"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { SalesChart } from "@/components/admin/sales-chart";
import { Card } from "@/components/ui/card";
import { fetchAdminDashboard, fetchAdminOrders } from "@/lib/admin-client";
import type { DashboardData } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export default function AdminAnalyticsPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [orders, setOrders] = useState<Array<{ placedAt: string; totalAmount: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadAnalytics() {
      try {
        setError("");
        const [nextDashboard, nextOrders] = await Promise.all([fetchAdminDashboard(), fetchAdminOrders()]);
        if (!cancelled) {
          setDashboard(nextDashboard);
          setOrders(
            nextOrders.map((order) => ({
              placedAt: order.placedAt,
              totalAmount: order.totalAmount
            }))
          );
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
  }, []);

  const peakHours = useMemo(() => {
    const hourCounts = new Map<number, number>();
    const hourRevenue = new Map<number, number>();

    for (const order of orders) {
      const hour = new Date(order.placedAt).getHours();
      hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
      hourRevenue.set(hour, (hourRevenue.get(hour) ?? 0) + order.totalAmount);
    }

    return Array.from(hourCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([hour]) => ({
        window: `${formatHour(hour)} - ${formatHour((hour + 1) % 24)}`,
        orders: hourCounts.get(hour) ?? 0,
        revenue: hourRevenue.get(hour) ?? 0
      }));
  }, [orders]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      <AdminShell title="Analytics" description="Sales trends, best sellers, and operational timing patterns.">
        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        {loading || !dashboard ? (
          <Card className="p-6 text-sm text-pocket-navy/60">Loading analytics...</Card>
        ) : (
          <>
            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <SalesChart sales={dashboard.sales} />
              <Card className="p-5">
                <p className="text-lg font-black text-pocket-navy">Peak hours</p>
                <div className="mt-4 space-y-3">
                  {peakHours.length ? (
                    peakHours.map((slot) => (
                      <div key={slot.window} className="rounded-md bg-pocket-cream px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-pocket-navy">{slot.window}</p>
                            <p className="text-sm text-pocket-navy/60">{slot.orders} orders</p>
                          </div>
                          <p className="font-bold text-pocket-orange">{formatCurrency(slot.revenue)}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-pocket-navy/60">Peak-hour data will appear after orders are placed.</p>
                  )}
                </div>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="p-5">
                <p className="text-lg font-black text-pocket-navy">Product performance</p>
                <div className="mt-4 space-y-3">
                  {dashboard.topProducts.map((product, index) => (
                    <div key={product.productName} className="flex items-center justify-between border-b border-pocket-navy/10 pb-3 last:border-0 last:pb-0">
                      <div>
                        <p className="font-semibold text-pocket-navy">{product.productName}</p>
                        <p className="text-sm text-pocket-navy/60">Rank #{index + 1}</p>
                      </div>
                      <p className="font-bold text-pocket-orange">{product.quantity} sold</p>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="p-5">
                <p className="text-lg font-black text-pocket-navy">Branch expansion readiness</p>
                <div className="mt-4 space-y-3 text-sm text-pocket-navy/70">
                  <div className="rounded-md border border-pocket-navy/10 px-4 py-3">
                    <p className="font-semibold text-pocket-navy">Islamabad</p>
                    <p>Active ordering branch with branch-level pricing and delivery fee support.</p>
                  </div>
                  <div className="rounded-md border border-pocket-navy/10 px-4 py-3">
                    <p className="font-semibold text-pocket-navy">Lahore</p>
                    <p>Schema-ready for branch inventory, routing, and location-specific catalog overrides.</p>
                  </div>
                  <div className="rounded-md border border-pocket-navy/10 px-4 py-3">
                    <p className="font-semibold text-pocket-navy">Karachi</p>
                    <p>Catalog, pricing, and order routing can be added without changing the core order model.</p>
                  </div>
                </div>
              </Card>
            </div>
          </>
        )}
      </AdminShell>
    </div>
  );
}

function formatHour(hour: number) {
  return new Intl.DateTimeFormat("en-PK", {
    hour: "numeric",
    hour12: true
  }).format(new Date(Date.UTC(2026, 0, 1, hour)));
}
