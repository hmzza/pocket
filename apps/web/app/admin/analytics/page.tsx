"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { SalesChart } from "@/components/admin/sales-chart";
import { Card } from "@/components/ui/card";
import { dashboardData } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

export default function AdminAnalyticsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      <AdminShell title="Analytics" description="Sales trends, best sellers, and operational timing patterns.">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <SalesChart sales={dashboardData.sales} />
          <Card className="p-5">
            <p className="text-lg font-black text-pocket-navy">Peak hours</p>
            <div className="mt-4 space-y-3">
              {[
                { window: "1 PM - 3 PM", revenue: 38200 },
                { window: "7 PM - 9 PM", revenue: 44100 },
                { window: "10 PM - 11 PM", revenue: 21900 }
              ].map((slot) => (
                <div key={slot.window} className="rounded-md bg-pocket-cream px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-pocket-navy">{slot.window}</p>
                    <p className="font-bold text-pocket-orange">{formatCurrency(slot.revenue)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <p className="text-lg font-black text-pocket-navy">Product performance</p>
            <div className="mt-4 space-y-3">
              {dashboardData.topProducts.map((product, index) => (
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
                <p>CMS and settings layers already support branch expansion without restructuring the data model.</p>
              </div>
            </div>
          </Card>
        </div>
      </AdminShell>
    </div>
  );
}

