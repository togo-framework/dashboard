import type { ReactNode } from "react";
import { DashboardGate } from "@/components/dashboard-gate";
import DashboardShell from "./dashboard-shell";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardGate>
      <DashboardShell>{children}</DashboardShell>
    </DashboardGate>
  );
}
