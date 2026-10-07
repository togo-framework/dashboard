// togo auth client. Talks to the auth plugin's /api/auth/* endpoints. Session is
// an HttpOnly cookie (set by the server); CSRF uses the double-submit token.
"use client";

import { HttpError, httpErrorFrom } from "./http-error";
import { clearImpersonation, impersonationHeaders } from "./impersonation";

const API = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";

/** The signed-in identity, as `GET /api/auth/me` returns it. */
export interface Me {
  id: string;
  email: string;
  roles?: string[];
  permissions?: string[];
  /** Set only on an impersonation token: the id of the administrator acting as this user. */
  impersonator?: string;
}

export async function csrfToken(): Promise<string> {
  const res = await fetch(`${API}/api/auth/csrf`, { credentials: "include" });
  if (!res.ok) throw await httpErrorFrom(res, "could not get a CSRF token");
  const data = (await res.json().catch(() => ({}))) as { csrf_token?: string };
  return data.csrf_token ?? "";
}

async function post<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  const token = await csrfToken();
  const res = await fetch(`${API}/api/auth/${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await httpErrorFrom(res, "request failed");
  return (await res.json().catch(() => ({}))) as T;
}

export const auth = {
  login: (email: string, password: string) => post("login", { email, password }),
  register: (email: string, password: string) => post("register", { email, password }),
  logout: () => post("logout"),
  /**
   * The current identity (the borrowed one while impersonating), or null when
   * signed out (401). Any other failure throws, so an outage is not mistaken for
   * a sign-out.
   */
  me: async (): Promise<Me | null> => {
    const headers = impersonationHeaders();
    const res = await fetch(`${API}/api/auth/me`, { credentials: "include", headers });
    if (res.status === 401 && headers.Authorization) {
      // The impersonation token expired or was revoked: fall back to the administrator's own session.
      clearImpersonation();
      return auth.me();
    }
    if (res.status === 401) return null;
    if (!res.ok) throw new HttpError(`could not load the session (${res.status})`, res.status);
    return (await res.json()) as Me | null;
  },
  requestOtp: (email: string, purpose = "reset") => post("otp", { email, purpose }),
  verifyOtp: (email: string, code: string, purpose = "reset") => post("otp/verify", { email, code, purpose }),
  changePassword: (oldPassword: string, newPassword: string) =>
    post("change-password", { old_password: oldPassword, new_password: newPassword }),
  enroll2fa: () => post<{ secret: string; otpauth_url: string }>("2fa/enroll"),
  verify2fa: (code: string) => post("2fa/verify", { code }),
  setPin: (pin: string) => post("pin", { pin }),
  verifyPin: (pin: string) => post("pin/verify", { pin }),
  /** Redeems an admin-issued reset link: the token is the credential (401 when invalid, used or expired). */
  resetPassword: (token: string, password: string) => post("password/reset", { token, password }),
};
