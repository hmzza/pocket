"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { AdminPinGate } from "@/components/admin/admin-pin-gate";
import { FinanceManagement } from "@/components/admin/finance-management";

export default function AdminFinancesPage() {
  return (
    <AdminShell title="Finances" description="Monthly break-even tracking, Foodpanda payout estimates, and expense context in one place.">
        <AdminPinGate
          title="Enter finance PIN"
          description="This page unlocks only after the correct PIN is entered."
          unlockLabel="Unlock Finances"
        >
          <FinanceManagement />
        </AdminPinGate>
      </AdminShell>
  );
}
