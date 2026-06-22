// Prism-style dashboard shell: icon sidebar (with auto-discovered resources), a
// top bar, and a user dropdown (avatar → profile / sign out).
"use client";

import Link from "next/link";
import { ReactNode, useEffect, useRef, useState } from "react";
import { auth } from "@/lib/auth";
import { trans } from "@/lib/i18n";

const API = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";
const APP = process.env.NEXT_PUBLIC_APP_NAME ?? "togo";

const Icon = {
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  table: "M3 3h18v18H3zM3 9h18M9 3v18",
  user: "M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
};

function NavIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {d.split("M").filter(Boolean).map((seg, i) => <path key={i} d={"M" + seg} />)}
    </svg>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<any>(null);
  const [resources, setResources] = useState<{ name: string; table: string }[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    auth.me().then((u) => {
      if (!u) { window.location.href = "/login"; return; }
      setMe(u);
    });
    fetch(`${API}/api/_meta/resources`).then((r) => r.json()).then((d) => setResources(d.resources ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const initial = (me?.email ?? "?").charAt(0).toUpperCase();

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-900 p-4 sm:flex">
        <Link href="/dashboard" className="mb-8 flex items-center gap-2 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-400 to-indigo-500">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5Z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></svg>
          </span>
          <span className="font-semibold">{APP}</span>
        </Link>

        <nav className="space-y-1">
          <SideLink href="/dashboard" icon={Icon.grid} label={trans("nav.dashboard", "Dashboard")} />
          <SideLink href="/admin" icon={Icon.table} label={trans("nav.admin", "Admin")} />
        </nav>

        {resources.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wide text-slate-500">{trans("nav.resources", "Resources")}</p>
            <nav className="space-y-1">
              {resources.map((r) => (
                <SideLink key={r.table} href={`/admin/${r.table}`} icon={Icon.table} label={r.name || r.table} />
              ))}
            </nav>
          </div>
        )}

        <div className="mt-auto">
          <SideLink href="/profile" icon={Icon.user} label={trans("nav.profile", "Profile")} />
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end border-b border-slate-800 bg-slate-900/50 px-6 py-3">
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition hover:bg-white/5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 text-sm font-semibold text-white">{initial}</span>
              <span className="max-w-[160px] truncate text-sm text-slate-300">{me?.email ?? "…"}</span>
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-44 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-xl">
                <Link href="/profile" className="block px-4 py-2.5 text-sm hover:bg-white/5">{trans("nav.profile", "Profile")}</Link>
                <button
                  onClick={async () => { await auth.logout(); window.location.href = "/login"; }}
                  className="block w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-white/5"
                >
                  {trans("nav.sign_out", "Sign out")}
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function SideLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white">
      <NavIcon d={icon} />
      <span className="truncate capitalize">{label}</span>
    </Link>
  );
}
