"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, MapPin, MessageCircle } from "lucide-react";
import { useLiveProducts } from "@/components/site/use-live-products";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/components/store/store-provider";
import { branch } from "@/lib/mock-data";
import { calculateOrderTotals, readStoredCoupon, validateCouponCode, writeStoredCoupon } from "@/lib/ordering";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils";
import { usePublicBranch } from "@/components/site/public-branch-provider";

const API_URL = typeof window === "undefined" ? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000" : "";

const deliveryAreas = [
  { sector: "G-11", fee: 70 },
  { sector: "G-10", fee: 150 },
  { sector: "F-11", fee: 150 },
  { sector: "G-12", fee: 180 },
  { sector: "G-13", fee: 200 },
  { sector: "F-10", fee: 180 },
  { sector: "G-9", fee: 200 }
] as const;

export default function CheckoutPage() {
  const { cart, getCartProducts, clearCart } = useStore();
  const { selectedBranch } = usePublicBranch();
  const { products, loading: catalogLoading, error: catalogError } = useLiveProducts();
  const [confirmedOrderNumber, setConfirmedOrderNumber] = useState("");
  const [confirmedTotal, setConfirmedTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [deliverySector, setDeliverySector] = useState("");
  const [deliverySubsector, setDeliverySubsector] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressNotes, setAddressNotes] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");

  const cartProducts = getCartProducts(products);
  const missingItems = Math.max(0, cart.length - cartProducts.length);
  const subtotal = useMemo(() => cartProducts.reduce((sum, item) => sum + item.price * item.quantity, 0), [cartProducts]);
  const selectedArea = deliveryAreas.find((area) => area.sector === deliverySector);
  const deliverySubsectors = selectedArea ? [1, 2, 3, 4].map((number) => `${selectedArea.sector}/${number}`) : [];
  const totals = useMemo(
    () => calculateOrderTotals(subtotal, selectedArea?.fee ?? 0, couponDiscount),
    [couponDiscount, selectedArea?.fee, subtotal]
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
      const nextCoupon = await validateCouponCode(couponCode, subtotal, selectedBranch?.slug);
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
    setError("");

    if (!selectedArea) {
      setError("Choose your delivery sector first. We only deliver to the sectors shown above.");
      return;
    }
    if (!selectedBranch) {
      setError("Choose an available branch before placing the order.");
      return;
    }
    if (!deliverySubsector) {
      setError("Choose your sub-sector before placing the order.");
      return;
    }
    if (catalogError) {
      setError("Live catalog is unavailable. Retry after the storefront reconnects to the API.");
      return;
    }

    setLoading(true);
    try {
      let activeCouponCode: string | undefined;
      if (couponCode.trim()) {
        const nextCoupon = await validateCouponCode(couponCode, subtotal, selectedBranch.slug);
        setCouponCode(nextCoupon.code);
        setCouponDiscount(nextCoupon.discount);
        setCouponMessage(nextCoupon.title ? `${nextCoupon.title} applied.` : "Coupon applied.");
        writeStoredCoupon(nextCoupon.code);
        activeCouponCode = nextCoupon.code;
      } else {
        writeStoredCoupon("");
      }

      const response = await fetch(`${API_URL}/api/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          name: customerName.trim(),
          phone: customerPhone.trim(),
          branchSlug: selectedBranch.slug,
          paymentMethod: "CASH_ON_DELIVERY",
          deliverySector: selectedArea.sector,
          deliverySubsector,
          couponCode: activeCouponCode,
          deliveryInstructions: deliveryInstructions.trim() || undefined,
          address: {
            label: "Delivery",
            addressLine1: addressLine1.trim(),
            city: "Islamabad",
            instructions: addressNotes.trim() || undefined
          },
          items: cartProducts.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
            selectedAddOnIds: item.selectedAddOnIds
          }))
        })
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const fieldErrors = data?.issues?.fieldErrors ? Object.values(data.issues.fieldErrors).flat().filter(Boolean).join(" ") : "";
        const validationDetails = Array.isArray(data?.details) ? data.details.filter(Boolean).join(" ") : "";
        const validationIssues = Array.isArray(data?.issues)
          ? data.issues.map((issue: { path?: Array<string | number>; message?: string }) => {
              const path = issue.path?.length ? `${issue.path.join(".")}: ` : "";
              return issue.message ? `${path}${issue.message}` : "";
            }).filter(Boolean).join(" ")
          : "";
        throw new Error(validationDetails || validationIssues || fieldErrors || data?.message || "Unable to place your delivery order.");
      }

      setConfirmedOrderNumber(data.order.orderNumber);
      setConfirmedTotal(Number(data.order.totalAmount));
      writeStoredCoupon("");
      clearCart();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to place your delivery order.");
    } finally {
      setLoading(false);
    }
  }

  if (confirmedOrderNumber) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-14 md:px-6">
        <Card className="border-emerald-200 bg-emerald-50 p-7 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700">Delivery order received</p>
          <h1 className="mt-2 text-3xl font-black text-pocket-navy">{confirmedOrderNumber}</h1>
          <p className="mt-3 text-base text-pocket-navy/75">Your order is waiting for Pocket to accept it. We will contact you on WhatsApp if we need anything.</p>
          <p className="mt-5 text-xl font-black text-pocket-orange">{formatCurrency(confirmedTotal)}</p>
          <p className="mt-1 text-sm text-pocket-navy/60">Cash on Delivery</p>
          <Link href="/menu" className="mt-7 inline-flex"><Button>Order more items</Button></Link>
        </Card>
      </div>
    );
  }

  function selectDeliverySector(sector: string) {
    setDeliverySector(sector);
    setDeliverySubsector("");
    setError("");
    window.requestAnimationFrame(() => {
      document.getElementById("delivery-details")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-6">
      <form onSubmit={handleSubmit} className={selectedArea ? "grid gap-8 lg:grid-cols-[1fr_360px]" : "mx-auto max-w-2xl"}>
        <div className="space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">{selectedArea ? "Delivery checkout" : "Step 1 of 2"}</p>
            <h1 className="text-4xl font-black text-pocket-navy">{selectedArea ? "A few details, then we'll take it from here." : "Which sector are you in?"}</h1>
          </div>
          {!selectedArea ? (
            <Card className="p-5">
              <div className="flex items-start gap-3"><MapPin className="mt-1 h-5 w-5 text-pocket-orange" /><div><p className="text-lg font-black text-pocket-navy">Islamabad delivery only</p><p className="mt-1 text-sm text-pocket-navy/60">Pocket currently delivers only within Islamabad, and only to the sectors listed below.</p></div></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {deliveryAreas.map((area) => (
                  <label key={area.sector} className="flex cursor-pointer items-center rounded-xl border border-pocket-navy/10 px-4 py-3 hover:border-pocket-orange/50">
                    <input type="radio" name="delivery-sector" value={area.sector} checked={false} onChange={() => selectDeliverySector(area.sector)} required />
                    <span className="ml-3 font-bold text-pocket-navy">{area.sector}</span>
                  </label>
                ))}
              </div>
            </Card>
          ) : (
            <>
              {missingItems ? <Card className="border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Some saved items are no longer on the menu. Please review your cart before placing the order.</Card> : null}
              {catalogError ? <Card className="border-red-300 bg-red-50 p-4 text-sm text-red-700">Live catalog is unavailable right now. Checkout is blocked until it reconnects.</Card> : null}
              {catalogLoading && !cartProducts.length && cart.length ? <Card className="p-4 text-sm text-pocket-navy/70">Refreshing your cart...</Card> : null}

              <Card id="delivery-details" className="scroll-mt-28 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-lg font-black text-pocket-navy">Delivery details</p><p className="mt-1 text-sm text-pocket-navy/60">Delivery is set to Islamabad · {selectedArea.sector}. Choose the sub-sector and use the WhatsApp number Pocket should contact.</p></div><Button type="button" variant="outline" onClick={() => { setDeliverySector(""); setDeliverySubsector(""); }}>Change sector</Button></div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="space-y-1 text-sm font-semibold text-pocket-navy"><span>City</span><select className="flex h-10 w-full rounded-md border border-pocket-navy/15 bg-pocket-cream px-3 text-sm text-pocket-navy" value="Islamabad" disabled><option>Islamabad</option></select></label>
                  <label className="space-y-1 text-sm font-semibold text-pocket-navy"><span>Sub-sector</span><select className="flex h-10 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm" value={deliverySubsector} onChange={(event) => setDeliverySubsector(event.target.value)} required><option value="">Choose {selectedArea.sector} sub-sector</option>{deliverySubsectors.map((subsector) => <option key={subsector} value={subsector}>{subsector}</option>)}</select></label>
                  <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Full name" required />
                  <label className="relative"><MessageCircle className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-emerald-600" /><Input className="pl-9" type="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="WhatsApp number (03xx xxxxxxx)" required /></label>
                  <div className="md:col-span-2"><Input value={addressLine1} onChange={(event) => setAddressLine1(event.target.value)} placeholder="House/building, floor, street and area" required /></div>
                  <div className="md:col-span-2"><Textarea value={addressNotes} onChange={(event) => setAddressNotes(event.target.value)} placeholder="Helpful location instructions (optional)" /></div>
                </div>
              </Card>

              <Card className="p-5">
                <p className="text-lg font-black text-pocket-navy">Payment</p>
                <div className="mt-4 rounded-xl border border-pocket-orange/20 bg-pocket-orange/5 px-4 py-3 text-sm font-semibold text-pocket-navy">Cash on Delivery</div>
                <Textarea className="mt-4" value={deliveryInstructions} onChange={(event) => setDeliveryInstructions(event.target.value)} placeholder="Anything we should know about this order? (optional)" />
              </Card>
            </>
          )}
        </div>

        {selectedArea ? <Card className="h-fit p-5 lg:sticky lg:top-24">
          <p className="text-xl font-black text-pocket-navy">Your order</p>
          {cartProducts.length ? <div className="mt-4 space-y-3 text-sm">{cartProducts.map((item) => <div key={item.cartItemId} className="flex items-start justify-between gap-4"><div><p className="font-semibold text-pocket-navy">{item.name}</p>{item.selectedAddOns.length ? <p className="text-pocket-navy/60">{item.selectedAddOns.map((option) => option.name).join(", ")}</p> : null}<p className="text-pocket-navy/60">Qty {item.quantity}</p></div><p className="text-right font-bold text-pocket-orange">{formatCompactCurrency(item.price * item.quantity)}</p></div>)}</div> : <p className="mt-4 text-sm text-pocket-navy/60">Your cart is empty. <Link href="/menu" className="font-bold text-pocket-orange">Browse the menu</Link>.</p>}
          <div className="mt-5 space-y-3 border-t border-pocket-navy/10 pt-4 text-sm">
            <div className="flex justify-between gap-3"><span>Items</span><span>{formatCurrency(totals.subtotal)}</span></div>
            <div className="flex justify-between gap-3"><span>Discount</span><span>-{formatCurrency(totals.discount)}</span></div>
            <div className="flex justify-between gap-3"><span>Delivery ({selectedArea.sector})</span><span>{formatCurrency(totals.delivery)}</span></div>
            <div className="flex justify-between gap-3 border-t border-pocket-navy/10 pt-3 text-base font-black"><span>Total</span><span className="text-pocket-orange">{formatCurrency(totals.total)}</span></div>
          </div>
          <div className="mt-5"><label className="block text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60">Coupon</label><div className="mt-2 flex gap-2"><Input value={couponCode} onChange={(event) => { setCouponCode(event.target.value); setCouponDiscount(0); setCouponMessage(""); }} placeholder="Coupon code" /><Button type="button" variant="outline" onClick={() => void applyCoupon()} disabled={!subtotal || couponLoading}>{couponLoading ? "Applying..." : "Apply"}</Button></div>{couponMessage ? <p className={`mt-2 text-sm ${couponDiscount ? "text-emerald-700" : "text-red-600"}`}>{couponMessage}</p> : null}</div>
          {error ? <p className="mt-4 text-sm font-medium text-red-600">{error}</p> : null}
          <Button className="mt-6 w-full" disabled={!cartProducts.length || !selectedArea || loading || catalogLoading || Boolean(catalogError)}>{loading ? "Placing order..." : "Place delivery order"}</Button>
        </Card> : null}
      </form>
    </div>
  );
}
