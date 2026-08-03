"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { ProductManagement } from "@/components/admin/product-management";

export default function AdminProductsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      <AdminShell title="Products" description="Category, pricing, merchandising flags, and launch readiness.">
        <ProductManagement />
      </AdminShell>
    </div>
  );
}
