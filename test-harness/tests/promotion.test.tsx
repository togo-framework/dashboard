import { describe, expect, it, vi, beforeEach } from "vitest";
import { Suspense } from "react";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Providers } from "@/components/providers";
import { PromotionConfirmDialog } from "@/components/promotion-confirm";
import { usePromotion } from "@/lib/promotion";
import { adminUsers } from "@/lib/admin-users";
import {
  AdminTargetError, ProvenanceConflictError, RateLimitedError, adminMessage, isCallerForbidden, parseProvenanceConflict,
} from "@/lib/admin-errors";
import { baseRoutes, mockApi, USERS } from "./helpers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/admin/users",
  useSearchParams: () => new URLSearchParams(""),
  useParams: () => ({ id: "u-2" }),
}));
import AdminUserDetailPage from "@/app/(app)/admin/users/[id]/view";

const PATCH = "PATCH /api/auth/admin/users/u-2";
// Exactly the body auth v0.10.0 provenanceConflict() sends (checked by the Go integration test).
const conflictBody = (over: Record<string, unknown> = {}) => ({
  error: "identity_set_by_other_admin",
  message: "The email and password of this account was set by another administrator.",
  tainted_fields: ["email", "password"],
  set_by: { email: "u-a1,u-a2", password: "u-a1" },
  set_at: { email: "2026-10-01T10:00:00Z", password: "2026-10-02T10:00:00Z" },
  accept_field: "accept_identity_set_by_other",
  ...over,
});
const acceptOf = (body: unknown) => (body as Record<string, unknown>).accept_identity_set_by_other;

beforeEach(() => window.sessionStorage.clear());

describe("admin error contract", () => {
  it("parses the 409 body into a typed conflict (comma-separated set_by)", async () => {
    mockApi({ ...baseRoutes, [PATCH]: { status: 409, json: conflictBody() } });
    const err = await adminUsers.update("u-2", { roles: ["admin"] }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProvenanceConflictError);
    expect((err as ProvenanceConflictError).conflict).toEqual({
      taintedFields: ["email", "password"],
      setBy: { email: ["u-a1", "u-a2"], password: ["u-a1"] },
      setAt: { email: "2026-10-01T10:00:00Z", password: "2026-10-02T10:00:00Z" },
    });
  });

  it("a malformed 409 is a plain error, never a confirmable one", () => {
    expect(parseProvenanceConflict({ error: "identity_set_by_other_admin", tainted_fields: ["role"] })).toBeNull();
    expect(parseProvenanceConflict({ error: "identity_set_by_other_admin", tainted_fields: [] })).toBeNull();
    expect(parseProvenanceConflict({ error: "other", tainted_fields: ["email"] })).toBeNull();
  });

  it("403 adminTargetErr and 403 requireAdmin are told apart", async () => {
    mockApi({ ...baseRoutes, [PATCH]: { status: 403, json: { error: "administrators cannot be acted on this way" } } });
    const target = await adminUsers.update("u-2", { roles: ["x"] }).catch((e: unknown) => e);
    expect(target).toBeInstanceOf(AdminTargetError);
    expect(isCallerForbidden(target)).toBe(false);
    mockApi({ ...baseRoutes, [PATCH]: { status: 403, json: { error: "forbidden" } } });
    const caller = await adminUsers.update("u-2", { roles: ["x"] }).catch((e: unknown) => e);
    expect(isCallerForbidden(caller)).toBe(true);
    expect(adminMessage(target)).not.toEqual(adminMessage(caller));
  });

  it("429 carries Retry-After and the message hides the raw body", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("csrf")
        ? new Response(JSON.stringify({ csrf_token: "c" }), { status: 200 })
        : new Response(JSON.stringify({ error: "too many requests" }), { status: 429, headers: { "Retry-After": "300" } })));
    const err = await adminUsers.magicLink("u-2").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitedError);
    expect(adminMessage(err)).toMatch(/try again in 300 seconds/i);
    expect(adminMessage(err)).not.toMatch(/too many requests$/);
  });

  it("a 500 never shows the server text", async () => {
    mockApi({ ...baseRoutes, [PATCH]: { status: 500, json: { error: "pq: relation users stack trace" } } });
    const err = await adminUsers.update("u-2", { roles: ["x"] }).catch((e: unknown) => e);
    expect(adminMessage(err)).not.toMatch(/pq:|stack/);
  });

  it("the accept flag is absent unless explicitly requested", async () => {
    const api = mockApi({ ...baseRoutes, [PATCH]: { json: {} } });
    await adminUsers.update("u-2", { roles: ["admin"] });
    await adminUsers.update("u-2", { roles: ["admin"] }, { acceptIdentitySetByOther: true });
    const [a, b] = api.find("PATCH", "/api/auth/admin/users/u-2");
    expect("accept_identity_set_by_other" in (a.body as object)).toBe(false);
    expect(acceptOf(b.body)).toBe(true);
  });
});

