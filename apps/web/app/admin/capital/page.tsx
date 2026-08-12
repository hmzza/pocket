"use client";

import { AdminPinGate } from "@/components/admin/admin-pin-gate";
import { AdminShell } from "@/components/admin/admin-shell";
import { CapitalManagement } from "@/components/admin/capital-management";

export default function AdminCapitalPage() {
  return (
    <AdminShell title="Capital" description="Password-protected loans, repayments, partner investments, and committed equity tracking.">
        <AdminPinGate
          title="Enter finance PIN"
          description="Capital uses the same protected PIN as Finances."
          unlockLabel="Unlock Capital"
        >
          <CapitalManagement />
        </AdminPinGate>
      </AdminShell>
  );
}
