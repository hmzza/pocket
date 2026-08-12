import { PosOrderQueue } from "@/components/pos/order-queue";
import { PosWorkspaceShell } from "@/components/pos/pos-toolbar";

export default function PosQueuePage() {
  return (
    <PosWorkspaceShell active="queue">
      <PosOrderQueue />
    </PosWorkspaceShell>
  );
}
