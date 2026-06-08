"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";
import { fetchAdminCustomers } from "@/lib/admin-client";
import type { AdminCustomer } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

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

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      <AdminShell title="Customers" description="Order history, spend, and loyalty tier visibility.">
        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        {loading ? (
          <Card className="p-6 text-sm text-pocket-navy/60">Loading customers...</Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {customers.length ? (
              customers.map((customer) => (
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
                          ? new Intl.DateTimeFormat("en-PK", { month: "short", day: "numeric", year: "numeric" }).format(new Date(customer.lastOrderDate))
                          : "No orders yet"}
                      </span>
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              <Card className="p-6 text-sm text-pocket-navy/60">Customers will appear here after the first orders are placed.</Card>
            )}
          </div>
        )}
      </AdminShell>
    </div>
  );
}
