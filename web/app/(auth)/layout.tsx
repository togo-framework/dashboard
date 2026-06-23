// Auth layout — the kit's split-screen shell (form side + branded BrandPanel).
"use client";

import { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { AuthLayout } from "@togo-framework/ui";
import { trans } from "@/lib/i18n";

const APP = process.env.NEXT_PUBLIC_APP_NAME ?? "togo";

export default function AuthRouteLayout({ children }: { children: ReactNode }) {
  return (
    <AuthLayout brand={{ name: APP, tagline: trans("auth.brand.tagline", "Authentication & identity"), icon: <ShieldCheck className="h-10 w-10" /> }}>
      {children}
    </AuthLayout>
  );
}
