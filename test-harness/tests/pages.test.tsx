import { describe, expect, it, vi, beforeEach } from "vitest";
import { Suspense } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Providers } from "@/components/providers";
import { baseRoutes, mockApi, ADMIN, USERS } from "./helpers";
import { setImpersonation } from "@/lib/impersonation";

const push = vi.fn();
const replace = vi.fn();
let search = "";
let pathname = "/dashboard";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
  useParams: () => ({ id: "u-2" }),
}));

import ResetPasswordPage from "@/app/(auth)/reset-password/page";
import DashboardLayout from "@/app/(app)/layout";
import AdminUsersPage from "@/app/(app)/admin/users/page";
import AdminUserDetailPage from "@/app/(app)/admin/users/[id]/page";
import ProfilePage from "@/app/(app)/profile/page";
import TwoFactorPage from "@/app/(auth)/two-factor/page";
import AdminMailPage from "@/app/(app)/admin/mail/page";

// A pre-settled thenable lets React 19 `use()` read it synchronously instead of suspending.
function settled<T>(value: T): Promise<T> {
  return Object.assign(Promise.resolve(value), { status: "fulfilled", value });
}

beforeEach(() => {
  window.sessionStorage.clear();
  push.mockClear();
  replace.mockClear();
  search = "";
  pathname = "/dashboard";
});

describe("/reset-password", () => {
  it("posts {token, password} and shows success", async () => {
    search = "token=abc123";
    const api = mockApi({ ...baseRoutes, "POST /api/auth/password/reset": { json: {} } });
    render(<Providers><ResetPasswordPage /></Providers>);
    await userEvent.type(screen.getByLabelText(/new password/i), "a-long-password");
    await userEvent.click(screen.getByRole("button", { name: /update password/i }));
    await waitFor(() => expect(screen.getByText(/password updated/i)).toBeTruthy());
    expect(api.find("POST", "/api/auth/password/reset")[0].body).toEqual({ token: "abc123", password: "a-long-password" });
  });

  it("explains an invalid or expired link (401)", async () => {
    search = "token=dead";
    mockApi({ ...baseRoutes, "POST /api/auth/password/reset": { status: 401, json: {} } });
    render(<Providers><ResetPasswordPage /></Providers>);
    await userEvent.type(screen.getByLabelText(/new password/i), "a-long-password");
    await userEvent.click(screen.getByRole("button", { name: /update password/i }));
    await waitFor(() => expect(screen.getByText(/invalid or has expired/i)).toBeTruthy());
  });

  it("shows no form without a token", () => {
    mockApi(baseRoutes);
    render(<Providers><ResetPasswordPage /></Providers>);
    expect(screen.getByText(/missing its token/i)).toBeTruthy();
    expect(screen.queryByLabelText(/new password/i)).toBeNull();
  });
});

