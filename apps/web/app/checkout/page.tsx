"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { useLiveProducts } from "@/components/site/use-live-products";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/components/store/store-provider";
import { calculateOrderTotals, readStoredCouponState, validateCouponCode, writeStoredCoupon } from "@/lib/ordering";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils";
import { usePublicBranch } from "@/components/site/public-branch-provider";
import { useDeliveryAvailability } from "@/components/site/use-delivery-availability";
import { formatSelectionLines } from "@/lib/item-detail-display";

const API_URL = typeof window === "undefined" ? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000" : "";
type Fulfillment = "DELIVERY" | "PICKUP";
type CheckoutField = "deliverySector" | "deliverySubsector" | "customerName" | "customerPhone" | "addressLine1" | "addressNotes" | "pickupAt" | "pickupNotes";

function friendlyValidationMessage(message: string) {
  return message.replace(/^String must contain at least (\d+) character\(s\)$/i, (_match, count: string) => `Please enter at least ${count} characters.`).replace(/^String must contain at most (\d+) character\(s\)$/i, (_match, count: string) => `Please keep this to ${count} characters or fewer.`).replace(/^Required$/i, "This field is required.");
}

function checkoutFieldForPath(path: Array<string | number>) {
  const value = path.join(".");
  if (value === "name" || value === "customerName") return "customerName" as const;
  if (value === "phone" || value === "customerPhone") return "customerPhone" as const;
  if (value.includes("sector") && !value.includes("subsector")) return "deliverySector" as const;
  if (value.includes("subsector")) return "deliverySubsector" as const;
  if (value === "address.addressLine1" || value === "addressLine1") return "addressLine1" as const;
  if (value === "address.instructions" || value === "addressNotes") return "addressNotes" as const;
  if (value.includes("pickupAt")) return "pickupAt" as const;
  if (value.includes("pickupInstructions")) return "pickupNotes" as const;
  return undefined;
}

function fieldClasses(hasError: boolean) {
  return hasError ? "border-red-400 focus-visible:ring-red-300" : "";
}

function pakistanParts(date: Date) {
  const shifted = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate(), hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes() };
}

function pickupSlots(snapshot: { shopScheduleConfigured?: boolean; shopOpenTime?: string | null; shopCloseTime?: string | null }) {
  if (!snapshot.shopScheduleConfigured || !snapshot.shopOpenTime || !snapshot.shopCloseTime) return [];
  const open = Number(snapshot.shopOpenTime.slice(0, 2)) * 60 + Number(snapshot.shopOpenTime.slice(3, 5));
  const close = Number(snapshot.shopCloseTime.slice(0, 2)) * 60 + Number(snapshot.shopCloseTime.slice(3, 5));
  const start = Math.ceil((Date.now() + 60_000) / (15 * 60_000)) * 15 * 60_000;
  const slots: Array<{ value: string; label: string }> = [];
  for (let timestamp = start; timestamp <= start + 24 * 60 * 60 * 1000; timestamp += 15 * 60_000) {
    const candidate = new Date(timestamp);
    const parts = pakistanParts(candidate);
    const minutes = parts.hour * 60 + parts.minute;
    const within = open === close || (close > open ? minutes >= open && minutes < close : minutes >= open || minutes < close);
    if (!within) continue;
    slots.push({ value: candidate.toISOString(), label: candidate.toLocaleTimeString("en-PK", { timeZone: "Asia/Karachi", hour: "numeric", minute: "2-digit" }) });
    if (slots.length >= 48) break;
  }
  return slots;
}

