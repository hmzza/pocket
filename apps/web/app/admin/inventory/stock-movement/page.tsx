"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { InventoryWorkspace } from "@/components/admin/inventory-workspace";

export default function AdminInventoryMovementPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 md:px-6">
      <AdminShell title="Stock Movement" description="Restocks, wastage, corrections, and daily closing updates from one dedicated screen.">
        <InventoryWorkspace mode="movement" />
      </AdminShell>
    </div>
  );
}
