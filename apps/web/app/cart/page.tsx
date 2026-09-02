"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Minus, PencilLine, Plus, Trash2 } from "lucide-react";
import { useLiveProducts } from "@/components/site/use-live-products";
import { useStore } from "@/components/store/store-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { calculateOrderTotals, readStoredCouponState, validateCouponCode, writeStoredCoupon } from "@/lib/ordering";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils";
import { usePublicBranch } from "@/components/site/public-branch-provider";

export default function CartPage() {
  const { cart, getCartProducts, updateCartItem, updateQuantity } = useStore();
  const { selectedBranch } = usePublicBranch();
  const { products, loading, error: catalogError } = useLiveProducts();
  const [coupon, setCoupon] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [editingCartItemId, setEditingCartItemId] = useState("");
  const [editedOptions, setEditedOptions] = useState<Record<string, string[]>>({});
  const cartProducts = getCartProducts(products);
  const missingItems = Math.max(0, cart.length - cartProducts.length);
  const subtotal = useMemo(() => cartProducts.reduce((total, product) => total + product.price * product.quantity, 0), [cartProducts]);
  const totals = useMemo(() => calculateOrderTotals(subtotal, 0, couponDiscount), [couponDiscount, subtotal]);
  const editingProduct = cartProducts.find((product) => product.cartItemId === editingCartItemId) ?? null;
  function beginEdit(cartItemId: string) {
    const product = cartProducts.find((item) => item.cartItemId === cartItemId);
    if (!product) return;
    setEditedOptions(
      Object.fromEntries(product.addOnGroups.map((group) => [group.id, product.selectedAddOnIds.filter((optionId) => group.options.some((option) => option.id === optionId))]))
    );
    setEditingCartItemId(cartItemId);
  }

  function saveEdit() {
    if (!editingProduct) return;
    for (const group of editingProduct.addOnGroups) {
      const optionIds = editedOptions[group.id] ?? [];
      if (optionIds.length < group.minSelect || optionIds.length > group.maxSelect) {
        return;
      }
    }
    updateCartItem(editingProduct.cartItemId, { selectedAddOnIds: editingProduct.addOnGroups.flatMap((group) => editedOptions[group.id] ?? []) });
    setEditingCartItemId("");
  }

  useEffect(() => {
    if (!subtotal || !selectedBranch?.slug) {
      return;
    }

    const storedCoupon = readStoredCouponState();
    if (!storedCoupon?.code) {
      return;
    }

    if (storedCoupon.branchSlug && storedCoupon.branchSlug !== selectedBranch.slug) {
      writeStoredCoupon("");
      setCoupon("");
      setCouponDiscount(0);
      setCouponMessage("");
      return;
    }

    const storedCode = storedCoupon.code;
    const branchSlug = selectedBranch.slug;
    let cancelled = false;
    setCoupon(storedCode);

    async function refreshCoupon() {
      try {
        const nextCoupon = await validateCouponCode(storedCode, subtotal, branchSlug);
        if (!cancelled) {
          setCoupon(nextCoupon.code);
          setCouponDiscount(nextCoupon.discount);
          setCouponMessage(nextCoupon.title ? `${nextCoupon.title} applied.` : "Coupon applied.");
          writeStoredCoupon({ ...nextCoupon, branchSlug });
        }
      } catch (validationError) {
        if (!cancelled) {
          setCoupon("");
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
  }, [selectedBranch?.slug, subtotal]);

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
      const nextCoupon = await validateCouponCode(coupon, subtotal, selectedBranch?.slug);
      setCoupon(nextCoupon.code);
      setCouponDiscount(nextCoupon.discount);
      setCouponMessage(nextCoupon.title ? `${nextCoupon.title} applied.` : "Coupon applied.");
      writeStoredCoupon({ ...nextCoupon, branchSlug: selectedBranch!.slug });
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
                  <p className="mt-3 break-words text-base font-bold text-pocket-orange">{formatCompactCurrency(product.price)}</p>
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
                  {product.addOnGroups.length ? (
                    <button type="button" onClick={() => beginEdit(product.cartItemId)} className="inline-flex h-10 items-center gap-2 rounded-md border border-pocket-navy/10 px-3 text-sm font-semibold text-pocket-navy hover:bg-pocket-cream">
                      <PencilLine className="h-4 w-4" />
                      Edit
                    </button>
                  ) : null}
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
            <div className="flex items-center justify-between gap-3">
              <span>Subtotal</span>
              <span className="min-w-0 break-words text-right">{formatCurrency(totals.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Discount</span>
              <span className="min-w-0 break-words text-right">-{formatCurrency(totals.discount)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-pocket-navy/10 pt-3 text-base font-black">
              <span>Items total</span>
              <span className="min-w-0 break-words text-right text-pocket-orange">{formatCurrency(totals.total)}</span>
            </div>
          </div>
          <p className="mt-4 text-xs leading-5 text-pocket-navy/60">Delivery fee is selected next, after you choose your sector.</p>
          <Link href="/checkout" className="mt-6 inline-flex w-full">
            <Button className="w-full" disabled={!cartProducts.length || loading || Boolean(catalogError)}>
              Continue to Checkout
            </Button>
          </Link>
        </Card>
      </div>

      {editingProduct ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-cart-item-title">
          <Card className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border-pocket-navy/10 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Edit item</p>
                <h2 id="edit-cart-item-title" className="mt-2 text-2xl font-black text-pocket-navy">{editingProduct.name}</h2>
              </div>
              <Button type="button" variant="ghost" onClick={() => setEditingCartItemId("")}>Close</Button>
            </div>
            <div className="mt-6 space-y-5">
              {editingProduct.addOnGroups.map((group) => (
                <div key={group.id}>
                  <p className="font-semibold text-pocket-navy">{group.name}</p>
                  <p className="mt-1 text-sm text-pocket-navy/60">Choose {group.minSelect} to {group.maxSelect}</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {group.options.map((option) => {
                      const selected = (editedOptions[group.id] ?? []).includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            setEditedOptions((current) => {
                              const optionIds = current[group.id] ?? [];
                              const next = optionIds.includes(option.id)
                                ? optionIds.filter((id) => id !== option.id)
                                : [...optionIds, option.id].slice(-group.maxSelect);
                              return { ...current, [group.id]: next };
                            });
                          }}
                          className={selected ? "rounded-xl border border-pocket-orange bg-pocket-orange/10 px-4 py-3 text-left" : "rounded-xl border border-pocket-navy/10 bg-white px-4 py-3 text-left hover:border-pocket-orange/50"}
                        >
                          <p className="font-semibold text-pocket-navy">{option.name}</p>
                          <p className="text-sm text-pocket-navy/60">{option.priceDelta ? `+${formatCompactCurrency(option.priceDelta)}` : "Included"}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <Button type="button" className="w-full" onClick={saveEdit}>Save changes</Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
