"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { DeliveryManagement } from "@/components/admin/delivery-management";

export default function AdminDeliveryPage() {
  return <AdminShell title="Delivery" description="Direct delivery orders from Pocket G-11, with fast accept and dispatch controls."><DeliveryManagement /></AdminShell>;
}
