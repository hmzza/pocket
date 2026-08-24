"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, Bike, ShoppingBag } from "lucide-react";
import { useLiveProducts } from "@/components/site/use-live-products";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/components/store/store-provider";
import { branch } from "@/lib/mock-data";
import { calculateOrderTotals, readStoredCoupon, validateCouponCode, writeStoredCoupon } from "@/lib/ordering";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils";

const API_URL = typeof window === "undefined" ? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000" : "";

type ServiceType = "DELIVERY" | "TAKEAWAY";

const serviceOptions: Array<{
  value: ServiceType;
  label: string;
  description: string;
  icon: typeof Bike;
}> = [
  { value: "DELIVERY", label: "Delivery", description: "A rider brings it to your door.", icon: Bike },
  { value: "TAKEAWAY", label: "Takeaway", description: "Collect it from the counter. No delivery fee.", icon: ShoppingBag }
];

function createClientRequestId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function CheckoutPage() {
  const { cart, getCartProducts, clearCart } = useStore();
  const { products, loading: catalogLoading, error: catalogError } = useLiveProducts();
  const [confirmedOrder, setConfirmedOrder] = useState<{ orderNumber: string; serviceType: ServiceType } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [serviceType, setServiceType] = useState<ServiceType>("DELIVERY");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("Islamabad");
  const [addressNotes, setAddressNotes] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");

  // Stable for the lifetime of this attempt, so a double click or a retry after
  // a dropped response cannot create a second order. Rotated once an order is
  // confirmed, in case the same session orders again.
  const clientRequestId = useRef(createClientRequestId());

  const isDelivery = serviceType === "DELIVERY";
  const cartProducts = getCartProducts(products);
  const missingItems = Math.max(0, cart.length - cartProducts.length);
  const subtotal = useMemo(() => cartProducts.reduce((sum, item) => sum + item.price * item.quantity, 0), [cartProducts]);
  const totals = useMemo(
    () => calculateOrderTotals(subtotal, cartProducts.length && isDelivery ? branch.deliveryFee : 0, couponDiscount),
    [cartProducts.length, couponDiscount, subtotal, isDelivery]
  );

  useEffect(() => {
    setCouponCode(readStoredCoupon());
  }, []);

  async function applyCoupon() {
    if (!couponCode.trim()) {
      setCouponDiscount(0);
      setCouponMessage("");
      writeStoredCoupon("");
      return;
    }

    setCouponLoading(true);
    setCouponMessage("");
    try {
      const nextCoupon = await validateCouponCode(couponCode, subtotal);
      setCouponCode(nextCoupon.code);
      setCouponDiscount(nextCoupon.discount);
      setCouponMessage(nextCoupon.title ? `${nextCoupon.title} applied.` : "Coupon applied.");
      writeStoredCoupon(nextCoupon.code);
    } catch (validationError) {
      setCouponDiscount(0);
      setCouponMessage(validationError instanceof Error ? validationError.message : "Coupon is unavailable.");
      writeStoredCoupon("");
    } finally {
      setCouponLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (catalogError) {
        throw new Error("Live catalog is unavailable. Retry after the API connection is restored.");
      }

      let activeCouponCode: string | undefined;
      if (couponCode.trim()) {
        const nextCoupon = await validateCouponCode(couponCode, subtotal);
        setCouponCode(nextCoupon.code);
        setCouponDiscount(nextCoupon.discount);
        setCouponMessage(nextCoupon.title ? `${nextCoupon.title} applied.` : "Coupon applied.");
        writeStoredCoupon(nextCoupon.code);
        activeCouponCode = nextCoupon.code;
      } else {
        setCouponDiscount(0);
        setCouponMessage("");
        writeStoredCoupon("");
      }

      const response = await fetch(`${API_URL}/api/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: customerName,
          phone: customerPhone,
          ...(customerEmail.trim() ? { email: customerEmail.trim() } : {}),
          branchSlug: branch.slug,
          serviceType,
          paymentMethod: "CASH_ON_DELIVERY",
          couponCode: activeCouponCode,
          clientRequestId: clientRequestId.current,
          deliveryInstructions: deliveryInstructions.trim() || undefined,
          // Takeaway is collected at the counter, so no address is sent.
          ...(isDelivery
            ? {
                address: {
                  label: "Home",
                  addressLine1,
                  city,
                  instructions: addressNotes
                }
              }
            : {}),
          items: cartProducts.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
            selectedAddOnIds: item.selectedAddOnIds
          }))
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const fieldErrors = payload?.issues?.fieldErrors
          ? Object.values(payload.issues.fieldErrors).flat().filter(Boolean).join(" ")
          : "";
        const detailErrors = Array.isArray(payload?.details) ? payload.details.join(" ") : "";
        throw new Error(fieldErrors || detailErrors || payload?.message || "Unable to place order.");
      }

      const data = (await response.json()) as {
        order: { orderNumber: string; serviceType?: ServiceType };
      };

      setConfirmedOrder({ orderNumber: data.order.orderNumber, serviceType: data.order.serviceType ?? serviceType });
      clientRequestId.current = createClientRequestId();
      writeStoredCoupon("");
      clearCart();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to place order.");
    } finally {
      setLoading(false);
    }
  }

  if (confirmedOrder) {
    const wasDelivery = confirmedOrder.serviceType === "DELIVERY";
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 md:px-6">
        <Card className="p-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700">Order Confirmed</p>
          <h1 className="mt-3 text-2xl font-black text-pocket-navy">Thank you, {customerName.split(" ")[0] || "friend"}.</h1>

          <div className="mt-6 rounded-xl border-2 border-dashed border-pocket-orange/40 bg-pocket-cream px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-navy/60">Your order number</p>
            <p className="mt-2 select-all break-all text-3xl font-black tracking-tight text-pocket-orange">
              {confirmedOrder.orderNumber}
            </p>
            <p className="mt-2 text-sm text-pocket-navy/70">Save this. You will need it to track or ask about your order.</p>
          </div>

          <p className="mt-6 text-sm text-pocket-navy/70">
            {wasDelivery
              ? "Our team is confirming your order now. The rider will call you on the number you gave before setting off."
              : `Our team is confirming your order now. Collect it from ${branch.addressLine1}, ${branch.city} and quote your order number at the counter.`}
          </p>
          <p className="mt-2 text-sm font-semibold text-pocket-navy">Payment: Cash {wasDelivery ? "on delivery" : "on pickup"}.</p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href={`/track?orderNumber=${encodeURIComponent(confirmedOrder.orderNumber)}`}>
              <Button type="button">Track this order</Button>
            </Link>
            <Link href="/menu">
              <Button type="button" variant="outline">
                Back to menu
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      <form onSubmit={handleSubmit} className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Checkout</p>
            <h1 className="text-4xl font-black text-pocket-navy">Step-by-step order confirmation</h1>
          </div>
          {missingItems ? (
            <Card className="border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              Some saved items are no longer in the live catalog. Remove them from the cart and add current menu items again.
            </Card>
          ) : null}
          {catalogError ? (
            <Card className="border-red-300 bg-red-50 p-4 text-sm text-red-700">
              Live catalog is unavailable right now. Checkout is blocked until the storefront reconnects to the API.
            </Card>
          ) : null}
          {catalogLoading && !cartProducts.length && cart.length ? (
            <Card className="p-4 text-sm text-pocket-navy/70">Refreshing live checkout items...</Card>
          ) : null}

          <Card className="p-5">
            <p className="text-lg font-black text-pocket-navy">1. How would you like your order?</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {serviceOptions.map((option) => {
                const selected = serviceType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setServiceType(option.value)}
                    aria-pressed={selected}
                    className={`flex items-start gap-3 rounded-lg border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pocket-orange/40 ${
                      selected
                        ? "border-pocket-orange bg-pocket-orange/5 shadow-sm"
                        : "border-pocket-navy/15 bg-white hover:bg-pocket-cream"
                    }`}
                  >
                    <option.icon className={`mt-0.5 h-5 w-5 shrink-0 ${selected ? "text-pocket-orange" : "text-pocket-navy/50"}`} />
                    <span className="min-w-0">
                      <span className="block font-bold text-pocket-navy">{option.label}</span>
                      <span className="block text-sm text-pocket-navy/60">{option.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-lg font-black text-pocket-navy">2. Your details</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60">Full name</span>
                <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Full name" required />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60">Contact number</span>
                <Input
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  placeholder="0300 1234567"
                  inputMode="tel"
                  required
                />
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60">
                  Email <span className="normal-case tracking-normal text-pocket-navy/40">(optional)</span>
                </span>
                <Input
                  type="email"
                  value={customerEmail}
                  onChange={(event) => setCustomerEmail(event.target.value)}
                  placeholder="Email address"
                />
              </label>
            </div>

            <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
              <p className="text-sm font-semibold text-amber-900">
                {isDelivery
                  ? "Please ensure your details are correct. The rider will contact you on this number."
                  : "Please ensure your details are correct. We will contact you on this number about your order."}
              </p>
            </div>
          </Card>

          {isDelivery ? (
            <Card className="p-5">
              <p className="text-lg font-black text-pocket-navy">3. Delivery address</p>
              <div className="mt-4 grid gap-4">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60">Address</span>
                  <Input
                    value={addressLine1}
                    onChange={(event) => setAddressLine1(event.target.value)}
                    placeholder="House / flat, street, sector"
                    required
                  />
                </label>
                <div className="grid gap-4 md:grid-cols-2">
                  <Input value={city} onChange={(event) => setCity(event.target.value)} placeholder="City" required />
                  <Input
                    value={addressNotes}
                    onChange={(event) => setAddressNotes(event.target.value)}
                    placeholder="Landmark or directions"
                  />
                </div>
                <Textarea
                  value={deliveryInstructions}
                  onChange={(event) => setDeliveryInstructions(event.target.value)}
                  placeholder="Extra instructions"
                />
              </div>
            </Card>
          ) : (
            <Card className="p-5">
              <p className="text-lg font-black text-pocket-navy">3. Pickup point</p>
              <p className="mt-3 text-sm font-semibold text-pocket-navy">{branch.name}</p>
              <p className="text-sm text-pocket-navy/60">
                {branch.addressLine1}, {branch.city}
              </p>
              <p className="mt-3 text-sm text-pocket-navy/70">
                Quote your order number at the counter. We will call you when it is ready to collect.
              </p>
              <div className="mt-4">
                <Textarea
                  value={deliveryInstructions}
                  onChange={(event) => setDeliveryInstructions(event.target.value)}
                  placeholder="Anything we should know about your order"
                />
              </div>
            </Card>
          )}

          <Card className="p-5">
            <p className="text-lg font-black text-pocket-navy">4. Payment</p>
            <div className="mt-4 flex items-center gap-3 rounded-md border border-pocket-orange/40 bg-pocket-orange/5 px-4 py-3">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-pocket-orange">
                <span className="h-2 w-2 rounded-full bg-pocket-orange" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-pocket-navy">
                  Cash {isDelivery ? "on delivery" : "on pickup"}
                </span>
                <span className="block text-sm text-pocket-navy/60">
                  Pay {isDelivery ? "the rider when your order arrives" : "at the counter when you collect"}.
                </span>
              </span>
            </div>
            <p className="mt-3 text-sm text-pocket-navy/50">Card and wallet payments are coming soon.</p>
          </Card>
        </div>

        <Card className="h-fit p-5">
          <p className="text-xl font-black text-pocket-navy">Summary</p>
          <div className="mt-4 space-y-3 text-sm">
            {cartProducts.map((item) => (
              <div key={item.cartItemId} className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-pocket-navy">{item.name}</p>
                  {item.selectedAddOns.length ? (
                    <p className="text-pocket-navy/60">{item.selectedAddOns.map((option) => option.name).join(", ")}</p>
                  ) : null}
                  <p className="text-pocket-navy/60">Qty {item.quantity}</p>
                </div>
                <p className="break-words text-right font-bold text-pocket-orange">{formatCompactCurrency(item.price * item.quantity)}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 space-y-3 border-t border-pocket-navy/10 pt-4 text-sm">
            <div className="flex justify-between gap-3">
              <span>Subtotal</span>
              <span className="min-w-0 break-words text-right">{formatCurrency(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Discount</span>
              <span className="min-w-0 break-words text-right">-{formatCurrency(totals.discount)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Tax</span>
              <span className="min-w-0 break-words text-right">{formatCurrency(totals.tax)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Delivery</span>
              <span className="min-w-0 break-words text-right">
                {isDelivery ? formatCurrency(totals.delivery) : "Free (takeaway)"}
              </span>
            </div>
            <div className="flex justify-between gap-3 text-base font-black">
              <span>Total</span>
              <span className="min-w-0 break-words text-right text-pocket-orange">{formatCurrency(totals.total)}</span>
            </div>
          </div>
          <div className="mt-5">
            <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60">Coupon</label>
            <div className="mt-2 flex gap-2">
              <Input
                value={couponCode}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setCouponCode(nextValue);
                  setCouponDiscount(0);
                  setCouponMessage("");
                }}
                placeholder="Enter coupon code"
              />
              <Button type="button" variant="outline" onClick={() => void applyCoupon()} disabled={!subtotal || couponLoading}>
                {couponLoading ? "Applying..." : "Apply"}
              </Button>
            </div>
            {couponMessage ? <p className={`mt-2 text-sm ${couponDiscount ? "text-emerald-700" : "text-red-600"}`}>{couponMessage}</p> : null}
          </div>
          {error ? <p className="mt-4 whitespace-pre-line text-sm font-medium text-red-600">{error}</p> : null}
          <Button className="mt-6 w-full" disabled={!cartProducts.length || loading || catalogLoading || Boolean(catalogError)}>
            {loading ? "Placing Order..." : `Place ${isDelivery ? "Delivery" : "Takeaway"} Order`}
          </Button>
        </Card>
      </form>
    </div>
  );
}
