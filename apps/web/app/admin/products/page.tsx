"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { ProductManagement } from "@/components/admin/product-management";

export default function AdminProductsPage() {
  return (
    <AdminShell title="Products" description="Category, pricing, merchandising flags, and launch readiness.">
        <ProductManagement />
      </AdminShell>
  );
}