describe("app shell", () => {
  it("redirects to /login when signed out", async () => {
    mockApi({ ...baseRoutes, "GET /api/auth/me": { status: 401 } });
    render(<Providers><DashboardLayout><p>secret</p></DashboardLayout></Providers>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("secret")).toBeNull();
  });

  it("admin session: user-management and mail nav are offered, no banner", async () => {
    mockApi({ ...baseRoutes, "GET /api/auth/me": { json: ADMIN } });
    render(<Providers><DashboardLayout><p>content</p></DashboardLayout></Providers>);
    await screen.findByText("content");
    expect(screen.getAllByText("Users").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Mail").length).toBeGreaterThan(0);
    expect(screen.queryByText(/actions count as this user/i)).toBeNull();
  });

  it("impersonating: banner names the admin, admin nav is hidden, End calls /impersonation/stop", async () => {
    setImpersonation({ id: "u-2", email: "jane@example.com", token: "imp-token" });
    const api = mockApi({
      ...baseRoutes,
      "GET /api/auth/me": { json: { id: "u-2", email: "jane@example.com", impersonator: "u-admin" } },
      "POST /api/auth/impersonation/stop": { json: {} },
    });
    render(<Providers><DashboardLayout><p>content</p></DashboardLayout></Providers>);
    await screen.findByText("content");
    expect(await screen.findByText(/signed in as administrator u-admin/i)).toBeTruthy();
    expect(screen.queryByText("Users")).toBeNull();
    expect(screen.queryByText("Mail")).toBeNull();
    const end = screen.getAllByRole("button").find((b) => /exit|end|stop|return/i.test(b.textContent ?? ""));
    expect(end).toBeTruthy();
    await userEvent.click(end!);
    await waitFor(() => expect(api.find("POST", "/api/auth/impersonation/stop")).toHaveLength(1));
    expect(api.find("POST", "/api/auth/impersonation/stop")[0].headers.Authorization).toBe("Bearer imp-token");
    expect(window.sessionStorage.getItem("togo_impersonate")).toBeNull();
  });
});

describe("admin pages", () => {
  it("users list renders for an admin", async () => {
    mockApi({ ...baseRoutes, "GET /api/auth/admin/users": { json: USERS } });
    render(<Providers><AdminUsersPage /></Providers>);
    expect(await screen.findByText("jane@example.com")).toBeTruthy();
  });

  it("users list shows a forbidden state on 403 (no crash)", async () => {
    mockApi({ ...baseRoutes, "GET /api/auth/admin/users": { status: 403, json: { error: "forbidden" } } });
    render(<Providers><AdminUsersPage /></Providers>);
    expect(await screen.findByText(/^Forbidden$/)).toBeTruthy();
    expect(screen.queryByText("jane@example.com")).toBeNull();
  });

  it("users page is blocked while impersonating and makes no admin request", async () => {
    setImpersonation({ id: "u-2", email: "jane@example.com", token: "imp-token" });
    const api = mockApi({ ...baseRoutes, "GET /api/auth/admin/users": { json: USERS } });
    render(<Providers><AdminUsersPage /></Providers>);
    await waitFor(() => expect(screen.queryByText("jane@example.com")).toBeNull());
    expect(api.find("GET", "/api/auth/admin/users")).toHaveLength(0);
  });

  it("mail settings: 403 shows the forbidden state", async () => {
    mockApi({ ...baseRoutes, "GET /api/dashboard/admin/mail": { status: 403, json: {} } });
    render(<Providers><AdminMailPage /></Providers>);
    expect(await screen.findByText(/^Forbidden$/)).toBeTruthy();
  });

  it("reset/magic link 403 for an admin target is a toast, not a forbidden page", async () => {
    const api = mockApi({
      ...baseRoutes,
      "GET /api/auth/admin/users/u-admin": { json: USERS[0] },
      "POST /api/auth/admin/users/u-admin/reset-password": { status: 403, json: { error: "administrators cannot be acted on this way" } },
    });
    render(<Providers><Suspense><AdminUserDetailPage params={settled({ id: "u-admin" })} /></Suspense></Providers>);
    await userEvent.click(await screen.findByRole("button", { name: /reset password/i }));
    expect(await screen.findByText(/administrator accounts can.t be changed this way/i)).toBeTruthy();
    expect(screen.queryByText(/^Forbidden$/)).toBeNull();
    expect(api.find("POST", "/api/auth/admin/users/u-admin/reset-password")).toHaveLength(1);
  });

  it("profile while impersonating: no password/PIN/2FA controls, explains why", async () => {
    setImpersonation({ id: "u-2", email: "jane@example.com", token: "imp-token" });
    const api = mockApi({ ...baseRoutes, "GET /api/auth/me": { json: { id: "u-2", email: "jane@example.com", impersonator: "u-admin" } } });
    render(<Providers><ProfilePage /></Providers>);
    expect(await screen.findByText(/belong to the account holder/i)).toBeTruthy();
    expect(screen.queryByLabelText(/current password/i)).toBeNull();
    expect(screen.queryByLabelText(/new password/i)).toBeNull();
    expect(screen.queryByLabelText(/PIN/i)).toBeNull();
    expect(screen.queryByText(/manage 2fa/i)).toBeNull();
    expect(api.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it("profile for the real account holder keeps the controls", async () => {
    mockApi({ ...baseRoutes, "GET /api/auth/me": { json: ADMIN } });
    render(<Providers><ProfilePage /></Providers>);
    expect(await screen.findByLabelText(/current password/i)).toBeTruthy();
    expect(screen.getByText(/manage 2fa/i)).toBeTruthy();
  });

  it("two-factor page is blocked while impersonating", () => {
    setImpersonation({ id: "u-2", email: "jane@example.com", token: "imp-token" });
    mockApi(baseRoutes);
    render(<Providers><TwoFactorPage /></Providers>);
    expect(screen.getByText(/belong to the account holder/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /enable|enroll|set up/i })).toBeNull();
  });
});
