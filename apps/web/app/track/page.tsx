"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Bike, PackageCheck, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { API_URL } from "@/lib/catalog";
import { formatCurrency } from "@/lib/utils";

type TrackedOrder = {
  orderNumber: string;
  status: string;
  serviceType: "DELIVERY" | "TAKEAWAY" | string;
  branch: { name: string; addressLine1?: string; phone?: string };
  deliveryAddress?: { addressLine1: string; city: string } | null;
  expectedDeliveryAt?: string | null;
  totalAmount: number;
  placedAt: string;
  items: Array<{ id: string; productName: string; quantity: number; unitPrice: number }>;
};

/**
 * Customer-visible lifecycle. Internal statuses are collapsed into the handful
 * of things a customer actually cares about, so kitchen detail does not leak.
 */
const deliverySteps = ["Received", "Being prepared", "On the way", "Delivered"] as const;
const takeawaySteps = ["Received", "Being prepared", "Ready to collect", "Collected"] as const;

function stepIndexFor(status: string, isDelivery: boolean) {
  switch (status) {
    case "PENDING":
      return 0;
    case "CONFIRMED":
    case "PREPARING":
    case "WATCH_LATER":
      return 1;
    case "READY":
      return isDelivery ? 1 : 2;
    case "OUT_FOR_DELIVERY":
      return 2;
    case "DELIVERED":
      return 3;
    default:
      return 0;
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-PK", {
    timeZone: "Asia/Karachi",
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function TrackOrderForm() {
  const searchParams = useSearchParams();
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Deep link from the confirmation screen prefills the order number; the phone
  // is still required, so the link alone does not expose anyone's order.
  useEffect(() => {
    const fromQuery = searchParams.get("orderNumber");
    if (fromQuery) setOrderNumber(fromQuery);
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setOrder(null);

    try {
      const response = await fetch(`${API_URL}/api/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber: orderNumber.trim(), phone: phone.trim() })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.message === "Order not found."
            ? "We could not find that order. Check the order number and the phone number you ordered with."
            : payload?.message ?? "Unable to look up that order."
        );
      }

      const data = (await response.json()) as { order: TrackedOrder };
      setOrder(data.order);
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : "Unable to look up that order.");
    } finally {
      setLoading(false);
    }
  }

  const isDelivery = order?.serviceType === "DELIVERY";
  const steps = isDelivery ? deliverySteps : takeawaySteps;
  const activeStep = order ? stepIndexFor(order.status, isDelivery) : 0;
  const isCancelled = order?.status === "CANCELLED";

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:px-6">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Order Tracking</p>
        <h1 className="mt-2 text-3xl font-black text-pocket-navy sm:text-4xl">Where is my order?</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-pocket-navy/70">
          Enter your order number and the phone number you ordered with.
        </p>
      </div>

      <Card className="mt-8 p-5">
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60">Order number</span>
            <Input value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} placeholder="PKT-2026-000123" required />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60">Contact number</span>
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0300 1234567" inputMode="tel" required />
          </label>
          <Button type="submit" disabled={loading}>
            {loading ? "Checking..." : "Track order"}
          </Button>
        </form>
        {error ? <p className="mt-4 text-sm font-medium text-red-600">{error}</p> : null}
      </Card>

      {order ? (
        <Card className="mt-6 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-navy/60">Order</p>
              <p className="break-all text-2xl font-black text-pocket-navy">{order.orderNumber}</p>
              <p className="mt-1 text-sm text-pocket-navy/60">Placed {formatDateTime(order.placedAt)}</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-pocket-navy/15 bg-pocket-cream px-3 py-1.5 text-sm font-bold text-pocket-navy">
              {isDelivery ? <Bike className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
              {isDelivery ? "Delivery" : "Takeaway"}
            </span>
          </div>

          {isCancelled ? (
            <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm font-bold text-red-700">This order was cancelled.</p>
              <p className="mt-1 text-sm text-red-600">
                Call {order.branch.phone ?? "the branch"} if you were expecting it.
              </p>
            </div>
          ) : (
            <ol className="mt-6 space-y-3">
              {steps.map((step, index) => {
                const done = index <= activeStep;
                return (
                  <li key={step} className="flex items-center gap-3">
                    <span
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                        done ? "bg-pocket-orange text-white" : "border border-pocket-navy/15 bg-white text-pocket-navy/40"
                      }`}
                    >
                      {done ? <PackageCheck className="h-4 w-4" /> : index + 1}
                    </span>
                    <span className={`text-sm font-semibold ${done ? "text-pocket-navy" : "text-pocket-navy/40"}`}>{step}</span>
                    {index === activeStep ? (
                      <span className="rounded-full bg-pocket-orange/10 px-2 py-0.5 text-xs font-bold text-pocket-orange">Now</span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}

          <div className="mt-6 grid gap-4 border-t border-pocket-navy/10 pt-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-navy/60">
                {isDelivery ? "Delivering to" : "Collect from"}
              </p>
              {isDelivery ? (
                <p className="mt-1 text-sm text-pocket-navy">
                  {order.deliveryAddress ? `${order.deliveryAddress.addressLine1}, ${order.deliveryAddress.city}` : "Address on file"}
                </p>
              ) : (
                <p className="mt-1 text-sm text-pocket-navy">
                  {order.branch.name}
                  {order.branch.addressLine1 ? `, ${order.branch.addressLine1}` : ""}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-navy/60">Total</p>
              <p className="mt-1 text-sm font-bold text-pocket-navy">{formatCurrency(order.totalAmount)}</p>
              <p className="text-sm text-pocket-navy/60">Cash {isDelivery ? "on delivery" : "on pickup"}</p>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-navy/60">Items</p>
            <div className="mt-2 space-y-2">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-4 text-sm">
                  <span className="min-w-0 text-pocket-navy">
                    {item.quantity} x {item.productName}
                  </span>
                  <span className="shrink-0 font-semibold text-pocket-navy/70">{formatCurrency(item.unitPrice * item.quantity)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-12 md:px-6" />}>
      <TrackOrderForm />
    </Suspense>
  );
}
