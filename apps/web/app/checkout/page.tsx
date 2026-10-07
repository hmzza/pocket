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
import { branch } from "@/lib/mock-data";
import { calculateOrderTotals, readStoredCouponState, validateCouponCode, writeStoredCoupon } from "@/lib/ordering";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils";
import { usePublicBranch } from "@/components/site/public-branch-provider";
import { useDeliveryAvailability } from "@/components/site/use-delivery-availability";
import { formatSelectionLines } from "@/lib/item-detail-display";

const API_URL = typeof window === "undefined" ? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000" : "";

type CheckoutField = "deliverySector" | "deliverySubsector" | "customerName" | "customerPhone" | "addressLine1" | "addressNotes";

function friendlyValidationMessage(message: string) {
  return message
    .replace(/^String must contain at least (\d+) character\(s\)$/i, (_match, count: string) => `Please enter at least ${count} characters.`)
    .replace(/^String must contain at most (\d+) character\(s\)$/i, (_match, count: string) => `Please keep this to ${count} characters or fewer.`)
    .replace(/^Required$/i, "This field is required.");
}

function checkoutFieldForPath(path: Array<string | number>) {
  const value = path.join(".");
  if (value === "name" || value === "customerName") return "customerName" as const;
  if (value === "phone" || value === "customerPhone") return "customerPhone" as const;
  if (value.includes("sector") && !value.includes("subsector")) return "deliverySector" as const;
  if (value.includes("subsector")) return "deliverySubsector" as const;
  if (value === "address.addressLine1" || value === "addressLine1") return "addressLine1" as const;
  if (value === "address.instructions" || value === "addressNotes") return "addressNotes" as const;
  return undefined;
}

function fieldClasses(hasError: boolean) {
  return hasError ? "border-red-400 focus-visible:ring-red-300" : "";
}

