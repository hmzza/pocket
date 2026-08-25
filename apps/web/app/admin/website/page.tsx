"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { AdminPinGate } from "@/components/admin/admin-pin-gate";
import { CustomerReviewManagement } from "@/components/admin/customer-review-management";
import { ProductManagement } from "@/components/admin/product-management";
import { WebsiteControlPanel } from "@/components/admin/website-control-panel";

export default function AdminWebsitePage() {
  return (
    <AdminShell title="Website Control Panel" description="Manage homepage images, slider timing, public website items, and launch flags from one place.">
        <AdminPinGate
          title="Enter website controls PIN"
          description="This page unlocks only after the correct PIN is entered."
          unlockLabel="Unlock Website Controls"
        >
          <div className="space-y-8">
            <WebsiteControlPanel />
            <CustomerReviewManagement />
            <ProductManagement mode="website" />
          </div>
        </AdminPinGate>
      </AdminShell>
  );
}
