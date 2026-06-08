import { Clock3, MapPin, PackageCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getTrackedOrder } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

const statusSteps = ["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"];

export default async function OrdersPage() {
  const order = await getTrackedOrder("PKT-2026-000123");

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 md:px-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Order Tracking</p>
        <h1 className="text-4xl font-black text-pocket-navy">Track your live order</h1>
      </div>

      {order ? (
        <div className="mt-8 grid gap-6">
          <Card className="p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-pocket-orange">{order.orderNumber}</p>
                <h2 className="mt-2 text-2xl font-black text-pocket-navy">{order.status.replaceAll("_", " ")}</h2>
                <div className="mt-4 grid gap-2 text-sm text-pocket-navy/70">
                  <p className="inline-flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-pocket-orange" />
                    {order.branch}
                  </p>
                  <p className="inline-flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-pocket-orange" />
                    ETA {new Date(order.expectedDeliveryAt).toLocaleTimeString("en-PK", { hour: "numeric", minute: "2-digit" })}
                  </p>
                  <p className="inline-flex items-center gap-2">
                    <PackageCheck className="h-4 w-4 text-pocket-orange" />
                    Total {formatCurrency(order.totalAmount)}
                  </p>
                </div>
              </div>
              <div className="grid gap-2 md:min-w-[260px]">
                {statusSteps.map((status) => {
                  const active = statusSteps.indexOf(status) <= statusSteps.indexOf(order.status);
                  return (
                    <div key={status} className={`rounded-md px-4 py-3 text-sm font-semibold ${active ? "bg-pocket-orange text-white" : "bg-pocket-cream text-pocket-navy/60"}`}>
                      {status.replaceAll("_", " ")}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <p className="text-lg font-black text-pocket-navy">Order details</p>
            <div className="mt-4 space-y-3">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between border-b border-pocket-navy/10 pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="font-semibold text-pocket-navy">{item.productName}</p>
                    <p className="text-sm text-pocket-navy/60">Qty {item.quantity}</p>
                  </div>
                  <p className="font-bold text-pocket-orange">{formatCurrency(item.unitPrice * item.quantity)}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

