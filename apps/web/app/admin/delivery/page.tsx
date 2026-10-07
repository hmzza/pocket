"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { DeliveryConfiguration } from "@/components/admin/delivery-configuration";

export default function AdminDeliveryPage() {
  return <AdminShell title="Delivery" description="Manage website delivery availability, delivery sectors, and rider fee reports."><DeliveryConfiguration /></AdminShell>;
}
