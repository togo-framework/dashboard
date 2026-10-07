"use client";

import { ShieldAlert } from "lucide-react";
import { ErrorState } from "@fadymondy/nasaq/web";
import { trans } from "@/lib/i18n";

// Shown in place of an admin page when the API answers 403. Hiding UI is not
// security (the server enforces it); this just gives a clear answer, not a crash.
export function ForbiddenState({ description }: { description?: string }) {
  return (
    <ErrorState
      icon={ShieldAlert}
      title={trans("common.forbidden", "Forbidden")}
      description={description ?? trans("common.forbidden_desc", "You don’t have permission to view this page (403).")}
    />
  );
}
