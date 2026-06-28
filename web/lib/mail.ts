// Mail/SMTP admin client — talks to the dashboard plugin's own backend under
// /api/dashboard/admin/mail (GET/PUT) + /api/dashboard/admin/mail/test. Guarded
// by role=admin + double-submit CSRF on writes (same pattern as the auth admin
// surface). Field names match the kit's MailConfig so MailSettingsForm round-
// trips the value directly.
"use client";

import type { MailConfig, MailTestResult } from "@togo-framework/ui";

const API = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";

async function csrf(): Promise<string> {
  const res = await fetch(`${API}/api/auth/csrf`, { credentials: "include" });
  const data = await res.json().catch(() => ({}));
  return data.csrf_token ?? "";
}

export type MailLoad = { config: MailConfig; available: boolean };

export async function loadMail(): Promise<MailLoad> {
  const res = await fetch(`${API}/api/dashboard/admin/mail`, { credentials: "include" });
  if (res.status === 404) return { config: { port: 587, secure: true }, available: false };
  if (!res.ok) throw new Error(`load failed (${res.status})`);
  const config = (await res.json().catch(() => ({}))) as MailConfig;
  return { config: { port: 587, secure: true, ...config }, available: true };
}

export async function saveMail(config: MailConfig): Promise<void> {
  const token = await csrf();
  const res = await fetch(`${API}/api/dashboard/admin/mail`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `save failed (${res.status})`);
  }
}

export async function testMail(to: string): Promise<MailTestResult> {
  try {
    const token = await csrf();
    const res = await fetch(`${API}/api/dashboard/admin/mail/test`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
      body: JSON.stringify({ to }),
    });
    const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok) return { ok: false, error: d.error || `test failed (${res.status})` };
    return { ok: !!d.ok, error: d.error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Test failed" };
  }
}
