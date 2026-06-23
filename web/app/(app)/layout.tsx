"use client";

import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { LayoutGrid, Table2, User, LogOut, Layers, ChevronDown } from "lucide-react";
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton,
  SidebarInset, SidebarTrigger,
  Avatar, AvatarFallback,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  StatusBadge,
} from "@togo-framework/ui";
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

  const primary = [
    { href: "/dashboard", label: trans("nav.dashboard", "Dashboard"), icon: <LayoutGrid className="h-4 w-4" /> },
    { href: "/admin", label: trans("nav.admin", "Admin"), icon: <Table2 className="h-4 w-4" /> },
  ];
  const initial = (me?.email ?? "?").charAt(0).toUpperCase();

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <button onClick={() => router.push("/dashboard")} className="flex items-center gap-2 px-2 py-1.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Layers className="h-4 w-4" />
            </span>
            <span className="truncate font-semibold">{APP}</span>
          </button>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              {primary.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton isActive={pathname === item.href} onClick={() => router.push(item.href)}>
                    {item.icon}
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>

          {resources.length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel>{trans("nav.resources", "Resources")}</SidebarGroupLabel>
              <SidebarMenu>
                {resources.map((r) => {
                  const href = `/admin/${r.table}`;
                  return (
                    <SidebarMenuItem key={r.table}>
                      <SidebarMenuButton isActive={pathname === href} onClick={() => router.push(href)}>
                        <Table2 className="h-4 w-4" />
                        <span className="capitalize">{r.name || r.table}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={pathname === "/profile"} onClick={() => router.push("/profile")}>
                <User className="h-4 w-4" />
                <span>{trans("nav.profile", "Profile")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 items-center justify-between gap-2 border-b border-border px-4">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <StatusBadge tone={live ? "success" : "neutral"}>
              {live ? trans("nav.live", "Realtime connected") : trans("nav.offline", "Offline")}
            </StatusBadge>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-full py-1 pe-3 ps-1 outline-none transition hover:bg-accent">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{initial}</AvatarFallback>
              </Avatar>
              <span className="max-w-[160px] truncate text-sm">{me?.email ?? "…"}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => router.push("/profile")}>
                <User className="me-2 h-4 w-4" />
                {trans("nav.profile", "Profile")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={async () => { await auth.logout(); router.push("/login"); }}>
                <LogOut className="me-2 h-4 w-4" />
                {trans("nav.sign_out", "Sign out")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
