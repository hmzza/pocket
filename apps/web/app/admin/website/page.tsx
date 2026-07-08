"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { AdminPinGate } from "@/components/admin/admin-pin-gate";
import { ProductManagement } from "@/components/admin/product-management";
import { WebsiteControlPanel } from "@/components/admin/website-control-panel";

export default function AdminWebsitePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      <AdminShell title="Website Control Panel" description="Manage homepage images, slider timing, public website items, and launch flags from one place.">
        <AdminPinGate
          title="Enter website controls PIN"
          description="This page unlocks only after the correct PIN is entered."
          unlockLabel="Unlock Website Controls"
        >
          <div className="space-y-8">
            <WebsiteControlPanel />
            <ProductManagement mode="website" />
          </div>
        </AdminPinGate>
      </AdminShell>
    </div>
  );
}
