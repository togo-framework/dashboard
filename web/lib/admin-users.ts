// Admin user-management client — talks to the auth plugin's /api/auth/admin/*
// surface (guarded by role=admin + double-submit CSRF; bearer requests are
// CSRF-exempt). Mirrors the existing lib/auth.ts fetch pattern: HttpOnly cookie
// session + a CSRF token fetched from /api/auth/csrf, plus an Authorization
// bearer header while impersonating.
"use client";

import type { AdminUser, AddUserInput, EditUserInput, AdminLinkResult } from "@togo-framework/ui";
import { impersonationHeaders } from "./impersonation";

const API = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";

async function csrf(): Promise<string> {
  const res = await fetch(`${API}/api/auth/csrf`, { credentials: "include" });
  const data = await res.json().catch(() => ({}));
  return data.csrf_token ?? "";
}

async function req<T = any>(path: string, init: RequestInit & { write?: boolean } = {}): Promise<T> {
  const { write, headers, ...rest } = init;
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    ...impersonationHeaders(),
    ...(headers as Record<string, string> | undefined),
  };
  if (write) h["X-CSRF-Token"] = await csrf();
  const res = await fetch(`${API}/api/auth/admin${path}`, { credentials: "include", headers: h, ...rest });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.detail || `request failed (${res.status})`);
  return data as T;
}

export const adminUsers = {
  list: (q = ""): Promise<AdminUser[]> =>
    req<AdminUser[]>(`/users${q ? `?q=${encodeURIComponent(q)}` : ""}`).then((d) => (Array.isArray(d) ? d : [])),

  get: (id: string): Promise<AdminUser> => req<AdminUser>(`/users/${id}`),

  create: (input: AddUserInput): Promise<void> =>
    req(`/users`, {
      method: "POST",
      write: true,
      body: JSON.stringify({ email: input.email, password: input.password || undefined, roles: input.roles }),
    }).then(() => undefined),

  update: (id: string, input: EditUserInput): Promise<void> =>
    req(`/users/${id}`, {
      method: "PATCH",
      write: true,
      body: JSON.stringify({ email: input.email, roles: input.roles, permissions: input.permissions }),
    }).then(() => undefined),

  remove: (id: string): Promise<void> =>
    req(`/users/${id}`, { method: "DELETE", write: true }).then(() => undefined),

  impersonate: (id: string): Promise<{ token?: string; identity?: { id?: string; email?: string } }> =>
    req(`/users/${id}/impersonate`, { method: "POST", write: true }),

  resetPassword: (id: string, password?: string): Promise<AdminLinkResult & { reset?: boolean }> =>
    req(`/users/${id}/reset-password`, {
      method: "POST",
      write: true,
      body: JSON.stringify(password ? { password } : {}),
    }),

  magicLink: (id: string): Promise<AdminLinkResult> =>
    req(`/users/${id}/magic-link`, { method: "POST", write: true }),
};
