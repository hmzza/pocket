import { Card } from "@/components/ui/card";
import { formatCompactNumber } from "@/lib/utils";

export function SalesChart({
  sales,
  title = "Sales trend",
  description = "Revenue across the selected period."
}: {
  sales: Array<{ label: string; revenue: number; orders?: number }>;
  title?: string;
  description?: string;
}) {
  const peak = Math.max(...sales.map((entry) => entry.revenue), 1);

  return (
    <Card className="p-5">
      <div className="mb-6">
        <p className="text-lg font-black text-pocket-navy">{title}</p>
        <p className="text-sm text-pocket-navy/60">{description}</p>
      </div>
      <div className="flex items-end gap-2 overflow-x-auto pb-2">
        {sales.map((entry) => (
          <div key={entry.label} className="flex min-w-14 flex-1 flex-col items-center gap-2">
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

