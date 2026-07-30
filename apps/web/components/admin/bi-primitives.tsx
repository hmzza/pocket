import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type BIEntry = { label: string; value: number; detail?: string };

export function BIBarList({ entries, formatValue = (value) => String(value), tone = "orange" }: {
  entries: BIEntry[];
  formatValue?: (value: number) => string;
  tone?: "orange" | "navy" | "emerald";
}) {
  const max = Math.max(...entries.map((entry) => entry.value), 1);
  const toneClass = tone === "navy" ? "bg-pocket-navy" : tone === "emerald" ? "bg-emerald-500" : "bg-pocket-orange";

  return (
    <div className="space-y-4">
      {entries.length ? entries.map((entry) => (
        <div key={entry.label}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-pocket-navy">{entry.label}</span>
            <span className="text-right text-pocket-navy/60">{formatValue(entry.value)}{entry.detail ? ` · ${entry.detail}` : ""}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-pocket-cream">
            <div className={cn("h-full rounded-full transition-all", toneClass)} style={{ width: `${Math.max(5, (entry.value / max) * 100)}%` }} />
          </div>
        </div>
      )) : <p className="text-sm text-pocket-navy/55">No data in this period.</p>}
    </div>
  );
}

export function BISection({ title, description, children, className }: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("min-w-0 p-5", className)}>
      <div className="mb-5">
        <p className="text-lg font-black text-pocket-navy">{title}</p>
        {description ? <p className="mt-1 text-sm text-pocket-navy/60">{description}</p> : null}
      </div>
      {children}
    </Card>
  );
}

export function BIHeatmap({ entries }: { entries: BIEntry[] }) {
  const max = Math.max(...entries.map((entry) => entry.value), 1);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
      {entries.map((entry) => {
        const intensity = entry.value / max;
        return (
          <div
            key={entry.label}
            className="min-w-0 overflow-hidden rounded-2xl border border-pocket-orange/10 p-3 sm:p-4"
            style={{ backgroundColor: `rgba(234, 88, 12, ${0.06 + intensity * 0.8})` }}
          >
            <p className={cn("whitespace-nowrap text-[11px] font-bold tracking-[0.04em] sm:text-xs", intensity > 0.55 ? "text-white/80" : "text-pocket-navy/55")}>{entry.label}</p>
            <p className={cn("mt-3 text-xl font-black sm:text-2xl", intensity > 0.55 ? "text-white" : "text-pocket-navy")}>{entry.value}</p>
            <p className={cn("mt-1 text-xs", intensity > 0.55 ? "text-white/70" : "text-pocket-navy/50")}>orders</p>
          </div>
        );
      })}
    </div>
  );
}

export function BILine({ entries, formatValue = (value) => String(value) }: {
  entries: BIEntry[];
  formatValue?: (value: number) => string;
}) {
  const max = Math.max(...entries.map((entry) => entry.value), 1);

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max items-end gap-3">
        {entries.map((entry) => (
          <div key={entry.label} className="flex w-20 shrink-0 flex-col items-center gap-2 sm:w-24">
            <div className="flex h-44 w-full items-end rounded-t-xl bg-pocket-cream/70">
              <div className="w-full rounded-t-xl bg-pocket-orange" style={{ height: `${Math.max(8, (entry.value / max) * 100)}%` }} />
            </div>
            <p className="w-full truncate text-center text-[10px] font-semibold uppercase tracking-wide text-pocket-navy/50 sm:text-[11px]">{entry.label}</p>
            <p className="w-full overflow-hidden text-ellipsis whitespace-nowrap text-center text-[10px] font-bold leading-tight text-pocket-navy sm:text-[11px]">{formatValue(entry.value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FutureMetric({ label, description }: { label: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-pocket-navy/15 bg-pocket-cream/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-pocket-navy">{label}</p>
        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-pocket-navy/45">Future</span>
      </div>
      <p className="mt-3 text-2xl font-black text-pocket-navy/35">—</p>
      <p className="mt-1 text-xs text-pocket-navy/55">{description}</p>
    </div>
  );
}
