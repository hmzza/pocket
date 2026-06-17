"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useLiveProducts } from "@/components/site/use-live-products";
import { useStore } from "@/components/store/store-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { branch } from "@/lib/mock-data";
import { calculateOrderTotals, readStoredCoupon, validateCouponCode, writeStoredCoupon } from "@/lib/ordering";
import { formatCurrency } from "@/lib/utils";

export default function CartPage() {
  const { cart, getCartProducts, updateQuantity } = useStore();
  const { products, loading, error: catalogError } = useLiveProducts();
  const [coupon, setCoupon] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const cartProducts = getCartProducts(products);
  const missingItems = Math.max(0, cart.length - cartProducts.length);
  const subtotal = useMemo(() => cartProducts.reduce((total, product) => total + product.price * product.quantity, 0), [cartProducts]);
  const totals = useMemo(() => calculateOrderTotals(subtotal, cartProducts.length ? branch.deliveryFee : 0, couponDiscount), [couponDiscount, cartProducts.length, subtotal]);

  useEffect(() => {
    setCoupon(readStoredCoupon());
  }, []);

  useEffect(() => {
    if (!couponDiscount || !coupon.trim()) {
      return;
    }

    let cancelled = false;

    async function refreshCoupon() {
      try {
        const nextCoupon = await validateCouponCode(coupon, subtotal);
        if (!cancelled) {
          setCoupon(nextCoupon.code);
          setCouponDiscount(nextCoupon.discount);
          setCouponMessage(nextCoupon.title ? `${nextCoupon.title} applied.` : "Coupon applied.");
          writeStoredCoupon(nextCoupon.code);
        }
      } catch (validationError) {
        if (!cancelled) {
          setCouponDiscount(0);
          setCouponMessage(validationError instanceof Error ? validationError.message : "Coupon is unavailable.");
          writeStoredCoupon("");
        }
      }
    }

    void refreshCoupon();

    return () => {
      cancelled = true;
    };
  }, [coupon, couponDiscount, subtotal]);

  async function applyCoupon() {
    if (!coupon.trim()) {
      setCouponDiscount(0);
      setCouponMessage("");
      writeStoredCoupon("");
      return;
    }

    setCouponLoading(true);
    setCouponMessage("");
    try {
      const nextCoupon = await validateCouponCode(coupon, subtotal);
      setCoupon(nextCoupon.code);
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Cart</p>
            <h1 className="text-4xl font-black text-pocket-navy">Review your order</h1>
          </div>
          {missingItems ? (
            <Card className="border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              Some saved items are no longer in the live catalog and were excluded from checkout.
            </Card>
          ) : null}
          {catalogError ? (
            <Card className="border-red-300 bg-red-50 p-4 text-sm text-red-700">
              Live catalog is unavailable right now. Cart quantities are still saved, but checkout is blocked until the API connection is restored.
            </Card>
          ) : null}
          {loading && !cartProducts.length && cart.length ? (
            <Card className="p-4 text-sm text-pocket-navy/70">Refreshing live cart items...</Card>
          ) : null}
          {cartProducts.length ? (
            cartProducts.map((product) => (
              <Card key={product.cartItemId} className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-lg font-black text-pocket-navy">{product.name}</p>
                  <p className="text-sm text-pocket-navy/65">{product.description}</p>
                  {product.selectedAddOns.length ? (
                    <p className="mt-2 text-sm text-pocket-navy/60">{product.selectedAddOns.map((option) => option.name).join(", ")}</p>
                  ) : null}
                  <p className="mt-3 text-base font-bold text-pocket-orange">{formatCurrency(product.price)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="inline-flex items-center gap-2 rounded-md border border-pocket-navy/10 px-2 py-2">
                    <button type="button" onClick={() => updateQuantity(product.cartItemId, product.quantity - 1)} className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-pocket-cream">
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold">{product.quantity}</span>
                    <button type="button" onClick={() => updateQuantity(product.cartItemId, product.quantity + 1)} className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-pocket-cream">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <button type="button" onClick={() => updateQuantity(product.cartItemId, 0)} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-pocket-navy/10 hover:bg-pocket-cream">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            ))
          ) : (
            <Card className="p-8">
              <p className="text-lg font-bold text-pocket-navy">Your cart is empty.</p>
              <p className="mt-2 text-sm text-pocket-navy/60">Start with shawarma, fries, shakes, or soft drinks.</p>
              <Link href="/menu" className="mt-4 inline-flex">
                <Button>Browse Menu</Button>
              </Link>
            </Card>
          )}
        </div>

        <Card className="h-fit p-5">
          <p className="text-xl font-black text-pocket-navy">Order summary</p>
          <div className="mt-5 space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60">Coupon</label>
            <div className="flex gap-2">
              <Input
                value={coupon}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setCoupon(nextValue);
                  if (nextValue.trim().toUpperCase() !== coupon.trim().toUpperCase()) {
                    setCouponDiscount(0);
                    setCouponMessage("");
                  }
                }}
                placeholder="Enter coupon code"
              />
              <Button type="button" variant="outline" onClick={() => void applyCoupon()} disabled={!subtotal || couponLoading}>
                {couponLoading ? "Applying..." : "Apply"}
              </Button>
            </div>
            {couponMessage ? (
              <p className={`text-sm ${couponDiscount ? "text-emerald-700" : "text-red-600"}`}>{couponMessage}</p>
            ) : null}
          </div>
          <div className="mt-5 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(totals.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Discount</span>
              <span>-{formatCurrency(totals.discount)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Tax</span>
              <span>{formatCurrency(totals.tax)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Delivery</span>
              <span>{formatCurrency(totals.delivery)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-pocket-navy/10 pt-3 text-base font-black">
              <span>Total</span>
              <span className="text-pocket-orange">{formatCurrency(totals.total)}</span>
            </div>
          </div>
          <Link href="/checkout" className="mt-6 inline-flex w-full">
            <Button className="w-full" disabled={!cartProducts.length || loading || Boolean(catalogError)}>
              Continue to Checkout
            </Button>
          </Link>
        </Card>
      </div>
    </div>
  );
}
