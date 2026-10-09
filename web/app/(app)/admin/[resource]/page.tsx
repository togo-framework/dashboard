import { DashboardGate } from "@/components/dashboard-gate";
import View from "./view";

export default function AdminResourcePage({ params }: { params: Promise<{ resource: string }> }) {
  return <DashboardGate><View params={params} /></DashboardGate>;
}
