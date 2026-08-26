"use client";

import { useEffect, useState } from "react";
import { Printer, RefreshCcw, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type PrinterInfo = {
  name: string;
  displayName: string;
  isDefault: boolean;
  status: number;
};

export function DesktopPrinterSettings() {
  const [open, setOpen] = useState(false);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isDesktop = typeof window !== "undefined" && Boolean(window.pocketDesktop);

  async function loadPrinters() {
    if (!window.pocketDesktop) return;
    setLoading(true);
    setError("");
    try {
      const result = await window.pocketDesktop.getPrinters();
      setPrinters(result.printers);
      setSelectedPrinter(result.selectedPrinter);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load printers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void loadPrinters();
  }, [open]);

  if (!isDesktop) return null;

  const printerLabel = printers.find((printer) => printer.name === selectedPrinter)?.displayName || "Windows default printer";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-white/20 bg-slate-950/90 px-3 py-2 text-xs font-bold text-white shadow-lg transition hover:bg-slate-800"
      >
        <Printer className="h-4 w-4" />
        Printer
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-labelledby="desktop-printer-title">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 text-pocket-navy shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-pocket-orange">Desktop POS</p>
                <h2 id="desktop-printer-title" className="mt-1 text-xl font-black">Receipt printer</h2>
                <p className="mt-1 text-sm text-pocket-navy/65">Choose the Windows printer configured with 80mm receipt paper. Printing stays silent after this.</p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close printer settings">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-5 space-y-2">
              <label className="text-sm font-semibold">Printer</label>
              <select
                value={selectedPrinter}
                onChange={async (event) => {
                  const printerName = event.target.value;
                  setSelectedPrinter(printerName);
                  try {
                    await window.pocketDesktop?.setPrinter(printerName);
                  } catch (saveError) {
                    setError(saveError instanceof Error ? saveError.message : "Unable to save the printer.");
                  }
                }}
                className="h-11 w-full rounded-lg border border-pocket-navy/15 bg-white px-3 text-sm"
              >
                <option value="">Windows default printer</option>
                {printers.map((printer) => (
                  <option key={printer.name} value={printer.name}>
                    {printer.displayName}{printer.isDefault ? " (Windows default)" : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-pocket-navy/60">Current: {printerLabel}</p>
              {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
              {!loading && !printers.length ? <p className="text-sm text-amber-700">No printers found. Connect the thermal printer and install its Windows driver.</p> : null}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => void loadPrinters()} disabled={loading}>
                <RefreshCcw className="h-4 w-4" />{loading ? "Refreshing..." : "Refresh printers"}
              </Button>
              <Button type="button" onClick={() => setOpen(false)}>Done</Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
