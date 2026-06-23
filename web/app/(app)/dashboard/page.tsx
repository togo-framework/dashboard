"use client";

import { useEffect, useState } from "react";
import { Mail, Shield, KeyRound } from "lucide-react";
import { PageHeader, StatCard } from "@togo-framework/ui";
import { auth } from "@/lib/auth";
import { trans } from "@/lib/i18n";

export default function DashboardPage() {
  const [me, setMe] = useState<any>(null);

  useEffect(() => {
    auth.me().then((u) => {
      if (!u) { window.location.href = "/login"; return; }
      setMe(u);
    });
  }, []);

  if (!me) return <div className="p-8 text-slate-500">{trans("common.loading", "Loading…")}</div>;

  return (
    <div className="mx-auto max-w-6xl p-8">
      <PageHeader title={trans("dashboard.title", "Dashboard")} subtitle={`${trans("dashboard.welcome", "Welcome back")}, ${me.email}`} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={<Mail className="h-4 w-4" />} label={trans("dashboard.account", "Account")} value={me.email} accent="#7c3aed" />
        <StatCard icon={<Shield className="h-4 w-4" />} label={trans("dashboard.roles", "Roles")} value={me.roles?.join(", ") || "user"} accent="#06b6d4" />
        <StatCard icon={<KeyRound className="h-4 w-4" />} label={trans("dashboard.permissions", "Permissions")} value={String(me.permissions?.length ?? 0)} accent="#22c55e" />
      </div>
    </div>
  );
}
