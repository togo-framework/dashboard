// Server-side dashboard access check. Import it only from server components (the (app)
// layout and pages): it reads the request cookies through next/headers, which Next refuses in
// a client bundle.
//
// It asks the dashboard plugin's GET /api/dashboard/access whether the caller may use the
// dashboard. The API applies the deployment's DASHBOARD_REQUIRED_ROLE policy (unset: any
// signed-in account). This guard keeps protected pages from rendering; it is not what
// protects data. Every API still enforces its own authorization.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const SESSION_COOKIE = "togo_session"; // the auth plugin's HttpOnly session cookie
const ACCESS_PATH = "/api/dashboard/access";
const TIMEOUT_MS = 5000;
// A session token is a signed, URL-safe string. Anything else is not forwarded.
const TOKEN_SHAPE = /^[A-Za-z0-9._~+/=-]{1,4096}$/;

export type DashboardAccess = "allow" | "signin" | "forbidden";

/**
 * The API origin the check is sent to: the server-only API_ORIGIN (the same variable and
 * default as the /api rewrite in next.config), never a NEXT_PUBLIC_ value or anything taken
 * from the request. It must be a bare http(s) origin; anything else is a configuration
 * error and the check fails closed.
 */
export function apiOrigin(value: string | undefined = process.env.API_ORIGIN): string {
  const raw = value?.trim() || "http://localhost:8080";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("API_ORIGIN must be an absolute http(s) URL");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new Error("API_ORIGIN must be a bare http(s) origin, such as http://localhost:8080");
  }
  return url.origin;
}

/**
 * Asks the API whether the session may use the dashboard. Only the session cookie is
 * forwarded, only to apiOrigin(). 204 allows, 401 means sign in, 403 means forbidden; any
 * other answer, a timeout or a network error throws, so nothing protected renders.
 */
export async function checkDashboardAccess(
  session: string | undefined,
  origin: string = apiOrigin(),
  fetchImpl: typeof fetch = fetch,
): Promise<DashboardAccess> {
  if (!session || !TOKEN_SHAPE.test(session)) return "signin";
  const res = await fetchImpl(`${origin}${ACCESS_PATH}`, {
    method: "GET",
    headers: { Cookie: `${SESSION_COOKIE}=${session}` },
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  switch (res.status) {
    case 204:
      return "allow";
    case 401:
      return "signin";
    case 403:
      return "forbidden";
    default:
      throw new Error(`dashboard access check failed (${res.status})`);
  }
}

/**
 * Guards a dashboard layout or page. Signed out redirects to /login; allowed returns true;
 * forbidden returns false, and the caller renders the forbidden state instead of its content.
 */
export async function requireDashboardAccess(): Promise<boolean> {
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  const access = await checkDashboardAccess(session);
  if (access === "signin") redirect("/login");
  return access === "allow";
}
