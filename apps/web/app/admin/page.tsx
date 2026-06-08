"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { MetricCard } from "@/components/admin/metric-card";
import { SalesChart } from "@/components/admin/sales-chart";
import { Card } from "@/components/ui/card";
import { dashboardData } from "@/lib/mock-data";
import { formatCompactNumber, formatCurrency } from "@/lib/utils";

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      <AdminShell title="Dashboard" description="KPIs, recent orders, inventory watch, and sales momentum.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Today's Orders" value={formatCompactNumber(dashboardData.kpis.todayOrders)} helper="Current day order flow" />
          <MetricCard label="Revenue" value={formatCurrency(dashboardData.kpis.revenue)} helper="Gross revenue snapshot" />
          <MetricCard label="Customers" value={formatCompactNumber(dashboardData.kpis.totalCustomers)} helper="Total customer base" />
          <MetricCard label="Avg Order" value={formatCurrency(dashboardData.kpis.averageOrderValue)} helper="Average ticket size" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <SalesChart sales={dashboardData.sales} />
          <Card className="p-5">
            <p className="text-lg font-black text-pocket-navy">Top products</p>
            <div className="mt-4 space-y-3">
              {dashboardData.topProducts.map((item) => (
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
              {dashboardData.recentOrders.map((order) => (
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
              {dashboardData.lowStock.map((item) => (
                <div key={`${item.branch}-${item.ingredient}`} className="rounded-md border border-pocket-orange/20 bg-pocket-orange/5 px-4 py-3">
                  <p className="font-semibold text-pocket-navy">{item.ingredient}</p>
                  <p className="text-sm text-pocket-navy/60">{item.branch}</p>
                  <p className="mt-2 text-sm font-bold text-pocket-orange">{item.quantityOnHand} units on hand</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </AdminShell>
    </div>
  );
}

