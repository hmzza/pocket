"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { InventoryManagement } from "@/components/admin/inventory-management";

export default function AdminInventoryPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 md:px-6">
      <AdminShell title="Inventory" description="Live stock levels, reorder points, daily closing counts, and manual inventory control.">
        <InventoryManagement mode="overview" />
      </AdminShell>
    </div>
  );
}
