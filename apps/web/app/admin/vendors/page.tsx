"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { VendorManagement } from "@/components/admin/vendor-management";

export default function AdminVendorsPage() {
  return (
    <AdminShell title="Vendors" description="Manage ingredient vendors from a workbook-backed local portal.">
        <VendorManagement />
      </AdminShell>
  );
}
