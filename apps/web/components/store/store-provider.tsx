"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { API_URL } from "@/lib/catalog";
import { branch, products as legacyProducts } from "@/lib/mock-data";
import type { AddOnOption, CartProduct, Product } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type CartEntry = {
  id: string;
  productId: string;
  quantity: number;
  selectedAddOnIds: string[];
};

type AddToCartInput = {
  productId: string;
  quantity?: number;
  selectedAddOnIds?: string[];
};

type StoreContextValue = {
  cart: CartEntry[];
  favorites: string[];
  recentlyViewed: string[];
  addToCart: (input: AddToCartInput) => boolean;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  toggleFavorite: (productId: string) => void;
  markViewed: (productId: string) => void;
  cartCount: number;
  getCartProducts: (catalogue: Product[]) => CartProduct[];
};

const StoreContext = createContext<StoreContextValue | null>(null);

const CART_KEY = "pocket-cart";
const FAVORITES_KEY = "pocket-favorites";
const RECENT_KEY = "pocket-recent";
const legacyIdToSlug = new Map(legacyProducts.map((product) => [product.id, product.slug]));
const storeAddress = `${branch.addressLine1}, ${branch.city}`;

function createCartEntryId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `cart-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeAddOnIds(selectedAddOnIds?: string[]) {
  return [...new Set((selectedAddOnIds ?? []).filter(Boolean))].sort();
}

function buildEntrySignature(productId: string, selectedAddOnIds: string[]) {
  return `${productId}:${selectedAddOnIds.join(",")}`;
}

function normalizeCartEntries(entries: unknown): CartEntry[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const nextEntry = entry as Partial<CartEntry>;
      if (typeof nextEntry.productId !== "string") {
        return null;
      }

      const quantity =
        typeof nextEntry.quantity === "number" && Number.isFinite(nextEntry.quantity)
          ? Math.min(20, Math.max(1, Math.trunc(nextEntry.quantity)))
          : 1;

      return {
        id: typeof nextEntry.id === "string" ? nextEntry.id : createCartEntryId(),
        productId: nextEntry.productId,
        quantity,
        selectedAddOnIds: normalizeAddOnIds(nextEntry.selectedAddOnIds)
      };
    })
    .filter(Boolean) as CartEntry[];
}

function mergeCartEntries(entries: CartEntry[]) {
  return entries.reduce<CartEntry[]>((merged, entry) => {
    const signature = buildEntrySignature(entry.productId, entry.selectedAddOnIds);
    const existing = merged.find((item) => buildEntrySignature(item.productId, item.selectedAddOnIds) === signature);
    if (existing) {
      existing.quantity = Math.min(20, existing.quantity + entry.quantity);
      return merged;
    }

    merged.push(entry);
    return merged;
  }, []);
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>([]);
  const [orderingNoticeOpen, setOrderingNoticeOpen] = useState(false);
  const [hasShownHomepageNotice, setHasShownHomepageNotice] = useState(false);

  function showOrderingNotice() {
    setOrderingNoticeOpen(true);
  }

  useEffect(() => {
    const nextCart = localStorage.getItem(CART_KEY);
    const nextFavorites = localStorage.getItem(FAVORITES_KEY);
    const nextRecent = localStorage.getItem(RECENT_KEY);
    if (nextCart) setCart(normalizeCartEntries(JSON.parse(nextCart)));
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
              id: entry.id,
              productId: liveId ?? entry.productId,
              quantity: entry.quantity,
              selectedAddOnIds: entry.selectedAddOnIds
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

  useEffect(() => {
    if (pathname !== "/" || hasShownHomepageNotice) {
      return;
    }

    setOrderingNoticeOpen(true);
    setHasShownHomepageNotice(true);
  }, [hasShownHomepageNotice, pathname]);

  const value = useMemo<StoreContextValue>(
    () => ({
      cart,
      favorites,
      recentlyViewed,
      addToCart: (_input) => {
        showOrderingNotice();
        return false;
      },
      updateQuantity: (cartItemId, quantity) => {
        setCart((current) =>
          quantity <= 0
            ? current.filter((entry) => entry.id !== cartItemId)
            : current.map((entry) => (entry.id === cartItemId ? { ...entry, quantity } : entry))
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
            if (!product) {
              return null;
            }

            const selectedAddOns = entry.selectedAddOnIds.reduce<AddOnOption[]>((selected, optionId) => {
              const option = product.addOnGroups.flatMap((group) => group.options).find((item) => item.id === optionId);
              if (option) {
                selected.push(option);
              }
              return selected;
            }, []);

            return {
              ...product,
              cartItemId: entry.id,
              quantity: entry.quantity,
              selectedAddOnIds: entry.selectedAddOnIds,
              selectedAddOns,
              price: product.price + selectedAddOns.reduce((sum, option) => sum + option.priceDelta, 0)
            };
          })
          .filter(Boolean) as CartProduct[]
    }),
    [cart, favorites, recentlyViewed]
  );

  return (
    <StoreContext.Provider value={value}>
      {children}

      {orderingNoticeOpen ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-labelledby="ordering-notice-title">
          <Card className="w-full max-w-xl rounded-3xl border-pocket-navy/10 p-6 sm:p-8">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-pocket-orange">Notice</p>
              <div className="space-y-3">
                <h2 id="ordering-notice-title" className="text-3xl font-black text-pocket-navy">
                  We are not taking online orders right now.
                </h2>
                <p className="text-base leading-7 text-pocket-navy/75">
                  Please visit us physically to place your order. You can still browse the menu and view all items on the website.
                </p>
              </div>
              <div className="rounded-2xl bg-pocket-cream p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Visit Us</p>
                <p className="mt-2 text-lg font-bold text-pocket-navy">{storeAddress}</p>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setOrderingNoticeOpen(false)}>Close</Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used within StoreProvider.");
  return context;
}
