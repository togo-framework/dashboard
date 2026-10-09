import { describe, expect, it, vi, beforeEach } from "vitest";

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined) }),
}));
const redirect = vi.fn((to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); });
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));

import { apiOrigin, checkDashboardAccess, requireDashboardAccess } from "@/lib/dashboard-access";

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1In0.c2ln";

function answer(status: number) {
  return vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => { void args; return new Response(null, { status }); });
}

beforeEach(() => {
  cookieJar.clear();
  redirect.mockClear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("apiOrigin", () => {
  it("defaults to the rewrite's default origin", () => {
    expect(apiOrigin(undefined)).toBe("http://localhost:8080");
    expect(apiOrigin("  ")).toBe("http://localhost:8080");
  });
  it("accepts a bare http(s) origin", () => {
    expect(apiOrigin("https://api.example.com")).toBe("https://api.example.com");
    expect(apiOrigin("http://127.0.0.1:8080/")).toBe("http://127.0.0.1:8080");
  });
  it.each(["api.example.com", "ftp://api.example.com", "https://u:p@api.example.com", "https://api.example.com/x", "https://api.example.com?a=1", "javascript:alert(1)"])(
    "refuses %s", (v) => { expect(() => apiOrigin(v)).toThrow(/API_ORIGIN/); },
  );
  it("reads the server-only API_ORIGIN, never NEXT_PUBLIC_API_ORIGIN", () => {
    vi.stubEnv("NEXT_PUBLIC_API_ORIGIN", "https://evil.example.com");
    vi.stubEnv("API_ORIGIN", "https://api.example.com");
    expect(apiOrigin()).toBe("https://api.example.com");
  });
});

describe("checkDashboardAccess", () => {
  it.each([[204, "allow"], [401, "signin"], [403, "forbidden"]] as const)("maps %i to %s", async (status, want) => {
    expect(await checkDashboardAccess(TOKEN, "https://api.example.com", answer(status))).toBe(want);
  });

  it.each([200, 302, 404, 500, 502])("fails closed on %i", async (status) => {
    await expect(checkDashboardAccess(TOKEN, "https://api.example.com", answer(status))).rejects.toThrow(/access check failed/);
  });

  it("fails closed on a network error", async () => {
    const fail = vi.fn(async () => { throw new TypeError("fetch failed"); });
    await expect(checkDashboardAccess(TOKEN, "https://api.example.com", fail)).rejects.toThrow(/fetch failed/);
  });

  it("forwards only the session cookie, uncached, without following redirects, with a timeout", async () => {
    const f = answer(204);
    await checkDashboardAccess(TOKEN, "https://api.example.com", f);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe("https://api.example.com/api/dashboard/access");
    expect(init?.headers).toEqual({ Cookie: `togo_session=${TOKEN}` });
    expect(init?.cache).toBe("no-store");
    expect(init?.redirect).toBe("manual");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([undefined, "", "a;b=c", "a b", "x\r\nInjected: 1"])("does not call the API for session %j", async (session) => {
    const f = answer(204);
    expect(await checkDashboardAccess(session, "https://api.example.com", f)).toBe("signin");
    expect(f).not.toHaveBeenCalled();
  });
});

describe("requireDashboardAccess", () => {
  it("redirects to /login with no return path when signed out", async () => {
    await expect(requireDashboardAccess()).rejects.toThrow("NEXT_REDIRECT /login");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("allows and forbids from the API's answer", async () => {
    cookieJar.set("togo_session", TOKEN);
    vi.stubEnv("API_ORIGIN", "https://api.example.com");
    vi.stubGlobal("fetch", answer(204));
    expect(await requireDashboardAccess()).toBe(true);
    vi.stubGlobal("fetch", answer(403));
    expect(await requireDashboardAccess()).toBe(false);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("fails closed when API_ORIGIN is not a bare origin", async () => {
    cookieJar.set("togo_session", TOKEN);
    vi.stubEnv("API_ORIGIN", "https://api.example.com/somewhere");
    const f = answer(204);
    vi.stubGlobal("fetch", f);
    await expect(requireDashboardAccess()).rejects.toThrow(/API_ORIGIN/);
    expect(f).not.toHaveBeenCalled();
  });
});
