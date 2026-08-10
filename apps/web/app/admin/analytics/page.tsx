"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BarChart3, Clock3, Users } from "lucide-react";
import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { BIBarList, BIHeatmap, BILine, BISection, FutureMetric } from "@/components/admin/bi-primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchAdminDashboard } from "@/lib/admin-client";
import { FOODPANDA_COMMISSION_RATE, getFoodpandaRevenueFromBreakdowns, getRevenueAfterFoodpandaCut } from "@/lib/finance";
import type { AdminOrderSegment, AdminRangePreset, DashboardData } from "@/lib/types";
import { formatCompactCurrency, formatCompactNumber, getCurrentBusinessDateKey, toPakistanDateIso } from "@/lib/utils";

function Kpi({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-pocket-orange">{label}</p><p className="mt-3 text-2xl font-black text-pocket-navy">{value}</p><p className="mt-1 text-sm text-pocket-navy/60">{helper}</p></Card>;
}

const periodOptions: Array<{ value: AdminRangePreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "1 Week" },
  { value: "month", label: "This Month" },
  { value: "custom", label: "Custom" }
];

const segmentOptions: Array<{ value: AdminOrderSegment; label: string }> = [
  { value: "all", label: "All sources" },
  { value: "inshop", label: "Inshop" },
  { value: "foodpanda", label: "Foodpanda" }
];

