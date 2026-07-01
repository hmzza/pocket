"use client";

import { useEffect, useState } from "react";
import { Package2, Receipt, Store, Wallet } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { SalesChart } from "@/components/admin/sales-chart";
import { Card } from "@/components/ui/card";
import { fetchAdminFoodpanda } from "@/lib/admin-client";
import type { AdminRangePreset, FoodpandaReportData } from "@/lib/types";
import { cn, formatCompactNumber, formatCurrency } from "@/lib/utils";

const presets: Array<{ value: AdminRangePreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" }
];

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-PK", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export default function AdminFoodpandaPage() {
  const [report, setReport] = useState<FoodpandaReportData | null>(null);
  const [preset, setPreset] = useState<AdminRangePreset>("7d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadReport() {
      try {
        setLoading(true);
        setError("");
        const nextReport = await fetchAdminFoodpanda({ preset });
        if (!cancelled) {
          setReport(nextReport);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load Foodpanda report.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadReport();

    return () => {
      cancelled = true;
    };
  }, [preset]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 md:px-6">
      <AdminShell
        title="Foodpanda"
        description="Gross Foodpanda order sales, product movement, and order history separated from in-shop revenue."
      >
        <div className="flex flex-wrap gap-2">
          {presets.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPreset(option.value)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-semibold transition",
                preset === option.value
                  ? "border-pocket-orange bg-pocket-orange text-white"
                  : "border-pocket-navy/10 bg-white text-pocket-navy hover:bg-pocket-cream"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

        {loading || !report ? (
          <Card className="p-6 text-sm text-pocket-navy/60">Loading Foodpanda report...</Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <SummaryCard label="Gross Sales" value={formatCurrency(report.summary.grossSales)} icon={Wallet} />
              <SummaryCard label="Orders" value={formatCompactNumber(report.summary.orders)} icon={Receipt} />
              <SummaryCard label="Average Order" value={formatCurrency(report.summary.averageOrderValue)} icon={Store} />
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <SalesChart
                sales={report.series}
                title="Foodpanda sales"
                description={`Gross Foodpanda sales and order count for ${report.range.label.toLowerCase()}.`}
              />
              <Card className="p-5">
                <p className="text-lg font-black text-pocket-navy">Top products</p>
                <p className="text-sm text-pocket-navy/60">Products sold through Foodpanda only.</p>
                <div className="mt-4 space-y-3">
                  {report.topProducts.length ? (
                    report.topProducts.map((product, index) => (
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
                    ))
                  ) : (
                    <p className="text-sm text-pocket-navy/60">No Foodpanda products in this range.</p>
                  )}
                </div>
              </Card>
            </div>

            <Card className="overflow-hidden p-0">
              <div className="border-b border-pocket-navy/10 px-5 py-4">
                <p className="text-lg font-black text-pocket-navy">Foodpanda orders</p>
                <p className="text-sm text-pocket-navy/60">Gross order list for the selected range.</p>
              </div>
              <div className="divide-y divide-pocket-navy/10">
                {report.orders.length ? (
                  report.orders.map((order) => (
                    <div key={order.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_160px_180px]">
                      <div>
                        <p className="font-black text-pocket-navy">{order.orderNumber}</p>
                        <p className="mt-1 text-sm text-pocket-navy/60">
                          {order.customerName} {order.customerPhone ? `· ${order.customerPhone}` : ""}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-pocket-navy/45">
                          {order.branch} · {formatDateTime(order.placedAt)}
                        </p>
                        <p className="mt-2 text-sm text-pocket-navy/70">
                          {order.items.map((item) => `${item.quantity}x ${item.productName}`).join(", ")}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/45">Status</p>
                        <p className="mt-1 font-bold text-pocket-navy">{order.status.replaceAll("_", " ")}</p>
                        <p className="mt-2 text-sm text-pocket-navy/60">{order.paymentMethod.replaceAll("_", " ")}</p>
                      </div>
                      <div className="lg:text-right">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/45">Gross Total</p>
                        <p className="mt-1 text-xl font-black text-pocket-orange">{formatCurrency(order.totalAmount)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-8 text-sm text-pocket-navy/60">No Foodpanda orders in this range.</div>
                )}
              </div>
            </Card>
          </>
        )}
      </AdminShell>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon
}: {
  label: string;
  value: string;
  icon: typeof Wallet;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">{label}</p>
          <p className="mt-3 text-2xl font-black text-pocket-navy">{value}</p>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-pocket-cream text-pocket-orange">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}
