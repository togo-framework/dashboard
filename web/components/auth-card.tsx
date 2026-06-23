// Prism-style auth shell: form on the left, a branded gradient panel with an icon
// on the right. Self-contained (Tailwind only) so it compiles in any togo app.
"use client";

import { ReactNode, useEffect, useState } from "react";
import { ShieldCheck, Lock } from "lucide-react";
import { Field as KitField, Input as KitInput, Button as KitButton } from "@togo-framework/ui";
import { trans } from "@/lib/i18n";

const APP = process.env.NEXT_PUBLIC_APP_NAME ?? "togo";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      {/* Form side */}
      <div className="flex items-center justify-center bg-slate-950 px-6 py-12 text-white">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 mb-6 text-sm text-slate-400">{subtitle}</p>}
          {children}
          {footer && <div className="mt-6 text-sm text-slate-500">{footer}</div>}
        </div>
      </div>

      {/* Brand side */}
      <div className="relative hidden items-center justify-center overflow-hidden bg-gradient-to-br from-violet-500 to-indigo-600 md:flex">
        <div
          className="absolute inset-0 opacity-20"
          style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,.5) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
        />
        <div className="relative z-10 text-center text-white">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15 backdrop-blur">
            <ShieldCheck className="h-10 w-10" />
          </div>
          <h2 className="text-3xl font-bold">{APP}</h2>
          <p className="mt-2 text-white/70">{trans("auth.brand.tagline", "Authentication & identity")}</p>
          <p className="mt-8 inline-flex items-center gap-1.5 text-sm text-white/60">
            <Lock className="h-4 w-4" />
            {trans("auth.brand.secured", "Secured & encrypted")}
          </p>
        </div>
      </div>
    </div>
  );
}

// Field/Submit wrap the @togo-framework/ui kit so login/register stay unchanged.
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

type Method = { name: string; label: string; type: string; url: string };

// LoginMethods renders only the sign-in methods that are actually configured
// (OAuth providers via auth-oauth, developer login via auth-dev) — fetched from
// /api/auth/methods. Renders nothing if none are active.
export function LoginMethods() {
  const api = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";
  const [methods, setMethods] = useState<Method[]>([]);
  useEffect(() => {
    fetch(`${api}/api/auth/methods`).then((r) => r.json()).then((d) => setMethods(d.methods ?? [])).catch(() => {});
  }, [api]);

  if (methods.length === 0) return null;

  async function dev(url: string) {
    await fetch(`${api}${url}`, { method: "POST", credentials: "include" });
    window.location.href = "/dashboard";
  }

  return (
    <>
      <Divider label={trans("auth.or", "or")} />
      <div className="space-y-2">
        {methods.map((m) =>
          m.type === "dev" ? (
            <button
              key={m.name}
              onClick={() => dev(m.url)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 bg-slate-900 px-4 py-2.5 font-mono text-sm text-slate-300 transition hover:bg-slate-800"
            >
              <span className="text-violet-400">›_</span> {m.label}
            </button>
          ) : (
            <a
              key={m.name}
              href={`${api}${m.url}`}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 font-medium text-white transition hover:bg-slate-800"
            >
              {m.name === "google" && (
                <svg viewBox="0 0 24 24" className="h-4 w-4"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" /><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" /></svg>
              )}
              {m.label}
            </a>
          )
        )}
      </div>
    </>
  );
}

export function Divider({ label }: { label: string }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-slate-600">
      <span className="h-px flex-1 bg-slate-800" />
      {label}
      <span className="h-px flex-1 bg-slate-800" />
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{children}</p>;
}
