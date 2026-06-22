"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/auth";
import { trans } from "@/lib/i18n";

// Dashboard home (prism-inspired). Redirects to /login when unauthenticated.
export default function DashboardPage() {
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    auth.me().then((u) => {
      if (!u) {
        window.location.href = "/login";
        return;
      }
      setMe(u);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="p-8 text-slate-500">{trans("common.loading", "Loading…")}</div>;

  const cards = [
    { label: trans("dashboard.account", "Account"), value: me.email },
    { label: trans("dashboard.roles", "Roles"), value: me.roles?.join(", ") || "user" },
    { label: trans("dashboard.permissions", "Permissions"), value: String(me.permissions?.length ?? 0) },
  ];

  return (
    <div className="mx-auto max-w-5xl p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">{trans("dashboard.title", "Dashboard")}</h1>
        <p className="text-slate-500">{trans("dashboard.welcome", "Welcome back")}, {me.email}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm text-slate-500">{c.label}</p>
            <p className="mt-1 truncate text-lg font-medium">{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
