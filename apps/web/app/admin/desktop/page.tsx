"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { DesktopAppDownloads } from "@/components/admin/desktop-app-downloads";

export default function AdminDesktopAppsPage() {
  return (
    <AdminShell title="Desktop Apps" description="Download the POS and Admin desktop applications for staff computers.">
      <DesktopAppDownloads />
    </AdminShell>
  );
}
