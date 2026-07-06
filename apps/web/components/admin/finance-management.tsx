"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Wallet } from "lucide-react";
import { SalesChart } from "@/components/admin/sales-chart";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchAdminDashboard, fetchAdminExpenses } from "@/lib/admin-client";
import { estimateFoodpandaPayout, getFoodpandaRevenueFromBreakdowns, MONTHLY_BREAKEVEN_TARGET } from "@/lib/finance";
import type { AdminExpenseData, DashboardData } from "@/lib/types";
import { formatCurrency, formatCompactNumber } from "@/lib/utils";

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));

  return (
    <div className="h-4 overflow-hidden rounded-full bg-pocket-cream">
      <div className="h-full rounded-full bg-[linear-gradient(90deg,_#ea580c,_#f59e0b)]" style={{ width: `${pct}%` }} />
    </div>
  );
}

function TrendChart({
  title,
  description,
  entries,
  barClassName
}: {
  title: string;
  description: string;
  entries: Array<{ label: string; revenue: number; orders?: number }>;
  barClassName: string;
}) {
  const peak = Math.max(...entries.map((entry) => entry.revenue), 1);

  return (
    <Card className="min-w-0 p-5">
      <div className="mb-6">
        <p className="text-lg font-black text-pocket-navy">{title}</p>
        <p className="text-sm text-pocket-navy/60">{description}</p>
      </div>
      <div className="w-full min-w-0 overflow-x-auto pb-2">
        <div className="flex min-w-max items-end gap-2">
          {entries.map((entry) => (
            <div key={entry.label} className="flex w-12 shrink-0 flex-col items-center gap-2">
              <div className="flex h-52 w-full items-end">
                <div
                  className={`w-full rounded-md ${barClassName}`}
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
      </div>
    </Card>
  );
}

function MetricCard({
  title,
  value,
  description,
  tone = "default"
}: {
  title: string;
  value: string;
  description: string;
  tone?: "default" | "positive" | "negative" | "warning";
}) {
  const toneStyles: Record<typeof tone, string> = {
    default: "text-pocket-navy",
    positive: "text-emerald-700",
    negative: "text-red-700",
    warning: "text-pocket-orange"
  };

  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">{title}</p>
      <p className={`mt-3 text-3xl font-black ${toneStyles[tone]}`}>{value}</p>
      <p className="mt-2 text-sm text-pocket-navy/60">{description}</p>
    </Card>
  );
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function normalizeLabel(value: string) {
  return value.trim().toLowerCase();
}

function buildBranchPerformance(
  revenueEntries: Array<{ label: string; revenue: number }>,
  expenseData: AdminExpenseData["expenses"]
) {
  const expenseMap = new Map<string, { amount: number; count: number }>();

  for (const expense of expenseData) {
    const key = normalizeLabel(expense.branchName);
    const current = expenseMap.get(key) ?? { amount: 0, count: 0 };
    current.amount += expense.amount;
    current.count += 1;
    expenseMap.set(key, current);
  }

  return revenueEntries
    .map((entry) => {
      const expense = expenseMap.get(normalizeLabel(entry.label)) ?? { amount: 0, count: 0 };
      const net = entry.revenue - expense.amount;

      return {
        label: entry.label,
        revenue: entry.revenue,
        expense: expense.amount,
        expenseCount: expense.count,
        net
      };
    })
    .sort((left, right) => right.revenue - left.revenue);
}

export function FinanceManagement() {
  const [monthDashboard, setMonthDashboard] = useState<DashboardData | null>(null);
  const [weekDashboard, setWeekDashboard] = useState<DashboardData | null>(null);
  const [todayDashboard, setTodayDashboard] = useState<DashboardData | null>(null);
  const [monthFoodpandaDashboard, setMonthFoodpandaDashboard] = useState<DashboardData | null>(null);
  const [monthExpenses, setMonthExpenses] = useState<AdminExpenseData | null>(null);
  const [weekExpenses, setWeekExpenses] = useState<AdminExpenseData | null>(null);
  const [todayExpenses, setTodayExpenses] = useState<AdminExpenseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadFinance() {
      try {
        setLoading(true);
        setError("");
        const [
          monthDashboardData,
          weekDashboardData,
          todayDashboardData,
          monthFoodpandaData,
          monthExpenseData,
          weekExpenseData,
          todayExpenseData
        ] = await Promise.all([
          fetchAdminDashboard({ preset: "month", segment: "all" }),
          fetchAdminDashboard({ preset: "7d", segment: "all" }),
          fetchAdminDashboard({ preset: "today", segment: "all" }),
          fetchAdminDashboard({ preset: "month", segment: "foodpanda" }),
          fetchAdminExpenses({ preset: "month" }),
          fetchAdminExpenses({ preset: "7d" }),
          fetchAdminExpenses({ preset: "today" })
        ]);

        if (!cancelled) {
          setMonthDashboard(monthDashboardData);
          setWeekDashboard(weekDashboardData);
          setTodayDashboard(todayDashboardData);
          setMonthFoodpandaDashboard(monthFoodpandaData);
          setMonthExpenses(monthExpenseData);
          setWeekExpenses(weekExpenseData);
          setTodayExpenses(todayExpenseData);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load finances.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadFinance();

    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    const monthRevenue = monthDashboard?.summary.revenue ?? 0;
    const monthExpensesTotal = monthExpenses?.summary.totalAmount ?? 0;
    const weekRevenue = weekDashboard?.summary.revenue ?? 0;
    const weekExpensesTotal = weekExpenses?.summary.totalAmount ?? 0;
    const todayRevenue = todayDashboard?.summary.revenue ?? 0;
    const todayExpensesTotal = todayExpenses?.summary.totalAmount ?? 0;
    const monthNet = monthRevenue - monthExpensesTotal;
    const weekNet = weekRevenue - weekExpensesTotal;
    const todayNet = todayRevenue - todayExpensesTotal;
    const remainingToBreakeven = Math.max(0, MONTHLY_BREAKEVEN_TARGET - monthRevenue);
    const breakevenProgress = Math.min(100, (monthRevenue / MONTHLY_BREAKEVEN_TARGET) * 100);
    const surplusAfterBreakeven = monthRevenue - MONTHLY_BREAKEVEN_TARGET;
    const expenseRatio = monthRevenue > 0 ? (monthExpensesTotal / monthRevenue) * 100 : 0;
    const operatingMargin = monthRevenue > 0 ? (monthNet / monthRevenue) * 100 : 0;
    const foodpandaGross = getFoodpandaRevenueFromBreakdowns(monthFoodpandaDashboard?.breakdowns.serviceTypes ?? []);
    const foodpandaPayout = estimateFoodpandaPayout(foodpandaGross);
    const paymentMix = [...(monthDashboard?.breakdowns.payments ?? [])].sort((left, right) => right.revenue - left.revenue);
    const branchPerformance = buildBranchPerformance(monthDashboard?.breakdowns.branches ?? [], monthExpenses?.expenses ?? []);
    const topCategories = [...(monthExpenses?.categories ?? [])].sort((left, right) => right.amount - left.amount).slice(0, 6);

    return {
      monthRevenue,
      monthExpensesTotal,
      monthNet,
      weekRevenue,
      weekExpensesTotal,
      weekNet,
      todayRevenue,
      todayExpensesTotal,
      todayNet,
      remainingToBreakeven,
      breakevenProgress,
      surplusAfterBreakeven,
      expenseRatio,
      operatingMargin,
      foodpandaGross,
      foodpandaPayout,
      paymentMix,
      branchPerformance,
      topCategories
    };
  }, [monthDashboard, monthExpenses, monthFoodpandaDashboard, todayDashboard, todayExpenses, weekDashboard, weekExpenses]);

  if (loading || !monthDashboard || !monthExpenses || !weekDashboard || !weekExpenses || !todayDashboard || !todayExpenses || !monthFoodpandaDashboard) {
    return <Card className="p-6 text-sm text-pocket-navy/60">Loading finance view...</Card>;
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-none bg-[linear-gradient(135deg,_#102a43,_#0f172a_55%,_#1f2937)] p-6 text-white shadow-[0_24px_64px_rgba(16,42,67,0.28)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-300">Finance control center</p>
            <h2 className="mt-3 text-3xl font-black">Monthly profit, cashflow, and branch performance</h2>
            <p className="mt-2 max-w-3xl text-sm text-white/70">
              This view combines revenue, expenses, Foodpanda payouts, and branch-level performance so you can read the business in one place.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-amber-300" />
              Break-even target
            </div>
            <p className="mt-1 text-xl font-black">{formatCurrency(MONTHLY_BREAKEVEN_TARGET)}</p>
          </div>
        </div>
      </Card>

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard title="Month revenue" value={formatCurrency(summary.monthRevenue)} description="Sales recorded in the current month." tone="positive" />
        <MetricCard title="Month expenses" value={formatCurrency(summary.monthExpensesTotal)} description="Tracked expenses recorded in the same period." tone="negative" />
        <MetricCard title="Operating profit" value={formatCurrency(summary.monthNet)} description="Revenue minus tracked expenses for the month." tone={summary.monthNet >= 0 ? "positive" : "negative"} />
        <MetricCard title="Break-even gap" value={summary.remainingToBreakeven > 0 ? formatCurrency(summary.remainingToBreakeven) : "Reached"} description="Amount still needed before profit can start." tone={summary.remainingToBreakeven > 0 ? "warning" : "positive"} />
        <MetricCard title="Foodpanda payout" value={formatCurrency(summary.foodpandaPayout.estimated)} description="Estimated amount left after Foodpanda keeps 40-42%." />
        <MetricCard title="Today net" value={formatCurrency(summary.todayNet)} description="Today's revenue minus today's expenses." tone={summary.todayNet >= 0 ? "positive" : "negative"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-black text-pocket-navy">Breakeven progress</p>
              <p className="text-sm text-pocket-navy/60">Target is Rs 530,000 for the month.</p>
            </div>
            <p className="text-right text-sm font-semibold text-pocket-navy/60">{formatPercent(summary.breakevenProgress)}</p>
          </div>
          <div className="mt-5">
            <ProgressBar value={summary.breakevenProgress} />
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-pocket-navy/70">
            <span>{formatCurrency(summary.monthRevenue)} collected</span>
            <span>{formatCurrency(MONTHLY_BREAKEVEN_TARGET)} target</span>
          </div>
          <p className="mt-3 text-sm text-pocket-navy/60">
            After the target is crossed, the surplus can be read as profit above base operating cost.
            {summary.surplusAfterBreakeven > 0 ? ` Current surplus: ${formatCurrency(summary.surplusAfterBreakeven)}` : ""}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-pocket-cream px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-pocket-navy/50">Operating margin</p>
              <p className="mt-1 text-lg font-black text-pocket-navy">{formatPercent(summary.operatingMargin)}</p>
            </div>
            <div className="rounded-2xl bg-pocket-cream px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-pocket-navy/50">Expense ratio</p>
              <p className="mt-1 text-lg font-black text-pocket-navy">{formatPercent(summary.expenseRatio)}</p>
            </div>
            <div className="rounded-2xl bg-pocket-cream px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-pocket-navy/50">Cash cover</p>
              <p className="mt-1 text-lg font-black text-pocket-navy">
                {summary.monthExpensesTotal > 0 ? `${(summary.monthRevenue / summary.monthExpensesTotal).toFixed(2)}x` : "N/A"}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-lg font-black text-pocket-navy">Cash snapshot</p>
          <p className="text-sm text-pocket-navy/60">Daily and weekly view of money in versus money out.</p>
          <div className="mt-4 space-y-3 rounded-2xl bg-pocket-cream px-4 py-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-pocket-navy">Today revenue</span>
              <span className="font-bold text-pocket-navy">{formatCurrency(summary.todayRevenue)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-pocket-navy">Today expenses</span>
              <span className="font-bold text-pocket-navy">{formatCurrency(summary.todayExpensesTotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-pocket-navy">Today net</span>
              <span className={`font-bold ${summary.todayNet >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCurrency(summary.todayNet)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-pocket-navy">7-day revenue</span>
              <span className="font-bold text-pocket-navy">{formatCurrency(summary.weekRevenue)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-pocket-navy">7-day expenses</span>
              <span className="font-bold text-pocket-navy">{formatCurrency(summary.weekExpensesTotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-pocket-navy">7-day net</span>
              <span className={`font-bold ${summary.weekNet >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCurrency(summary.weekNet)}</span>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SalesChart sales={weekDashboard.series} title="7-day revenue trend" description="Revenue momentum for the last 7 days." />
        <TrendChart
          entries={weekExpenses.series}
          title="7-day expense trend"
          description="Tracked expenses across the last 7 days."
          barClassName="bg-red-500"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card className="p-5">
          <p className="text-lg font-black text-pocket-navy">Payment mix</p>
          <p className="text-sm text-pocket-navy/60">How customers are paying in the current month.</p>
          <div className="mt-4 space-y-3">
            {summary.paymentMix.map((entry) => (
              <div key={entry.label} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-pocket-navy">{entry.label}</span>
                  <span className="font-bold text-pocket-navy">{formatCurrency(entry.revenue)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-pocket-cream">
                  <div
                    className="h-full rounded-full bg-pocket-orange"
                    style={{
                      width: `${Math.max(8, (entry.revenue / Math.max(summary.monthRevenue, 1)) * 100)}%`
                    }}
                  />
                </div>
                <p className="text-xs text-pocket-navy/50">{formatCompactNumber(entry.count)} orders</p>
              </div>
            ))}
            {!summary.paymentMix.length ? <p className="text-sm text-pocket-navy/60">No payment data for the selected month.</p> : null}
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-lg font-black text-pocket-navy">Branch performance</p>
          <p className="text-sm text-pocket-navy/60">Revenue, expenses, and net by branch for the current month.</p>
          <div className="mt-4 space-y-3">
            {summary.branchPerformance.map((entry) => (
              <div key={entry.label} className="rounded-2xl border border-pocket-navy/10 bg-pocket-cream px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-bold text-pocket-navy">{entry.label}</p>
                    <p className="text-xs text-pocket-navy/50">{formatCompactNumber(entry.expenseCount)} tracked expenses</p>
                  </div>
                  <p className={`font-bold ${entry.net >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCurrency(entry.net)}</p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-pocket-navy/50">Revenue</p>
                    <p className="font-semibold text-pocket-navy">{formatCurrency(entry.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-pocket-navy/50">Expenses</p>
                    <p className="font-semibold text-pocket-navy">{formatCurrency(entry.expense)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Card className="p-5">
          <p className="text-lg font-black text-pocket-navy">Top expense categories</p>
          <p className="text-sm text-pocket-navy/60">Where month spend is going right now.</p>
          <div className="mt-4 space-y-3">
            {summary.topCategories.map((entry) => (
              <div key={entry.label} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-pocket-navy">{entry.label}</span>
                  <span className="font-bold text-pocket-navy">{formatCurrency(entry.amount)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-pocket-cream">
                  <div
                    className="h-full rounded-full bg-red-500"
                    style={{
                      width: `${Math.max(8, (entry.amount / Math.max(summary.monthExpensesTotal, 1)) * 100)}%`
                    }}
                  />
                </div>
                <p className="text-xs text-pocket-navy/50">{formatCompactNumber(entry.count)} entries</p>
              </div>
            ))}
            {!summary.topCategories.length ? <p className="text-sm text-pocket-navy/60">No expense categories yet.</p> : null}
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-lg font-black text-pocket-navy">Foodpanda split estimate</p>
          <p className="text-sm text-pocket-navy/60">Estimated left side after Foodpanda keeps 40-42%.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-pocket-cream px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-pocket-navy/50">Gross Foodpanda sales</p>
              <p className="mt-1 text-2xl font-black text-pocket-navy">{formatCurrency(summary.foodpandaGross)}</p>
            </div>
            <div className="rounded-2xl bg-pocket-cream px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-pocket-navy/50">Estimated payout</p>
              <p className="mt-1 text-2xl font-black text-pocket-navy">{formatCurrency(summary.foodpandaPayout.estimated)}</p>
            </div>
            <div className="rounded-2xl bg-pocket-cream px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-pocket-navy/50">Payout range</p>
              <p className="mt-1 text-lg font-black text-pocket-navy">
                {formatCurrency(summary.foodpandaPayout.minimum)} - {formatCurrency(summary.foodpandaPayout.maximum)}
              </p>
            </div>
            <div className="rounded-2xl bg-pocket-cream px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-pocket-navy/50">Retained amount</p>
              <p className="mt-1 text-lg font-black text-pocket-navy">
                {formatCurrency(summary.foodpandaPayout.retainedMin)} - {formatCurrency(summary.foodpandaPayout.retainedMax)}
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm text-pocket-navy/60">
            This is still an estimate until Foodpanda settlement data is tracked separately.
          </p>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-lg font-black text-pocket-navy">Month trend</p>
            <p className="text-sm text-pocket-navy/60">Current month revenue movement and overall control summary.</p>
          </div>
          <Button variant="outline" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            Back to top
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-4">
          <SalesChart sales={monthDashboard.series} title="Month revenue trend" description="Revenue momentum for the current month." />
        </div>
      </Card>
    </div>
  );
}
