// Dashboard layout (prism-style): sidebar + topbar shell wrapping every page in
// the (app) route group. Add pages under (app)/ and they inherit this chrome.
"use client";

import { ReactNode, useEffect, useState } from "react";
import { auth } from "@/lib/auth";
import { trans } from "@/lib/i18n";

const nav = [
  { href: "/dashboard", label: () => trans("nav.dashboard", "Dashboard") },
  { href: "/admin", label: () => trans("nav.admin", "Admin") },
  { href: "/profile", label: () => trans("nav.profile", "Profile") },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState("");
  useEffect(() => {
    auth.me().then((u) => {
      if (!u) {
        window.location.href = "/login";
        return;
      }
      setEmail(u.email);
    });
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-white">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:block">
        <div className="mb-8 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 font-bold text-white dark:bg-white dark:text-slate-900">t</div>
          <span className="font-semibold">togo</span>
        </div>
        <nav className="space-y-1">
          {nav.map((n) => (
            <a key={n.href} href={n.href} className="block rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
              {n.label()}
            </a>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
          <span className="text-sm text-slate-500">{email}</span>
          <button
            onClick={async () => { await auth.logout(); window.location.href = "/login"; }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            {trans("nav.sign_out", "Sign out")}
          </button>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
