"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { CustomerReviewManagement } from "@/components/admin/customer-review-management";
import { WebsiteControlPanel } from "@/components/admin/website-control-panel";

export default function AdminWebsitePage() {
  return (
    <AdminShell title="Website Control Panel" description="Manage homepage images, slider timing, and homepage-only customer review settings.">
      <div className="space-y-8">
        <WebsiteControlPanel />
        <CustomerReviewManagement />
      </div>
    </AdminShell>
  );
}
