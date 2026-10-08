"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth } from "@/lib/auth";
import { isUnauthorized, messageOf } from "@/lib/http-error";
import { trans } from "@/lib/i18n";
import { AuthCard, Field, Submit, ErrorText } from "@/components/auth-card";

// Landing page of the reset link an administrator (or the mail plugin) sends:
// AUTH_PUBLIC_URL + AUTH_RESET_PATH (default /reset-password) ?token=...
// The token is single-use; the server answers 401 when it is invalid, used or expired.
function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await auth.resetPassword(token, password);
      setDone(true);
    } catch (e: unknown) {
      setErr(isUnauthorized(e)
        ? trans("auth.reset_password.expired", "This reset link is invalid or has expired. Ask an administrator for a new one.")
        : messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={trans("auth.reset_password.title", "Choose a new password")}
      subtitle={done ? trans("auth.reset_password.done", "Password updated. You can sign in now.") : undefined}
      footer={<a href="/login" className="text-slate-500 underline">{trans("auth.reset.back", "Back to sign in")}</a>}
    >
      {done ? (
        <button type="button" className="underline" onClick={() => router.replace("/login")}>
          {trans("auth.login.submit", "Sign in")}
        </button>
      ) : !token ? (
        <ErrorText>{trans("auth.reset_password.missing", "This reset link is missing its token.")}</ErrorText>
      ) : (
        <form onSubmit={submit}>
          <ErrorText>{err}</ErrorText>
          <Field label={trans("auth.profile.new_pw", "New password")} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          <Submit disabled={busy}>{busy ? trans("auth.reset.sending", "Sending…") : trans("auth.profile.update_pw", "Update password")}</Submit>
        </form>
      )}
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
