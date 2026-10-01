"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState, type MouseEvent } from "react";
import { LayoutGrid, Table2, UserRound, Users, Mail } from "lucide-react";
import {
  AppShell, AppHeader, AppMain, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarItem, SidebarTrigger, SidebarExpandedOnly,
  DropdownMenuItem, UserMenu, ImpersonationBanner, ProductMark, WsStatus, ThemeSwitcher, LocaleSwitcher,
  type WsState,
} from "@fadymondy/nasaq/web";
import { auth } from "@/lib/auth";
import { trans } from "@/lib/i18n";
import { getImpersonation, onImpersonationChange, clearImpersonation, type Impersonation } from "@/lib/impersonation";

const API = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";
const APP = process.env.NEXT_PUBLIC_APP_NAME ?? "togo";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<any>(null);
  const [resources, setResources] = useState<{ name: string; table: string }[]>([]);
  const [live, setLive] = useState<WsState>("connecting");
  const [imp, setImp] = useState<Impersonation>(null);

  useEffect(() => {
    auth.me().then((u) => {
      if (!u) { router.push("/login"); return; }
      setMe(u);
    });
    fetch(`${API}/api/_meta/resources`).then((r) => r.json()).then((d) => setResources(d.resources ?? [])).catch(() => {});
    const es = new EventSource(`${API}/events`);
    es.onopen = () => setLive("connected");
    es.onerror = () => setLive(es.readyState === EventSource.CLOSED ? "offline" : "reconnecting");
    return () => es.close();
  }, [router]);

  useEffect(() => {
    setImp(getImpersonation());
    return onImpersonationChange(() => setImp(getImpersonation()));
  }, []);

  // SidebarItem is a real <a>: keep the href (open in new tab still works) and route in-app on a plain click.
  const link = (to: string) => ({
    href: to,
    active: pathname === to,
    onClick: (e: MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      router.push(to);
    },
  });
  const name = me?.email?.split("@")[0] ?? "…";

  const sidebar = (
    <Sidebar>
      <SidebarHeader>
        <Link href="/dashboard" className="flex items-center gap-2 px-2 py-1.5">
          <ProductMark size={24} />
          <SidebarExpandedOnly><span className="truncate font-semibold">{APP}</span></SidebarExpandedOnly>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarItem {...link("/dashboard")} icon={<LayoutGrid />}>{trans("nav.dashboard", "Dashboard")}</SidebarItem>
          <SidebarItem {...link("/admin")} icon={<Table2 />}>{trans("nav.admin", "Admin")}</SidebarItem>
          <SidebarItem {...link("/admin/users")} icon={<Users />}>{trans("nav.users", "Users")}</SidebarItem>
          <SidebarItem {...link("/admin/mail")} icon={<Mail />}>{trans("nav.mail", "Mail")}</SidebarItem>
        </SidebarGroup>

        {resources.length > 0 && (
          <SidebarGroup label={trans("nav.resources", "Resources")} collapsible>
            {resources.map((r) => (
              <SidebarItem key={r.table} {...link(`/admin/${r.table}`)} icon={<Table2 />} className="capitalize">
                {r.name || r.table}
              </SidebarItem>
            ))}
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        {/* Theme and language sit in the header, so the account menu leaves its own preference submenus out. */}
        <UserMenu
          user={{ name, email: me?.email ?? "" }}
          preferences={false}
          onSignOut={async () => { await auth.logout(); router.push("/login"); }}
          labels={{ signOut: trans("nav.sign_out", "Sign out") }}
        >
          <DropdownMenuItem onClick={() => router.push("/profile")}><UserRound />{trans("nav.profile", "Profile")}</DropdownMenuItem>
        </UserMenu>
      </SidebarFooter>
    </Sidebar>
  );

  return (
    <AppShell sidebar={sidebar}>
      {imp ? (
        <ImpersonationBanner
          as={{ name: imp.email, email: imp.email }}
          onExit={() => { clearImpersonation(); router.push("/admin/users"); }}
        />
      ) : null}
      <AppHeader>
        <SidebarTrigger />
        <WsStatus state={live} showLatency={false} />
        <div className="ms-auto flex items-center gap-1">
          <LocaleSwitcher />
          <ThemeSwitcher />
        </div>
      </AppHeader>
      <AppMain>{children}</AppMain>
    </AppShell>
  );
}
