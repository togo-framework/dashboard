"use client";

import { use, useEffect, useState } from "react";
import { Pencil, Trash2, Eye } from "lucide-react";
import { PageHeader, DataTable, Modal, Button, Field, Input, DetailGrid, type Column } from "@togo-framework/ui";
import { adminList, adminCreate, adminUpdate, adminDelete, editableColumns } from "@/lib/admin";
import { trans } from "@/lib/i18n";

const API = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";
type Row = Record<string, any>;

export default function AdminResourcePage({ params }: { params: Promise<{ resource: string }> }) {
  const { resource } = use(params);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [cols, setCols] = useState<string[]>([]);
  const [live, setLive] = useState(false);
  const [err, setErr] = useState("");
  const [modal, setModal] = useState<{ mode: "create" | "edit" | "view" | "delete"; row?: Row } | null>(null);

  async function refresh() {
    const data = await adminList(resource);
    setRows(data);
    if (data[0]) setCols(editableColumns(data[0]));
  }

  useEffect(() => {
    refresh();
    const es = new EventSource(`${API}/events`);
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = () => refresh();
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource]);

  const dataCols: Column<Row>[] = (rows?.[0] ? Object.keys(rows[0]) : ["id", ...cols]).map((k) => ({
    key: k,
    label: k,
    kind: k === "id" ? "mono" : k.endsWith("_at") ? "date" : "text",
  }));
  dataCols.push({
    key: "_actions",
    label: trans("admin.actions", "Actions"),
    render: (row) => (
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="ghost" icon={<Eye className="h-3.5 w-3.5" />} onClick={() => setModal({ mode: "view", row })}>{trans("admin.view", "View")}</Button>
        <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setModal({ mode: "edit", row })}>{trans("admin.edit", "Edit")}</Button>
        <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setModal({ mode: "delete", row })}>{trans("admin.delete", "Delete")}</Button>
      </div>
    ),
  });

  const editCols = cols.length ? cols : ["title"];

  return (
    <div className="mx-auto max-w-6xl p-8">
      <PageHeader
        title={resource}
        count={rows?.length}
        subtitle={live ? trans("admin.live", "Realtime · live") : trans("admin.offline", "Realtime offline")}
        actions={<Button variant="primary" onClick={() => setModal({ mode: "create" })}>+ {trans("admin.create", "Create")}</Button>}
      />

      {err && <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{err}</p>}

      <DataTable columns={dataCols} rows={rows} getRowKey={(r) => r.id} emptyLabel={trans("admin.empty", "No records yet")} />

      {/* Create / Edit */}
      <Modal
        open={modal?.mode === "create" || modal?.mode === "edit"}
        onClose={() => setModal(null)}
        title={modal?.mode === "edit" ? trans("admin.edit", "Edit") : trans("admin.create", "Create")}
      >
        {modal && (modal.mode === "create" || modal.mode === "edit") && (
          <FormBody
            cols={editCols}
            row={modal.mode === "edit" ? modal.row : undefined}
            submitLabel={modal.mode === "edit" ? trans("admin.save", "Save") : trans("admin.create", "Create")}
            onSubmit={async (data) => {
              setErr("");
              try {
                if (modal.mode === "edit") await adminUpdate(resource, modal.row!.id, data);
                else await adminCreate(resource, data);
                setModal(null); await refresh();
              } catch (e: any) { setErr(e.message); }
            }}
          />
        )}
      </Modal>

      {/* View */}
      <Modal open={modal?.mode === "view"} onClose={() => setModal(null)} title={resource.replace(/s$/, "")}>
        {modal?.row && <DetailGrid fields={Object.entries(modal.row).map(([label, value]) => ({ label, value: String(value ?? "—") }))} />}
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={modal?.mode === "delete"}
        onClose={() => setModal(null)}
        title={trans("admin.confirm_delete", "Delete record")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>{trans("admin.cancel", "Cancel")}</Button>
            <Button variant="danger" onClick={async () => {
              setErr("");
              try { await adminDelete(resource, modal!.row!.id); setModal(null); await refresh(); }
              catch (e: any) { setErr(e.message); }
            }}>{trans("admin.delete", "Delete")}</Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">{trans("admin.delete_confirm", "This action cannot be undone. Delete this record?")}</p>
      </Modal>
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
        <Field key={c} label={c}>
          <Input value={form[c] ?? ""} onChange={(e) => setForm({ ...form, [c]: e.target.value })} />
        </Field>
      ))}
      <Button type="submit" variant="primary" className="w-full">{submitLabel}</Button>
    </form>
  );
}
