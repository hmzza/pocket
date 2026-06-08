"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLiveProducts } from "@/components/site/use-live-products";
import { Card } from "@/components/ui/card";
import { useStore } from "@/components/store/store-provider";
import { API_URL } from "@/lib/catalog";
import { readRememberedOrders } from "@/lib/ordering";
import type { TrackedOrder } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export default function AccountPage() {
  const { favorites, recentlyViewed } = useStore();
  const { products, error: catalogError } = useLiveProducts();
  const [orders, setOrders] = useState<TrackedOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const favoriteProducts = products.filter((product) => favorites.includes(product.id));
  const viewedProducts = products.filter((product) => recentlyViewed.includes(product.id));

  useEffect(() => {
    let cancelled = false;

    async function loadOrders() {
      const orderNumbers = readRememberedOrders();
      if (!orderNumbers.length) {
        setOrders([]);
        setLoadingOrders(false);
        return;
      }

      try {
        const responses = await Promise.all(
          orderNumbers.map(async (orderNumber) => {
            const response = await fetch(`${API_URL}/api/track/${orderNumber}`);
            if (!response.ok) return null;

            const data = (await response.json()) as {
              order: {
                id: string;
                orderNumber: string;
                status: string;
                expectedDeliveryAt: string;
                totalAmount: number | string;
                placedAt: string;
                branch: { name: string };
                items: Array<{
                  id: string;
                  productName: string;
                  quantity: number;
                  unitPrice: number | string;
                }>;
              };
            };

            return {
              id: data.order.id,
              orderNumber: data.order.orderNumber,
              status: data.order.status,
              branch: data.order.branch.name,
              expectedDeliveryAt: data.order.expectedDeliveryAt,
              totalAmount: Number(data.order.totalAmount),
              placedAt: data.order.placedAt,
              items: data.order.items.map((item) => ({
                id: item.id,
                productName: item.productName,
                quantity: item.quantity,
                unitPrice: Number(item.unitPrice)
              }))
            } satisfies TrackedOrder;
          })
        );

        if (!cancelled) {
          setOrders(responses.filter(Boolean) as TrackedOrder[]);
        }
      } catch {
        if (!cancelled) {
          setOrders([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingOrders(false);
        }
      }
    }

    void loadOrders();

    return () => {
      cancelled = true;
    };
  }, []);

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
            {catalogError ? <p className="mt-3 text-sm text-red-600">Favorites are unavailable until the live catalog reconnects.</p> : null}
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
              {loadingOrders ? <p className="text-sm text-pocket-navy/60">Loading recent orders...</p> : null}
              {!loadingOrders && !orders.length ? <p className="text-sm text-pocket-navy/60">Orders placed from this browser will appear here.</p> : null}
              {orders.map((order) => (
                <Link key={order.id} href={`/orders?orderNumber=${order.orderNumber}`} className="flex items-center justify-between rounded-md border border-pocket-navy/10 px-4 py-3 transition hover:bg-pocket-cream">
                  <div>
                    <p className="font-bold text-pocket-navy">{order.orderNumber}</p>
                    <p className="text-sm text-pocket-navy/60">{order.status.replaceAll("_", " ")}</p>
                  </div>
                  <p className="font-bold text-pocket-orange">{formatCurrency(order.totalAmount)}</p>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
