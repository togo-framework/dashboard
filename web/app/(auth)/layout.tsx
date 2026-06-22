// Auth layout (prism-style): a full-screen, centered backdrop for all auth pages
// (login, register, reset, two-factor). Extend by adding pages under (auth).
import { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200 p-4 dark:from-slate-950 dark:to-slate-900">
      {children}
    </div>
  );
}
