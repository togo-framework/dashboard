// Auth layout — full-bleed. AuthCard renders its own full-screen split (form +
// brand panel), so this layout must not center or constrain it.
import { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen w-full">{children}</div>;
}
