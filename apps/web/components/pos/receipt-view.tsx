"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchPosReceipt, fetchPublicReceipt, getPosReceiptCacheKey } from "@/lib/pos-client";
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

function formatOrderSource(value: string) {
  const map: Record<string, string> = {
    POS: "POS",
    ONLINE: "Online",
    FOODPANDA: "Foodpanda"
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

type ReceiptCopy = "customer" | "store";

type ReceiptMode = ReceiptCopy | "chef" | "all";

function ReceiptSlip({
  order,
  receiptMeta,
  copyLabel
}: {
  order: PosReceiptOrder;
  receiptMeta: { date: string; time: string };
  copyLabel: string;
}) {
  return (
    <section className="break-inside-avoid rounded-lg border border-dashed border-black/30 bg-white px-3 py-4 shadow-sm print:break-inside-avoid print:rounded-none print:border-0 print:shadow-none">
      <div className="text-center">
        <img src="/icon.png" alt="Pocket logo" className="mx-auto h-12 w-12 print:h-14 print:w-14" />
        <p className="mt-2 text-[26px] font-black tracking-[0.18em]">POCKET</p>
        <p className="mt-1 text-[11px] font-bold tracking-[0.22em] text-black print:text-[11.5px]">{order.branch.name}</p>
        <p className="mt-2 text-[10.5px] font-bold text-black print:text-[11px]">{order.branch.addressLine1}</p>
        <p className="text-[10.5px] font-bold text-black print:text-[11px]">{order.branch.phone}</p>
        <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em]">{copyLabel}</p>
        <p className="mt-1 text-[12px] font-bold tracking-[0.2em]">Purchase Slip</p>
      </div>

      <div className="my-3 border-t border-dashed border-black/30" />

      <div className="space-y-1.5 text-[11px] print:text-[11.5px]">
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
          ["Source", formatOrderSource(order.orderSource)],
          ["Order Type", order.orderType.replaceAll("_", " ")]
        ].map(([label, value]) => (
          <div key={`${copyLabel}-${label}`} className="flex items-start justify-between gap-3">
            <span className="font-semibold text-black print:font-bold">{label}:</span>
            <span className="text-right font-semibold text-black print:font-bold">{value}</span>
          </div>
        ))}
      </div>

      <div className="my-3 border-t border-dashed border-black/30" />

      <table className="w-full table-fixed border-collapse text-[10px] print:text-[10.5px]">
        <colgroup>
          <col style={{ width: "8%" }} />
          <col style={{ width: "48%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "18%" }} />
        </colgroup>
        <thead>
          <tr className="border-b border-dashed border-black/30">
            <th className="w-[8%] pb-1 text-left font-bold">Sr</th>
            <th className="w-[48%] pb-1 text-left font-bold">Product</th>
            <th className="w-[16%] pb-1 text-right font-bold">Price</th>
            <th className="w-[10%] pb-1 pr-1 text-right font-bold">Qty</th>
            <th className="w-[18%] pb-1 text-right font-bold">Total</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, index) => (
            <tr key={`${copyLabel}-${item.id}`} className="border-b border-dotted border-black/20 align-top">
              <td className="py-2 pr-1 font-medium print:font-semibold">{index + 1}</td>
              <td className="py-2 pr-1">
                <div className="break-words font-semibold">{item.productName}</div>
                {item.customDescription ? <div className="mt-0.5 break-words text-[9px] font-medium text-black/75 print:font-semibold print:text-black">{item.customDescription}</div> : null}
                {item.addOns.length ? (
                  <div className="mt-0.5 break-words text-[9px] font-medium text-black/65 print:font-semibold print:text-black">
                    {item.addOns.map((addOn) => addOn.optionName).join(", ")}
                  </div>
                ) : null}
                {item.note ? <div className="mt-0.5 break-words text-[9px] font-medium text-black/65 print:font-semibold print:text-black">Note: {item.note}</div> : null}
              </td>
              <td className="py-2 pl-0 pr-1 text-right whitespace-nowrap font-medium print:font-semibold">{money(item.unitPrice)}</td>
              <td className="py-2 pr-1 text-right whitespace-nowrap font-medium print:font-semibold">{item.quantity}</td>
              <td className="py-2 pl-1 text-right whitespace-nowrap font-semibold">{money(item.unitPrice * item.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="my-3 border-t border-dashed border-black/30" />

      <div className="space-y-1.5 text-[10px] print:text-[10.5px]">
        <div className="flex justify-between gap-3">
          <span className="font-medium print:font-semibold">Gross Total:</span>
          <span className="font-semibold">{money(order.grossTotal)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="font-medium print:font-semibold">Discount:</span>
          <span className="font-semibold">{money(order.discountAmount)}</span>
        </div>
        <div className="flex justify-between gap-3 border-t border-dashed border-black/20 pt-1">
          <span className="font-bold">Total:</span>
          <span className="font-bold">{money(order.netTotal)}</span>
        </div>
      </div>

      <div className="my-3 border-t border-dashed border-black/30" />

      <div className="text-center text-[10px] print:text-[10.5px]">
        <p className="font-bold text-black">Thank you for your visit</p>
        <p className="mt-1 text-[12px] font-bold tracking-[0.18em]">Pocket</p>
        <p className="mt-1 font-bold text-black">For complaints &amp; queries: {order.branch.phone}</p>
      </div>
    </section>
  );
}

function ChefSlip({
  order
}: {
  order: PosReceiptOrder;
}) {
  return (
    <section className="break-inside-avoid rounded-lg border border-dashed border-black/30 bg-white px-3 py-4 shadow-sm print:break-inside-avoid print:rounded-none print:border-0 print:shadow-none">
      <div className="text-center">
        <img src="/icon.png" alt="Pocket logo" className="mx-auto h-14 w-14 print:h-16 print:w-16" />
        <p className="mt-2 text-[28px] font-black tracking-[0.12em]">CHEF COPY</p>
        <p className="mt-1 text-[13px] font-bold uppercase tracking-[0.14em]">Order to Kitchen</p>
      </div>

      <div className="my-3 border-t border-dashed border-black/30" />

      <div className="space-y-2 text-[14px] print:text-[15px]">
        <div className="flex items-start justify-between gap-3">
          <span className="font-semibold text-black print:font-bold">Order ID:</span>
          <span className="text-right font-semibold text-black print:font-bold">{order.id}</span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <span className="font-semibold text-black print:font-bold">Receipt No:</span>
          <span className="text-right font-semibold text-black print:font-bold">{order.receiptNumber}</span>
        </div>
      </div>

      <div className="my-3 border-t border-dashed border-black/30" />

      <div className="space-y-3">
        {order.items.map((item, index) => (
          <div key={`chef-${item.id}`} className="border-b border-dashed border-black/20 pb-3 text-[15px] leading-tight print:text-[16px]">
            <div className="flex items-start justify-between gap-3">
              <span className="font-bold">{index + 1}.</span>
              <span className="ml-2 flex-1 font-bold">{item.productName}</span>
              <span className="min-w-[40px] text-right font-bold">x{item.quantity}</span>
            </div>
            {item.customDescription ? (
              <p className="mt-1 pl-7 text-[13px] font-semibold print:text-[14px]">{item.customDescription}</p>
            ) : null}
            {item.addOns.length ? (
              <div className="mt-2 pl-7">
                <p className="text-[11px] font-black uppercase tracking-[0.18em]">Selections</p>
                <ul className="mt-1 space-y-1">
                  {item.addOns.map((addOn) => (
                    <li key={addOn.id} className="text-[14px] font-semibold print:text-[15px]">
                      {addOn.optionName}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {item.note ? <p className="mt-2 pl-7 text-[13px] font-semibold">Note: {item.note}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function ReceiptBundle({
  order,
  receiptMeta
}: {
  order: PosReceiptOrder;
  receiptMeta: { date: string; time: string };
}) {
  return (
    <div className="space-y-3 print:space-y-0">
      <div className="print:break-after-page">
        <ReceiptSlip order={order} receiptMeta={receiptMeta} copyLabel="Customer Copy" />
      </div>
      <div className="print:break-after-page">
        <ReceiptSlip order={order} receiptMeta={receiptMeta} copyLabel="Store Copy" />
      </div>
      <ChefSlip order={order} />
    </div>
  );
}

export function ReceiptView({ orderId, publicToken }: { orderId: string; publicToken?: string }) {
  const searchParams = useSearchParams();
  const [order, setOrder] = useState<PosReceiptOrder | null>(null);
  const [error, setError] = useState("");
  const autoPrint = searchParams.get("autoPrint") === "1";
  const printedRef = useRef(false);
  const mode = (searchParams.get("copy") as ReceiptMode | null) ?? "customer";

  useEffect(() => {
    let cancelled = false;

    async function loadReceipt() {
      if (publicToken) {
        try {
          const nextOrder = await fetchPublicReceipt(orderId, publicToken);
          if (!cancelled) {
            setOrder(nextOrder);
          }
        } catch (loadError) {
          if (!cancelled) {
            setError(loadError instanceof Error ? loadError.message : "Receipt unavailable.");
          }
        }
        return;
      }

      const cachedReceipt = window.sessionStorage.getItem(getPosReceiptCacheKey(orderId));
      let parsedReceipt: PosReceiptOrder | null = null;
      if (cachedReceipt) {
        try {
          parsedReceipt = JSON.parse(cachedReceipt) as PosReceiptOrder;
          setOrder(parsedReceipt);
        } catch {
          window.sessionStorage.removeItem(getPosReceiptCacheKey(orderId));
        }
      }

      try {
        if (!parsedReceipt) {
          const nextOrder = await fetchPosReceipt(orderId);
          if (!cancelled) {
            setOrder(nextOrder);
          }
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
  }, [orderId, publicToken]);

  const receiptMeta = useMemo(() => {
    if (!order) return null;
    const dateTime = formatDateTime(order.createdAt ?? order.placedAt);
    return {
      date: dateTime.date,
      time: dateTime.time
    };
  }, [order]);

  const isBundle = mode === "all";
  const isChef = mode === "chef";
  const copy = mode === "store" ? "store" : "customer";
  const copyLabel = copy === "store" ? "Store Copy" : "Customer Copy";

  useEffect(() => {
    if (!autoPrint || !order || !receiptMeta || printedRef.current) {
      return;
    }

    printedRef.current = true;
    const timer = window.setTimeout(() => {
      window.print();
      window.parent.postMessage(
        {
          type: "pos-receipt-printed",
          orderId,
          copy: isBundle ? "all" : isChef ? "chef" : copy
        },
        window.location.origin
      );
    }, 0);

    return () => window.clearTimeout(timer);
  }, [autoPrint, copy, isBundle, isChef, order, orderId, receiptMeta]);

  if (error) {
    return <div className="mx-auto max-w-sm px-4 py-10 text-sm text-red-600">{error}</div>;
  }

  if (!order || !receiptMeta) {
    return <div className="mx-auto max-w-sm px-4 py-10 font-mono text-sm text-black/60">Loading receipt...</div>;
  }

  return (
    <div className="bg-[#f4efe5] px-3 py-4 font-mono text-[11px] leading-tight text-black print:bg-white print:px-0 print:py-0 print:font-medium">
      <div className="mx-auto w-full max-w-[80mm] print:max-w-none print:w-[80mm]">
        <div className="mb-3 flex justify-end gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md border border-black/20 bg-white px-3 py-2 text-xs font-semibold text-black"
          >
            Print
          </button>
        </div>
        {isBundle ? <ReceiptBundle order={order} receiptMeta={receiptMeta} /> : isChef ? <ChefSlip order={order} /> : <ReceiptSlip order={order} receiptMeta={receiptMeta} copyLabel={copyLabel} />}
      </div>
    </div>
  );
}