function Harness({ onUpdated = () => {}, onError = () => {} }: { onUpdated?: () => void; onError?: (e: unknown) => void }) {
  const p = usePromotion({ onUpdated, onError });
  return (
    <>
      <button onClick={() => { void p.request("u-2", "jane@example.com", ["admin"]); }}>promote</button>
      <button onClick={() => { void p.request("u-2", "jane@example.com", ["admin", "editor"]); }}>promote-editor</button>
      <PromotionConfirmDialog
        pending={p.pending}
        busy={p.busy}
        onConfirm={(x) => { void p.confirm(x); }}
        onCancel={p.cancel}
        nameOf={(id) => (id === "u-a1" ? "boss@example.com" : id)}
      />
    </>
  );
}

describe("promotion confirmation", () => {
  it("names the account, the tainted fields and who set them; cancel sends nothing more", async () => {
    const api = mockApi({ ...baseRoutes, [PATCH]: { status: 409, json: conflictBody() } });
    render(<Providers><Harness /></Providers>);
    await userEvent.click(screen.getByText("promote"));
    expect(await screen.findByText(/confirm promotion to administrator/i)).toBeTruthy();
    expect(screen.getByText("jane@example.com")).toBeTruthy();
    expect(screen.getByTestId("tainted-email").textContent).toMatch(/boss@example\.com, u-a2/);
    expect(screen.getByTestId("tainted-password").textContent).toMatch(/boss@example\.com/);
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByText(/confirm promotion/i)).toBeNull());
    const patches = api.find("PATCH", "/api/auth/admin/users/u-2");
    expect(patches).toHaveLength(1);
    expect("accept_identity_set_by_other" in (patches[0].body as object)).toBe(false);
  });

  it("confirm resends the same PATCH once with the accept flag, then closes", async () => {
    let n = 0;
    const onUpdated = vi.fn();
    const api = mockApi({
      ...baseRoutes,
      [PATCH]: (c) => (acceptOf(c.body) === true ? { json: {} } : (n++, { status: 409, json: conflictBody() })),
    });
    render(<Providers><Harness onUpdated={onUpdated} /></Providers>);
    await userEvent.click(screen.getByText("promote"));
    await userEvent.click(await screen.findByRole("button", { name: /promote anyway/i }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
    const patches = api.find("PATCH", "/api/auth/admin/users/u-2");
    expect(patches).toHaveLength(2);
    expect(patches[1].body).toEqual({ roles: ["admin"], accept_identity_set_by_other: true });
    expect(n).toBe(1);
    // the flag is not remembered: a later promotion starts without it
    await userEvent.click(screen.getByText("promote"));
    const later = api.find("PATCH", "/api/auth/admin/users/u-2").at(-1)!;
    expect("accept_identity_set_by_other" in (later.body as object)).toBe(false);
  });

  it("double submission: re-entrant confirms send exactly one accepted PATCH", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const api = mockApi({
      ...baseRoutes,
      [PATCH]: (c) => (acceptOf(c.body) === true ? { json: {} } : { status: 409, json: conflictBody() }),
    });
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.body && String(init.body).includes("accept_identity_set_by_other")) await gate;
      return real(input, init);
    });
    const { result } = renderHook(() => usePromotion({ onUpdated: () => {}, onError: () => {} }));
    await act(async () => { await result.current.request("u-2", "jane@example.com", ["admin"]); });
    const p = result.current.pending!;
    let first: Promise<void> = Promise.resolve();
    await act(async () => {
      first = result.current.confirm(p);
      void result.current.confirm(p);
      void result.current.confirm(p);
    });
    expect(result.current.busy).toBe(true);
    act(() => result.current.cancel()); // ignored while in flight
    expect(result.current.pending).toBe(p);
    release();
    await act(async () => { await first; });
    const accepted = api.find("PATCH", "/api/auth/admin/users/u-2").filter((c) => acceptOf(c.body) === true);
    expect(accepted).toHaveLength(1);
    expect(result.current.pending).toBeNull();
  });

  it("buttons are disabled while the confirmed request is in flight", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    mockApi({
      ...baseRoutes,
      [PATCH]: (c) => (acceptOf(c.body) === true ? { json: {} } : { status: 409, json: conflictBody() }),
    });
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.body && String(init.body).includes("accept_identity_set_by_other")) await gate;
      return real(input, init);
    });
    render(<Providers><Harness /></Providers>);
    await userEvent.click(screen.getByText("promote"));
    const go = await screen.findByRole("button", { name: /promote anyway/i });
    await userEvent.click(go);
    await waitFor(() => expect((screen.getByRole("button", { name: /^cancel$/i }) as HTMLButtonElement).disabled).toBe(true));
    const confirmBtn = screen.getByRole("button", { name: /promote anyway/i });
    expect(confirmBtn.hasAttribute("disabled") || confirmBtn.getAttribute("aria-disabled") === "true").toBe(true);
    release();
    await waitFor(() => expect(screen.queryByText(/confirm promotion/i)).toBeNull());
  });

  it("stale confirmation: a new request voids the earlier one, which then does nothing", async () => {
    const api = mockApi({ ...baseRoutes, [PATCH]: { status: 409, json: conflictBody() } });
    const { result } = renderHook(() => usePromotion({ onUpdated: () => {}, onError: () => {} }));
    await act(async () => { await result.current.request("u-2", "jane@example.com", ["admin"]); });
    const first = result.current.pending!;
    await act(async () => { await result.current.request("u-2", "jane@example.com", ["admin", "editor"]); });
    const second = result.current.pending!;
    expect(second).not.toBe(first);
    const before = api.find("PATCH", "/api/auth/admin/users/u-2").length;
    await act(async () => { await result.current.confirm(first); });
    expect(api.find("PATCH", "/api/auth/admin/users/u-2")).toHaveLength(before); // void: nothing sent
  });

  it("stale confirmation: cancel then reopen needs a fresh confirmation", async () => {
    const api = mockApi({ ...baseRoutes, [PATCH]: { status: 409, json: conflictBody() } });
    const { result } = renderHook(() => usePromotion({ onUpdated: () => {}, onError: () => {} }));
    await act(async () => { await result.current.request("u-2", "jane@example.com", ["admin"]); });
    const old = result.current.pending!;
    act(() => result.current.cancel());
    await act(async () => { await result.current.request("u-2", "jane@example.com", ["admin"]); });
    await act(async () => { await result.current.confirm(old); });
    expect(api.find("PATCH", "/api/auth/admin/users/u-2").filter((c) => acceptOf(c.body) === true)).toHaveLength(0);
  });

  it("a changed 409 on confirm voids the confirmation, re-asks, and is not retried", async () => {
    let calls = 0;
    const api = mockApi({
      ...baseRoutes,
      [PATCH]: (c) => {
        calls++;
        // first (unconfirmed) attempt: email only; the confirmed attempt meets a wider conflict
        return acceptOf(c.body) === true
          ? { status: 409, json: conflictBody() }
          : { status: 409, json: conflictBody({ tainted_fields: ["email"], set_by: { email: "u-a1" }, set_at: { email: "2026-10-01T10:00:00Z" } }) };
      },
    });
    const { result } = renderHook(() => usePromotion({ onUpdated: () => {}, onError: () => {} }));
    await act(async () => { await result.current.request("u-2", "jane@example.com", ["admin"]); });
    const first = result.current.pending!;
    await act(async () => { await result.current.confirm(first); });
    expect(calls).toBe(2); // no automatic third call
    expect(result.current.pending).not.toBe(first);
    expect(result.current.pending!.changed).toBe(true);
    expect(result.current.pending!.conflict.taintedFields).toEqual(["email", "password"]);
    await act(async () => { await result.current.confirm(first); }); // the old one is void
    expect(api.find("PATCH", "/api/auth/admin/users/u-2")).toHaveLength(2);
  });

  it.each([
    [403, { error: "administrators cannot be acted on this way" }],
    [403, { error: "forbidden" }],
    [429, { error: "too many requests" }],
  ])("a confirmed attempt failing with %i is reported once and never retried", async (status, json) => {
    const onError = vi.fn();
    const api = mockApi({
      ...baseRoutes,
      [PATCH]: (c) => (acceptOf(c.body) === true ? { status, json } : { status: 409, json: conflictBody() }),
    });
    const { result } = renderHook(() => usePromotion({ onUpdated: () => {}, onError }));
    await act(async () => { await result.current.request("u-2", "jane@example.com", ["admin"]); });
    await act(async () => { await result.current.confirm(result.current.pending!); });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBeNull();
    expect(api.find("PATCH", "/api/auth/admin/users/u-2")).toHaveLength(2);
  });
});

