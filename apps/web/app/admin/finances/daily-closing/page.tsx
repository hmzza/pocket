"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { DailyClosingManagement } from "@/components/admin/daily-closing-management";

export default function DailyClosingPage() {
  return <AdminShell title="Daily Closing" description="Reconcile today's available money in less than 30 seconds."><DailyClosingManagement /></AdminShell>;
}
