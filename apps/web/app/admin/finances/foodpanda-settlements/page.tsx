"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { FoodpandaSettlementManagement } from "@/components/admin/foodpanda-settlement-management";

export default function FoodpandaSettlementsPage() {
  return <AdminShell title="Foodpanda Settlements" description="Track platform receivables separately from the cash you have today."><FoodpandaSettlementManagement /></AdminShell>;
}
