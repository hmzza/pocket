"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { LoanManagement } from "@/components/admin/loan-management";

export default function AdminLoansPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 md:px-6">
      <AdminShell title="Loans" description="Record loans taken, repayments, outstanding balances, and cashflow source impact.">
        <LoanManagement />
      </AdminShell>
    </div>
  );
}
