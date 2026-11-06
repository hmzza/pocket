"use client";

import { ReportDownloadCard } from "@/components/admin/report-download-card";
import { downloadAdminInvestorReport } from "@/lib/admin-client";

export function InvestorReportDownload() {
  return <ReportDownloadCard title="Investor report" period="June 2026 to present · All branches"
    description="A PDF of sales, expenses, orders, customers and growth scenarios, generated from the latest records."
    buttonLabel="Download investor PDF" download={downloadAdminInvestorReport} />;
}
