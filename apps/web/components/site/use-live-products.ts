"use client";

import { useEffect, useState } from "react";
import { API_URL, normalizeProducts } from "@/lib/catalog";
import type { Product } from "@/lib/types";
import { usePublicBranch } from "@/components/site/public-branch-provider";

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
      try {
        setError("");
        const response = await fetch(`${API_URL}/api/products?branchSlug=${encodeURIComponent(selectedBranch.slug)}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to load products.");
        }

        const data = (await response.json()) as { products: any[] };
        if (!cancelled) {
          setProducts(normalizeProducts(data.products));
        }
      } catch (loadError) {
        if (!cancelled) {
          setProducts([]);
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
