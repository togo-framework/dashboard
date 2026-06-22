"use client";

import { useState } from "react";
import { auth } from "@/lib/auth";
import { trans } from "@/lib/i18n";
import { AuthCard, Field, Submit, ErrorText } from "@/components/auth-card";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await auth.register(email, password);
      window.location.href = "/dashboard";
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={trans("auth.register.title", "Create your account")}
      subtitle={trans("auth.register.subtitle", "Get started in seconds")}
      footer={<>{trans("auth.register.have_account", "Already registered?")} <a href="/login" className="font-medium text-slate-900 underline dark:text-white">{trans("auth.login.cta", "Sign in")}</a></>}
    >
      <form onSubmit={submit}>
        <ErrorText>{err}</ErrorText>
        <Field label={trans("auth.field.email", "Email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field label={trans("auth.field.password", "Password")} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        <Submit disabled={busy}>{busy ? trans("auth.register.busy", "Creating…") : trans("auth.register.submit", "Create account")}</Submit>
      </form>
    </AuthCard>
  );
}
