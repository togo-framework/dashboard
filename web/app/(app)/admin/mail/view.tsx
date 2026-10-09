"use client";

import { useEffect, useState } from "react";
import { PageHeader, SmtpSettings, ErrorState, type SmtpConfig } from "@fadymondy/nasaq/web";
import { loadMail, saveMail, testMail, EMPTY_SMTP } from "@/lib/mail";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/auth";
import { ForbiddenState } from "@/components/forbidden-state";
import { isForbidden, isUnauthorized, messageOf } from "@/lib/http-error";
import { trans } from "@/lib/i18n";
import { useImpersonation } from "@/lib/impersonation";
import { ImpersonationBlocked } from "@/components/impersonation-blocked";

function AdminMailPageInner() {
  const router = useRouter();
  const [forbidden, setForbidden] = useState(false);
  const [config, setConfig] = useState<SmtpConfig>(EMPTY_SMTP);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [testTo, setTestTo] = useState("");

  useEffect(() => {
    auth.me().then((me) => setTestTo(me?.email ?? "")).catch(() => undefined);
    loadMail()
      .then(({ config: c, available: a }) => { setConfig(c); setAvailable(a); })
      .catch((e: unknown) => {
        if (isUnauthorized(e)) router.replace("/login");
        else if (isForbidden(e)) setForbidden(true);
        else setAvailable(false);
      })
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={trans("admin.mail", "Mail")}
        description={trans("admin.mail_subtitle", "Outbound SMTP so reset and magic-link emails actually send")}
      />
      {forbidden ? (
        <ForbiddenState />
      ) : available ? (
        <SmtpSettings
          value={config}
          loading={loading}
          defaultTestTo={testTo}
          onSave={async (input) => {
            try { await saveMail(input); setConfig((await loadMail()).config); }
            catch (e) {
              if (isForbidden(e)) setForbidden(true);
              return { error: messageOf(e) || trans("admin.save_failed", "Save failed") };
            }
          }}
          onTest={testMail}
        />
      ) : (
        <ErrorState
          title={trans("admin.mail_unavailable", "Mail API unavailable")}
          description={trans("admin.mail_unavailable_desc", "Install the dashboard backend to configure SMTP here.")}
        />
      )}
    </div>
  );
}

export default function AdminMailPage() {
  const imp = useImpersonation();
  if (imp) return <ImpersonationBlocked title={trans("admin.mail", "Mail")} />;
  return <AdminMailPageInner />;
}
