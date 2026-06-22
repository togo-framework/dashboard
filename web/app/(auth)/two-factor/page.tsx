"use client";

import { useState } from "react";
import { auth } from "@/lib/auth";
import { trans } from "@/lib/i18n";
import { AuthCard, Field, Submit, ErrorText } from "@/components/auth-card";

export default function TwoFactorPage() {
  const [secret, setSecret] = useState("");
  const [otpauth, setOtpauth] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function enroll() {
    setBusy(true);
    setErr("");
    try {
      const r = await auth.enroll2fa();
      setSecret(r.secret);
      setOtpauth(r.otpauth_url);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await auth.verify2fa(code);
      setMsg(trans("auth.2fa.enabled", "Two-factor authentication enabled."));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title={trans("auth.2fa.title", "Two-factor authentication")} subtitle={trans("auth.2fa.subtitle", "Secure your account with an authenticator app")}>
      <ErrorText>{err}</ErrorText>
      {msg && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40">{msg}</p>}
      {!secret ? (
        <Submit onClick={enroll} disabled={busy}>{busy ? trans("auth.2fa.generating", "Generating…") : trans("auth.2fa.enable", "Enable 2FA")}</Submit>
      ) : (
        <form onSubmit={verify}>
          <p className="mb-2 text-sm text-slate-500">{trans("auth.2fa.scan", "Scan this URI in your authenticator app, then enter the code:")}</p>
          <code className="mb-4 block break-all rounded-lg bg-slate-100 p-2 text-xs dark:bg-slate-800">{otpauth}</code>
          <Field label={trans("auth.2fa.code", "6-digit code")} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required />
          <Submit disabled={busy}>{busy ? trans("auth.reset.verifying", "Verifying…") : trans("auth.2fa.confirm", "Confirm")}</Submit>
        </form>
      )}
    </AuthCard>
  );
}
