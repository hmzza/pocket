"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { ExpenseManagement } from "@/components/admin/expense-management";

export default function AdminExpensesPage() {
  return (
    <AdminShell title="Expenses" description="Track branch bills, vendor payments, daily spend, and filtered expense history.">
        <ExpenseManagement />
      </AdminShell>
  );
}
