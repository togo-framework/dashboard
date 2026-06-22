// Generic admin client — talks to any resource's REST endpoints (/api/<table>).
"use client";

const API = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";

// resources lists the admin-managed tables. Set NEXT_PUBLIC_TOGO_RESOURCES to a
// comma-separated list (e.g. "posts,comments"); empty shows a hint.
export function resources(): string[] {
  const raw = process.env.NEXT_PUBLIC_TOGO_RESOURCES ?? "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function adminList(table: string): Promise<any[]> {
  const r = await fetch(`${API}/api/${table}`, { credentials: "include" });
  if (!r.ok) return [];
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

export async function adminCreate(table: string, data: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${API}/api/${table}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || d.detail || `create failed (${r.status})`);
  }
}

export async function adminGet(table: string, id: string): Promise<any> {
  const r = await fetch(`${API}/api/${table}/${id}`, { credentials: "include" });
  if (!r.ok) throw new Error(`load failed (${r.status})`);
  return r.json();
}

export async function adminUpdate(table: string, id: string, data: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${API}/api/${table}/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || d.detail || `update failed (${r.status})`);
  }
}

export async function adminDelete(table: string, id: string): Promise<void> {
  const r = await fetch(`${API}/api/${table}/${id}`, { method: "DELETE", credentials: "include" });
  if (!r.ok && r.status !== 204) throw new Error(`delete failed (${r.status})`);
}

// editableColumns returns row keys minus the system-managed ones.
export function editableColumns(row: Record<string, unknown>): string[] {
  return Object.keys(row).filter((k) => !["id", "created_at", "updated_at"].includes(k));
}