export default function CheckoutPage() {
  const { cart, getCartProducts, clearCart } = useStore();
  const { selectedBranch } = usePublicBranch();
  const { deliveryEnabled, message: deliveryMessage, sectors: deliveryAreas, loading: deliveryAvailabilityLoading, refresh: refreshDeliveryAvailability } = useDeliveryAvailability(selectedBranch?.slug);
  const { products, loading: catalogLoading, error: catalogError } = useLiveProducts();
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

  const cartProducts = getCartProducts(products);
  const subtotal = useMemo(() => cartProducts.reduce((sum, item) => sum + item.price * item.quantity, 0), [cartProducts]);
  const selectedArea = deliveryAreas.find((area) => area.name === deliverySector);
  const deliverySubsectors = selectedArea?.subsectors ?? [];
  const totals = useMemo(
    () => calculateOrderTotals(subtotal, selectedArea?.deliveryFee ?? 0, couponDiscount),
    [couponDiscount, selectedArea?.deliveryFee, subtotal]
  );

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    const storedCoupon = readStoredCouponState();
    if (!storedCoupon?.code || !subtotal || !selectedBranch?.slug) {
      setCouponCode("");
      setCouponDiscount(0);
      setCouponLoading(false);
      return;
    }

    if (storedCoupon.branchSlug && storedCoupon.branchSlug !== selectedBranch.slug) {
      setCouponCode("");
      setCouponDiscount(0);
      setCouponLoading(false);
      writeStoredCoupon("");
      return;
    }

    const storedCode = storedCoupon.code;
    const branchSlug = selectedBranch.slug;
    let cancelled = false;
    setCouponLoading(true);

    async function refreshCoupon() {
      try {
        const nextCoupon = await validateCouponCode(storedCode, subtotal, branchSlug);
        if (!cancelled) {
          setCouponCode(nextCoupon.code);
          setCouponDiscount(nextCoupon.discount);
          writeStoredCoupon({ ...nextCoupon, branchSlug });
        }
      } catch {
        if (!cancelled) {
          setCouponCode("");
          setCouponDiscount(0);
          writeStoredCoupon("");
        }
      } finally {
        if (!cancelled) setCouponLoading(false);
      }
    }

    void refreshCoupon();

    return () => {
      cancelled = true;
    };
  }, [selectedBranch?.slug, subtotal]);

  function clearFieldError(field: CheckoutField) {
    setFieldErrors((current) => current[field] ? { ...current, [field]: undefined } : current);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFieldErrors({});

    if (!selectedArea) {
      setFieldErrors({ deliverySector: "Choose your delivery sector." });
      return;
    }
    if (!selectedBranch) {
      setError("Choose an available branch before placing the order.");
      return;
    }
    if (!deliverySubsector) {
      setFieldErrors({ deliverySubsector: "Choose your sub-sector." });
      return;
    }
    if (catalogError) {
      setError("Live catalog is unavailable. Retry after the storefront reconnects to the API.");
      return;
    }

    setLoading(true);
    try {
      const latestDeliveryStatus = await refreshDeliveryAvailability();
      if (!latestDeliveryStatus) {
        setError("We could not verify delivery availability. Please try again.");
        return;
      }
      if (!latestDeliveryStatus.deliveryEnabled) {
        setError(latestDeliveryStatus.message ?? "Deliveries are closed at the moment.");
        window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
        return;
      }
      let activeCouponCode: string | undefined;
      if (couponCode.trim()) {
        const nextCoupon = await validateCouponCode(couponCode, subtotal, selectedBranch.slug);
        setCouponCode(nextCoupon.code);
        setCouponDiscount(nextCoupon.discount);
        writeStoredCoupon({ ...nextCoupon, branchSlug: selectedBranch.slug });
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
          deliverySector: selectedArea.name,
          deliverySubsector,
          couponCode: activeCouponCode,
          address: {
            label: "Delivery",
            addressLine1: addressLine1.trim(),
            city: "Islamabad",
            instructions: addressNotes.trim() || undefined
          },
          items: cartProducts.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
            selectedAddOnIds: item.selectedAddOnIds,
            selectedAddOnQuantities: item.selectedAddOnQuantities
          }))
        })
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const nextFieldErrors: Partial<Record<CheckoutField, string>> = {};
        const generalMessages: string[] = [];
        const issues = Array.isArray(data?.issues) ? data.issues : [];

        for (const issue of issues as Array<{ path?: Array<string | number>; message?: string }>) {
          if (!issue.message) continue;
          const message = friendlyValidationMessage(issue.message);
          const field = checkoutFieldForPath(issue.path ?? []);
          if (field) nextFieldErrors[field] = message;
          else generalMessages.push(message);
        }

        if (data?.issues?.fieldErrors && typeof data.issues.fieldErrors === "object") {
          for (const [path, value] of Object.entries(data.issues.fieldErrors as Record<string, unknown>)) {
            const messages = Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
            const field = checkoutFieldForPath(path.split("."));
            if (field && messages[0]) nextFieldErrors[field] = friendlyValidationMessage(messages[0]);
            else generalMessages.push(...messages.map(friendlyValidationMessage));
          }
        }

        setFieldErrors(nextFieldErrors);
        const validationDetails = !issues.length && Array.isArray(data?.details)
          ? data.details.filter((entry: unknown): entry is string => typeof entry === "string").map(friendlyValidationMessage)
          : [];
        setError([...generalMessages, ...validationDetails, ...(generalMessages.length || Object.keys(nextFieldErrors).length ? [] : [data?.message ?? "Unable to place your delivery order."])].join(" "));
        return;
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-6">
      <form onSubmit={handleSubmit} className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Delivery checkout</p>
            <h1 className="text-4xl font-black text-pocket-navy">A few details, then we'll take it from here.</h1>
          </div>
          {catalogError ? <Card className="border-red-300 bg-red-50 p-4 text-sm text-red-700">Live catalog is unavailable right now. Checkout is blocked until it reconnects.</Card> : null}
          {catalogLoading && !cartProducts.length && cart.length ? <Card className="p-4 text-sm text-pocket-navy/70">Refreshing your cart...</Card> : null}
          {deliveryMessage && !deliveryEnabled ? <Card className="border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">{deliveryMessage}</Card> : null}

          <Card id="delivery-details" className="scroll-mt-28 p-5">
            <p className="text-lg font-black text-pocket-navy">Delivery details</p>
            <p className="mt-1 text-sm leading-6 text-pocket-navy/60">Pocket currently delivers only within Islamabad, and only to the sectors listed below. Choose the sub-sector as well and use the WhatsApp number that Pocket should use to contact you.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm font-semibold text-pocket-navy">
                <span>Sector</span>
                <select className={`flex h-10 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm ${fieldClasses(Boolean(fieldErrors.deliverySector))}`} value={deliverySector} onChange={(event) => { setDeliverySector(event.target.value); setDeliverySubsector(""); setError(""); clearFieldError("deliverySector"); clearFieldError("deliverySubsector"); }} required>
                  <option value="">Choose your sector</option>
                  {deliveryAreas.map((area) => <option key={area.id} value={area.name}>{area.name}</option>)}
                </select>
                {fieldErrors.deliverySector ? <p className="text-xs font-medium text-red-600">{fieldErrors.deliverySector}</p> : null}
              </label>
              <label className="space-y-1 text-sm font-semibold text-pocket-navy">
                <span>Sub-sector</span>
                <select className={`flex h-10 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm disabled:bg-pocket-cream ${fieldClasses(Boolean(fieldErrors.deliverySubsector))}`} value={deliverySubsector} onChange={(event) => { setDeliverySubsector(event.target.value); clearFieldError("deliverySubsector"); }} disabled={!selectedArea} required>
                  <option value="">{selectedArea ? `Choose ${selectedArea.name} sub-sector` : "Choose a sector first"}</option>
                  {deliverySubsectors.map((subsector) => <option key={subsector} value={subsector}>{subsector}</option>)}
                </select>
                {fieldErrors.deliverySubsector ? <p className="text-xs font-medium text-red-600">{fieldErrors.deliverySubsector}</p> : null}
              </label>
              <label className="space-y-1 text-sm font-semibold text-pocket-navy"><span>Full name</span><Input className={fieldClasses(Boolean(fieldErrors.customerName))} value={customerName} onChange={(event) => { setCustomerName(event.target.value); clearFieldError("customerName"); }} placeholder="Full name" required />{fieldErrors.customerName ? <p className="text-xs font-medium text-red-600">{fieldErrors.customerName}</p> : null}</label>
              <label className="relative space-y-1 text-sm font-semibold text-pocket-navy"><span>WhatsApp number</span><MessageCircle className="pointer-events-none absolute left-3 top-9 h-4 w-4 text-emerald-600" /><Input className={`pl-9 ${fieldClasses(Boolean(fieldErrors.customerPhone))}`} type="tel" value={customerPhone} onChange={(event) => { setCustomerPhone(event.target.value); clearFieldError("customerPhone"); }} placeholder="WhatsApp number (03xx xxxxxxx)" required />{fieldErrors.customerPhone ? <p className="text-xs font-medium text-red-600">{fieldErrors.customerPhone}</p> : null}</label>
              <label className="md:col-span-2 space-y-1 text-sm font-semibold text-pocket-navy"><span>Address</span><Input className={fieldClasses(Boolean(fieldErrors.addressLine1))} value={addressLine1} onChange={(event) => { setAddressLine1(event.target.value); clearFieldError("addressLine1"); }} placeholder="House/building, floor, street and area" required />{fieldErrors.addressLine1 ? <p className="text-xs font-medium text-red-600">{fieldErrors.addressLine1}</p> : null}</label>
              <label className="md:col-span-2 space-y-1 text-sm font-semibold text-pocket-navy"><span>Location information</span><Textarea className={fieldClasses(Boolean(fieldErrors.addressNotes))} value={addressNotes} onChange={(event) => { setAddressNotes(event.target.value); clearFieldError("addressNotes"); }} placeholder="Any additional information we should know about the order or your location." />{fieldErrors.addressNotes ? <p className="text-xs font-medium text-red-600">{fieldErrors.addressNotes}</p> : null}</label>
            </div>
          </Card>
        </div>

        <Card className="h-fit p-5 lg:sticky lg:top-24">
          <p className="text-xl font-black text-pocket-navy">Your order</p>
          {cartProducts.length ? <div className="mt-4 space-y-3 text-sm">{cartProducts.map((item) => <div key={item.cartItemId} className="flex items-start justify-between gap-4"><div><p className="font-semibold text-pocket-navy">{item.name}</p>{formatSelectionLines(item.selectedAddOns.flatMap((option) => Array.from({ length: Math.max(1, item.selectedAddOnQuantities[option.id] ?? 1) }, () => option.name)), item.quantity).map((line) => <p key={line} className="text-pocket-navy/60">{line}</p>)}<p className="text-pocket-navy/60">Qty {item.quantity}</p></div><p className="text-right font-bold text-pocket-orange">{formatCompactCurrency(item.price * item.quantity)}</p></div>)}</div> : <p className="mt-4 text-sm text-pocket-navy/60">Your cart is empty. <Link href="/menu" className="font-bold text-pocket-orange">Browse the menu</Link>.</p>}
          <div className="mt-5 space-y-3 border-t border-pocket-navy/10 pt-4 text-sm">
            <div className="flex justify-between gap-3"><span>Items</span><span>{formatCurrency(totals.subtotal)}</span></div>
            {couponCode ? <>
              <div className="flex justify-between gap-3"><span>Coupon</span><span className="font-semibold text-emerald-700">{couponCode}</span></div>
              <div className="flex justify-between gap-3"><span>Discount</span><span>-{formatCurrency(totals.discount)}</span></div>
            </> : null}
             <div className="flex justify-between gap-3"><span>Delivery{selectedArea ? ` (${selectedArea.name})` : ""}</span><span>{formatCurrency(totals.delivery)}</span></div>
            <div className="flex justify-between gap-3 border-t border-pocket-navy/10 pt-3 text-base font-black"><span>Total</span><span className="text-pocket-orange">{formatCurrency(totals.total)}</span></div>
           </div>
           <p className="mt-3 text-xs leading-5 text-pocket-navy/60">Note: You can pay cash or online to the rider</p>
           {error ? <p className="mt-4 text-sm font-medium text-red-600">{error}</p> : null}
           <Button className="mt-6 w-full" disabled={!cartProducts.length || !selectedArea || loading || couponLoading || catalogLoading || deliveryAvailabilityLoading || !deliveryEnabled || Boolean(catalogError)}>{loading ? "Placing order..." : "Place delivery order"}</Button>
        </Card>
      </form>
    </div>
  );
}
