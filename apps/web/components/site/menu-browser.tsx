"use client";

import { useMemo, useState } from "react";
import { ProductCard } from "./product-card";
import { Input } from "@/components/ui/input";
import type { Category, Product } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MenuBrowser({ products, categories }: { products: Product[]; categories: Category[] }) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const filtered = useMemo(() => {
    return products.filter((product) => {
      const matchesCategory = activeCategory === "all" || product.category.slug === activeCategory;
      const matchesQuery =
        query.length === 0 ||
        product.name.toLowerCase().includes(query.toLowerCase()) ||
        product.description.toLowerCase().includes(query.toLowerCase());
      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, products, query]);

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search shawarma, drinks, or combos" />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveCategory("all")}
            className={cn(
              "rounded-md border px-3 py-2 text-sm font-semibold transition",
              activeCategory === "all" ? "border-pocket-orange bg-pocket-orange text-white" : "border-pocket-navy/15 bg-white text-pocket-navy hover:bg-pocket-cream"
            )}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setActiveCategory(category.slug)}
              className={cn(
                "rounded-md border px-3 py-2 text-sm font-semibold transition",
                activeCategory === category.slug ? "border-pocket-orange bg-pocket-orange text-white" : "border-pocket-navy/15 bg-white text-pocket-navy hover:bg-pocket-cream"
              )}
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}

