"use client";

import { useEffect, useState } from "react";
import { auth, type Me } from "@/lib/auth";
import { trans } from "@/lib/i18n";
import { messageOf } from "@/lib/http-error";
import { useImpersonation } from "@/lib/impersonation";
import { Field, Submit, ErrorText } from "@/components/auth-card";

export default function ProfilePage() {
  const imp = useImpersonation();
  const [me, setMe] = useState<Me | null>(null);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    auth.me().then(setMe).catch(() => setMe(null));
  }, []);

  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setMsg("");
    try { await auth.changePassword(oldPw, newPw); setMsg(trans("auth.profile.pw_updated", "Password updated.")); setOldPw(""); setNewPw(""); }
    catch (e: unknown) { setErr(messageOf(e)); }
  }
  async function savePin(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setMsg("");
    try { await auth.setPin(pin); setMsg(trans("auth.profile.pin_set", "PIN set.")); setPin(""); }
    catch (e: unknown) { setErr(messageOf(e)); }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-8">
      <header>
        <h1 className="text-2xl font-semibold">{trans("auth.profile.title", "Profile")}</h1>
        {me && <p className="text-slate-500">{me.email} · {trans("auth.profile.roles", "roles")}: {me.roles?.join(", ") || "—"}</p>}
      </header>

      {imp ? (
        <p role="note" className="border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {trans("auth.profile.impersonating", "You are impersonating this account. Password, PIN and two-factor settings are not available until you end the impersonation.")}
        </p>
      ) : null}
      <ErrorText>{err}</ErrorText>
      {msg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40">{msg}</p>}

      {!imp && (<>
      <section className="border border-slate-200 p-6 dark:border-slate-800">
        <h2 className="mb-4 font-medium">{trans("auth.profile.change_pw", "Change password")}</h2>
        <form onSubmit={changePw}>
          <Field label={trans("auth.profile.current_pw", "Current password")} type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} required />
          <Field label={trans("auth.profile.new_pw", "New password")} type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={8} />
          <Submit>{trans("auth.profile.update_pw", "Update password")}</Submit>
        </form>
      </section>

      <section className="border border-slate-200 p-6 dark:border-slate-800">
        <h2 className="mb-4 font-medium">{trans("auth.profile.pin_title", "Lock-screen PIN")}</h2>
        <form onSubmit={savePin}>
          <Field label={trans("auth.profile.pin_label", "PIN (min 4 digits)")} type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} required minLength={4} />
          <Submit>{trans("auth.profile.set_pin", "Set PIN")}</Submit>
        </form>
      </section>

      <section className="border border-slate-200 p-6 dark:border-slate-800">
        <h2 className="mb-2 font-medium">{trans("auth.2fa.title", "Two-factor authentication")}</h2>
        <a href="/two-factor" className="text-sm font-medium text-slate-900 underline dark:text-white">{trans("auth.profile.manage_2fa", "Manage 2FA →")}</a>
      </section>
      </>)}
    </div>
  );
}
