"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { InventoryManagement } from "@/components/admin/inventory-management";

export default function AdminInventoryLogPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 md:px-6">
      <AdminShell title="Recent Stock Log" description="View recent inventory movement history with branch and search filters.">
        <InventoryManagement mode="log" />
      </AdminShell>
    </div>
  );
}
