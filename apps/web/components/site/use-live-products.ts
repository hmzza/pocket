"use client";

import { useEffect, useState } from "react";
import { API_URL, normalizeProducts } from "@/lib/catalog";
import type { Product } from "@/lib/types";
import { usePublicBranch } from "@/components/site/public-branch-provider";

const PRODUCT_CACHE_PREFIX = "pocket-live-products:";
const productMemoryCache = new Map<string, Product[]>();

function readCachedProducts(branchSlug: string) {
  const memoryProducts = productMemoryCache.get(branchSlug);
  if (memoryProducts) return memoryProducts;

  try {
    const stored = window.localStorage.getItem(`${PRODUCT_CACHE_PREFIX}${branchSlug}`);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return null;
    const cachedProducts = parsed as Product[];
    productMemoryCache.set(branchSlug, cachedProducts);
    return cachedProducts;
  } catch {
    return null;
  }
}

function cacheProducts(branchSlug: string, nextProducts: Product[]) {
  productMemoryCache.set(branchSlug, nextProducts);
  try {
    window.localStorage.setItem(`${PRODUCT_CACHE_PREFIX}${branchSlug}`, JSON.stringify(nextProducts));
  } catch {
    // Catalog caching is an optimization and must not block storefront use.
  }
}

export function useLiveProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { selectedBranch, loading: branchLoading } = usePublicBranch();

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      if (!selectedBranch) {
        if (!branchLoading && !cancelled) {
          setProducts([]);
          setError("No active branch is available.");
          setLoading(false);
        }
        return;
      }

      const cachedProducts = readCachedProducts(selectedBranch.slug);
      if (!cancelled) {
        setProducts(cachedProducts ?? []);
        setError("");
        setLoading(!cachedProducts);
      }

      try {
        const response = await fetch(`${API_URL}/api/products?branchSlug=${encodeURIComponent(selectedBranch.slug)}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to load products.");
        }

        const data = (await response.json()) as { products: any[] };
        if (!cancelled) {
          const nextProducts = normalizeProducts(data.products);
          cacheProducts(selectedBranch.slug, nextProducts);
          setProducts(nextProducts);
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          if (!cachedProducts) setProducts([]);
          setError(loadError instanceof Error ? loadError.message : "Unable to load the live catalog.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProducts();

    return () => {
      cancelled = true;
    };
  }, [branchLoading, selectedBranch]);

  return { products, loading, error };
}