export default function CheckoutPage() {
  const { cart, getCartProducts, clearCart } = useStore();
  const { selectedBranch } = usePublicBranch();
  const availability = useDeliveryAvailability(selectedBranch?.slug);
  const { deliveryEnabled, shopEnabled, pickupEnabled, message: deliveryMessage, shopMessage, sectors: deliveryAreas, snapshot, loading: availabilityLoading, refresh: refreshAvailability } = availability;
  const { products, loading: catalogLoading, error: catalogError } = useLiveProducts();
  const [fulfillment, setFulfillment] = useState<Fulfillment>("DELIVERY");
  const [confirmedOrderNumber, setConfirmedOrderNumber] = useState("");
  const [confirmedTotal, setConfirmedTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CheckoutField, string>>>({});
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponLoading, setCouponLoading] = useState(false);
  const [deliverySector, setDeliverySector] = useState("");
  const [deliverySubsector, setDeliverySubsector] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressNotes, setAddressNotes] = useState("");
  const [pickupAt, setPickupAt] = useState("");
  const [pickupNotes, setPickupNotes] = useState("");

  const cartProducts = getCartProducts(products);
  const subtotal = useMemo(() => cartProducts.reduce((sum, item) => sum + item.price * item.quantity, 0), [cartProducts]);
  const selectedArea = deliveryAreas.find((area) => area.name === deliverySector);
  const deliverySubsectors = selectedArea?.subsectors ?? [];
  const slots = useMemo(() => pickupSlots(snapshot), [snapshot, availabilityLoading]);
  const totals = useMemo(() => calculateOrderTotals(subtotal, fulfillment === "DELIVERY" ? selectedArea?.deliveryFee ?? 0 : 0, couponDiscount), [couponDiscount, fulfillment, selectedArea?.deliveryFee, subtotal]);
  const modeClosed = !shopEnabled || (fulfillment === "DELIVERY" && !deliveryEnabled);

  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: "auto" }); }, []);
  useEffect(() => { if (!availabilityLoading && !deliveryEnabled && pickupEnabled) setFulfillment("PICKUP"); }, [availabilityLoading, deliveryEnabled, pickupEnabled]);

  useEffect(() => {
    const storedCoupon = readStoredCouponState();
    if (!storedCoupon?.code || !subtotal || !selectedBranch?.slug) {
      setCouponCode(""); setCouponDiscount(0); setCouponLoading(false); return;
    }
    if (storedCoupon.branchSlug && storedCoupon.branchSlug !== selectedBranch.slug) { setCouponCode(""); setCouponDiscount(0); writeStoredCoupon(""); return; }
    let cancelled = false;
    setCouponLoading(true);
    void validateCouponCode(storedCoupon.code, subtotal, selectedBranch.slug, fulfillment).then((nextCoupon) => {
      if (cancelled) return;
      setCouponCode(nextCoupon.code); setCouponDiscount(nextCoupon.discount); writeStoredCoupon({ ...nextCoupon, branchSlug: selectedBranch.slug! });
    }).catch(() => {
      if (cancelled) return;
      setCouponCode(""); setCouponDiscount(0); writeStoredCoupon("");
    }).finally(() => { if (!cancelled) setCouponLoading(false); });
    return () => { cancelled = true; };
  }, [fulfillment, selectedBranch?.slug, subtotal]);

  function clearFieldError(field: CheckoutField) { setFieldErrors((current) => current[field] ? { ...current, [field]: undefined } : current); }

  function switchFulfillment(next: Fulfillment) {
    setFulfillment(next); setError(""); setFieldErrors({});
    if (next === "PICKUP") { setDeliverySector(""); setDeliverySubsector(""); setAddressLine1(""); setAddressNotes(""); }
    else { setPickupAt(""); setPickupNotes(""); }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setFieldErrors({});
    if (!selectedBranch) return setError("Choose an available branch before placing the order.");
    if (catalogError) return setError("Live catalog is unavailable. Retry after the storefront reconnects to the API.");
    if (fulfillment === "DELIVERY" && (!selectedArea || !deliverySubsector)) { setFieldErrors({ ...(selectedArea ? {} : { deliverySector: "Choose your delivery sector." }), ...(deliverySubsector ? {} : { deliverySubsector: "Choose your sub-sector." }) }); return; }
    if (fulfillment === "PICKUP" && pickupAt && !slots.some((slot) => slot.value === pickupAt)) { setFieldErrors({ pickupAt: "Choose an available pickup time." }); return; }
    setLoading(true);
    try {
      const latest = await refreshAvailability();
      if (!latest) return setError("We could not verify shop availability. Please try again.");
      if (!latest.shopEnabled) { setError(latest.shopMessage ?? "Our shop is closed at the moment."); window.scrollTo({ top: 0, left: 0, behavior: "smooth" }); return; }
      if (fulfillment === "DELIVERY" && !latest.deliveryEnabled) { setError(latest.message ?? "Deliveries are closed at the moment."); window.scrollTo({ top: 0, left: 0, behavior: "smooth" }); return; }
      let activeCouponCode: string | undefined;
      if (couponCode.trim()) { const nextCoupon = await validateCouponCode(couponCode, subtotal, selectedBranch.slug, fulfillment); setCouponCode(nextCoupon.code); setCouponDiscount(nextCoupon.discount); writeStoredCoupon({ ...nextCoupon, branchSlug: selectedBranch.slug }); activeCouponCode = nextCoupon.code; } else writeStoredCoupon("");
      const response = await fetch(`${API_URL}/api/checkout`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({
        name: customerName.trim(), phone: customerPhone.trim(), branchSlug: selectedBranch.slug, fulfillment,
        paymentMethod: fulfillment === "DELIVERY" ? "CASH_ON_DELIVERY" : "PAY_AT_COUNTER",
        deliverySector: fulfillment === "DELIVERY" ? selectedArea?.name : undefined, deliverySubsector: fulfillment === "DELIVERY" ? deliverySubsector : undefined,
        pickupAt: fulfillment === "PICKUP" && pickupAt ? pickupAt : undefined, pickupInstructions: fulfillment === "PICKUP" ? pickupNotes.trim() || undefined : undefined,
        couponCode: activeCouponCode, address: fulfillment === "DELIVERY" ? { label: "Delivery", addressLine1: addressLine1.trim(), city: "Islamabad", instructions: addressNotes.trim() || undefined } : undefined,
        items: cartProducts.map((item) => ({ productId: item.id, quantity: item.quantity, selectedAddOnIds: item.selectedAddOnIds, selectedAddOnQuantities: item.selectedAddOnQuantities }))
      }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const nextFieldErrors: Partial<Record<CheckoutField, string>> = {};
        const generalMessages: string[] = [];
        const issues = Array.isArray(data?.issues) ? data.issues : [];
        for (const issue of issues as Array<{ path?: Array<string | number>; message?: string }>) { if (!issue.message) continue; const field = checkoutFieldForPath(issue.path ?? []); if (field) nextFieldErrors[field] = friendlyValidationMessage(issue.message); else generalMessages.push(friendlyValidationMessage(issue.message)); }
        setFieldErrors(nextFieldErrors); setError([...generalMessages, ...(Object.keys(nextFieldErrors).length ? [] : [data?.message ?? "Unable to place your order."])].join(" ")); return;
      }
      setConfirmedOrderNumber(data.order.orderNumber); setConfirmedTotal(Number(data.order.totalAmount)); writeStoredCoupon(""); clearCart();
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Unable to place your order."); } finally { setLoading(false); }
  }

  if (confirmedOrderNumber) return <div className="mx-auto max-w-2xl px-4 py-14 md:px-6"><Card className="border-emerald-200 bg-emerald-50 p-7 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><p className="mt-5 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700">Order received</p><h1 className="mt-2 text-3xl font-black text-pocket-navy">{confirmedOrderNumber}</h1><p className="mt-3 text-base text-pocket-navy/75">Your order is waiting for Pocket to accept it. We will contact you on WhatsApp if we need anything.</p><p className="mt-5 text-xl font-black text-pocket-orange">{formatCurrency(confirmedTotal)}</p><p className="mt-1 text-sm text-pocket-navy/60">{fulfillment === "PICKUP" ? "Pay at the branch" : "Cash on Delivery"}</p><Link href="/menu" className="mt-7 inline-flex"><Button>Order more items</Button></Link></Card></div>;

  return <div className="mx-auto max-w-7xl px-4 py-10 md:px-6"><form onSubmit={handleSubmit} className="grid gap-8 lg:grid-cols-[1fr_360px]"><div className="space-y-6"><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Checkout</p><h1 className="text-4xl font-black text-pocket-navy">A few details, then we'll take it from here.</h1></div>
    <div className="grid grid-cols-2 gap-2 rounded-xl bg-pocket-cream p-1"><button type="button" onClick={() => switchFulfillment("DELIVERY")} className={`rounded-lg px-4 py-3 text-sm font-bold ${fulfillment === "DELIVERY" ? "bg-white text-pocket-navy shadow-sm" : "text-pocket-navy/60"}`}>Delivery</button><button type="button" onClick={() => switchFulfillment("PICKUP")} disabled={!pickupEnabled} className={`rounded-lg px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40 ${fulfillment === "PICKUP" ? "bg-white text-pocket-navy shadow-sm" : "text-pocket-navy/60"}`}>Pickup</button></div>
    {catalogError ? <Card className="border-red-300 bg-red-50 p-4 text-sm text-red-700">Live catalog is unavailable right now. Checkout is blocked until it reconnects.</Card> : null}{catalogLoading && !cartProducts.length && cart.length ? <Card className="p-4 text-sm text-pocket-navy/70">Refreshing your cart...</Card> : null}{modeClosed ? <Card className="border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">{!shopEnabled ? shopMessage : deliveryMessage}</Card> : null}
    <Card className="p-5"><p className="text-lg font-black text-pocket-navy">{fulfillment === "DELIVERY" ? "Delivery details" : "Pickup details"}</p>{fulfillment === "DELIVERY" ? <p className="mt-1 text-sm leading-6 text-pocket-navy/60">Pocket currently delivers only within Islamabad, and only to the sectors listed below. Choose the sub-sector as well and use the WhatsApp number that Pocket should use to contact you.</p> : <p className="mt-1 text-sm leading-6 text-pocket-navy/60">Choose Fast pickup or a 15-minute pickup time during today’s shop hours. We will contact you on WhatsApp if needed.</p>}<div className="mt-4 grid gap-4 md:grid-cols-2">
      {fulfillment === "DELIVERY" ? <><label className="space-y-1 text-sm font-semibold text-pocket-navy"><span>Sector</span><select className={`flex h-10 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm ${fieldClasses(Boolean(fieldErrors.deliverySector))}`} value={deliverySector} onChange={(event) => { setDeliverySector(event.target.value); setDeliverySubsector(""); clearFieldError("deliverySector"); clearFieldError("deliverySubsector"); }} required><option value="">Choose your sector</option>{deliveryAreas.map((area) => <option key={area.id} value={area.name}>{area.name}</option>)}</select>{fieldErrors.deliverySector ? <p className="text-xs font-medium text-red-600">{fieldErrors.deliverySector}</p> : null}</label><label className="space-y-1 text-sm font-semibold text-pocket-navy"><span>Sub-sector</span><select className={`flex h-10 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm disabled:bg-pocket-cream ${fieldClasses(Boolean(fieldErrors.deliverySubsector))}`} value={deliverySubsector} onChange={(event) => { setDeliverySubsector(event.target.value); clearFieldError("deliverySubsector"); }} disabled={!selectedArea} required><option value="">{selectedArea ? `Choose ${selectedArea.name} sub-sector` : "Choose a sector first"}</option>{deliverySubsectors.map((subsector) => <option key={subsector} value={subsector}>{subsector}</option>)}</select>{fieldErrors.deliverySubsector ? <p className="text-xs font-medium text-red-600">{fieldErrors.deliverySubsector}</p> : null}</label></> : <label className="space-y-1 text-sm font-semibold text-pocket-navy md:col-span-2"><span>Pickup time</span><select className={`flex h-10 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm ${fieldClasses(Boolean(fieldErrors.pickupAt))}`} value={pickupAt} onChange={(event) => { setPickupAt(event.target.value); clearFieldError("pickupAt"); }}><option value="">Fast pickup</option>{slots.map((slot) => <option key={slot.value} value={slot.value}>{slot.label}</option>)}</select>{fieldErrors.pickupAt ? <p className="text-xs font-medium text-red-600">{fieldErrors.pickupAt}</p> : null}</label>}
      <label className="space-y-1 text-sm font-semibold text-pocket-navy"><span>Full name</span><Input className={fieldClasses(Boolean(fieldErrors.customerName))} value={customerName} onChange={(event) => { setCustomerName(event.target.value); clearFieldError("customerName"); }} placeholder="Full name" required />{fieldErrors.customerName ? <p className="text-xs font-medium text-red-600">{fieldErrors.customerName}</p> : null}</label><label className="relative space-y-1 text-sm font-semibold text-pocket-navy"><span>WhatsApp number</span><MessageCircle className="pointer-events-none absolute left-3 top-9 h-4 w-4 text-emerald-600" /><Input className={`pl-9 ${fieldClasses(Boolean(fieldErrors.customerPhone))}`} type="tel" value={customerPhone} onChange={(event) => { setCustomerPhone(event.target.value); clearFieldError("customerPhone"); }} placeholder="WhatsApp number (03xx xxxxxxx)" required />{fieldErrors.customerPhone ? <p className="text-xs font-medium text-red-600">{fieldErrors.customerPhone}</p> : null}</label>
      {fulfillment === "DELIVERY" ? <><label className="md:col-span-2 space-y-1 text-sm font-semibold text-pocket-navy"><span>Address</span><Input className={fieldClasses(Boolean(fieldErrors.addressLine1))} value={addressLine1} onChange={(event) => { setAddressLine1(event.target.value); clearFieldError("addressLine1"); }} placeholder="House/building, floor, street and area" required />{fieldErrors.addressLine1 ? <p className="text-xs font-medium text-red-600">{fieldErrors.addressLine1}</p> : null}</label><label className="md:col-span-2 space-y-1 text-sm font-semibold text-pocket-navy"><span>Location information</span><Textarea className={fieldClasses(Boolean(fieldErrors.addressNotes))} value={addressNotes} onChange={(event) => { setAddressNotes(event.target.value); clearFieldError("addressNotes"); }} placeholder="Any additional information we should know about the order or your location." />{fieldErrors.addressNotes ? <p className="text-xs font-medium text-red-600">{fieldErrors.addressNotes}</p> : null}</label></> : <label className="md:col-span-2 space-y-1 text-sm font-semibold text-pocket-navy"><span>Additional information</span><Textarea className={fieldClasses(Boolean(fieldErrors.pickupNotes))} value={pickupNotes} onChange={(event) => { setPickupNotes(event.target.value); clearFieldError("pickupNotes"); }} placeholder="Anything else we should know about your pickup?" />{fieldErrors.pickupNotes ? <p className="text-xs font-medium text-red-600">{fieldErrors.pickupNotes}</p> : null}</label>}
    </div></Card></div>
    <Card className="h-fit p-5 lg:sticky lg:top-24"><p className="text-xl font-black text-pocket-navy">Your order</p>{cartProducts.length ? <div className="mt-4 space-y-3 text-sm">{cartProducts.map((item) => <div key={item.cartItemId} className="flex items-start justify-between gap-4"><div><p className="font-semibold text-pocket-navy">{item.name}</p>{formatSelectionLines(item.selectedAddOns.flatMap((option) => Array.from({ length: Math.max(1, item.selectedAddOnQuantities[option.id] ?? 1) }, () => option.name)), item.quantity).map((line) => <p key={line} className="text-pocket-navy/60">{line}</p>)}<p className="text-pocket-navy/60">Qty {item.quantity}</p></div><p className="text-right font-bold text-pocket-orange">{formatCompactCurrency(item.price * item.quantity)}</p></div>)}</div> : <p className="mt-4 text-sm text-pocket-navy/60">Your cart is empty. <Link href="/menu" className="font-bold text-pocket-orange">Browse the menu</Link>.</p>}<div className="mt-5 space-y-3 border-t border-pocket-navy/10 pt-4 text-sm"><div className="flex justify-between gap-3"><span>Items</span><span>{formatCurrency(totals.subtotal)}</span></div>{couponCode ? <><div className="flex justify-between gap-3"><span>Coupon</span><span className="font-semibold text-emerald-700">{couponCode}</span></div><div className="flex justify-between gap-3"><span>Discount</span><span>-{formatCurrency(totals.discount)}</span></div></> : null}{fulfillment === "DELIVERY" ? <div className="flex justify-between gap-3"><span>Delivery{selectedArea ? ` (${selectedArea.name})` : ""}</span><span>{formatCurrency(totals.delivery)}</span></div> : null}<div className="flex justify-between gap-3 border-t border-pocket-navy/10 pt-3 text-base font-black"><span>Total</span><span className="text-pocket-orange">{formatCurrency(totals.total)}</span></div></div><p className="mt-3 text-xs leading-5 text-pocket-navy/60">{fulfillment === "PICKUP" ? "Note: You can pay cash or online at the branch when you collect your order." : "Note: You can pay cash or online to the rider"}</p>{error ? <p className="mt-4 text-sm font-medium text-red-600">{error}</p> : null}<Button className="mt-6 w-full" disabled={!cartProducts.length || (fulfillment === "DELIVERY" && (!selectedArea || !deliverySubsector)) || loading || couponLoading || catalogLoading || availabilityLoading || modeClosed || Boolean(catalogError)}>{loading ? "Placing order..." : fulfillment === "PICKUP" ? "Place pickup order" : "Place delivery order"}</Button></Card>
  </form></div>;
}
