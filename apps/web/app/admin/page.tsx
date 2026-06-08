"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { MetricCard } from "@/components/admin/metric-card";
import { SalesChart } from "@/components/admin/sales-chart";
import { Card } from "@/components/ui/card";
import { fetchAdminDashboard } from "@/lib/admin-client";
import type { DashboardData } from "@/lib/types";
import { formatCompactNumber, formatCurrency } from "@/lib/utils";

export default function AdminPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        setError("");
        const nextDashboard = await fetchAdminDashboard();
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

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      <AdminShell title="Dashboard" description="KPIs, recent orders, inventory watch, and sales momentum.">
        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        {loading || !dashboard ? (
          <Card className="p-6 text-sm text-pocket-navy/60">Loading dashboard...</Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Today's Orders" value={formatCompactNumber(dashboard.kpis.todayOrders)} helper="Current day order flow" />
              <MetricCard label="Revenue" value={formatCurrency(dashboard.kpis.revenue)} helper="Gross revenue snapshot" />
              <MetricCard label="Customers" value={formatCompactNumber(dashboard.kpis.totalCustomers)} helper="Total customer base" />
              <MetricCard label="Avg Order" value={formatCurrency(dashboard.kpis.averageOrderValue)} helper="Average ticket size" />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <SalesChart sales={dashboard.sales} />
              <Card className="p-5">
                <p className="text-lg font-black text-pocket-navy">Top products</p>
                <div className="mt-4 space-y-3">
                  {dashboard.topProducts.map((item) => (
                    <div key={item.productName} className="flex items-center justify-between rounded-md bg-pocket-cream px-4 py-3">
                      <p className="font-semibold text-pocket-navy">{item.productName}</p>
                      <p className="font-black text-pocket-orange">{item.quantity}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="p-5">
                <p className="text-lg font-black text-pocket-navy">Recent orders</p>
                <div className="mt-4 space-y-3">
                  {dashboard.recentOrders.map((order) => (
                    <div key={order.id} className="flex items-center justify-between border-b border-pocket-navy/10 pb-3 last:border-0 last:pb-0">
                      <div>
                        <p className="font-semibold text-pocket-navy">{order.orderNumber}</p>
                        <p className="text-sm text-pocket-navy/60">{order.customerName}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-pocket-orange">{formatCurrency(order.totalAmount)}</p>
                        <p className="text-xs font-semibold uppercase tracking-wide text-pocket-navy/50">{order.status.replaceAll("_", " ")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="p-5">
                <p className="text-lg font-black text-pocket-navy">Low stock alerts</p>
                <div className="mt-4 space-y-3">
                  {dashboard.lowStock.length ? (
                    dashboard.lowStock.map((item) => (
                      <div key={`${item.branch}-${item.ingredient}`} className="rounded-md border border-pocket-orange/20 bg-pocket-orange/5 px-4 py-3">
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
