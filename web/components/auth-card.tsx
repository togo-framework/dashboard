// Adapter over @togo-framework/ui auth components so the auth pages
// (login/register/reset/two-factor/lock) keep their existing imports. The
// split-screen shell lives in app/(auth)/layout.tsx (kit AuthLayout); here we
// re-export the form container + field/submit/error/methods.
"use client";

import { ReactNode, useEffect, useState } from "react";
import { Terminal } from "lucide-react";
import {
  AuthCard as KitAuthCard,
  AuthError,
  AuthMethods,
  Field as KitField,
  Input as KitInput,
  Button as KitButton,
  type AuthMethod,
} from "@togo-framework/ui";
import { trans } from "@/lib/i18n";

export { KitAuthCard as AuthCard };

export function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <div className="mb-4">
      <KitField label={label}>
        <KitInput {...rest} />
      </KitField>
    </div>
  );
}

export function Submit({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <KitButton variant="primary" className="w-full" {...rest}>
      {children}
    </KitButton>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  return <AuthError>{children}</AuthError>;
}

type Method = { name: string; label: string; type: string; url: string };

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" /><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" /></svg>
);

// LoginMethods → kit AuthMethods, populated from /api/auth/methods (only methods
// that are actually configured: OAuth providers, dev login).
export function LoginMethods() {
  const api = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";
  const [methods, setMethods] = useState<Method[]>([]);
  useEffect(() => {
    fetch(`${api}/api/auth/methods`).then((r) => r.json()).then((d) => setMethods(d.methods ?? [])).catch(() => {});
  }, [api]);

  const items: AuthMethod[] = methods.map((m) => ({
    key: m.name,
    label: m.label,
    icon: m.type === "dev" ? <Terminal className="h-4 w-4 text-violet-400" /> : m.name === "google" ? <GoogleIcon /> : undefined,
    onClick: async () => {
      if (m.type === "dev") {
        await fetch(`${api}${m.url}`, { method: "POST", credentials: "include" });
        window.location.href = "/dashboard";
      } else {
        window.location.href = `${api}${m.url}`;
      }
    },
  }));

  return <AuthMethods methods={items} dividerLabel={trans("auth.or", "or")} />;
}
