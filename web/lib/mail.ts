// Mail/SMTP admin client — talks to the dashboard plugin's own backend under
// /api/dashboard/admin/mail (GET/PUT) + /api/dashboard/admin/mail/test. Guarded
// by role=admin + double-submit CSRF on writes (same pattern as the auth admin
// surface). The helpers translate between the backend's SMTP shape and the
// shapes Nasaq's SmtpSettings uses (SmtpConfig / SmtpSaveInput / TestOutcome).
"use client";

import type { SmtpConfig, SmtpSaveInput, TestOutcome, TestStepId } from "@fadymondy/nasaq/web";

const API = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";

async function csrf(): Promise<string> {
  const res = await fetch(`${API}/api/auth/csrf`, { credentials: "include" });
  const data = await res.json().catch(() => ({}));
  return data.csrf_token ?? "";
}

/** The backend's SMTP config. `secure` means TLS: implicit on port 465, STARTTLS otherwise. */
interface BackendMail { host?: string; port?: number; username?: string; password?: string; from?: string; secure?: boolean }
const MASK = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";

export const EMPTY_SMTP: SmtpConfig = { host: "", port: 587, encryption: "starttls", username: "", fromName: "", fromAddress: "", passwordSet: false };

function toSmtp(m: BackendMail): SmtpConfig {
  const from = m.from ?? "";
  const named = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  const port = m.port || 587;
  return {
    host: m.host ?? "",
    port,
    encryption: !m.secure ? "none" : port === 465 ? "tls" : "starttls",
    username: m.username ?? "",
    fromName: named ? named[1].replace(/^"|"$/g, "") : "",
    fromAddress: named ? named[2] : from,
    passwordSet: !!m.password,
  };
}

function fromSmtp(s: SmtpSaveInput): BackendMail {
  return {
    host: s.host,
    port: s.port,
    username: s.username,
    // An empty or masked password keeps the stored one server-side.
    password: s.password || MASK,
    from: s.fromName ? `${s.fromName} <${s.fromAddress}>` : s.fromAddress,
    secure: s.encryption !== "none",
  };
}

export type MailLoad = { config: SmtpConfig; available: boolean };

export async function loadMail(): Promise<MailLoad> {
  const res = await fetch(`${API}/api/dashboard/admin/mail`, { credentials: "include" });
  if (res.status === 404 || res.status === 501) return { config: EMPTY_SMTP, available: false };
  if (!res.ok) throw new Error(`load failed (${res.status})`);
  const body = (await res.json().catch(() => ({}))) as BackendMail;
  return { config: toSmtp(body), available: true };
}

export async function saveMail(input: SmtpSaveInput): Promise<void> {
  const token = await csrf();
  const res = await fetch(`${API}/api/dashboard/admin/mail`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
    body: JSON.stringify(fromSmtp(input)),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `save failed (${res.status})`);
  }
}

// The backend reports one error string; place it on the step it most likely failed at.
function failedStep(error: string): TestStepId {
  const e = error.toLowerCase();
  if (/dial|connect|refused|timeout|no such host|lookup/.test(e)) return "connect";
  if (/tls|certificate|x509|handshake/.test(e)) return "tls";
  if (/auth|credential|password|535/.test(e)) return "auth";
  return "send";
}

const STEPS: TestStepId[] = ["connect", "tls", "auth", "send"];

/** Saves the form first (the backend tests the saved config), then sends a test message. */
export async function testMail(input: SmtpSaveInput & { to: string }): Promise<TestOutcome> {
  let error: string | undefined;
  try {
    await saveMail(input);
    const token = await csrf();
    const res = await fetch(`${API}/api/dashboard/admin/mail/test`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
      body: JSON.stringify({ to: input.to }),
    });
    const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok) error = d.error || `test failed (${res.status})`;
    else if (!d.ok) error = d.error || "Test failed";
  } catch (e) {
    error = e instanceof Error ? e.message : "Test failed";
  }
  if (!error) return { ok: true, steps: STEPS.map((id) => ({ id, ok: true })) };
  const at = STEPS.indexOf(failedStep(error));
  return {
    ok: false,
    steps: STEPS.slice(0, at + 1).map((id, i) => (i < at ? { id, ok: true } : { id, ok: false, message: error })),
  };
}
