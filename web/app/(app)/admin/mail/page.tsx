"use client";

import { useEffect, useState } from "react";
import { PageHeader, SmtpSettings, ErrorState, type SmtpConfig } from "@fadymondy/nasaq/web";
import { loadMail, saveMail, testMail, EMPTY_SMTP } from "@/lib/mail";
import { auth } from "@/lib/auth";
import { trans } from "@/lib/i18n";

export default function AdminMailPage() {
  const [config, setConfig] = useState<SmtpConfig>(EMPTY_SMTP);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [testTo, setTestTo] = useState("");

  useEffect(() => {
    auth.me().then((me) => setTestTo(me?.email ?? ""));
    loadMail()
      .then(({ config: c, available: a }) => { setConfig(c); setAvailable(a); })
      .catch(() => setAvailable(false))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={trans("admin.mail", "Mail")}
        description={trans("admin.mail_subtitle", "Outbound SMTP so reset and magic-link emails actually send")}
      />
      {available ? (
        <SmtpSettings
          value={config}
          loading={loading}
          defaultTestTo={testTo}
          onSave={async (input) => {
            try { await saveMail(input); setConfig((await loadMail()).config); }
            catch (e) { return { error: e instanceof Error ? e.message : trans("admin.save_failed", "Save failed") }; }
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
