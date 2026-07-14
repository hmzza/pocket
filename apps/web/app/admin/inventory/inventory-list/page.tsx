"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { InventoryWorkspace } from "@/components/admin/inventory-workspace";

export default function AdminInventoryListPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 md:px-6">
      <AdminShell title="Inventory List" description="Review tracked items, filter by branch, and edit inventory records from a dedicated page.">
        <InventoryWorkspace mode="list" />
      </AdminShell>
    </div>
  );
}
