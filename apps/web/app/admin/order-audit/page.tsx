"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { OrderAuditManagement } from "@/components/admin/order-audit-management";

export default function AdminOrderAuditPage() {
  return (
    <AdminShell title="Order Audit" description="Concise order history with immutable changes, receipt activity, and deletion records.">
      <OrderAuditManagement />
    </AdminShell>
  );
}
