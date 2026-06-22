"use client";

import { use, useEffect, useState } from "react";
import { adminList, adminCreate, adminUpdate, adminDelete, editableColumns } from "@/lib/admin";
import { trans } from "@/lib/i18n";

const API = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";

type Row = Record<string, any>;

export default function AdminResourcePage({ params }: { params: Promise<{ resource: string }> }) {
  const { resource } = use(params);
  const [rows, setRows] = useState<Row[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [err, setErr] = useState("");

  // modal: {mode:'create'|'edit'|'view'|'delete', row}
  const [modal, setModal] = useState<{ mode: string; row?: Row } | null>(null);

  async function refresh() {
    try {
      const data = await adminList(resource);
      setRows(data);
      if (data[0]) setCols(editableColumns(data[0]));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // Live updates via the realtime stream (SSE). Refresh on any resource event.
    const es = new EventSource(`${API}/events`);
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = () => refresh();
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource]);

  const headers = rows[0] ? Object.keys(rows[0]) : ["id", ...cols];

  return (
    <div className="mx-auto max-w-6xl p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold capitalize">{resource}</h1>
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-500">
            <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-400" : "bg-slate-600"}`} />
            {live ? trans("admin.live", "Live") : trans("admin.offline", "Offline")} · {rows.length} {trans("admin.records", "records")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-sm text-slate-500 hover:text-slate-300">← {trans("admin.back", "All resources")}</a>
          <button onClick={() => setModal({ mode: "create" })} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500">
            + {trans("admin.create", "Create")}
          </button>
        </div>
      </header>

      {err && <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{err}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              {headers.map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
              <th className="px-4 py-3 text-right">{trans("admin.actions", "Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={99} className="px-4 py-10 text-center text-slate-500">{trans("common.loading", "Loading…")}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={99} className="px-4 py-10 text-center text-slate-500">{trans("admin.empty", "No records yet.")}</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-800/70 hover:bg-white/[.02]">
                  {headers.map((h) => <td key={h} className="max-w-[240px] truncate px-4 py-3 text-slate-300">{String(row[h] ?? "")}</td>)}
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button onClick={() => setModal({ mode: "view", row })} className="text-slate-400 hover:text-white">{trans("admin.view", "View")}</button>
                    <button onClick={() => setModal({ mode: "edit", row })} className="ml-3 text-violet-400 hover:text-violet-300">{trans("admin.edit", "Edit")}</button>
                    <button onClick={() => setModal({ mode: "delete", row })} className="ml-3 text-red-400 hover:text-red-300">{trans("admin.delete", "Delete")}</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modalTitle(modal.mode, resource)} onClose={() => setModal(null)}>
          {modal.mode === "view" && <ViewBody row={modal.row!} />}
          {(modal.mode === "create" || modal.mode === "edit") && (
            <FormBody
              cols={cols.length ? cols : ["title"]}
              row={modal.mode === "edit" ? modal.row : undefined}
              submitLabel={modal.mode === "edit" ? trans("admin.save", "Save") : trans("admin.create", "Create")}
              onSubmit={async (data) => {
                setErr("");
                try {
                  if (modal.mode === "edit") await adminUpdate(resource, modal.row!.id, data);
                  else await adminCreate(resource, data);
                  setModal(null);
                  await refresh();
                } catch (e: any) { setErr(e.message); }
              }}
            />
          )}
          {modal.mode === "delete" && (
            <DeleteBody
              onCancel={() => setModal(null)}
              onConfirm={async () => {
                setErr("");
                try { await adminDelete(resource, modal.row!.id); setModal(null); await refresh(); }
                catch (e: any) { setErr(e.message); }
              }}
            />
          )}
        </Modal>
      )}
    </div>
  );
}

function modalTitle(mode: string, resource: string) {
  const r = resource.replace(/s$/, "");
  if (mode === "create") return trans("admin.create", "Create") + " " + r;
  if (mode === "edit") return trans("admin.edit", "Edit") + " " + r;
  if (mode === "view") return r;
  return trans("admin.confirm_delete", "Delete record");
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold capitalize">{title}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormBody({ cols, row, submitLabel, onSubmit }: { cols: string[]; row?: Row; submitLabel: string; onSubmit: (d: Record<string, string>) => void }) {
  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    cols.forEach((c) => (init[c] = row ? String(row[c] ?? "") : ""));
    return init;
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
      {cols.map((c) => (
        <label key={c} className="block">
          <span className="mb-1 block text-sm text-slate-400">{c}</span>
          <input
            value={form[c] ?? ""}
            onChange={(e) => setForm({ ...form, [c]: e.target.value })}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-violet-500"
          />
        </label>
      ))}
      <button className="w-full rounded-lg bg-violet-600 px-4 py-2.5 font-semibold text-white hover:bg-violet-500">{submitLabel}</button>
    </form>
  );
}

function ViewBody({ row }: { row: Row }) {
  return (
    <dl className="space-y-2 text-sm">
      {Object.entries(row).map(([k, v]) => (
        <div key={k} className="flex gap-3 border-b border-slate-800/60 py-1.5">
          <dt className="w-32 shrink-0 text-slate-500">{k}</dt>
          <dd className="break-all text-slate-200">{String(v ?? "")}</dd>
        </div>
      ))}
    </dl>
  );
}

function DeleteBody({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div>
      <p className="text-slate-300">{trans("admin.delete_confirm", "This action cannot be undone. Delete this record?")}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onCancel} className="rounded-lg border border-slate-700 px-4 py-2 text-sm">{trans("admin.cancel", "Cancel")}</button>
        <button onClick={onConfirm} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">{trans("admin.delete", "Delete")}</button>
      </div>
    </div>
  );
}
