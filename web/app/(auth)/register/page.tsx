"use client";

import Link from "next/link";
import { useState } from "react";
import { auth } from "@/lib/auth";
import { trans } from "@/lib/i18n";
import { AuthCard, Field, Submit, ErrorText, LoginMethods } from "@/components/auth-card";

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
      footer={
        <span>
          {trans("auth.register.have_account", "Already registered?")}{" "}
          <Link href="/login" className="font-medium text-violet-400 hover:underline">{trans("auth.login.cta", "Sign in")}</Link>
        </span>
      }
    >
      <form onSubmit={submit}>
        <ErrorText>{err}</ErrorText>
        <Field label={trans("auth.field.email", "Email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field label={trans("auth.field.password", "Password")} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        <Submit disabled={busy}>{busy ? trans("auth.register.busy", "Creating…") : trans("auth.register.submit", "Create account")}</Submit>
      </form>
      <LoginMethods />
    </AuthCard>
  );
}
