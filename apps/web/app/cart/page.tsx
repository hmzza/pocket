"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/components/store/store-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { products } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

export default function CartPage() {
  const { getCartProducts, updateQuantity } = useStore();
  const [coupon, setCoupon] = useState("");
  const cartProducts = getCartProducts(products);
  const subtotal = useMemo(() => cartProducts.reduce((total, product) => total + product.price * product.quantity, 0), [cartProducts]);
  const discount = coupon.trim().toUpperCase() === "POCKET10" ? subtotal * 0.1 : 0;
  const tax = (subtotal - discount) * 0.12;
  const delivery = cartProducts.length ? 180 : 0;
  const total = subtotal - discount + tax + delivery;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Cart</p>
            <h1 className="text-4xl font-black text-pocket-navy">Review your order</h1>
          </div>
          {cartProducts.length ? (
            cartProducts.map((product) => (
              <Card key={product.id} className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-lg font-black text-pocket-navy">{product.name}</p>
                  <p className="text-sm text-pocket-navy/65">{product.description}</p>
                  <p className="mt-3 text-base font-bold text-pocket-orange">{formatCurrency(product.price)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="inline-flex items-center gap-2 rounded-md border border-pocket-navy/10 px-2 py-2">
                    <button type="button" onClick={() => updateQuantity(product.id, product.quantity - 1)} className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-pocket-cream">
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold">{product.quantity}</span>
                    <button type="button" onClick={() => updateQuantity(product.id, product.quantity + 1)} className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-pocket-cream">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <button type="button" onClick={() => updateQuantity(product.id, 0)} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-pocket-navy/10 hover:bg-pocket-cream">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            ))
          ) : (
            <Card className="p-8">
              <p className="text-lg font-bold text-pocket-navy">Your cart is empty.</p>
              <p className="mt-2 text-sm text-pocket-navy/60">Start with shawarmas, combos, or loaded fries.</p>
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
              <Input value={coupon} onChange={(event) => setCoupon(event.target.value)} placeholder="Use POCKET10" />
              <Button type="button" variant="outline">
                Apply
              </Button>
            </div>
          </div>
          <div className="mt-5 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Discount</span>
              <span>-{formatCurrency(discount)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Tax</span>
              <span>{formatCurrency(tax)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Delivery</span>
              <span>{formatCurrency(delivery)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-pocket-navy/10 pt-3 text-base font-black">
              <span>Total</span>
              <span className="text-pocket-orange">{formatCurrency(total)}</span>
            </div>
          </div>
          <Link href="/checkout" className="mt-6 inline-flex w-full">
            <Button className="w-full" disabled={!cartProducts.length}>
              Continue to Checkout
            </Button>
          </Link>
        </Card>
      </div>
    </div>
  );
}
