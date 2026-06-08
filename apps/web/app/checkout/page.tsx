"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/components/store/store-provider";
import { products } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

export default function CheckoutPage() {
  const { getCartProducts } = useStore();
  const [confirmed, setConfirmed] = useState(false);
  const cartProducts = getCartProducts(products);
  const totals = useMemo(() => {
    const subtotal = cartProducts.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const tax = subtotal * 0.12;
    const delivery = cartProducts.length ? 180 : 0;
    return { subtotal, tax, delivery, total: subtotal + tax + delivery };
  }, [cartProducts]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      {confirmed ? (
        <div className="mb-8 rounded-lg border border-emerald-500/20 bg-emerald-50 p-5 text-emerald-900">
          <p className="text-xs font-semibold uppercase tracking-[0.25em]">Order Confirmed</p>
          <p className="mt-2 text-2xl font-black">PKT-2026-000123</p>
          <p className="mt-2 text-sm">Expected delivery time: 25-35 minutes from confirmation.</p>
        </div>
      ) : null}
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Checkout</p>
            <h1 className="text-4xl font-black text-pocket-navy">Step-by-step order confirmation</h1>
          </div>

          <Card className="p-5">
            <p className="text-lg font-black text-pocket-navy">1. Customer Information</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Input placeholder="Full name" defaultValue="Ayesha Khan" />
              <Input placeholder="Phone" defaultValue="+92-300-0000022" />
              <div className="md:col-span-2">
                <Input placeholder="Email" defaultValue="customer@pocketshawarma.com" />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-lg font-black text-pocket-navy">2. Delivery Details</p>
            <div className="mt-4 grid gap-4">
              <Input placeholder="Address line 1" defaultValue="House 14, Street 10, G-11/3" />
              <div className="grid gap-4 md:grid-cols-2">
                <Input placeholder="City" defaultValue="Islamabad" />
                <Input placeholder="Instructions" defaultValue="Ring bell once" />
              </div>
              <Textarea placeholder="Extra instructions" defaultValue="Cash on delivery. Keep sauces separate." />
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-lg font-black text-pocket-navy">3. Payment Method</p>
            <div className="mt-4 grid gap-3">
              {[
                "Cash on Delivery",
                "Card Payment (future ready)",
                "JazzCash (future ready)",
                "EasyPaisa (future ready)"
              ].map((option, index) => (
                <label key={option} className="flex items-center gap-3 rounded-md border border-pocket-navy/10 px-4 py-3">
                  <input type="radio" name="payment" defaultChecked={index === 0} />
                  <span className="text-sm font-medium text-pocket-navy">{option}</span>
                </label>
              ))}
            </div>
          </Card>
        </div>

        <Card className="h-fit p-5">
          <p className="text-xl font-black text-pocket-navy">Summary</p>
          <div className="mt-4 space-y-3 text-sm">
            {cartProducts.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-pocket-navy">{item.name}</p>
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
          <div className="mt-6 rounded-lg bg-pocket-cream p-4 text-sm text-pocket-navy">
            Demo confirmation number: <span className="font-black">PKT-2026-000123</span>
          </div>
          <Button className="mt-6 w-full" disabled={!cartProducts.length} onClick={() => setConfirmed(true)}>
            Place Order
          </Button>
        </Card>
      </div>
    </div>
  );
}
