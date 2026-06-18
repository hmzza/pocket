"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { ExpenseManagement } from "@/components/admin/expense-management";

export default function AdminExpensesPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 md:px-6">
      <AdminShell title="Expenses" description="Track branch bills, vendor payments, daily spend, and filtered expense history.">
        <ExpenseManagement />
      </AdminShell>
    </div>
  );
}
