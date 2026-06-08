"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";
import { mockCustomers } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

export default function AdminCustomersPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      <AdminShell title="Customers" description="Order history, spend, and loyalty tier visibility.">
        <div className="grid gap-4 md:grid-cols-3">
          {mockCustomers.map((customer) => (
            <Card key={customer.id} className="p-5">
              <p className="text-lg font-black text-pocket-navy">{customer.name}</p>
              <p className="mt-1 text-sm text-pocket-navy/60">{customer.email}</p>
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
                  <span className="font-bold text-pocket-navy">{customer.segment}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </AdminShell>
    </div>
  );
}

