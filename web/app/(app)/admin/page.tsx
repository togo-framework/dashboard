"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Table2 } from "lucide-react";
import { PageHeader, Card, CardContent, EmptyState } from "@togo-framework/ui";
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
      <PageHeader title={trans("admin.title", "Admin")} description={`${trans("admin.subtitle", "Manage your resources")} · ${list.length}`} />
      <div className="mt-6">
        {loading ? (
          <p className="text-muted-foreground">{trans("common.loading", "Loading…")}</p>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Table2 className="h-6 w-6" />}
            title={trans("admin.empty_title", "No resources yet")}
            description={trans("admin.empty_resources", "Run `togo make:resource Post title:string` and they'll appear here.")}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((r) => (
              <button key={r.table} onClick={() => router.push(`/admin/${r.table}`)} className="text-start">
                <Card className="transition hover:border-primary/50">
                  <CardContent className="flex items-center gap-3 p-5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary"><Table2 className="h-4 w-4" /></span>
                    <span>
                      <span className="block font-medium capitalize">{r.name || r.table}</span>
                      <span className="block text-xs text-muted-foreground">/api/{r.table}</span>
                    </span>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
