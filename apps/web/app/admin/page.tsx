"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ArrowRight, CalendarDays, Clock3, Package2, Receipt, Users2, Wallet } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { SalesChart } from "@/components/admin/sales-chart";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchAdminDashboard, fetchAdminSettings, fetchAdminSession } from "@/lib/admin-client";
import { MONTHLY_BREAKEVEN_TARGET, estimateFoodpandaPayout, getFoodpandaRevenueFromBreakdowns } from "@/lib/finance";
import type { AdminOrderSegment, AdminRangePreset, DashboardData } from "@/lib/types";
import { cn, formatCompactNumber, formatCurrency } from "@/lib/utils";

const presets: Array<{ value: AdminRangePreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
  { value: "custom", label: "Custom" }
];

const segments: Array<{ value: AdminOrderSegment; label: string }> = [
  { value: "all", label: "All" },
  { value: "inshop", label: "Inshop" },
  { value: "foodpanda", label: "Foodpanda" }
];

export default function AdminPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [preset, setPreset] = useState<AdminRangePreset>("today");
  const [segment, setSegment] = useState<AdminOrderSegment>("all");
  const [isStaff, setIsStaff] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [monthlyTarget, setMonthlyTarget] = useState(MONTHLY_BREAKEVEN_TARGET);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        setLoading(true);
        setError("");
        const [nextDashboard, settings, session] = await Promise.all([
          fetchAdminDashboard(
            preset === "custom" && startDate && endDate
              ? {
                  preset,
                  start: new Date(`${startDate}T00:00:00`).toISOString(),
                  end: new Date(`${endDate}T23:59:59`).toISOString(),
                  segment
                }
              : { preset, segment }
          ),
          fetchAdminSettings().catch(() => []),
          fetchAdminSession()
        ]);

        const targetSetting = settings.find((setting) => setting.key === "finance.monthlyTarget");
        const targetValue = Number(targetSetting?.value ?? MONTHLY_BREAKEVEN_TARGET);
        if (Number.isFinite(targetValue) && targetValue > 0) {
          setMonthlyTarget(targetValue);
        }

        setIsStaff(session.user.role === "POS_STAFF");

        if (!cancelled) {
          setDashboard(nextDashboard);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (preset !== "custom" || (startDate && endDate)) {
      void loadDashboard();
    } else {
      setLoading(false);
      setDashboard(null);
    }

    return () => {
      cancelled = true;
    };
  }, [preset, startDate, endDate, segment]);

  const strongestChannel = useMemo(() => dashboard?.breakdowns.channels[0], [dashboard]);
  const strongestServiceType = useMemo(() => dashboard?.breakdowns.serviceTypes[0], [dashboard]);
  const strongestPayment = useMemo(() => dashboard?.breakdowns.payments[0], [dashboard]);
  const foodpandaRevenue = useMemo(
    () => getFoodpandaRevenueFromBreakdowns(dashboard?.breakdowns.serviceTypes ?? []),
    [dashboard]
  );
  const foodpandaPayout = useMemo(() => estimateFoodpandaPayout(foodpandaRevenue), [foodpandaRevenue]);
  const netRevenueAfterFoodpandaCut = useMemo(() => {
    if (!dashboard) return 0;
    return Math.max(0, dashboard.summary.revenue - foodpandaRevenue + foodpandaPayout.estimated);
  }, [dashboard, foodpandaPayout.estimated, foodpandaRevenue]);
  const visibleSegments = useMemo(() => (isStaff ? [] : segments), [isStaff]);
  const visiblePresets = useMemo(() => (isStaff ? presets.filter((option) => option.value === "today") : presets), [isStaff]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 md:px-6">
      <AdminShell
        title="Dashboard"
        description="Period-aware sales, customer behaviour, channel mix, payment mix, top products, and operational alerts in one place."
      >
        <Card className="overflow-hidden border-none bg-[linear-gradient(135deg,_#102a43,_#0f172a_55%,_#1f2937)] p-6 text-white shadow-[0_24px_64px_rgba(16,42,67,0.28)]">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-300">Performance Window</p>
              <h2 className="mt-3 text-3xl font-black">Sales command center</h2>
              <p className="mt-2 max-w-2xl text-sm text-white/70">
                {isStaff
                  ? "Staff accounts only see today's sales snapshot."
                  : "Switch periods and filter sales between all orders, Inshop, and Foodpanda without opening separate reports."}
              </p>
            </div>
            <div className="space-y-3">
              {visibleSegments.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {visibleSegments.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSegment(option.value)}
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm font-semibold transition",
                        segment === option.value
                          ? "border-white bg-white text-slate-950"
                          : "border-white/15 bg-white/5 text-white hover:bg-white/10"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {visiblePresets.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPreset(option.value)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm font-semibold transition",
                      preset === option.value
                        ? "border-amber-300 bg-amber-300 text-slate-950"
                        : "border-white/15 bg-white/5 text-white hover:bg-white/10"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {preset === "custom" ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="h-11 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white"
                  />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="h-11 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white"
                  />
                  <Button
                    className="h-11 bg-amber-300 text-slate-950 hover:bg-amber-200"
                    onClick={() => {
                      if (!startDate || !endDate) return;
                      setLoading(true);
                    }}
                  >
                    Apply Range
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
          {dashboard ? (
            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
                <CalendarDays className="h-4 w-4 text-amber-300" />
                {dashboard.range.label} · {segments.find((option) => option.value === dashboard.range.segment)?.label ?? "All"}
              </span>
              {strongestChannel ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
                  <Receipt className="h-4 w-4 text-amber-300" />
                  Top channel: {strongestChannel.label}
                </span>
              ) : null}
              {strongestServiceType ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
                  <Package2 className="h-4 w-4 text-amber-300" />
                  Top service: {strongestServiceType.label}
                </span>
              ) : null}
              {strongestPayment ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
                  <Wallet className="h-4 w-4 text-amber-300" />
                  Top payment: {strongestPayment.label}
                </span>
              ) : null}
            </div>
          ) : null}
        </Card>

        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

        {loading || !dashboard ? (
          <Card className="p-6 text-sm text-pocket-navy/60">Loading dashboard...</Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <InsightCard
                label="Revenue"
                value={formatCurrency(dashboard.summary.revenue)}
                helper={`Previous ${formatCurrency(dashboard.summary.previousRevenue)}`}
                delta={dashboard.summary.revenueDelta}
                icon={Wallet}
              />
              <InsightCard
                label="Net after Foodpanda cut"
                value={formatCurrency(netRevenueAfterFoodpandaCut)}
                helper={`${formatCurrency(foodpandaRevenue)} Foodpanda gross · ${formatCurrency(foodpandaPayout.estimated)} expected net`}
                delta={null}
                icon={ArrowDownRight}
              />
              <InsightCard
                label="Orders"
                value={formatCompactNumber(dashboard.summary.orders)}
                helper={`Previous ${formatCompactNumber(dashboard.summary.previousOrders)}`}
                delta={dashboard.summary.ordersDelta}
                icon={Receipt}
              />
              <InsightCard
                label="Average Ticket"
                value={formatCurrency(dashboard.summary.averageOrderValue)}
                helper={`Previous ${formatCurrency(dashboard.summary.previousAverageOrderValue)}`}
                delta={dashboard.summary.averageOrderValueDelta}
                icon={Package2}
              />
              <InsightCard
                label="Active Customers"
                value={formatCompactNumber(dashboard.summary.activeCustomers)}
                helper={`${dashboard.summary.repeatCustomers} repeat customers`}
                delta={null}
                icon={Users2}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <Card className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Foodpanda payout estimate</p>
                <p className="mt-3 text-3xl font-black text-pocket-navy">{formatCurrency(foodpandaPayout.estimated)}</p>
                <p className="mt-2 text-sm text-pocket-navy/60">
                  Gross {formatCurrency(foodpandaPayout.gross)} · expected return after the 40-42% platform fee.
                </p>
                <div className="mt-4 rounded-2xl bg-pocket-cream px-4 py-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-pocket-navy">Return range</span>
                    <span className="font-bold text-pocket-navy">
                      {formatCurrency(foodpandaPayout.minimum)} - {formatCurrency(foodpandaPayout.maximum)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-pocket-navy/60">This is the amount expected to land with Pocket after Foodpanda keeps its share.</p>
                </div>
              </Card>

              <Card className="flex flex-col justify-between gap-4 p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Finance page</p>
                  <p className="mt-3 text-2xl font-black text-pocket-navy">Monthly breakeven</p>
                  <p className="mt-2 text-sm text-pocket-navy/60">
                    Track the {formatCurrency(monthlyTarget)} monthly target and see when profit starts.
                  </p>
                </div>
                <Button className="w-fit" onClick={() => window.location.assign("/admin/finances")}>
                  Open Finances
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Card>

              <Card className="flex flex-col justify-between gap-4 p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Website control</p>
                  <p className="mt-3 text-2xl font-black text-pocket-navy">Website Control Panel</p>
                  <p className="mt-2 text-sm text-pocket-navy/60">Manage homepage slider images, reorder media, and keep the website synced with live content.</p>
                </div>
                <Button className="w-fit" onClick={() => window.location.assign("/admin/website")}>
                  Open Website Control
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <SalesChart
                sales={dashboard.series}
                title="Revenue trend"
                description={`Revenue and order momentum for ${dashboard.range.label.toLowerCase()}.`}
              />
              <Card className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-1">
                <StatStrip
                  label="Customer Base"
                  value={formatCompactNumber(dashboard.summary.totalCustomers)}
                  helper="Total customer accounts on the platform."
                />
                <StatStrip
                  label="Peak Hour"
                  value={dashboard.breakdowns.hours.slice().sort((a, b) => b.count - a.count)[0]?.label ?? "N/A"}
                  helper="Highest order count hour in the selected range."
                />
              </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <BreakdownCard
                title="Channel Mix"
                items={dashboard.breakdowns.channels}
                helper="How orders are split across POS and online."
              />
              <BreakdownCard
                title="Service Mix"
                items={dashboard.breakdowns.serviceTypes}
                helper="Inshop includes current Inshop plus older takeaway and dine-in orders."
              />
              <BreakdownCard
                title="Payment Mix"
                items={dashboard.breakdowns.payments}
                helper="Cash, card, and wallet contribution."
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-black text-pocket-navy">Top products</p>
                    <p className="text-sm text-pocket-navy/60">Best performers in the selected period.</p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {dashboard.topProducts.map((item, index) => (
                    <div key={item.productName} className="rounded-xl bg-pocket-cream px-4 py-3">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-orange">#{index + 1}</p>
                          <p className="mt-1 font-bold text-pocket-navy">{item.productName}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-pocket-navy">{item.quantity} sold</p>
                          <p className="text-sm text-pocket-navy/60">{formatCurrency(item.revenue)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-5">
                <p className="text-lg font-black text-pocket-navy">Weekday performance</p>
                <p className="text-sm text-pocket-navy/60">Use this to spot strong and weak operating days.</p>
                <div className="mt-5 space-y-3">
                  {dashboard.breakdowns.weekdays.map((entry) => {
                    const maxRevenue = Math.max(...dashboard.breakdowns.weekdays.map((item) => item.revenue), 1);
                    return (
                      <div key={entry.label}>
                        <div className="mb-1.5 flex items-center justify-between text-sm">
                          <span className="font-semibold text-pocket-navy">{entry.label}</span>
                          <span className="text-pocket-navy/70">
                            {formatCurrency(entry.revenue)} · {entry.count} orders
                          </span>
                        </div>
                        <div className="h-3 overflow-hidden rounded-full bg-pocket-cream">
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

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <Card className="p-5">
                <p className="text-lg font-black text-pocket-navy">Recent orders</p>
                <p className="text-sm text-pocket-navy/60">Latest order movement inside the selected window.</p>
                <div className="mt-4 space-y-3">
                  {dashboard.recentOrders.map((order) => (
                    <div key={order.id} className="rounded-xl border border-pocket-navy/10 px-4 py-3">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-bold text-pocket-navy">{order.orderNumber}</p>
                          <p className="text-sm text-pocket-navy/60">{order.customerName}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-pocket-navy/45">
                            {order.branch} · {order.channel}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-pocket-orange">{formatCurrency(order.totalAmount)}</p>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pocket-navy/50">
                            {order.serviceType}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-5">
                <p className="text-lg font-black text-pocket-navy">Low stock alerts</p>
                <p className="text-sm text-pocket-navy/60">Live branch inventory watchlist.</p>
                <div className="mt-4 space-y-3">
                  {dashboard.lowStock.length ? (
                    dashboard.lowStock.map((item) => (
                      <div key={`${item.branch}-${item.ingredient}`} className="rounded-xl border border-pocket-orange/20 bg-pocket-orange/5 px-4 py-3">
                        <p className="font-semibold text-pocket-navy">{item.ingredient}</p>
                        <p className="text-sm text-pocket-navy/60">{item.branch}</p>
                        <p className="mt-2 text-sm font-bold text-pocket-orange">{item.quantityOnHand} units on hand</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-pocket-navy/60">No active low-stock alerts.</p>
                  )}
                </div>
              </Card>
            </div>
          </>
        )}
      </AdminShell>
    </div>
  );
}

function InsightCard({
  label,
  value,
  helper,
  delta,
  icon: Icon
}: {
  label: string;
  value: string;
  helper: string;
  delta: number | null;
  icon: typeof Wallet;
}) {
  const positive = delta == null ? true : delta >= 0;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">{label}</p>
          <p className="mt-3 text-3xl font-black text-pocket-navy">{value}</p>
          <p className="mt-2 text-sm text-pocket-navy/60">{helper}</p>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-pocket-cream text-pocket-orange">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {delta == null ? null : (
        <div
          className={cn(
            "mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold",
            positive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          )}
        >
          {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {Math.abs(delta)}% vs previous period
        </div>
      )}
    </Card>
  );
}

function StatStrip({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl bg-pocket-cream px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-orange">{label}</p>
      <p className="mt-2 text-2xl font-black text-pocket-navy">{value}</p>
      <p className="mt-1 text-sm text-pocket-navy/60">{helper}</p>
    </div>
  );
}

function BreakdownCard({
  title,
  helper,
  items
}: {
  title: string;
  helper: string;
  items: Array<{ label: string; count: number; revenue: number }>;
}) {
  const maxRevenue = Math.max(...items.map((entry) => entry.revenue), 1);

  return (
    <Card className="p-5">
      <p className="text-lg font-black text-pocket-navy">{title}</p>
      <p className="text-sm text-pocket-navy/60">{helper}</p>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.label}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-semibold text-pocket-navy">{item.label}</span>
              <span className="text-pocket-navy/70">
                {item.count} · {formatCurrency(item.revenue)}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-pocket-cream">
              <div
                className="h-full rounded-full bg-pocket-orange"
                style={{ width: `${Math.max(6, (item.revenue / maxRevenue) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
