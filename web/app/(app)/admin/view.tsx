"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Table2 } from "lucide-react";
import { PageHeader, Card, EmptyState, Skeleton } from "@fadymondy/nasaq/web";
import { trans } from "@/lib/i18n";

const API = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";

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
    <div className="flex flex-col gap-6">
      <PageHeader title={trans("admin.title", "Admin")} description={`${trans("admin.subtitle", "Manage your resources")} · ${list.length}`} />
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={Table2}
          title={trans("admin.empty_title", "No resources yet")}
          description={trans("admin.empty_resources", "Run `togo make:resource Post title:string` and they'll appear here.")}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r) => (
            <Link key={r.table} href={`/admin/${r.table}`} className="block">
              <Card className="flex-row items-center gap-3 p-4 transition-colors hover:border-primary/50">
                <span className="flex size-9 items-center justify-center bg-primary/15 text-primary"><Table2 className="size-4" /></span>
                <span>
                  <span className="block font-medium capitalize">{r.name || r.table}</span>
                  <span className="block text-caption text-muted-foreground" dir="ltr">/api/{r.table}</span>
                </span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
