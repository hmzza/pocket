import { PosOrderQueue } from "@/components/pos/order-queue";
import { PosWorkspaceShell } from "@/components/pos/pos-toolbar";

export default function PosOrdersPage() {
  return (
    <PosWorkspaceShell active="queue">
      <PosOrderQueue todayOnly />
    </PosWorkspaceShell>
  );
}
