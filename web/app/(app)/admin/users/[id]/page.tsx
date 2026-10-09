import { DashboardGate } from "@/components/dashboard-gate";
import View from "./view";

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <DashboardGate><View params={params} /></DashboardGate>;
}
