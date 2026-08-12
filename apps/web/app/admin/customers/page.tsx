"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { BIBarList, BISection, FutureMetric } from "@/components/admin/bi-primitives";
import { Card } from "@/components/ui/card";
import { fetchAdminCustomers } from "@/lib/admin-client";
import type { AdminCustomer } from "@/lib/types";
import { formatCompactCurrency, formatCompactNumber, formatCurrency } from "@/lib/utils";

function getCustomerSegment(customer: AdminCustomer) {
  if (customer.totalSpend >= 5000 || customer.totalOrders >= 8) return "Loyal";
  if (customer.totalOrders >= 3) return "Returning";
  return "New";
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCustomers() {
      try {
        setError("");
        const nextCustomers = await fetchAdminCustomers();
        if (!cancelled) {
          setCustomers(nextCustomers);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load customers.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadCustomers();

    return () => {
      cancelled = true;
    };
  }, []);

  const repeatCustomers = customers.filter((customer) => customer.totalOrders > 1);
  const totalSpend = customers.reduce((sum, customer) => sum + customer.totalSpend, 0);
  const averageSpend = customers.length ? totalSpend / customers.length : 0;
  const averageVisits = customers.length ? customers.reduce((sum, customer) => sum + customer.totalOrders, 0) / customers.length : 0;
  const inactiveCustomers = customers.filter((customer) => !customer.lastOrderDate || Date.now() - new Date(customer.lastOrderDate).getTime() > 60 * 24 * 60 * 60 * 1000).length;
  const topCustomers = [...customers].sort((left, right) => right.totalSpend - left.totalSpend).slice(0, 8);

  return (
    <AdminShell title="Customers" description="Order history, spend, and loyalty tier visibility.">
        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        {loading ? (
          <Card className="p-6 text-sm text-pocket-navy/60">Loading customers...</Card>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
              <Card className="p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-pocket-orange">Customers</p><p className="mt-2 text-xl font-black text-pocket-navy">{formatCompactNumber(customers.length)}</p><p className="mt-1 text-xs text-pocket-navy/60">Registered accounts</p></Card>
              <Card className="p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-pocket-orange">Repeat customers</p><p className="mt-2 text-xl font-black text-pocket-navy">{formatCompactNumber(repeatCustomers.length)}</p><p className="mt-1 text-xs text-pocket-navy/60">{customers.length ? ((repeatCustomers.length / customers.length) * 100).toFixed(1) : "0.0"}% repeat</p></Card>
              <Card className="p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-pocket-orange">Repeat %</p><p className="mt-2 text-xl font-black text-pocket-navy">{customers.length ? ((repeatCustomers.length / customers.length) * 100).toFixed(1) : "0.0"}%</p><p className="mt-1 text-xs text-pocket-navy/60">Customer base</p></Card>
              <Card className="p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-pocket-orange">Average spend</p><p className="mt-2 text-xl font-black text-pocket-navy">{formatCompactCurrency(averageSpend)}</p><p className="mt-1 text-xs text-pocket-navy/60">Lifetime per account</p></Card>
              <Card className="p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-pocket-orange">Average visits</p><p className="mt-2 text-xl font-black text-pocket-navy">{averageVisits.toFixed(1)}</p><p className="mt-1 text-xs text-pocket-navy/60">Orders per account</p></Card>
              <Card className="p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-pocket-orange">Inactive</p><p className="mt-2 text-xl font-black text-pocket-navy">{formatCompactNumber(inactiveCustomers)}</p><p className="mt-1 text-xs text-pocket-navy/60">No order in 60+ days</p></Card>
              <FutureMetric label="Customer lifetime value" description="Add cohort margin tracking." />
            </div>
            <div className="grid gap-6 xl:grid-cols-2"><BISection title="Customer spending" description="Top customers by lifetime spend."><BIBarList entries={topCustomers.map((customer) => ({ label: customer.name, value: customer.totalSpend, detail: `${customer.totalOrders} orders` }))} formatValue={formatCompactCurrency} /></BISection><BISection title="Customer growth" description="Current account segments to guide retention work."><BIBarList entries={[{ label: "New customers", value: customers.filter((customer) => customer.totalOrders === 1).length }, { label: "Repeat customers", value: repeatCustomers.length }, { label: "Loyal customers", value: customers.filter((customer) => getCustomerSegment(customer) === "Loyal").length }, { label: "Inactive customers", value: inactiveCustomers }]} formatValue={formatCompactNumber} tone="navy" /></BISection></div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {customers.length ? customers.map((customer) => (
                <Card key={customer.id} className="p-5">
                  <p className="text-lg font-black text-pocket-navy">{customer.name}</p>
                  <p className="mt-1 text-sm text-pocket-navy/60">{customer.email}</p>
                  {customer.phone ? <p className="mt-1 text-sm text-pocket-navy/60">{customer.phone}</p> : null}
                  <div className="mt-5 grid gap-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-pocket-navy/60">Orders</span>
                      <span className="font-bold text-pocket-navy">{customer.totalOrders}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-pocket-navy/60">Spend</span>
                      <span className="font-bold text-pocket-orange">{formatCurrency(customer.totalSpend)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-pocket-navy/60">Segment</span>
                      <span className="font-bold text-pocket-navy">{getCustomerSegment(customer)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-pocket-navy/60">Last order</span>
                      <span className="font-medium text-pocket-navy">
                        {customer.lastOrderDate
                          ? new Intl.DateTimeFormat("en-PK", { timeZone: "Asia/Karachi", month: "short", day: "numeric", year: "numeric" }).format(new Date(customer.lastOrderDate))
                          : "No orders yet"}
                      </span>
                    </div>
                  </div>
                </Card>
              ))
            : (
              <Card className="p-6 text-sm text-pocket-navy/60">Customers will appear here after the first orders are placed.</Card>
            )}
            </div>
          </div>
        )}
      </AdminShell>
  );
}
