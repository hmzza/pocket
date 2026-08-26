"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { AdminPinGate } from "@/components/admin/admin-pin-gate";
import { CustomerReviewManagement } from "@/components/admin/customer-review-management";
import { WebsiteControlPanel } from "@/components/admin/website-control-panel";

export default function AdminWebsitePage() {
  return (
    <AdminShell title="Website Control Panel" description="Manage homepage images, slider timing, and homepage-only customer review settings.">
        <AdminPinGate
          title="Enter website controls PIN"
          description="This page unlocks only after the correct PIN is entered."
          unlockLabel="Unlock Website Controls"
        >
          <div className="space-y-8">
            <WebsiteControlPanel />
            <CustomerReviewManagement />
          </div>
        </AdminPinGate>
      </AdminShell>
  );
}