export default function BusinessAnalyticsPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [period, setPeriod] = useState<AdminRangePreset>("month");
  const [segment, setSegment] = useState<AdminOrderSegment>("all");
  const [startDate, setStartDate] = useState(getCurrentBusinessDateKey());
  const [endDate, setEndDate] = useState(getCurrentBusinessDateKey());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (period === "custom" && (!startDate || !endDate)) {
      setDashboard(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    const params = period === "custom"
      ? {
          preset: period,
          start: toPakistanDateIso(startDate),
          end: toPakistanDateIso(endDate, true),
          segment
        }
      : { preset: period, segment };

    fetchAdminDashboard(params)
      .then((nextDashboard) => {
        if (!cancelled) setDashboard(nextDashboard);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Failed to load analytics.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [period, segment, startDate, endDate]);

  const peakHours = useMemo(() => [...(dashboard?.breakdowns.hours ?? [])].sort((a, b) => b.count - a.count).slice(0, 5), [dashboard]);
  const peakDays = useMemo(() => [...(dashboard?.breakdowns.weekdays ?? [])].sort((a, b) => b.count - a.count).slice(0, 5), [dashboard]);
  const foodpandaRevenue = getFoodpandaRevenueFromBreakdowns(dashboard?.breakdowns.serviceTypes ?? []);
  const revenueAfterFoodpandaCut = dashboard ? getRevenueAfterFoodpandaCut(dashboard.summary.revenue, foodpandaRevenue) : 0;
  const heatmapHours = useMemo(() => {
    const byHour = new Map((dashboard?.breakdowns.hours ?? []).map((entry) => [entry.label, entry.count]));
    const businessHours = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1];
    return businessHours.map((hour) => {
      const key = `${String(hour).padStart(2, "0")}:00`;
      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      const suffix = hour < 12 ? "AM" : "PM";
      return { label: `${displayHour} ${suffix}`, value: byHour.get(key) ?? 0 };
    });
  }, [dashboard]);

  const selectedPeriodLabel = period === "today" ? "Today" : period === "7d" ? "1 week" : period === "month" ? "This month" : period === "custom" && startDate && endDate ? `${startDate} to ${endDate}` : "Custom range";

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 md:px-6">
      <AdminShell title="Business Analytics" description="Understand when, where, and how customers buy so every operating decision has context.">
        <div className="rounded-2xl border border-pocket-navy/10 bg-white p-4 shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-pocket-cream text-pocket-orange"><BarChart3 className="h-5 w-5" /></div><div><p className="font-bold text-pocket-navy">{selectedPeriodLabel}</p><p className="text-sm text-pocket-navy/60">Sales, customers, channels, and peak trading windows</p></div></div>
            <Link href="/admin"><Button variant="outline">Back to Overview<ArrowRight className="h-4 w-4" /></Button></Link>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {periodOptions.map((option) => <button key={option.value} type="button" onClick={() => setPeriod(option.value)} className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${period === option.value ? "border-pocket-orange bg-pocket-orange text-white" : "border-pocket-navy/15 text-pocket-navy hover:bg-pocket-cream"}`}>{option.label}</button>)}
            <span className="mx-1 hidden h-6 w-px bg-pocket-navy/10 sm:block" />
            {segmentOptions.map((option) => <button key={option.value} type="button" onClick={() => setSegment(option.value)} className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${segment === option.value ? "border-pocket-navy bg-pocket-navy text-white" : "border-pocket-navy/15 text-pocket-navy hover:bg-pocket-cream"}`}>{option.label}</button>)}
          </div>
          {period === "custom" ? <div className="mt-3 flex flex-wrap gap-2"><label className="sr-only" htmlFor="analytics-start">Start date</label><input id="analytics-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-10 rounded-xl border border-pocket-navy/15 px-3 text-sm text-pocket-navy" /><label className="sr-only" htmlFor="analytics-end">End date</label><input id="analytics-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-10 rounded-xl border border-pocket-navy/15 px-3 text-sm text-pocket-navy" /></div> : null}
        </div>

        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        {period === "custom" && (!startDate || !endDate) ? <Card className="p-6 text-sm text-pocket-navy/60">Choose a start and end date to load this range.</Card> : loading || !dashboard ? <Card className="p-6 text-sm text-pocket-navy/60">Loading business analytics...</Card> : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <Kpi label="Revenue" value={formatCompactCurrency(dashboard.summary.revenue)} helper="Selected period" />
              <Kpi label="Revenue after Foodpanda cut" value={formatCompactCurrency(revenueAfterFoodpandaCut)} helper={`${formatCompactCurrency(foodpandaRevenue * FOODPANDA_COMMISSION_RATE)} Foodpanda commission`} />
              <Kpi label="Orders" value={formatCompactNumber(dashboard.summary.orders)} helper="Completed order records" />
              <Kpi label="Average order" value={formatCompactCurrency(dashboard.summary.averageOrderValue)} helper="Revenue per order" />
              <Kpi label="Active customers" value={formatCompactNumber(dashboard.summary.activeCustomers)} helper="Customers who ordered" />
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
              <BISection title="Revenue by day" description="Daily revenue movement across the selected period."><BILine entries={dashboard.series.map((entry) => ({ label: entry.label, value: entry.revenue }))} formatValue={formatCompactCurrency} /></BISection>
              <BISection title="Revenue by branch" description="Ready for multiple branches as they come online."><BIBarList entries={dashboard.breakdowns.branches.map((entry) => ({ label: entry.label, value: entry.revenue, detail: `${entry.count} orders` }))} formatValue={formatCompactCurrency} tone="navy" /></BISection>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <BISection title="Hourly heatmap" description="Pakistan time · 12:30 PM–11:59 PM weekdays, extending to 1:00 AM on Friday and Saturday."><BIHeatmap entries={heatmapHours} /></BISection>
              <BISection title="Sales by day of week" description="Use this pattern to plan staffing and prep levels."><BIBarList entries={dashboard.breakdowns.weekdays.map((entry) => ({ label: entry.label, value: entry.revenue, detail: `${entry.count} orders` }))} formatValue={formatCompactCurrency} /></BISection>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <BISection title="Order sources" description="Service type mix for this period."><BIBarList entries={dashboard.breakdowns.serviceTypes.map((entry) => ({ label: entry.label, value: entry.revenue, detail: `${entry.count} orders` }))} formatValue={formatCompactCurrency} /></BISection>
              <BISection title="Payment methods" description="Revenue contribution by payment method."><BIBarList entries={dashboard.breakdowns.payments.map((entry) => ({ label: entry.label, value: entry.revenue, detail: `${entry.count} orders` }))} formatValue={formatCompactCurrency} tone="emerald" /></BISection>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <BISection title="Customer behaviour" description="The shape of the active customer base.">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><Kpi label="Active customers" value={formatCompactNumber(dashboard.summary.activeCustomers)} helper="Customers who ordered in period" /><FutureMetric label="Customer lifetime value" description="Needs customer-level margin and historical cohort tracking." /></div>
              </BISection>
              <BISection title="Average order value trend" description="AOV follows the same daily series, making mix changes easy to spot."><BILine entries={dashboard.series.map((entry) => ({ label: entry.label, value: entry.orders ? entry.revenue / entry.orders : 0 }))} formatValue={formatCompactCurrency} /></BISection>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <BISection title="Attach rate" description="Tracked once order-line and modifier events are normalized."><div className="grid gap-3 sm:grid-cols-2"><FutureMetric label="Drinks / order" description="Add-on and bundle component tracking." /><FutureMetric label="Shakes / order" description="Add-on and bundle component tracking." /><FutureMetric label="Desserts / order" description="Dessert category attach events." /><FutureMetric label="Loaded fries / order" description="Product category attach events." /></div></BISection>
              <BISection title="Peak selling windows" description="The five strongest trading windows in this period."><div className="grid gap-6 sm:grid-cols-2"><div><div className="mb-3 flex items-center gap-2 text-sm font-bold text-pocket-navy"><Clock3 className="h-4 w-4 text-pocket-orange" />Peak hours</div><BIBarList entries={peakHours.map((entry) => ({ label: entry.label, value: entry.count }))} formatValue={(value) => `${value} orders`} /></div><div><div className="mb-3 flex items-center gap-2 text-sm font-bold text-pocket-navy"><Users className="h-4 w-4 text-pocket-orange" />Peak days</div><BIBarList entries={peakDays.map((entry) => ({ label: entry.label, value: entry.count }))} formatValue={(value) => `${value} orders`} tone="navy" /></div></div></BISection>
            </div>
          </>
        )}
      </AdminShell>
    </div>
  );
}
