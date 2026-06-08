"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { useStore } from "@/components/store/store-provider";
import { products, trackedOrders } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

export default function AccountPage() {
  const { favorites, recentlyViewed } = useStore();
  const favoriteProducts = products.filter((product) => favorites.includes(product.id));
  const viewedProducts = products.filter((product) => recentlyViewed.includes(product.id));

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Customer Dashboard</p>
        <h1 className="text-4xl font-black text-pocket-navy">Profile, favorites, and saved context</h1>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-pocket-orange">Profile</p>
          <div className="mt-4 space-y-3 text-sm text-pocket-navy/70">
            <p><span className="font-bold text-pocket-navy">Name:</span> Ayesha Khan</p>
            <p><span className="font-bold text-pocket-navy">Phone:</span> +92-300-0000022</p>
            <p><span className="font-bold text-pocket-navy">Email:</span> customer@pocketshawarma.com</p>
            <p><span className="font-bold text-pocket-navy">Address:</span> House 14, Street 10, G-11/3, Islamabad</p>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <p className="text-lg font-black text-pocket-navy">Favorites</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {favoriteProducts.length ? (
                favoriteProducts.map((product) => (
                  <Link key={product.id} href={`/menu/${product.slug}`} className="rounded-md border border-pocket-navy/10 p-4 transition hover:bg-pocket-cream">
                    <p className="font-bold text-pocket-navy">{product.name}</p>
                    <p className="mt-1 text-sm text-pocket-navy/60">{formatCurrency(product.price)}</p>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-pocket-navy/60">No favorites saved yet.</p>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-lg font-black text-pocket-navy">Recently viewed</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {viewedProducts.length ? (
                viewedProducts.map((product) => (
                  <Link key={product.id} href={`/menu/${product.slug}`} className="rounded-md border border-pocket-navy/10 p-4 transition hover:bg-pocket-cream">
                    <p className="font-bold text-pocket-navy">{product.name}</p>
                    <p className="mt-1 text-sm text-pocket-navy/60">{product.category.name}</p>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-pocket-navy/60">Recently viewed products will appear here.</p>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-lg font-black text-pocket-navy">Order history</p>
            <div className="mt-4 space-y-3">
              {trackedOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between rounded-md border border-pocket-navy/10 px-4 py-3">
                  <div>
                    <p className="font-bold text-pocket-navy">{order.orderNumber}</p>
                    <p className="text-sm text-pocket-navy/60">{order.status.replaceAll("_", " ")}</p>
                  </div>
                  <p className="font-bold text-pocket-orange">{formatCurrency(order.totalAmount)}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
