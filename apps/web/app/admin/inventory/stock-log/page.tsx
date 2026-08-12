"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { InventoryWorkspace } from "@/components/admin/inventory-workspace";

export default function AdminInventoryLogPage() {
  return (
    <AdminShell title="Recent Stock Log" description="View recent inventory movement history with search filters.">
        <InventoryWorkspace mode="log" />
      </AdminShell>
  );
}
