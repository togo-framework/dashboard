"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/auth";
import { trans } from "@/lib/i18n";
import { messageOf } from "@/lib/http-error";
import { AuthCard, Field, Submit, ErrorText } from "@/components/auth-card";

// Lock screen: unlock the session with a PIN (set one from your profile first).
export default function LockPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await auth.verifyPin(pin);
      router.replace("/dashboard");
    } catch (e: unknown) {
      setErr(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title={trans("auth.lock.title", "Locked")} subtitle={trans("auth.lock.subtitle", "Enter your PIN to continue")}>
      <form onSubmit={unlock}>
        <ErrorText>{err}</ErrorText>
        <Field label={trans("auth.field.pin", "PIN")} type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} required minLength={4} />
        <Submit disabled={busy}>{busy ? trans("auth.lock.unlocking", "Unlocking…") : trans("auth.lock.unlock", "Unlock")}</Submit>
      </form>
    </AuthCard>
  );
}
