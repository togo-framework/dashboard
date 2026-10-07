import { beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/lib/auth";
import { adminUsers } from "@/lib/admin-users";
import { setImpersonation, getImpersonation, stopImpersonation } from "@/lib/impersonation";
import { isForbidden, isUnauthorized } from "@/lib/http-error";
import { baseRoutes, mockApi, USERS } from "./helpers";

beforeEach(() => window.sessionStorage.clear());

describe("admin API client contract", () => {
  it("never sends the impersonation bearer to /api/auth/admin/*", async () => {
    setImpersonation({ id: "u-2", email: "jane@example.com", token: "imp-token" });
    const api = mockApi({ ...baseRoutes, "GET /api/auth/admin/users": { json: USERS } });
    await adminUsers.list();
    const [call] = api.find("GET", "/api/auth/admin/users");
    expect(call.headers.Authorization).toBeUndefined();
  });

  it("sends the CSRF header on writes only", async () => {
    const api = mockApi({
      ...baseRoutes,
      "GET /api/auth/admin/users": { json: USERS },
      "POST /api/auth/admin/users/u-2/reset-password": { json: { link: "https://x/reset-password?token=t" } },
    });
    await adminUsers.list();
    await adminUsers.resetPassword("u-2");
    expect(api.find("GET", "/api/auth/admin/users")[0].headers["X-CSRF-Token"]).toBeUndefined();
    expect(api.find("POST", "/api/auth/admin/users/u-2/reset-password")[0].headers["X-CSRF-Token"]).toBe("csrf-123");
  });

  it("surfaces 401 and 403 as typed errors", async () => {
    mockApi({ "GET /api/auth/admin/users": { status: 403, json: { error: "forbidden" } } });
    const err = await adminUsers.list().catch((e: unknown) => e);
    expect(isForbidden(err)).toBe(true);
    expect(isUnauthorized(err)).toBe(false);
    mockApi({ "GET /api/auth/admin/users": { status: 401, json: {} } });
    expect(isUnauthorized(await adminUsers.list().catch((e: unknown) => e))).toBe(true);
  });

  it("create resolves the new user id from {user}", async () => {
    mockApi({ ...baseRoutes, "POST /api/auth/admin/users": { status: 201, json: { user: { id: "u-9" } } } });
    expect(await adminUsers.create({ email: "n@example.com" })).toEqual({ id: "u-9" });
  });
});

describe("auth client", () => {
  it("me() is null on 401 and throws on other failures", async () => {
    mockApi({ "GET /api/auth/me": { status: 401 } });
    expect(await auth.me()).toBeNull();
    mockApi({ "GET /api/auth/me": { status: 500 } });
    await expect(auth.me()).rejects.toThrow();
  });

  it("me() sends the impersonation bearer and returns impersonator", async () => {
    setImpersonation({ id: "u-2", email: "jane@example.com", token: "imp-token" });
    const api = mockApi({ "GET /api/auth/me": { json: { id: "u-2", email: "jane@example.com", impersonator: "u-admin" } } });
    const me = await auth.me();
    expect(me?.impersonator).toBe("u-admin");
    expect(api.calls[0].headers.Authorization).toBe("Bearer imp-token");
  });

  it("an expired impersonation token falls back to the admin session", async () => {
    setImpersonation({ id: "u-2", email: "jane@example.com", token: "stale" });
    let n = 0;
    mockApi({ "GET /api/auth/me": () => (n++ === 0 ? { status: 401 } : { json: { id: "u-admin", email: "root@example.com" } }) });
    expect((await auth.me())?.id).toBe("u-admin");
    expect(getImpersonation()).toBeNull();
  });

  it("resetPassword posts {token, password} with CSRF", async () => {
    const api = mockApi({ ...baseRoutes, "POST /api/auth/password/reset": { json: {} } });
    await auth.resetPassword("tok", "new-password-1");
    const [c] = api.find("POST", "/api/auth/password/reset");
    expect(c.body).toEqual({ token: "tok", password: "new-password-1" });
    expect(c.headers["X-CSRF-Token"]).toBe("csrf-123");
  });
});

describe("stopImpersonation", () => {
  it("calls /api/auth/impersonation/stop with the bearer and clears state", async () => {
    setImpersonation({ id: "u-2", email: "jane@example.com", token: "imp-token" });
    const api = mockApi({ "POST /api/auth/impersonation/stop": { json: {} } });
    await stopImpersonation();
    expect(api.calls[0].headers.Authorization).toBe("Bearer imp-token");
    expect(getImpersonation()).toBeNull();
  });

  it("clears local state even when the server call fails, and reports it", async () => {
    setImpersonation({ id: "u-2", email: "jane@example.com", token: "imp-token" });
    mockApi({ "POST /api/auth/impersonation/stop": { status: 500 } });
    await expect(stopImpersonation()).rejects.toThrow();
    expect(getImpersonation()).toBeNull();
  });

  it("ignores an expired token (expires_at honoured)", () => {
    setImpersonation({ id: "u-2", email: "j@example.com", token: "t", expiresAt: "2000-01-01T00:00:00Z" });
    expect(getImpersonation()).toBeNull();
  });
});
