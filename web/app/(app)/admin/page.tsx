"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Table2 } from "lucide-react";
import { PageHeader, Card } from "@togo-framework/ui";
import { trans } from "@/lib/i18n";

const API = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";

export default function AdminHome() {
  const router = useRouter();
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
    <div className="mx-auto max-w-5xl p-8">
      <PageHeader title={trans("admin.title", "Admin")} count={list.length} subtitle={trans("admin.subtitle", "Manage your resources")} />
      {loading ? (
        <p className="text-slate-500">{trans("common.loading", "Loading…")}</p>
      ) : list.length === 0 ? (
        <Card padded>
          <p className="text-slate-400">{trans("admin.empty_resources", "No resources yet — run `togo make:resource Post title:string` and they'll appear here.")}</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r) => (
            <button key={r.table} onClick={() => router.push(`/admin/${r.table}`)} className="text-start">
              <Card padded className="transition hover:border-violet-500/50">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600/15 text-violet-400"><Table2 className="h-4 w-4" /></span>
                  <span>
                    <span className="block font-medium capitalize">{r.name || r.table}</span>
                    <span className="block text-xs text-slate-500">/api/{r.table}</span>
                  </span>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
