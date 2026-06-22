"use client";

import { use, useEffect, useState } from "react";
import { adminList, adminCreate, adminDelete, editableColumns } from "@/lib/admin";
import { trans } from "@/lib/i18n";

// Generic CRUD admin for any resource — lists rows, creates, and deletes via the
// resource REST endpoints. Columns are inferred from the data.
export default function AdminResourcePage({ params }: { params: Promise<{ resource: string }> }) {
  const { resource } = use(params);
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [cols, setCols] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const data = await adminList(resource);
    setRows(data);
    if (data[0]) setCols(editableColumns(data[0]));
    setLoading(false);
  }
  useEffect(() => {
    refresh();
  }, [resource]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await adminCreate(resource, form);
      setForm({});
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function remove(id: string) {
    setErr("");
    try {
      await adminDelete(resource, id);
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  const headers = rows[0] ? Object.keys(rows[0]) : [];

  return (
    <div className="mx-auto max-w-5xl p-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold capitalize">{resource}</h1>
        <a href="/admin" className="text-sm text-slate-500 underline">{trans("admin.back", "← All resources")}</a>
      </header>

      {err && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/50">{err}</p>}

      {loading ? (
        <p className="text-slate-500">{trans("common.loading", "Loading…")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left dark:bg-slate-900">
              <tr>
                {headers.map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                  {headers.map((h) => <td key={h} className="px-4 py-2 align-top">{String(row[h] ?? "")}</td>)}
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => remove(row.id)} className="text-red-600 hover:underline">{trans("admin.delete", "Delete")}</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td className="px-4 py-6 text-slate-500" colSpan={99}>{trans("admin.empty", "No records yet.")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <section className="mt-8 rounded-xl border border-slate-200 p-6 dark:border-slate-800">
        <h2 className="mb-4 font-medium">{trans("admin.create", "Create")}</h2>
        <form onSubmit={create} className="space-y-3">
          {(cols.length ? cols : ["title"]).map((c) => (
            <label key={c} className="block">
              <span className="mb-1 block text-sm text-slate-600 dark:text-slate-400">{c}</span>
              <input
                value={form[c] ?? ""}
                onChange={(e) => setForm({ ...form, [c]: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
              />
            </label>
          ))}
          <button className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white dark:bg-white dark:text-slate-900">
            {trans("admin.create", "Create")}
          </button>
        </form>
      </section>
    </div>
  );
}
