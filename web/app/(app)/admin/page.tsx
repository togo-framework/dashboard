"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trans } from "@/lib/i18n";

const API = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";

// Admin home — auto-discovers generated resources from /api/_meta/resources, so
// anything you `togo make:resource` shows up here automatically.
export default function AdminHome() {
  const [list, setList] = useState<{ name: string; table: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/_meta/resources`)
      .then((r) => r.json())
      .then((d) => setList(d.resources ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">{trans("admin.title", "Admin")}</h1>
      {loading ? (
        <p className="text-slate-500">{trans("common.loading", "Loading…")}</p>
      ) : list.length === 0 ? (
        <p className="text-slate-500">
          {trans("admin.empty_resources", "No resources yet — run `togo make:resource Post title:string` and they'll appear here.")}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r) => (
            <Link
              key={r.table}
              href={`/admin/${r.table}`}
              className="rounded-xl border border-slate-800 bg-slate-900 p-5 capitalize transition hover:border-violet-500/50 hover:bg-slate-800/60"
            >
              <span className="text-base font-medium">{r.name || r.table}</span>
              <p className="mt-1 text-xs text-slate-500">/api/{r.table}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
