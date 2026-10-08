// Typed failures of the auth plugin's admin API (togo-framework/auth v0.10.0) and
// the user-facing text for each. The server's bodies are parsed here and never
// shown verbatim: the UI renders only the messages below.
//
//   409 identity_set_by_other_admin  promotion of an account whose email/password another
//                                    administrator set; needs an explicit confirmation
//   403 administrators cannot be acted on this way   (adminTargetErr) another administrator is
//                                    the target of an email/role/permission change, reset-password,
//                                    magic-link or impersonate
//   403 forbidden                    (requireAdmin) the caller is not an administrator, or is an
//                                    API token / impersonated session
//   429 too many requests            reset-password, magic-link and impersonate are rate limited
import { HttpError, messageOf } from "./http-error";
import { trans } from "./i18n";

export const PROVENANCE_ERROR = "identity_set_by_other_admin";
export const ADMIN_TARGET_ERROR = "administrators cannot be acted on this way";

export type ProvenanceField = "email" | "password";

/** The 409 body of a promotion that needs confirming, validated. */
export interface ProvenanceConflict {
  taintedFields: ProvenanceField[];
  /** Per field: the ids of every administrator who set it (the server sends them comma-separated). */
  setBy: Partial<Record<ProvenanceField, string[]>>;
  setAt: Partial<Record<ProvenanceField, string>>;
}

export class ProvenanceConflictError extends HttpError {
  conflict: ProvenanceConflict;
  constructor(conflict: ProvenanceConflict) {
    super(PROVENANCE_ERROR, 409);
    this.name = "ProvenanceConflictError";
    this.conflict = conflict;
  }
}

/** 403 from adminTargetErr: the action on another administrator is refused. */
export class AdminTargetError extends HttpError {
  constructor() {
    super(ADMIN_TARGET_ERROR, 403);
    this.name = "AdminTargetError";
  }
}

/** 429 from the sensitive-route limiter. */
export class RateLimitedError extends HttpError {
  retryAfter?: number;
  constructor(retryAfter?: number) {
    super("too many requests", 429);
    this.name = "RateLimitedError";
    this.retryAfter = retryAfter;
  }
}

const FIELDS: readonly ProvenanceField[] = ["email", "password"];
const isField = (v: unknown): v is ProvenanceField => typeof v === "string" && (FIELDS as readonly string[]).includes(v);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Returns the validated conflict, or null when the body is not a well-formed provenance conflict. */
export function parseProvenanceConflict(data: unknown): ProvenanceConflict | null {
  if (!isRecord(data) || data.error !== PROVENANCE_ERROR) return null;
  const tainted = data.tainted_fields;
  if (!Array.isArray(tainted) || tainted.length === 0 || !tainted.every(isField)) return null;
  const by = isRecord(data.set_by) ? data.set_by : {};
  const at = isRecord(data.set_at) ? data.set_at : {};
  const taintedFields = [...new Set(tainted)].sort();
  const setBy: ProvenanceConflict["setBy"] = {};
  const setAt: ProvenanceConflict["setAt"] = {};
  for (const f of taintedFields) {
    const raw = by[f];
    setBy[f] = typeof raw === "string" ? raw.split(",").map((s) => s.trim()).filter(Boolean).sort() : [];
    const when = at[f];
    if (typeof when === "string") setAt[f] = when;
  }
  return { taintedFields, setBy, setAt };
}

/** Two conflicts are the same confirmation only when fields, writers and times all match. */
export function sameConflict(a: ProvenanceConflict, b: ProvenanceConflict): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Maps a failed admin API response to a typed error. */
export async function adminErrorFrom(res: Response, fallback: string): Promise<HttpError> {
  const data: unknown = await res.json().catch(() => ({}));
  const error = isRecord(data) && typeof data.error === "string" ? data.error : "";
  if (res.status === 409) {
    const conflict = parseProvenanceConflict(data);
    if (conflict) return new ProvenanceConflictError(conflict);
  }
  if (res.status === 403) return error === ADMIN_TARGET_ERROR ? new AdminTargetError() : new HttpError("forbidden", 403);
  if (res.status === 429) {
    const secs = Number.parseInt(res.headers.get("Retry-After") ?? "", 10);
    return new RateLimitedError(Number.isFinite(secs) && secs > 0 ? secs : undefined);
  }
  if (res.status >= 500) return new HttpError(`${fallback} (${res.status})`, res.status);
  return new HttpError(error || `${fallback} (${res.status})`, res.status);
}

export const isAdminTarget = (e: unknown): boolean => e instanceof AdminTargetError;
export const isRateLimited = (e: unknown): boolean => e instanceof RateLimitedError;
/** requireAdmin's 403 (not adminTargetErr): the caller may not use the admin API at all. */
export const isCallerForbidden = (e: unknown): boolean =>
  e instanceof HttpError && e.status === 403 && !(e instanceof AdminTargetError);

/** User-facing text for an admin API failure. Never includes a raw server body. */
export function adminMessage(e: unknown): string {
  if (e instanceof AdminTargetError) {
    return trans("admin.err_admin_target", "Administrator accounts can’t be changed this way. Another administrator’s email, roles, permissions or sign-in can’t be modified, reset or impersonated from here.");
  }
  if (isCallerForbidden(e)) {
    return trans("admin.err_forbidden", "You don’t have permission to do this. Only a signed-in administrator can, not an API token or an impersonated session.");
  }
  if (e instanceof RateLimitedError) {
    return e.retryAfter
      ? trans("admin.err_rate_limited_after", "Too many requests. Try again in {n} seconds.").replace("{n}", String(e.retryAfter))
      : trans("admin.err_rate_limited", "Too many requests. Wait a moment, then try again.");
  }
  if (e instanceof ProvenanceConflictError) {
    return trans("admin.err_confirmation_required", "This change needs your confirmation.");
  }
  if (e instanceof HttpError && e.status >= 500) {
    return trans("admin.err_server", "The server could not complete the request. Try again later.");
  }
  return messageOf(e);
}
