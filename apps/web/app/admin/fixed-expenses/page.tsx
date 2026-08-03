import { AdminShell } from "@/components/admin/admin-shell";
import { FixedExpenseManagement } from "@/components/admin/fixed-expense-management";

export default function AdminFixedExpensesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      <AdminShell title="Fixed Expenses" description="Manage recurring monthly costs and track what has been paid.">
        <FixedExpenseManagement />
      </AdminShell>
    </div>
  );
}
