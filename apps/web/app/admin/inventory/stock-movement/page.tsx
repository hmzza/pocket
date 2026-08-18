"use client";

import { useEffect } from "react";
import { AdminShell } from "@/components/admin/admin-shell";

export default function AdminInventoryMovementPage() {
  useEffect(() => {
    window.location.replace("/admin/expenses?entry=stock");
  }, []);

  return (
    <AdminShell title="Stock purchase" description="Opening the unified stock purchase form in Expenses.">
        <p className="text-sm text-pocket-navy/60">Opening stock purchases...</p>
      </AdminShell>
  );
}
