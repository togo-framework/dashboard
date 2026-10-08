// Admin user-management client — talks to the auth plugin's /api/auth/admin/*
// surface. Contract (togo-framework/auth v0.10.0, #5/#6): every route requires a signed-in
// administrator (401 signed out; 403 for a non-administrator, an API token or an
// impersonated session); writes carry the double-submit CSRF header from
// /api/auth/csrf. The administrator's own cookie session is used. An
// impersonation bearer token is deliberately NOT sent: the server refuses it here.
"use client";

import { csrfToken } from "./auth";
import { adminErrorFrom } from "./admin-errors";

/** A user as the auth plugin's admin API returns it. */
export interface AdminUser {
  id?: string;
  email: string;
  roles?: string[];
  permissions?: string[];
  created_at?: string;
}
/** Result of a reset-password / magic-link call: the link, or `emailed` when SMTP delivered it. */
export interface AdminLinkResult { link?: string; emailed?: boolean; expires_at?: string }
export interface AddUserInput { email: string; password?: string; roles?: string[] }
export interface EditUserInput { email?: string; roles?: string[]; permissions?: string[] }
/** Response of POST /users/{id}/impersonate. */
export interface ImpersonationGrant { token: string; expires_at?: string; identity?: { id?: string; email?: string } }

const API = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";

async function req<T>(path: string, init: RequestInit & { write?: boolean } = {}): Promise<T> {
  const { write, headers, ...rest } = init;
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string> | undefined),
  };
  if (write) h["X-CSRF-Token"] = await csrfToken();
  const res = await fetch(`${API}/api/auth/admin${path}`, { credentials: "include", headers: h, ...rest });
  if (!res.ok) throw await adminErrorFrom(res, "request failed");
  return (await res.json().catch(() => ({}))) as T;
}

export const adminUsers = {
  list: (q = ""): Promise<AdminUser[]> =>
    req<AdminUser[]>(`/users${q ? `?q=${encodeURIComponent(q)}` : ""}`).then((d) => (Array.isArray(d) ? d : [])),

  get: (id: string): Promise<AdminUser> => req<AdminUser>(`/users/${id}`),

  /** Resolves with the new user's id (the API answers 201 `{user}`). */
  create: (input: AddUserInput): Promise<{ id?: string }> =>
    req<{ id?: string; user?: { id?: string } }>(`/users`, {
      method: "POST",
      write: true,
      body: JSON.stringify({ email: input.email, password: input.password || undefined, roles: input.roles }),
    }).then((d) => ({ id: d.user?.id ?? d.id })),

  /**
   * `acceptIdentitySetByOther` is the explicit confirmation of a promotion the server answered with a
   * provenance 409. It applies to this single request only: it is not stored, and nothing here retries.
   */
  update: (id: string, input: EditUserInput, opts: { acceptIdentitySetByOther?: boolean } = {}): Promise<void> =>
    req<unknown>(`/users/${id}`, {
      method: "PATCH",
      write: true,
      body: JSON.stringify({
        email: input.email,
        roles: input.roles,
        permissions: input.permissions,
        accept_identity_set_by_other: opts.acceptIdentitySetByOther === true ? true : undefined,
      }),
    }).then(() => undefined),

  remove: (id: string): Promise<void> =>
    req<unknown>(`/users/${id}`, { method: "DELETE", write: true }).then(() => undefined),

  impersonate: (id: string): Promise<ImpersonationGrant> =>
    req<ImpersonationGrant>(`/users/${id}/impersonate`, { method: "POST", write: true }),

  resetPassword: (id: string, password?: string): Promise<AdminLinkResult & { reset?: boolean }> =>
    req<AdminLinkResult & { reset?: boolean }>(`/users/${id}/reset-password`, {
      method: "POST",
      write: true,
      body: JSON.stringify(password ? { password } : {}),
    }),

  magicLink: (id: string): Promise<AdminLinkResult> =>
    req<AdminLinkResult>(`/users/${id}/magic-link`, { method: "POST", write: true }),
};
