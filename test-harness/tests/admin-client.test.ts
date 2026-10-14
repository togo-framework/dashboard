import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockApi } from "./helpers";

describe("admin client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_TOGO_RESOURCES", "posts");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends the CSRF token on mutations and encodes ids", async () => {
    const api = mockApi({
      "GET /api/auth/csrf": { json: { csrf_token: "tok" } },
      "DELETE /api/posts/a%2Fb": { status: 204 },
    });
    const { adminDelete } = await import("../lib/admin");
    await adminDelete("posts", "a/b");
    const del = api.calls.find((c) => c.method === "DELETE");
    expect(del?.headers["X-CSRF-Token"]).toBe("tok");
  });

  it("refuses tables outside the configured resources", async () => {
    const api = mockApi({});
    const { adminList } = await import("../lib/admin");
    await expect(adminList("users")).rejects.toThrow(/unknown resource/);
    await expect(adminList("../auth/me")).rejects.toThrow(/unknown resource/);
    expect(api.calls).toHaveLength(0);
  });
});
