"use client";

import { resources } from "@/lib/admin";
import { trans } from "@/lib/i18n";

// Admin home — links to each managed resource. Set NEXT_PUBLIC_TOGO_RESOURCES
// (comma-separated table names) to populate the list.
export default function AdminHome() {
  const list = resources();
  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">{trans("admin.title", "Admin")}</h1>
      {list.length === 0 ? (
        <p className="text-slate-500">
          {trans("admin.configure", "Set NEXT_PUBLIC_TOGO_RESOURCES (e.g. \"posts,comments\") to list resources here.")}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((r) => (
            <a key={r} href={`/admin/${r}`} className="rounded-xl border border-slate-200 p-5 capitalize hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900">
              {r}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
