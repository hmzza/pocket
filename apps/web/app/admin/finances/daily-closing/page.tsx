"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { AdminPinGate } from "@/components/admin/admin-pin-gate";
import { DailyClosingManagement } from "@/components/admin/daily-closing-management";

export default function DailyClosingPage() {
  return <div className="mx-auto max-w-[1400px] px-4 py-10 md:px-6"><AdminShell title="Daily Closing" description="Reconcile today's available money in less than 30 seconds."><AdminPinGate title="Enter finance PIN" description="Daily closing is protected because it contains cash balances." unlockLabel="Unlock Daily Closing"><DailyClosingManagement /></AdminPinGate></AdminShell></div>;
}
