"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { RiderManagement } from "@/components/admin/rider-management";

export default function AdminRidersPage() {
  return (
    <AdminShell
      title="Riders"
      description="Delivery riders for this branch: contact details, vehicle, and duty status used by Dispatch."
    >
      <RiderManagement />
    </AdminShell>
  );
}
