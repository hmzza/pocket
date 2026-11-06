"use client";

import { ReportDownloadCard } from "@/components/admin/report-download-card";
import { downloadAdminProfitLossReport } from "@/lib/admin-client";

export function ProfitLossReportDownload() {
  return <ReportDownloadCard title="P&L (Profit & Loss)" period="Last complete month · All branches"
    description="Monthly sales, itemised expenses and estimated profit or loss on the recorded-cost basis."
    buttonLabel="Download P&L PDF" download={downloadAdminProfitLossReport} />;
}
