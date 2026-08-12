"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { InventoryWorkspace } from "@/components/admin/inventory-workspace";

export default function AdminInventoryListPage() {
  return (
    <AdminShell title="Inventory List" description="Review tracked items and edit inventory records from a dedicated page.">
        <InventoryWorkspace mode="list" />
      </AdminShell>
  );
}
