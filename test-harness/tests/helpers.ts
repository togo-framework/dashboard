import { vi } from "vitest";

export type Call = { method: string; path: string; headers: Record<string, string>; body: unknown };
type Reply = { status?: number; json?: unknown } | ((call: Call) => { status?: number; json?: unknown });

/**
 * Stubs global fetch with the auth/dashboard API contract. Routes are keyed
 * "METHOD /path" (query string ignored). Unknown routes fail the test loudly.
 * Every call is recorded so tests can assert on headers (CSRF, bearer).
 */
export function mockApi(routes: Record<string, Reply>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), "http://localhost");
    const method = (init.method ?? "GET").toUpperCase();
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>));
    const call: Call = { method, path: url.pathname, headers, body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const reply = routes[`${method} ${url.pathname}`];
    if (!reply) throw new Error(`unmocked request: ${method} ${url.pathname}`);
    const r = typeof reply === "function" ? reply(call) : reply;
    const status = r.status ?? 200;
    if (status === 204) return new Response(null, { status });
    return new Response(JSON.stringify(r.json ?? {}), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return { calls, find: (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path) };
}

/** Routes every page needs: a CSRF token, an empty resource list and an allowed access check. */
export const baseRoutes: Record<string, Reply> = {
  "GET /api/auth/csrf": { json: { csrf_token: "csrf-123" } },
  "GET /api/_meta/resources": { json: { resources: [] } },
  "GET /api/dashboard/access": { status: 204 },
};

export const ADMIN = { id: "u-admin", email: "root@example.com", roles: ["admin"], permissions: [] };
export const USERS = [
  { id: "u-admin", email: "root@example.com", roles: ["admin"], permissions: [], created_at: "2026-01-01T00:00:00Z" },
  { id: "u-2", email: "jane@example.com", roles: ["user"], permissions: [], created_at: "2026-02-01T00:00:00Z" },
];

export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: (() => void) | null = null;
  static CLOSED = 2;
  readyState = 0;
  constructor(public url: string) { FakeEventSource.instances.push(this); }
  close() { this.readyState = 2; }
}
