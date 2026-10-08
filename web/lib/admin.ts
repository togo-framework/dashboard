// Generic admin client — talks to any resource's REST endpoints (/api/<table>).
// These are "acting as the user" calls: while impersonating they carry the
// impersonation bearer, so the server applies the borrowed account's permissions.
"use client";

import { httpErrorFrom } from "./http-error";
import { impersonationHeaders } from "./impersonation";

const API = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";

export type AdminRow = Record<string, unknown>;

const JSON_HEADERS = { "Content-Type": "application/json" };

// resources lists the admin-managed tables. Set NEXT_PUBLIC_TOGO_RESOURCES to a
// comma-separated list (e.g. "posts,comments"); empty shows a hint.
export function resources(): string[] {
  const raw = process.env.NEXT_PUBLIC_TOGO_RESOURCES ?? "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function adminList(table: string): Promise<AdminRow[]> {
  const r = await fetch(`${API}/api/${table}`, { credentials: "include", headers: impersonationHeaders() });
  if (!r.ok) throw await httpErrorFrom(r, "load failed");
  const data: unknown = await r.json();
  return Array.isArray(data) ? (data as AdminRow[]) : [];
}

export async function adminCreate(table: string, data: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${API}/api/${table}`, {
    method: "POST",
    credentials: "include",
    headers: { ...JSON_HEADERS, ...impersonationHeaders() },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw await httpErrorFrom(r, "create failed");
}

export async function adminGet(table: string, id: string): Promise<AdminRow> {
  const r = await fetch(`${API}/api/${table}/${id}`, { credentials: "include", headers: impersonationHeaders() });
  if (!r.ok) throw await httpErrorFrom(r, "load failed");
  return (await r.json()) as AdminRow;
}

export async function adminUpdate(table: string, id: string, data: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${API}/api/${table}/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { ...JSON_HEADERS, ...impersonationHeaders() },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw await httpErrorFrom(r, "update failed");
}

export async function adminDelete(table: string, id: string): Promise<void> {
  const r = await fetch(`${API}/api/${table}/${id}`, { method: "DELETE", credentials: "include", headers: impersonationHeaders() });
  if (!r.ok && r.status !== 204) throw await httpErrorFrom(r, "delete failed");
}

// editableColumns returns row keys minus the system-managed ones.
export function editableColumns(row: AdminRow): string[] {
  return Object.keys(row).filter((k) => !["id", "created_at", "updated_at"].includes(k));
}
