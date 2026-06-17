"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLiveProducts } from "@/components/site/use-live-products";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/components/store/store-provider";
import { branch } from "@/lib/mock-data";
import { calculateOrderTotals, readStoredCoupon, validateCouponCode, writeStoredCoupon } from "@/lib/ordering";
import { formatCurrency } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const paymentMethods = [
  { label: "Cash on Delivery", value: "CASH_ON_DELIVERY" },
  { label: "Card Payment (future ready)", value: "CARD" },
  { label: "JazzCash (future ready)", value: "JAZZCASH" },
  { label: "EasyPaisa (future ready)", value: "EASYPAISA" }
] as const;

export default function CheckoutPage() {
  const { cart, getCartProducts, clearCart } = useStore();
  const { products, loading: catalogLoading, error: catalogError } = useLiveProducts();
  const [confirmedOrderNumber, setConfirmedOrderNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("Islamabad");
  const [addressNotes, setAddressNotes] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<(typeof paymentMethods)[number]["value"]>("CASH_ON_DELIVERY");

  const cartProducts = getCartProducts(products);
  const missingItems = Math.max(0, cart.length - cartProducts.length);
  const subtotal = useMemo(() => cartProducts.reduce((sum, item) => sum + item.price * item.quantity, 0), [cartProducts]);
  const totals = useMemo(() => calculateOrderTotals(subtotal, cartProducts.length ? branch.deliveryFee : 0, couponDiscount), [cartProducts.length, couponDiscount, subtotal]);

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
          email: customerEmail,
          branchSlug: branch.slug,
          paymentMethod,
          couponCode: activeCouponCode,
          deliveryInstructions: deliveryInstructions.trim() || undefined,
          address: {
            label: "Home",
            addressLine1,
            city,
            instructions: addressNotes
          },
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
        throw new Error(fieldErrors || payload?.message || "Unable to place order.");
      }

      const data = (await response.json()) as {
        order: {
          orderNumber: string;
          expectedDeliveryAt?: string;
        };
      };

      setConfirmedOrderNumber(data.order.orderNumber);
      writeStoredCoupon("");
      clearCart();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to place order.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      {confirmedOrderNumber ? (
        <div className="mb-8 rounded-lg border border-emerald-500/20 bg-emerald-50 p-5 text-emerald-900">
          <p className="text-xs font-semibold uppercase tracking-[0.25em]">Order Confirmed</p>
          <p className="mt-2 text-2xl font-black">{confirmedOrderNumber}</p>
          <p className="mt-2 text-sm">Keep this order number for reference at pickup or delivery.</p>
        </div>
      ) : null}

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
            <p className="text-lg font-black text-pocket-navy">1. Customer Information</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Full name" required />
              <Input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="+92-300-1234567" required />
              <div className="md:col-span-2">
                <Input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="Email address" required />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-lg font-black text-pocket-navy">2. Delivery Details</p>
            <div className="mt-4 grid gap-4">
              <Input value={addressLine1} onChange={(event) => setAddressLine1(event.target.value)} placeholder="Address line 1" required />
              <div className="grid gap-4 md:grid-cols-2">
                <Input value={city} onChange={(event) => setCity(event.target.value)} placeholder="City" required />
                <Input value={addressNotes} onChange={(event) => setAddressNotes(event.target.value)} placeholder="Instructions" />
              </div>
              <Textarea value={deliveryInstructions} onChange={(event) => setDeliveryInstructions(event.target.value)} placeholder="Extra instructions" />
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-lg font-black text-pocket-navy">3. Payment Method</p>
            <div className="mt-4 grid gap-3">
              {paymentMethods.map((option) => (
                <label key={option.value} className="flex items-center gap-3 rounded-md border border-pocket-navy/10 px-4 py-3">
                  <input
                    type="radio"
                    name="payment"
                    value={option.value}
                    checked={paymentMethod === option.value}
                    onChange={() => setPaymentMethod(option.value)}
                  />
                  <span className="text-sm font-medium text-pocket-navy">{option.label}</span>
                </label>
              ))}
            </div>
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
                <p className="font-bold text-pocket-orange">{formatCurrency(item.price * item.quantity)}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 space-y-3 border-t border-pocket-navy/10 pt-4 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Discount</span>
              <span>-{formatCurrency(totals.discount)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax</span>
              <span>{formatCurrency(totals.tax)}</span>
            </div>
            <div className="flex justify-between">
              <span>Delivery</span>
              <span>{formatCurrency(totals.delivery)}</span>
            </div>
            <div className="flex justify-between text-base font-black">
              <span>Total</span>
              <span className="text-pocket-orange">{formatCurrency(totals.total)}</span>
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
          {error ? <p className="mt-4 text-sm font-medium text-red-600">{error}</p> : null}
          <Button className="mt-6 w-full" disabled={!cartProducts.length || loading || catalogLoading || Boolean(catalogError)}>
            {loading ? "Placing Order..." : "Place Order"}
          </Button>
        </Card>
      </form>
    </div>
  );
}
