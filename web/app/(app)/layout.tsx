"use client";

import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { LayoutGrid, Table2, User, LogOut, Layers } from "lucide-react";
import { AdminShell, UserMenu, RealtimeDot } from "@togo-framework/ui";
import { auth } from "@/lib/auth";
import { trans } from "@/lib/i18n";

const API = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";
const APP = process.env.NEXT_PUBLIC_APP_NAME ?? "togo";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<any>(null);
  const [resources, setResources] = useState<{ name: string; table: string }[]>([]);
  const [live, setLive] = useState(false);

  useEffect(() => {
    auth.me().then((u) => {
      if (!u) { router.push("/login"); return; }
      setMe(u);
    });
    fetch(`${API}/api/_meta/resources`).then((r) => r.json()).then((d) => setResources(d.resources ?? [])).catch(() => {});
    const es = new EventSource(`${API}/events`);
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    return () => es.close();
  }, [router]);

  const nav = [
    { key: "/dashboard", label: trans("nav.dashboard", "Dashboard"), icon: <LayoutGrid className="h-4 w-4" />, active: pathname === "/dashboard" },
    { key: "/admin", label: trans("nav.admin", "Admin"), icon: <Table2 className="h-4 w-4" />, active: pathname === "/admin" },
    ...resources.map((r) => ({
      key: `/admin/${r.table}`,
      label: r.name || r.table,
      icon: <Table2 className="h-4 w-4" />,
      active: pathname === `/admin/${r.table}`,
    })),
    { key: "/profile", label: trans("nav.profile", "Profile"), icon: <User className="h-4 w-4" />, active: pathname === "/profile" },
  ];

  return (
    <AdminShell
      brand={{ name: APP, subtitle: trans("nav.subtitle", "Dashboard"), icon: <Layers className="h-4 w-4" /> }}
      nav={nav}
      groupLabel={trans("nav.menu", "Menu")}
      onNavigate={(key) => router.push(key)}
      headerLeft={<RealtimeDot connected={live} label={live ? trans("nav.live", "Realtime connected") : trans("nav.offline", "Offline")} />}
      headerRight={
        <UserMenu
          email={me?.email ?? "…"}
          items={[
            { label: trans("nav.profile", "Profile"), icon: <User className="h-4 w-4" />, onClick: () => router.push("/profile") },
            { label: trans("nav.sign_out", "Sign out"), icon: <LogOut className="h-4 w-4" />, danger: true, onClick: async () => { await auth.logout(); router.push("/login"); } },
          ]}
        />
      }
    >
      {children}
    </AdminShell>
  );
}
