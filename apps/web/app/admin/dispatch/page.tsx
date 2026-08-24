"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { DispatchBoard } from "@/components/admin/dispatch-board";

export default function AdminDispatchPage() {
  return (
    <AdminShell
      title="Dispatch"
      description="Assign delivery orders to riders, notify them on WhatsApp, and track each delivery to the door."
    >
      <DispatchBoard />
    </AdminShell>
  );
}
