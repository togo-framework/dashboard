import type { ReactNode } from "react";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { ForbiddenState } from "@/components/forbidden-state";

// Server component wrapping the (app) layout and every (app) page. A layout persists across
// soft navigation, so each page checks again: the page segment is what a navigation, an RSC
// fetch or a prefetch asks the server for. Children render only when the API allows.
export async function DashboardGate({ children }: { children: ReactNode }) {
  if (!(await requireDashboardAccess())) {
    return (
      <main data-dashboard-denied="" className="mx-auto max-w-lg p-8">
        <ForbiddenState />
      </main>
    );
  }
  return children;
}
