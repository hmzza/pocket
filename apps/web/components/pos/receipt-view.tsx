"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchPosReceipt, getPosTokenKey } from "@/lib/pos-client";
import type { PosReceiptOrder } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export function ReceiptView({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<PosReceiptOrder | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadReceipt() {
      const token = window.localStorage.getItem(getPosTokenKey());
      if (!token) {
        router.replace("/pos/login");
        return;
      }

      try {
        const nextOrder = await fetchPosReceipt(orderId);
        if (!cancelled) {
          setOrder(nextOrder);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Receipt unavailable.");
        }
      }
    }

    void loadReceipt();

    return () => {
      cancelled = true;
    };
  }, [orderId, router]);

  if (error) {
    return <div className="mx-auto max-w-2xl px-4 py-10 text-sm text-red-600">{error}</div>;
  }

  if (!order) {
    return <div className="mx-auto max-w-2xl px-4 py-10 text-sm text-pocket-navy/60">Loading receipt...</div>;
  }

  return (
    <div className="min-h-screen bg-[#ebe5db] px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => window.print()}>Print</Button>
        </div>
        <Card className="rounded-3xl p-8">
          <div className="text-center">
            <img src="/icon.svg" alt="Pocket logo" className="mx-auto h-14 w-14" />
            <p className="mt-4 text-3xl font-black text-pocket-navy">POCKET</p>
            <p className="mt-2 text-sm text-pocket-navy/70">{order.branch.name}</p>
            <p className="text-sm text-pocket-navy/70">{order.branch.addressLine1}</p>
            <p className="text-sm text-pocket-navy/70">{order.branch.phone}</p>
          </div>

          <div className="mt-6 grid gap-2 border-y border-dashed border-slate-300 py-4 text-sm">
            <div className="flex justify-between"><span>Order #</span><span>{order.orderNumber}</span></div>
            <div className="flex justify-between"><span>Service</span><span>{order.serviceType.replaceAll("_", " ")}</span></div>
            <div className="flex justify-between"><span>Payment</span><span>{order.paymentMethod.replaceAll("_", " ")}</span></div>
            <div className="flex justify-between"><span>Customer</span><span>{order.customerName}</span></div>
          </div>

          <div className="mt-6 space-y-4">
            {order.items.map((item) => (
              <div key={item.id} className="border-b border-dashed border-slate-300 pb-4 last:border-0">
                <div className="flex justify-between gap-4">
                  <div>
                    <p className="font-bold">{item.productName}</p>
                    {item.customDescription ? <p className="text-sm text-slate-500">{item.customDescription}</p> : null}
                    {item.addOns.map((addOn) => (
                      <p key={addOn.id} className="text-sm text-slate-500">{addOn.optionName} (+{formatCurrency(addOn.priceDelta)})</p>
                    ))}
                    {item.note ? <p className="text-sm text-slate-500">Note: {item.note}</p> : null}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">x{item.quantity}</p>
                    <p>{formatCurrency(item.unitPrice * item.quantity)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-2 border-t border-dashed border-slate-300 pt-4 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(order.subtotal)}</span></div>
            <div className="flex justify-between"><span>Discount</span><span>-{formatCurrency(order.discountAmount)}</span></div>
            <div className="flex justify-between"><span>Tax ({order.taxRate}%)</span><span>{formatCurrency(order.taxAmount)}</span></div>
            <div className="flex justify-between text-base font-bold"><span>Total</span><span>{formatCurrency(order.totalAmount)}</span></div>
            <div className="flex justify-between"><span>Paid</span><span>{formatCurrency(order.paidAmount)}</span></div>
            <div className="flex justify-between"><span>Change</span><span>{formatCurrency(order.changeDueAmount)}</span></div>
          </div>
        </Card>
      </div>
    </div>
  );
}
