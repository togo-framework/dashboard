"use client";

import { useEffect, useState } from "react";
import { UserRound, ShieldCheck, KeyRound } from "lucide-react";
import { PageHeader, StatCard, StatGrid, LoadingState } from "@fadymondy/nasaq/web";
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

  if (!me) return <LoadingState />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={trans("dashboard.title", "Dashboard")} description={`${trans("dashboard.welcome", "Welcome back")}, ${me.email}`} />
      <StatGrid>
        <StatCard icon={<UserRound />} label={trans("dashboard.account", "Account")} value={me.email} />
        <StatCard icon={<ShieldCheck />} label={trans("dashboard.roles", "Roles")} value={me.roles?.join(", ") || "user"} />
        <StatCard icon={<KeyRound />} label={trans("dashboard.permissions", "Permissions")} value={me.permissions?.length ?? 0} />
      </StatGrid>
    </div>
  );
}
