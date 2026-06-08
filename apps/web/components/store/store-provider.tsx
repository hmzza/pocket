"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { API_URL } from "@/lib/catalog";
import { products as legacyProducts } from "@/lib/mock-data";
import type { Product } from "@/lib/types";

type CartEntry = {
  productId: string;
  quantity: number;
};

type StoreContextValue = {
  cart: CartEntry[];
  favorites: string[];
  recentlyViewed: string[];
  addToCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  toggleFavorite: (productId: string) => void;
  markViewed: (productId: string) => void;
  cartCount: number;
  getCartProducts: (catalogue: Product[]) => Array<Product & { quantity: number }>;
};

const StoreContext = createContext<StoreContextValue | null>(null);

const CART_KEY = "pocket-cart";
const FAVORITES_KEY = "pocket-favorites";
const RECENT_KEY = "pocket-recent";
const legacyIdToSlug = new Map(legacyProducts.map((product) => [product.id, product.slug]));

function mergeCartEntries(entries: CartEntry[]) {
  return entries.reduce<CartEntry[]>((merged, entry) => {
    const existing = merged.find((item) => item.productId === entry.productId);
    if (existing) {
      existing.quantity = Math.min(20, existing.quantity + entry.quantity);
      return merged;
    }

    merged.push(entry);
    return merged;
  }, []);
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>([]);

  useEffect(() => {
    const nextCart = localStorage.getItem(CART_KEY);
    const nextFavorites = localStorage.getItem(FAVORITES_KEY);
    const nextRecent = localStorage.getItem(RECENT_KEY);
    if (nextCart) setCart(JSON.parse(nextCart));
    if (nextFavorites) setFavorites(JSON.parse(nextFavorites));
    if (nextRecent) setRecentlyViewed(JSON.parse(nextRecent));
  }, []);

  useEffect(() => {
    const hasLegacyReferences =
      cart.some((entry) => legacyIdToSlug.has(entry.productId)) ||
      favorites.some((entry) => legacyIdToSlug.has(entry)) ||
      recentlyViewed.some((entry) => legacyIdToSlug.has(entry));

    if (!hasLegacyReferences) {
      return;
    }

    let cancelled = false;

    async function migrateLegacyIds() {
      try {
        const response = await fetch(`${API_URL}/api/products`);
        if (!response.ok) return;

        const data = (await response.json()) as { products: Array<{ id: string; slug: string }> };
        const slugToLiveId = new Map(data.products.map((product) => [product.slug, product.id]));

        const migratedCart = mergeCartEntries(
          cart.map((entry) => {
            const legacySlug = legacyIdToSlug.get(entry.productId);
            const liveId = legacySlug ? slugToLiveId.get(legacySlug) : undefined;
            return {
              productId: liveId ?? entry.productId,
              quantity: entry.quantity
            };
          })
        );

        const migrateList = (entries: string[]) =>
          Array.from(
            new Set(
              entries.map((entry) => {
                const legacySlug = legacyIdToSlug.get(entry);
                return legacySlug ? slugToLiveId.get(legacySlug) ?? entry : entry;
              })
            )
          );

        if (!cancelled) {
          setCart(migratedCart);
          setFavorites(migrateList(favorites));
          setRecentlyViewed(migrateList(recentlyViewed));
        }
      } catch {
        return;
      }
    }

    void migrateLegacyIds();

    return () => {
      cancelled = true;
    };
  }, [cart, favorites, recentlyViewed]);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recentlyViewed));
  }, [recentlyViewed]);

  const value = useMemo<StoreContextValue>(
    () => ({
      cart,
      favorites,
      recentlyViewed,
      addToCart: (productId) => {
        setCart((current) => {
          const existing = current.find((entry) => entry.productId === productId);
          if (existing) {
            return current.map((entry) =>
              entry.productId === productId ? { ...entry, quantity: Math.min(20, entry.quantity + 1) } : entry
            );
          }

          return [...current, { productId, quantity: 1 }];
        });
      },
      updateQuantity: (productId, quantity) => {
        setCart((current) =>
          quantity <= 0 ? current.filter((entry) => entry.productId !== productId) : current.map((entry) => (entry.productId === productId ? { ...entry, quantity } : entry))
        );
      },
      clearCart: () => {
        setCart([]);
      },
      toggleFavorite: (productId) => {
        setFavorites((current) =>
          current.includes(productId) ? current.filter((entry) => entry !== productId) : [...current, productId]
        );
      },
      markViewed: (productId) => {
        setRecentlyViewed((current) => [productId, ...current.filter((entry) => entry !== productId)].slice(0, 6));
      },
      cartCount: cart.reduce((total, entry) => total + entry.quantity, 0),
      getCartProducts: (catalogue) =>
        cart
          .map((entry) => {
            const product = catalogue.find((item) => item.id === entry.productId);
            return product ? { ...product, quantity: entry.quantity } : null;
          })
          .filter(Boolean) as Array<Product & { quantity: number }>
    }),
    [cart, favorites, recentlyViewed]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used within StoreProvider.");
  return context;
}
