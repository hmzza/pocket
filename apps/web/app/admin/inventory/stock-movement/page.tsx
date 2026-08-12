"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { InventoryWorkspace } from "@/components/admin/inventory-workspace";

export default function AdminInventoryMovementPage() {
  return (
    <AdminShell title="Stock Movement" description="Restocks, wastage, corrections, and daily closing updates from one dedicated screen.">
        <InventoryWorkspace mode="movement" />
      </AdminShell>
  );
}
