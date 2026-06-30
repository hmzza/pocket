"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, Store, TrendingUp, Wallet } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { SalesChart } from "@/components/admin/sales-chart";
import { Card } from "@/components/ui/card";
import { fetchAdminDashboard } from "@/lib/admin-client";
import type { AdminRangePreset, DashboardData } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

const presets: Array<{ value: AdminRangePreset; label: string }> = [
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" }
];

export default function AdminAnalyticsPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [preset, setPreset] = useState<AdminRangePreset>("30d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadAnalytics() {
      try {
        setLoading(true);
        setError("");
        const nextDashboard = await fetchAdminDashboard({ preset });
        if (!cancelled) {
          setDashboard(nextDashboard);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load analytics.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadAnalytics();

    return () => {
      cancelled = true;
    };
  }, [preset]);

  const bestHour = useMemo(
    () => dashboard?.breakdowns.hours.slice().sort((left, right) => right.revenue - left.revenue)[0],
    [dashboard]
  );
  const bestBranch = useMemo(
    () => dashboard?.breakdowns.branches.slice().sort((left, right) => right.revenue - left.revenue)[0],
    [dashboard]
  );
  const bestSource = useMemo(
    () => dashboard?.breakdowns.sources.slice().sort((left, right) => right.revenue - left.revenue)[0],
    [dashboard]
  );
  const bestWeekday = useMemo(
    () => dashboard?.breakdowns.weekdays.slice().sort((left, right) => right.revenue - left.revenue)[0],
    [dashboard]
  );

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 md:px-6">
      <AdminShell
        title="Analytics"
        description="Deeper operational breakdowns across hour, weekday, branch, source, and payment behaviour for the selected period."
      >
        <div className="flex flex-wrap gap-2">
          {presets.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPreset(option.value)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                preset === option.value
                  ? "border-pocket-orange bg-pocket-orange text-white"
                  : "border-pocket-navy/10 bg-white text-pocket-navy hover:bg-pocket-cream"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        {loading || !dashboard ? (
          <Card className="p-6 text-sm text-pocket-navy/60">Loading analytics...</Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <MiniHighlight
                title="Peak Revenue Hour"
                value={bestHour?.label ?? "N/A"}
                helper={bestHour ? `${formatCurrency(bestHour.revenue)} across ${bestHour.count} orders` : "No orders in selected period"}
                icon={Clock3}
              />
              <MiniHighlight
                title="Best Branch"
                value={bestBranch?.label ?? "N/A"}
                helper={bestBranch ? `${formatCurrency(bestBranch.revenue)} across ${bestBranch.count} orders` : "No branch activity yet"}
                icon={Store}
              />
              <MiniHighlight
                title="Strongest Day"
                value={bestWeekday?.label ?? "N/A"}
                helper={bestWeekday ? `${formatCurrency(bestWeekday.revenue)} across ${bestWeekday.count} orders` : "No day pattern yet"}
                icon={TrendingUp}
              />
              <MiniHighlight
                title="Strongest Source"
                value={bestSource?.label ?? "N/A"}
                helper={bestSource ? `${formatCurrency(bestSource.revenue)} across ${bestSource.count} orders` : "No source pattern yet"}
                icon={Store}
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <SalesChart
                sales={dashboard.series}
                title="Revenue cadence"
                description={`Trend view for ${dashboard.range.label.toLowerCase()}.`}
              />
              <Card className="p-5">
                <p className="text-lg font-black text-pocket-navy">Hourly revenue</p>
                <p className="text-sm text-pocket-navy/60">Use this to schedule staff and prep volume.</p>
                <div className="mt-4 space-y-3">
                  {dashboard.breakdowns.hours.filter((entry) => entry.count > 0).map((entry) => {
                    const maxRevenue = Math.max(...dashboard.breakdowns.hours.map((item) => item.revenue), 1);
                    return (
                      <div key={entry.label}>
                        <div className="mb-1.5 flex items-center justify-between text-sm">
                          <span className="font-semibold text-pocket-navy">{entry.label}</span>
                          <span className="text-pocket-navy/70">
                            {entry.count} orders · {formatCurrency(entry.revenue)}
                          </span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-pocket-cream">
                          <div
                            className="h-full rounded-full bg-pocket-orange"
                            style={{ width: `${Math.max(6, (entry.revenue / maxRevenue) * 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <AnalyticsTable
                title="Branch Breakdown"
                rows={dashboard.breakdowns.branches}
                helper="Useful once more branches are live."
              />
              <AnalyticsTable
                title="Source Breakdown"
                rows={dashboard.breakdowns.sources}
                helper="Compare Foodpanda, online, and counter sales."
              />
              <AnalyticsTable
                title="Status Breakdown"
                rows={dashboard.breakdowns.statuses}
                helper="Track fulfillment bottlenecks and cancellations."
              />
              <AnalyticsTable
                title="Weekday Breakdown"
                rows={dashboard.breakdowns.weekdays}
                helper="Spot the best-selling operating days."
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <AnalyticsTable
                title="Payment Efficiency"
                rows={dashboard.breakdowns.payments}
                helper="Payment method contribution to revenue."
                icon={Wallet}
              />
              <Card className="p-5">
                <p className="text-lg font-black text-pocket-navy">Product revenue leaders</p>
                <p className="text-sm text-pocket-navy/60">Top-selling products by units and revenue.</p>
                <div className="mt-4 space-y-3">
                  {dashboard.topProducts.map((product, index) => (
                    <div key={product.productName} className="rounded-xl border border-pocket-navy/10 px-4 py-3">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-orange">#{index + 1}</p>
                          <p className="mt-1 font-bold text-pocket-navy">{product.productName}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-pocket-navy">{product.quantity} sold</p>
                          <p className="text-sm text-pocket-navy/60">{formatCurrency(product.revenue)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </>
        )}
      </AdminShell>
    </div>
  );
}

function MiniHighlight({
  title,
  value,
  helper,
  icon: Icon
}: {
  title: string;
  value: string;
  helper: string;
  icon: typeof Clock3;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">{title}</p>
          <p className="mt-3 text-2xl font-black text-pocket-navy">{value}</p>
          <p className="mt-2 text-sm text-pocket-navy/60">{helper}</p>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-pocket-cream text-pocket-orange">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function AnalyticsTable({
  title,
  helper,
  rows,
  icon: Icon
}: {
  title: string;
  helper: string;
  rows: Array<{ label: string; count: number; revenue: number }>;
  icon?: typeof Wallet;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-black text-pocket-navy">{title}</p>
          <p className="text-sm text-pocket-navy/60">{helper}</p>
        </div>
        {Icon ? (
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-pocket-cream text-pocket-orange">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
      </div>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between border-b border-pocket-navy/10 pb-3 last:border-0 last:pb-0">
            <div>
              <p className="font-semibold text-pocket-navy">{row.label}</p>
              <p className="text-sm text-pocket-navy/60">{row.count} orders</p>
            </div>
            <p className="font-bold text-pocket-orange">{formatCurrency(row.revenue)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
