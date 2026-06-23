// Auth route group — each page renders the kit AuthCard (its own split-screen
// shell), so this layout is a passthrough.
import { ReactNode } from "react";

export default function AuthRouteLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