describe("403 / 429 on user actions", () => {
  const detail = (routes: Record<string, { status?: number; json?: unknown }>) => {
    const api = mockApi({ ...baseRoutes, "GET /api/auth/admin/users/u-admin": { json: USERS[0] }, ...routes });
    render(<Providers><Suspense><AdminUserDetailPage params={Object.assign(Promise.resolve({ id: "u-admin" }), { status: "fulfilled", value: { id: "u-admin" } })} /></Suspense></Providers>);
    return api;
  };

  it("admin-to-admin 403 is a clear per-action message, not the forbidden page", async () => {
    const api = detail({ "POST /api/auth/admin/users/u-admin/magic-link": { status: 403, json: { error: "administrators cannot be acted on this way" } } });
    await userEvent.click(await screen.findByRole("button", { name: /send magic link/i }));
    expect(await screen.findByText(/administrator accounts can.t be changed this way/i)).toBeTruthy();
    expect(screen.queryByText(/^Forbidden$/)).toBeNull();
    expect(api.find("POST", "/api/auth/admin/users/u-admin/magic-link")).toHaveLength(1);
  });

  it("requireAdmin 403 (non-admin, PAT, impersonated caller) shows the forbidden state", async () => {
    detail({ "POST /api/auth/admin/users/u-admin/reset-password": { status: 403, json: { error: "forbidden" } } });
    await userEvent.click(await screen.findByRole("button", { name: /reset password/i }));
    expect(await screen.findByText(/^Forbidden$/)).toBeTruthy();
  });

  it("429 on reset-password shows a rate-limit message and is not retried", async () => {
    const api = detail({ "POST /api/auth/admin/users/u-admin/reset-password": { status: 429, json: { error: "too many requests" } } });
    await userEvent.click(await screen.findByRole("button", { name: /reset password/i }));
    expect(await screen.findByText(/too many requests\. wait a moment/i)).toBeTruthy();
    expect(screen.queryByText(/^Forbidden$/)).toBeNull();
    expect(api.find("POST", "/api/auth/admin/users/u-admin/reset-password")).toHaveLength(1);
  });
});
