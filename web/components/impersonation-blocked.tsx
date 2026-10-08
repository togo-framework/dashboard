"use client";

import { UserCog } from "lucide-react";
import { PageHeader, ErrorState } from "@fadymondy/nasaq/web";
import { trans } from "@/lib/i18n";

// Admin user management, mail settings and the account's security settings are
// not available to an impersonated session (the server answers 403). The pages
// say so up front instead of offering controls that cannot work.
export function ImpersonationBlocked({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} />
      <ErrorState
        icon={UserCog}
        title={trans("admin.blocked_title", "Not available while impersonating")}
        description={trans("admin.blocked_desc", "End the impersonation to use this page. An impersonated session cannot manage users, mail or account security.")}
      />
    </div>
  );
}
