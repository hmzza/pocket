"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { PromotionManagement } from "@/components/admin/promotion-management";

export default function AdminPromotionsPage() {
  return <AdminShell title="Promotions" description="Control automatic POS offers without changing product prices."><PromotionManagement /></AdminShell>;
}
