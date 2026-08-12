"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { OrderManagement } from "@/components/admin/order-management";

export default function AdminOrdersPage() {
  return (
    <AdminShell title="Orders" description="Order history with segment, payment, and date filters for operations and review.">
        <OrderManagement />
      </AdminShell>
  );
}
