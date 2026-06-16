"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { fetchPosReceipt, getPosTokenKey } from "@/lib/pos-client";
import type { PosReceiptOrder } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

function formatPaymentMethod(value: string) {
  const map: Record<string, string> = {
    CASH: "Cash",
    CASH_ON_DELIVERY: "Cash on Delivery",
    CARD: "Card",
    ONLINE: "Online",
    JAZZCASH: "JazzCash",
    EASYPAISA: "Easypaisa"
  };

  return map[value] ?? value.replaceAll("_", " ");
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat("en-PK", { day: "2-digit", month: "short", year: "numeric" }).format(date),
    time: new Intl.DateTimeFormat("en-PK", { hour: "2-digit", minute: "2-digit" }).format(date)
  };
}

function money(value: number) {
  return formatCurrency(Number(value.toFixed(2)));
}

function plainNumber(value: number) {
  return Math.round(value).toLocaleString("en-PK");
}

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

  const receiptMeta = useMemo(() => {
    if (!order) return null;
    const dateTime = formatDateTime(order.createdAt ?? order.placedAt);
    return {
      date: dateTime.date,
      time: dateTime.time
    };
  }, [order]);

  if (error) {
    return <div className="mx-auto max-w-sm px-4 py-10 text-sm text-red-600">{error}</div>;
  }

  if (!order || !receiptMeta) {
    return <div className="mx-auto max-w-sm px-4 py-10 font-mono text-sm text-black/60">Loading receipt...</div>;
  }

  return (
    <div className="bg-[#f4efe5] px-3 py-4 font-mono text-[11px] leading-tight text-black print:bg-white print:px-0 print:py-0">
      <div className="mx-auto w-full max-w-[80mm] print:max-w-none print:w-[80mm]">
        <div className="mb-3 flex justify-end print:hidden">
          <Button variant="outline" onClick={() => window.print()}>
            Print
          </Button>
        </div>

        <section className="break-inside-avoid rounded-lg border border-dashed border-black/30 bg-white px-3 py-4 shadow-sm print:break-inside-avoid print:rounded-none print:border-0 print:shadow-none">
          <div className="text-center">
            <img src="/icon.png" alt="Pocket logo" className="mx-auto h-9 w-9" />
            <p className="mt-2 text-[26px] font-black tracking-[0.18em]">POCKET</p>
            <p className="mt-1 text-[10px] font-semibold tracking-[0.3em] text-black/70">{order.branch.name}</p>
            <p className="mt-2 text-[10px]">{order.branch.addressLine1}</p>
            <p className="text-[10px]">{order.branch.phone}</p>
            <p className="mt-2 text-[12px] font-bold tracking-[0.2em]">Purchase Slip</p>
          </div>

          <div className="my-3 border-t border-dashed border-black/30" />

          <div className="space-y-1.5">
            {[
              ["Receipt No", order.receiptNumber],
              ["Order ID", order.id],
              ["FBR Reference No", order.fbrReferenceNumber],
              ["POS No", order.posNo],
              ["Payment Type", formatPaymentMethod(order.paymentMethod)],
              ["Date", receiptMeta.date],
              ["Time", receiptMeta.time],
              ["User ID", order.userId || "Admin"],
              ["Customer Name", order.customerName || "Walk-in"],
              ["Order Type", order.orderType.replaceAll("_", " ")]
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-3">
                <span className="text-black/70">{label}:</span>
                <span className="text-right font-semibold">{value}</span>
              </div>
            ))}
          </div>

          <div className="my-3 border-t border-dashed border-black/30" />

          <table className="w-full table-fixed border-collapse text-[10px]">
            <colgroup>
              <col style={{ width: "7%" }} />
              <col style={{ width: "36%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "12%" }} />
            </colgroup>
            <thead>
              <tr className="border-b border-dashed border-black/30">
                <th className="w-[8%] pb-1 text-left font-bold">Sr</th>
                <th className="w-[36%] pb-1 text-left font-bold">Product</th>
                <th className="w-[12%] pb-1 text-right font-bold">Price</th>
                <th className="w-[8%] pb-1 pr-1 text-right font-bold">Qty</th>
                <th className="w-[10%] pb-1 pl-2 text-right font-bold">Tax%</th>
                <th className="w-[12%] pb-1 text-right font-bold">Tax</th>
                <th className="w-[14%] pb-1 text-right font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, index) => (
                <tr key={item.id} className="border-b border-dotted border-black/20 align-top">
                  <td className="py-2 pr-1">{index + 1}</td>
                  <td className="py-2 pr-1">
                    <div className="break-words font-semibold">{item.productName}</div>
                    {item.customDescription ? <div className="mt-0.5 break-words text-[9px] text-black/65">{item.customDescription}</div> : null}
                    {item.addOns.length ? (
                      <div className="mt-0.5 break-words text-[9px] text-black/55">
                        {item.addOns.map((addOn) => addOn.optionName).join(", ")}
                      </div>
                    ) : null}
                    {item.note ? <div className="mt-0.5 break-words text-[9px] text-black/55">Note: {item.note}</div> : null}
                  </td>
                  <td className="py-2 pl-0 pr-1 text-right whitespace-nowrap">{money(item.unitPrice)}</td>
                  <td className="py-2 pr-1 text-right whitespace-nowrap">{item.quantity}</td>
                  <td className="py-2 pl-2 text-right whitespace-nowrap">{Math.round(item.taxRate)}%</td>
                  <td className="py-2 px-0 text-right whitespace-nowrap">{plainNumber(item.taxAmount)}</td>
                  <td className="py-2 pl-1 text-right whitespace-nowrap font-semibold">{plainNumber(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="my-3 border-t border-dashed border-black/30" />

          <div className="space-y-1.5 text-[10px]">
            <div className="flex justify-between gap-3">
              <span>Gross Total:</span>
              <span className="font-semibold">{money(order.grossTotal)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Discount:</span>
              <span className="font-semibold">{money(order.discountAmount)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Service Fee:</span>
              <span className="font-semibold">{money(order.serviceFee)}</span>
            </div>
            <div className="flex justify-between gap-3 border-t border-dashed border-black/20 pt-1">
              <span className="font-bold">Net Total:</span>
              <span className="font-bold">{money(order.netTotal)}</span>
            </div>
          </div>

          <div className="my-3 border-t border-dashed border-black/30" />

          <div className="space-y-1.5 text-[10px]">
            <div className="flex justify-between gap-3">
              <span>Tax Details:</span>
              <span />
            </div>
            <div className="flex justify-between gap-3">
              <span>GST on {order.taxRate.toFixed(2)}%:</span>
              <span className="font-semibold">{money(order.totalTax)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Total GST:</span>
              <span className="font-semibold">{money(order.totalTax)}</span>
            </div>
          </div>

          <div className="my-3 border-t border-dashed border-black/30" />

          <p className="text-center text-[10px] font-bold tracking-[0.14em]">********** Tax is Inclusive in Price **********</p>

          <div className="my-3 border-t border-dashed border-black/30" />

          <div className="text-center text-[10px]">
            <p>Thank you for your visit</p>
            <p className="mt-1 text-[12px] font-bold tracking-[0.18em]">Pocket</p>
            <p className="mt-1 text-black/70">For complaints &amp; queries: {order.branch.phone}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
