"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { VendorManagement } from "@/components/admin/vendor-management";

export default function AdminVendorsPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 md:px-6">
      <AdminShell title="Vendors" description="Manage ingredient vendors from a workbook-backed local portal.">
        <VendorManagement />
      </AdminShell>
    </div>
  );
}
