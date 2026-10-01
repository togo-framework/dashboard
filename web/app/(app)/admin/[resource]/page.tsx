"use client";

import { use, useEffect, useMemo, useState } from "react";
import { Pencil, Trash2, Eye, Plus, Download } from "lucide-react";
import {
  PageHeader, Button, Alert, Status, Infolist, Field, FieldLabel, Input, toast,
  DataTable, DataTableToolbar, DataTableSearch, DataTableViewOptions, DataTableBulkActions, DataTablePagination,
  useDataTable, type DataTableColumn,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from "@fadymondy/nasaq/web";
import { adminList, adminCreate, adminUpdate, adminDelete, editableColumns } from "@/lib/admin";
import { trans } from "@/lib/i18n";

const API = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";
const PAGE_SIZE = 20;

type Row = Record<string, any>;
type Mode = "create" | "edit" | "view" | "delete";

const labelOf = (name: string) => name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function AdminResourcePage({ params }: { params: Promise<{ resource: string }> }) {
  const { resource } = use(params);
  const single = resource.replace(/s$/, "");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [cols, setCols] = useState<string[]>([]);
  const [live, setLive] = useState(false);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<{ mode: Mode; row?: Row; ids?: string[] } | null>(null);

  async function refresh() {
    const data = await adminList(resource);
    setRows(data);
    if (data[0]) setCols(editableColumns(data[0]));
  }

  useEffect(() => {
    setRows(null);
    refresh();
    const es = new EventSource(`${API}/events`);
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = () => refresh();
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource]);

  const editCols = cols.length ? cols : ["title"];

  const columns = useMemo<DataTableColumn<Row>[]>(() => {
    const keys = rows?.[0] ? Object.keys(rows[0]).filter((k) => k !== "id") : editCols;
    return [
      { id: "id", header: "ID", cell: (r) => <span className="text-muted-foreground">#{String(r.id)}</span>, sortValue: (r) => r.id, hideable: false },
      ...keys.map((k): DataTableColumn<Row> => ({
        id: k,
        header: labelOf(k),
        cell: (r) => <Cell k={k} v={r[k]} />,
        sortValue: (r) => r[k],
        filterValue: (r) => String(r[k] ?? ""),
      })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cols]);

  const table = useDataTable<Row>({
    data: rows ?? [],
    columns,
    getRowId: (r) => String(r.id),
    pageSize: PAGE_SIZE,
    selectable: true,
  });

  async function del(ids: string[]) {
    setErr("");
    try {
      await Promise.all(ids.map((id) => adminDelete(resource, id)));
      setModal(null);
      table.setSelection(new Set());
      toast.success(trans("admin.deleted", "Deleted"));
      await refresh();
    } catch (e: any) { setErr(e.message); toast.error(e.message); }
  }

  async function save(data: Record<string, string>) {
    setErr("");
    setSaving(true);
    try {
      if (modal?.mode === "edit") await adminUpdate(resource, modal.row!.id, data);
      else await adminCreate(resource, data);
      toast.success(modal?.mode === "edit" ? trans("admin.updated", "Updated") : trans("admin.created", "Created"));
      setModal(null);
      await refresh();
    } catch (e: any) { setErr(e.message); toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={labelOf(resource)}
        description={`${rows?.length ?? 0} ${trans("admin.records", "records")}`}
        actions={
          <div className="flex items-center gap-3">
            <Status tone={live ? "success" : "neutral"}>{live ? trans("admin.live", "Live") : trans("admin.offline", "Offline")}</Status>
            <Button variant="primary" onClick={() => { setErr(""); setModal({ mode: "create" }); }}><Plus />{trans("admin.create", "Create")}</Button>
          </div>
        }
      />

      {err && <Alert tone="danger" onDismiss={() => setErr("")}>{err}</Alert>}

      <div className="flex flex-col gap-3">
        <DataTableToolbar>
          <DataTableSearch table={table} />
          <DataTableViewOptions table={table} className="ms-auto" />
        </DataTableToolbar>
        <DataTableBulkActions table={table}>
          <Button size="sm" variant="secondary" onClick={() => exportRows(table.selectedRows, resource)}><Download />{trans("admin.export", "Export")}</Button>
          <Button size="sm" variant="danger" onClick={() => setModal({ mode: "delete", ids: [...table.selection] })}><Trash2 />{trans("admin.delete", "Delete")}</Button>
        </DataTableBulkActions>
        <DataTable
          table={table}
          label={labelOf(resource)}
          loading={rows === null}
          onRowClick={(r) => setModal({ mode: "view", row: r })}
          rowActions={(r) => [
            { id: "view", label: trans("admin.view", "View"), icon: Eye, onSelect: () => setModal({ mode: "view", row: r }) },
            { id: "edit", label: trans("admin.edit", "Edit"), icon: Pencil, onSelect: () => { setErr(""); setModal({ mode: "edit", row: r }); } },
            { id: "delete", label: trans("admin.delete", "Delete"), icon: Trash2, danger: true, group: "danger", onSelect: () => setModal({ mode: "delete", ids: [String(r.id)] }) },
          ]}
        />
        <DataTablePagination table={table} />
      </div>

      {/* Create / Edit */}
      <Dialog open={modal?.mode === "create" || modal?.mode === "edit"} onOpenChange={(o) => { if (!o) setModal(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">{modal?.mode === "edit" ? trans("admin.edit", "Edit") : trans("admin.create", "Create")} {single}</DialogTitle>
          </DialogHeader>
          {modal && (modal.mode === "create" || modal.mode === "edit") && (
            <FormBody
              cols={editCols}
              row={modal.mode === "edit" ? modal.row : undefined}
              saving={saving}
              submitLabel={modal.mode === "edit" ? trans("admin.save", "Save") : trans("admin.create", "Create")}
              onCancel={() => setModal(null)}
              onSubmit={save}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* View */}
      <Dialog open={modal?.mode === "view"} onOpenChange={(o) => { if (!o) setModal(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">{single}</DialogTitle>
          </DialogHeader>
          {modal?.row && (
            <Infolist
              items={Object.entries(modal.row).map(([k, v]) => ({
                id: k,
                label: labelOf(k),
                value: v == null || v === "" ? undefined : typeof v === "object" ? JSON.stringify(v) : String(v),
                copyable: k === "id",
              }))}
            />
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setModal(null)}>{trans("admin.close", "Close")}</Button>
            <Button variant="primary" onClick={() => modal?.row && setModal({ mode: "edit", row: modal.row })}>{trans("admin.edit", "Edit")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation (one row or the bulk selection) */}
      <AlertDialog open={modal?.mode === "delete"} onOpenChange={(o) => { if (!o) setModal(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {(modal?.ids?.length ?? 0) > 1
                ? `${trans("admin.delete", "Delete")} ${modal?.ids?.length} ${trans("admin.records", "records")}?`
                : trans("admin.confirm_delete", "Delete record")}
            </AlertDialogTitle>
            <AlertDialogDescription>{trans("admin.delete_confirm", "This action cannot be undone. Delete this record?")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{trans("admin.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={() => del(modal?.ids ?? [])}>{trans("admin.delete", "Delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Cell({ k, v }: { k: string; v: any }) {
  if (v == null || v === "") return <span className="text-muted-foreground">&mdash;</span>;
  if (k.endsWith("_at")) return <span className="text-muted-foreground">{String(v).slice(0, 19).replace("T", " ")}</span>;
  return <span className="line-clamp-1 max-w-[28ch]">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>;
}

function FormBody({ cols, row, saving, submitLabel, onCancel, onSubmit }: {
  cols: string[]; row?: Row; saving: boolean; submitLabel: string; onCancel: () => void; onSubmit: (d: Record<string, string>) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    cols.forEach((c) => (init[c] = row ? String(row[c] ?? "") : ""));
    return init;
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="flex flex-col gap-4">
      {cols.map((c) => (
        <Field key={c} name={c}>
          <FieldLabel>{labelOf(c)}</FieldLabel>
          <Input value={form[c] ?? ""} onChange={(e) => setForm({ ...form, [c]: e.target.value })} />
        </Field>
      ))}
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>{trans("admin.cancel", "Cancel")}</Button>
        <Button type="submit" variant="primary" loading={saving}>{submitLabel}</Button>
      </DialogFooter>
    </form>
  );
}

/** Export selected rows as a CSV download (bulk action). */
function exportRows(rows: Row[], name: string) {
  if (!rows.length) return;
  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}-selected.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
