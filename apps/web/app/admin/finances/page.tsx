"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { FinanceManagement } from "@/components/admin/finance-management";

export default function AdminFinancesPage() {
  return (
    <AdminShell title="Finances" description="Monthly break-even tracking, Foodpanda payout estimates, and expense context in one place.">
      <FinanceManagement />
    </AdminShell>
  );
}
