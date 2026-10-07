"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserRound, ShieldCheck, KeyRound } from "lucide-react";
import { PageHeader, StatCard, StatGrid, LoadingState, ErrorState } from "@fadymondy/nasaq/web";
import { auth, type Me } from "@/lib/auth";
import { messageOf } from "@/lib/http-error";
import { trans } from "@/lib/i18n";

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    auth.me().then((u) => {
      if (!u) { router.replace("/login"); return; }
      setMe(u);
    }).catch((e: unknown) => setError(messageOf(e)));
  }, [router]);

  if (error) return <ErrorState title={trans("dashboard.load_failed", "Could not load your session")} description={error} />;
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
