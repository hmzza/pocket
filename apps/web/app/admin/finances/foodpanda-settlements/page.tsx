"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { AdminPinGate } from "@/components/admin/admin-pin-gate";
import { FoodpandaSettlementManagement } from "@/components/admin/foodpanda-settlement-management";

export default function FoodpandaSettlementsPage() {
  return <div className="mx-auto max-w-[1400px] px-4 py-10 md:px-6"><AdminShell title="Foodpanda Settlements" description="Track platform receivables separately from the cash you have today."><AdminPinGate title="Enter finance PIN" description="Settlement records affect your cash position." unlockLabel="Unlock Settlements"><FoodpandaSettlementManagement /></AdminPinGate></AdminShell></div>;
}
