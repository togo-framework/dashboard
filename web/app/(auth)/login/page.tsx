"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/auth";
import { trans } from "@/lib/i18n";
import { messageOf } from "@/lib/http-error";
import { AuthCard, Field, Submit, ErrorText, LoginMethods } from "@/components/auth-card";

export default function LoginPage() {
  const router = useRouter();
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
      router.replace("/dashboard");
    } catch (e: unknown) {
      setErr(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={trans("auth.login.title", "Welcome back")}
      subtitle={trans("auth.login.subtitle", "Sign in to your account")}
      footer={
        <span>
          {trans("auth.login.no_account", "No account?")}{" "}
          <Link href="/register" className="font-medium text-violet-400 hover:underline">{trans("auth.register.cta", "Create one")}</Link>
          {" · "}
          <Link href="/reset" className="text-slate-500 hover:underline">{trans("auth.login.forgot", "Forgot password?")}</Link>
        </span>
      }
    >
      <form onSubmit={submit}>
        <ErrorText>{err}</ErrorText>
        <Field label={trans("auth.field.email", "Email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field label={trans("auth.field.password", "Password")} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Submit disabled={busy}>{busy ? trans("auth.login.busy", "Signing in…") : trans("auth.login.submit", "Sign in")}</Submit>
      </form>
      <LoginMethods />
    </AuthCard>
  );
}
