"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState, type MouseEvent } from "react";
import { LayoutGrid, Table2, UserRound, Users, Mail } from "lucide-react";
import {
  AppShell, AppHeader, AppMain, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarItem, SidebarTrigger, SidebarExpandedOnly,
  DropdownMenuItem, UserMenu, ImpersonationBanner, ProductMark, WsStatus, ThemeSwitcher, LocaleSwitcher,
  ErrorState, LoadingState, toast,
  type WsState,
} from "@fadymondy/nasaq/web";
import { auth, type Me } from "@/lib/auth";
import { messageOf } from "@/lib/http-error";
import { trans } from "@/lib/i18n";
import { stopImpersonation, useImpersonation } from "@/lib/impersonation";

const API = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";
const APP = process.env.NEXT_PUBLIC_APP_NAME ?? "togo";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [resources, setResources] = useState<{ name: string; table: string }[]>([]);
  const [live, setLive] = useState<WsState>("connecting");
  const imp = useImpersonation();

  // Session guard: signed out (401) goes to /login; any other failure is shown, not mistaken for a sign-out.
  // Re-runs when impersonation starts or stops, so the shell shows whose view this is.
  const impToken = imp?.token;
  useEffect(() => {
    let live = true;
    auth.me().then((u) => {
      if (!live) return;
      if (!u) { router.replace("/login"); return; }
      setAuthError(null);
      setMe(u);
    }).catch((e: unknown) => { if (live) setAuthError(messageOf(e)); });
    return () => { live = false; };
  }, [router, impToken]);

  useEffect(() => {
    fetch(`${API}/api/_meta/resources`).then((r) => r.json()).then((d) => setResources(d.resources ?? [])).catch(() => {});
    const es = new EventSource(`${API}/events`);
    es.onopen = () => setLive("connected");
    es.onerror = () => setLive(es.readyState === EventSource.CLOSED ? "offline" : "reconnecting");
    return () => es.close();
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
          {/* The server refuses user management and mail settings to an impersonated session, so they are not offered. */}
          {!imp && <SidebarItem {...link("/admin/users")} icon={<Users />}>{trans("nav.users", "Users")}</SidebarItem>}
          {!imp && <SidebarItem {...link("/admin/mail")} icon={<Mail />}>{trans("nav.mail", "Mail")}</SidebarItem>}
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
          onSignOut={async () => {
            try { await stopImpersonation(); } catch { /* the sign-out below still ends the administrator's session */ }
            await auth.logout();
            router.push("/login");
          }}
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
          hint={me?.impersonator ? trans("admin.impersonated_by", "Actions count as this user. Signed in as administrator {id}.").replace("{id}", me.impersonator) : undefined}
          onExit={async () => {
            try { await stopImpersonation(); }
            catch (e) { toast.error(messageOf(e)); }
            router.push("/admin/users");
          }}
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
      <AppMain>
        {authError ? (
          <ErrorState title={trans("common.session_error", "Could not load your session")} description={authError} />
        ) : me ? (
          children
        ) : (
          <LoadingState />
        )}
      </AppMain>
    </AppShell>
  );
}
