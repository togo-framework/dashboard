"use client";

import { useEffect, useState } from "react";
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

  if (!me) return <div className="p-8 text-muted-foreground">{trans("common.loading", "Loading…")}</div>;

  return (
    <div className="mx-auto max-w-6xl p-8">
      <PageHeader title={trans("dashboard.title", "Dashboard")} description={`${trans("dashboard.welcome", "Welcome back")}, ${me.email}`} />
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={trans("dashboard.account", "Account")} value={me.email} />
        <StatCard label={trans("dashboard.roles", "Roles")} value={me.roles?.join(", ") || "user"} />
        <StatCard label={trans("dashboard.permissions", "Permissions")} value={String(me.permissions?.length ?? 0)} tone="muted" />
      </div>
    </div>
  );
}
