// Promotion-to-administrator confirmation (auth v0.10.0, F12).
//
// Promoting an account whose email or password another administrator set is refused
// with 409. This hook turns that refusal into an explicit confirmation and enforces
// the rules around it:
//
//   - The accept flag is sent only by `confirm`, on the one PATCH the administrator
//     confirmed. It is never stored in state, never reused and never sent by a retry:
//     nothing here retries.
//   - A confirmation is bound to the exact request it was shown for (account, roles and
//     the server's conflict). A new request, a cancel, a reopened dialog or a changed 409
//     voids it; a fresh confirmation is required.
//   - `confirm` ignores re-entrant calls while a request is in flight.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminUsers } from "./admin-users";
import { ProvenanceConflictError, sameConflict, type ProvenanceConflict } from "./admin-errors";

export interface PendingPromotion {
  id: string;
  email: string;
  roles: string[];
  conflict: ProvenanceConflict;
  /** True when the server's answer to a confirmed attempt differs from what was confirmed. */
  changed: boolean;
}

export interface PromotionHandlers {
  /** The promotion went through (after a confirmation, or because none was needed). */
  onUpdated: () => void;
  /** A confirmed attempt failed for a reason other than a changed confirmation. */
  onError: (e: unknown) => void;
}

export function usePromotion({ onUpdated, onError }: PromotionHandlers) {
  const [pending, setPending] = useState<PendingPromotion | null>(null);
  const [busy, setBusy] = useState(false);
  const current = useRef<PendingPromotion | null>(null);
  const inflight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const show = useCallback((p: PendingPromotion | null) => {
    current.current = p;
    if (mounted.current) setPending(p);
  }, []);

  /**
   * Sends the role change without the accept flag. Resolves "updated", or "confirm" when the server
   * wants an explicit confirmation (the dialog is then up). Any other failure is thrown to the caller.
   */
  const request = useCallback(async (id: string, email: string, roles: string[]): Promise<"updated" | "confirm"> => {
    show(null); // a new request voids any earlier confirmation
    try {
      await adminUsers.update(id, { roles });
      return "updated";
    } catch (e) {
      if (e instanceof ProvenanceConflictError) {
        show({ id, email, roles: [...roles], conflict: e.conflict, changed: false });
        return "confirm";
      }
      throw e;
    }
  }, [show]);

  /** Resends the same PATCH, once, with the accept flag. A no-op unless `p` is the live confirmation. */
  const confirm = useCallback(async (p: PendingPromotion): Promise<void> => {
    if (inflight.current || current.current !== p) return;
    inflight.current = true;
    if (mounted.current) setBusy(true);
    try {
      await adminUsers.update(p.id, { roles: p.roles }, { acceptIdentitySetByOther: true });
      if (current.current === p) show(null);
      onUpdated();
    } catch (e) {
      if (e instanceof ProvenanceConflictError) {
        // The facts changed under the administrator: the earlier confirmation is void.
        show({ ...p, conflict: e.conflict, changed: !sameConflict(p.conflict, e.conflict) });
      } else {
        if (current.current === p) show(null);
        onError(e);
      }
    } finally {
      inflight.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [onError, onUpdated, show]);

  /** Closes the dialog. Ignored while a request is in flight. */
  const cancel = useCallback(() => {
    if (!inflight.current) show(null);
  }, [show]);

  return { pending, busy, request, confirm, cancel };
}
