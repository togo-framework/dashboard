"use client";

import { useEffect, useState } from "react";
import {
  PageHeader, MailSettingsForm, useLanguage, type MailConfig,
} from "@togo-framework/ui";
import { loadMail, saveMail, testMail } from "@/lib/mail";
import { trans } from "@/lib/i18n";

export default function AdminMailPage() {
  const { language } = useLanguage();
  const [config, setConfig] = useState<MailConfig>({ port: 587, secure: true });
  const [available, setAvailable] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadMail()
      .then(({ config: c, available: a }) => { setConfig(c); setAvailable(a); })
      .catch(() => setAvailable(false))
      .finally(() => setLoaded(true));
  }, []);

  return (
    <div className="mx-auto max-w-2xl p-8">
      <PageHeader
        title={trans("admin.mail", "Mail")}
        description={trans("admin.mail_subtitle", "Outbound SMTP so reset and magic-link emails actually send")}
      />
      <div className="mt-6">
        {/* key flips once loaded so the kit form re-seeds from `value`. */}
        <MailSettingsForm
          key={loaded ? "loaded" : "init"}
          value={config}
          available={available}
          language={language}
          onSave={saveMail}
          onTest={testMail}
        />
      </div>
    </div>
  );
}
