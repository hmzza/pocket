"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { OrderManagement } from "@/components/admin/order-management";

export default function AdminOrdersPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      <AdminShell title="Orders" description="Order history with Inshop and Foodpanda filters for operations and review.">
        <OrderManagement />
      </AdminShell>
    </div>
  );
}
