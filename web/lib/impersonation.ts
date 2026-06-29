// Impersonation state for the dashboard admin.
//
// When an admin impersonates a user, the auth plugin issues a bearer token for
// that identity (POST /api/auth/admin/users/{id}/impersonate). The dashboard's
// session is an HttpOnly cookie that JS can't overwrite, so — like Fort — we
// stash {id,email,token} client-side and send `Authorization: Bearer <token>`
// on admin API calls while impersonating (bearer requests are also CSRF-exempt).
// A window event + the `storage` event keep the ImpersonationBanner in sync
// across tabs.
"use client";

const KEY = "togo_impersonate";
const EVENT = "togo-impersonation";

export type Impersonation = { id: string; email: string; token?: string } | null;

export function getImpersonation(): Impersonation {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Impersonation) : null;
  } catch {
    return null;
  }
}

export function setImpersonation(imp: Impersonation) {
  if (typeof window === "undefined") return;
  if (imp) window.localStorage.setItem(KEY, JSON.stringify(imp));
  else window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENT));
}

export function clearImpersonation() {
  setImpersonation(null);
}

/** Subscribe to impersonation changes (this tab + other tabs). */
export function onImpersonationChange(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

/** Authorization header to send while impersonating (empty otherwise). */
export function impersonationHeaders(): Record<string, string> {
  const imp = getImpersonation();
  return imp?.token ? { Authorization: `Bearer ${imp.token}` } : {};
}
