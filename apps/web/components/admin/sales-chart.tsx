import { Card } from "@/components/ui/card";
import { formatCompactNumber } from "@/lib/utils";

export function SalesChart({ sales }: { sales: Array<{ label: string; revenue: number }> }) {
  const peak = Math.max(...sales.map((entry) => entry.revenue), 1);

  return (
    <Card className="p-5">
      <div className="mb-6">
        <p className="text-lg font-black text-pocket-navy">Weekly sales</p>
        <p className="text-sm text-pocket-navy/60">Revenue rhythm across the current week.</p>
      </div>
      <div className="flex items-end gap-3">
        {sales.map((entry) => (
          <div key={entry.label} className="flex flex-1 flex-col items-center gap-3">
            <div className="flex h-52 w-full items-end">
              <div
                className="w-full rounded-md bg-pocket-orange"
                style={{
                  height: `${Math.max(18, (entry.revenue / peak) * 100)}%`
                }}
              />
            </div>
            <div className="space-y-1 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-pocket-navy/50">{entry.label}</p>
              <p className="text-sm font-bold text-pocket-navy">{formatCompactNumber(entry.revenue)}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

