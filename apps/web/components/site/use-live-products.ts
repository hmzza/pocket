"use client";

import { useEffect, useState } from "react";
import { API_URL, normalizeProducts } from "@/lib/catalog";
import type { Product } from "@/lib/types";

export function useLiveProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      try {
        setError("");
        const response = await fetch(`${API_URL}/api/products`);
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
  }, []);

  return { products, loading, error };
}
