"use client";

import { useRef, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function ReportDownloadCard({ title, period, description, buttonLabel, download }: {
  title: string; period: string; description: string; buttonLabel: string; download: () => Promise<void>;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const inFlight = useRef(false);

  async function startDownload() {
    if (inFlight.current) return;
    inFlight.current = true;
    setGenerating(true); setDownloaded(false); setError("");
    try { await download(); setDownloaded(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to generate the report."); }
    finally { inFlight.current = false; setGenerating(false); }
  }

  return <Card className="border-pocket-orange/20 p-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="rounded-xl bg-pocket-orange/10 p-2.5 text-pocket-orange"><FileText className="h-5 w-5" /></div>
        <div>
          <h2 className="font-black text-pocket-navy">{title}</h2>
          <p className="mt-1 text-sm text-pocket-navy/65">{period}</p>
          <p className="mt-1 max-w-xl text-xs text-pocket-navy/60">{description}</p>
        </div>
      </div>
      <Button type="button" onClick={() => void startDownload()} disabled={generating} aria-busy={generating} className="shrink-0">
        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {generating ? "Generating report..." : buttonLabel}
      </Button>
    </div>
    <p role="status" aria-live="polite" className="mt-2 text-xs text-pocket-navy/65">
      {generating ? "Preparing your report. Your download will start automatically." : downloaded ? "Report ready. Your PDF download has started." : "Includes all branches, regardless of the filters below."}
    </p>
    {error ? <p role="alert" className="mt-2 text-sm font-medium text-red-600">{error}</p> : null}
  </Card>;
}
