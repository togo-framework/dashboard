// Adapter over @togo-framework/ui auth/primitives so the auth pages
// (login/register/reset/two-factor/lock) + profile keep their existing imports.
// Uses the kit AuthCard (split-screen brand panel + form) and shadcn primitives.
"use client";

import { ReactNode, useEffect, useId, useState } from "react";
import { ShieldCheck, Terminal } from "lucide-react";
import {
  AuthCard as KitAuthCard,
  AuthErrorAlert,
  Input,
  Label,
  Button,
  type AuthCardBrand,
} from "@togo-framework/ui";
import { trans } from "@/lib/i18n";

const APP = process.env.NEXT_PUBLIC_APP_NAME ?? "togo";

const BRAND: AuthCardBrand = {
  name: APP,
  icon: <ShieldCheck className="h-10 w-10" />,
  tagline: { en: "Authentication & identity", ar: "المصادقة والهوية" },
};

export function AuthCard({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <KitAuthCard brand={BRAND} language="en" layout="split">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      <div className="mt-6">{children}</div>
      {footer && <div className="mt-6 text-sm text-muted-foreground">{footer}</div>}
    </KitAuthCard>
  );
}

export function Field({ label, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <div className="mb-4 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...rest} />
    </div>
  );
}

export function Submit({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button className="w-full" {...rest}>
      {children}
    </Button>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <AuthErrorAlert error={String(children)} />;
}

type Method = { name: string; label: string; type: string; url: string };

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" /><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" /></svg>
);

// LoginMethods — the sign-in methods actually configured (dev login, OAuth),
// fetched from /api/auth/methods, rendered as buttons under the form.
export function LoginMethods() {
  const api = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";
  const [methods, setMethods] = useState<Method[]>([]);
  useEffect(() => {
    fetch(`${api}/api/auth/methods`).then((r) => r.json()).then((d) => setMethods(d.methods ?? [])).catch(() => {});
  }, [api]);

  if (methods.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {trans("auth.or", "or")}
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="space-y-2">
        {methods.map((m) => (
          <Button
            key={m.name}
            variant="outline"
            className="w-full"
            onClick={async () => {
              if (m.type === "dev") {
                await fetch(`${api}${m.url}`, { method: "POST", credentials: "include" });
                window.location.href = "/dashboard";
              } else {
                window.location.href = `${api}${m.url}`;
              }
            }}
          >
            {m.type === "dev" ? <Terminal className="h-4 w-4" /> : m.name === "google" ? <GoogleIcon /> : null}
            {m.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
