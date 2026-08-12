"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { InventoryAnalytics } from "@/components/admin/inventory-analytics";
import { InventoryWorkspace } from "@/components/admin/inventory-workspace";

export default function AdminInventoryPage() {
  return (
    <AdminShell title="Inventory" description="Live stock levels, reorder points, daily closing counts, and manual inventory control.">
        <InventoryAnalytics />
        <InventoryWorkspace mode="overview" />
      </AdminShell>
  );
}
