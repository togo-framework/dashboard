"use client";

import { useState } from "react";
import { auth } from "@/lib/auth";
import { trans } from "@/lib/i18n";
import { AuthCard, Field, Submit, ErrorText } from "@/components/auth-card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await auth.login(email, password);
      window.location.href = "/dashboard";
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={trans("auth.login.title", "Welcome back")}
      subtitle={trans("auth.login.subtitle", "Sign in to your account")}
      footer={
        <>
          {trans("auth.login.no_account", "No account?")}{" "}
          <a href="/register" className="font-medium text-slate-900 underline dark:text-white">{trans("auth.register.cta", "Create one")}</a>
          <br />
          <a href="/reset" className="text-slate-500 underline">{trans("auth.login.forgot", "Forgot password?")}</a>
        </>
      }
    >
      <form onSubmit={submit}>
        <ErrorText>{err}</ErrorText>
        <Field label={trans("auth.field.email", "Email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field label={trans("auth.field.password", "Password")} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Submit disabled={busy}>{busy ? trans("auth.login.busy", "Signing in…") : trans("auth.login.submit", "Sign in")}</Submit>
      </form>
    </AuthCard>
  );
}
