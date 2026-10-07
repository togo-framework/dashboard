// Impersonation state for the dashboard admin.
//
// Contract (auth plugin, /api/auth/admin/users/{id}/impersonate): the response
// body carries a short-lived bearer token ({token, identity, expires_at}); it is
// never a cookie, so the administrator's own cookie session stays intact. While
// the token is held, `GET /api/auth/me` with it reports the borrowed identity
// plus `impersonator` (the administrator's id). The server refuses an
// impersonation token on /api/auth/admin/* (403), so the admin clients never send
// it; only calls that act "as the user" do (see impersonationHeaders).
//
// The token lives in sessionStorage: scoped to this tab, gone when it closes, and
// bounded by the server-side TTL (expires_at is honoured here too). It is a
// convenience for the UI; the server remains the authority.
"use client";

import { useMemo, useSyncExternalStore } from "react";
import { httpErrorFrom } from "./http-error";

const KEY = "togo_impersonate";
const EVENT = "togo-impersonation";
const API = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";

export type Impersonation = { id: string; email: string; token: string; expiresAt?: string } | null;

function parse(raw: string | null): Impersonation {
  if (!raw) return null;
  try {
    const imp = JSON.parse(raw) as NonNullable<Impersonation>;
    if (!imp?.token) return null;
    if (imp.expiresAt && Date.parse(imp.expiresAt) <= Date.now()) return null;
    return imp;
  } catch {
    return null;
  }
}

const read = (): string | null => (typeof window === "undefined" ? null : window.sessionStorage.getItem(KEY));

export function getImpersonation(): Impersonation {
  return parse(read());
}

export function setImpersonation(imp: Impersonation) {
  if (typeof window === "undefined") return;
  if (imp) window.sessionStorage.setItem(KEY, JSON.stringify(imp));
  else window.sessionStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENT));
}

export function clearImpersonation() {
  setImpersonation(null);
}

function subscribe(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

/** Reactive impersonation state for components. */
export function useImpersonation(): Impersonation {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  return useMemo(() => parse(raw), [raw]);
}

/** Authorization header for calls made as the impersonated user (empty otherwise). */
export function impersonationHeaders(): Record<string, string> {
  const imp = getImpersonation();
  return imp ? { Authorization: `Bearer ${imp.token}` } : {};
}

/**
 * Ends the impersonation: the server revokes the token (bearer requests are CSRF
 * exempt), then the local copy is dropped. It is dropped even when the call
 * fails, since the UI must not keep acting as the user; the error is rethrown so
 * the caller can tell the administrator the server-side revocation did not happen.
 */
export async function stopImpersonation(): Promise<void> {
  const headers = impersonationHeaders();
  try {
    if (headers.Authorization) {
      const res = await fetch(`${API}/api/auth/impersonation/stop`, { method: "POST", credentials: "include", headers });
      if (!res.ok) throw await httpErrorFrom(res, "could not end impersonation");
    }
  } finally {
    clearImpersonation();
  }
}
