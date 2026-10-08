"use client";

import { ShieldAlert } from "lucide-react";
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@fadymondy/nasaq/web";
import type { PendingPromotion } from "@/lib/promotion";
import type { ProvenanceField } from "@/lib/admin-errors";
import { trans } from "@/lib/i18n";

const FIELD_LABEL: Record<ProvenanceField, () => string> = {
  email: () => trans("admin.field_email", "email address"),
  password: () => trans("admin.field_password", "password"),
};

// Explicit confirmation before promoting an account whose email or password another
// administrator set. Cancel is the default; the server never gets the accept flag unless
// the administrator presses the confirm button here.
export function PromotionConfirmDialog({
  pending, busy, onConfirm, onCancel, nameOf,
}: {
  pending: PendingPromotion | null;
  busy: boolean;
  onConfirm: (p: PendingPromotion) => void;
  onCancel: () => void;
  /** Resolves an administrator id to a readable name (the email), falling back to the id. */
  nameOf: (id: string) => string;
}) {
  return (
    <Dialog open={!!pending} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        {pending ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="size-5" />
                {trans("admin.promote_confirm_title", "Confirm promotion to administrator")}
              </DialogTitle>
              <DialogDescription>
                {trans("admin.promote_confirm_desc", "Another administrator set part of this account’s sign-in. Promoting it would give that administrator a way into an administrator account.")}
              </DialogDescription>
            </DialogHeader>
            {pending.changed ? (
              <p role="alert" className="text-sm font-medium">
                {trans("admin.promote_changed", "The details changed since you last looked. Review them again before confirming.")}
              </p>
            ) : null}
            <dl className="flex flex-col gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">{trans("admin.promote_account", "Account")}</dt>
                <dd dir="ltr" className="font-medium">{pending.email}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{trans("admin.promote_roles", "New roles")}</dt>
                <dd dir="ltr">{pending.roles.join(", ")}</dd>
              </div>
              {pending.conflict.taintedFields.map((f) => (
                <div key={f} data-testid={`tainted-${f}`}>
                  <dt className="text-muted-foreground">
                    {trans("admin.promote_set_by", "Set by another administrator")}: {FIELD_LABEL[f]()}
                  </dt>
                  <dd dir="ltr">
                    {(pending.conflict.setBy[f] ?? []).map(nameOf).join(", ") || trans("admin.promote_unknown", "unknown")}
                    {pending.conflict.setAt[f] ? ` · ${new Date(pending.conflict.setAt[f]!).toLocaleString()}` : ""}
                  </dd>
                </div>
              ))}
            </dl>
            <DialogFooter>
              <Button variant="secondary" disabled={busy} onClick={onCancel}>
                {trans("common.cancel", "Cancel")}
              </Button>
              <Button variant="danger" disabled={busy} loading={busy} onClick={() => onConfirm(pending)}>
                {trans("admin.promote_confirm", "Promote anyway")}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
