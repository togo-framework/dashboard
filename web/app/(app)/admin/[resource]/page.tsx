"use client";

import { use, useEffect, useMemo, useState } from "react";
import { Pencil, Trash2, Eye } from "lucide-react";
import {
  PageHeader, DataTable, Button, Input, Label,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  StatusBadge, type ColumnDef,
} from "@togo-framework/ui";
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

  const editCols = cols.length ? cols : ["title"];

  const columns = useMemo<ColumnDef<Row>[]>(() => {
    const keys = rows?.[0] ? Object.keys(rows[0]) : ["id", ...editCols];
    const dataCols: ColumnDef<Row>[] = keys.map((k) => ({
      accessorKey: k,
      header: k,
      cell: ({ getValue }) => {
        const v = getValue();
        if (v == null || v === "") return <span className="text-muted-foreground">—</span>;
        if (k === "id") return <span className="font-mono text-xs text-muted-foreground">{String(v)}</span>;
        if (k.endsWith("_at")) return <span className="text-muted-foreground">{String(v).slice(0, 19).replace("T", " ")}</span>;
        return <span className="block max-w-[280px] truncate">{String(v)}</span>;
      },
    }));
    dataCols.push({
      id: "_actions",
      header: () => <span className="sr-only">{trans("admin.actions", "Actions")}</span>,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button size="icon" variant="ghost" aria-label="view" onClick={() => setModal({ mode: "view", row: row.original })}><Eye className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" aria-label="edit" onClick={() => setModal({ mode: "edit", row: row.original })}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" aria-label="delete" className="text-destructive" onClick={() => setModal({ mode: "delete", row: row.original })}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ),
    });
    return dataCols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cols]);

  return (
    <div className="mx-auto max-w-6xl p-8">
      <PageHeader
        title={resource}
        description={trans("admin.records", "records")}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge tone={live ? "success" : "neutral"}>{live ? trans("admin.live", "Live") : trans("admin.offline", "Offline")}</StatusBadge>
            <Button onClick={() => setModal({ mode: "create" })}>+ {trans("admin.create", "Create")}</Button>
          </div>
        }
      />

      {err && <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>}

      <div className="mt-6">
        <DataTable data={rows ?? []} columns={columns} getRowId={(r) => String(r.id)} loading={rows === null} csvFilename={resource} />
      </div>

      {/* Create / Edit */}
      <Dialog open={modal?.mode === "create" || modal?.mode === "edit"} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">{modal?.mode === "edit" ? trans("admin.edit", "Edit") : trans("admin.create", "Create")} {resource.replace(/s$/, "")}</DialogTitle>
          </DialogHeader>
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
        </DialogContent>
      </Dialog>

      {/* View */}
      <Dialog open={modal?.mode === "view"} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">{resource.replace(/s$/, "")}</DialogTitle>
          </DialogHeader>
          {modal?.row && (
            <dl className="space-y-2 text-sm">
              {Object.entries(modal.row).map(([k, v]) => (
                <div key={k} className="flex gap-3 border-b border-border/60 py-1.5">
                  <dt className="w-32 shrink-0 text-muted-foreground">{k}</dt>
                  <dd className="break-all">{String(v ?? "—")}</dd>
                </div>
              ))}
            </dl>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={modal?.mode === "delete"} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{trans("admin.confirm_delete", "Delete record")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{trans("admin.delete_confirm", "This action cannot be undone. Delete this record?")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(null)}>{trans("admin.cancel", "Cancel")}</Button>
            <Button variant="destructive" onClick={async () => {
              setErr("");
              try { await adminDelete(resource, modal!.row!.id); setModal(null); await refresh(); }
              catch (e: any) { setErr(e.message); }
            }}>{trans("admin.delete", "Delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
        <div key={c} className="space-y-1.5">
          <Label htmlFor={`f-${c}`}>{c}</Label>
          <Input id={`f-${c}`} value={form[c] ?? ""} onChange={(e) => setForm({ ...form, [c]: e.target.value })} />
        </div>
      ))}
      <Button type="submit" className="w-full">{submitLabel}</Button>
    </form>
  );
}
