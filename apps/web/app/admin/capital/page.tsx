"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { CapitalManagement } from "@/components/admin/capital-management";

export default function AdminCapitalPage() {
  return (
    <AdminShell title="Capital" description="Loans, repayments, partner investments, committed equity, and savings reserves.">
      <CapitalManagement />
    </AdminShell>
  );
}
