"use client";

import { useMemo, useState } from "react";
import { ProductCard } from "./product-card";
import { Input } from "@/components/ui/input";
import type { Category, Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getMealProductForProduct, isMealProduct } from "@/lib/meal-products";

const WEBSITE_CATEGORY_ORDER = [
  "shawarma",
  "wraps",
  "slider",
  "sliders",
  "fries",
  "deals",
  "chillers",
  "ice-cream-shakes",
  "soft-drinks",
  "desserts"
];

function getCategoryLabel(category: Category) {
  if (category.slug === "slider" || category.slug === "sliders") return "Sliders";
  if (category.slug === "ice-cream-shakes") return "Ice Cream Shakes";
  if (category.slug === "soft-drinks") return "Soft Drinks";
  return category.name;
}

export function MenuBrowser({ products, categories, branchSlug }: { products: Product[]; categories: Category[]; branchSlug?: string }) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const filtered = useMemo(() => {
    return products.filter((product) => {
      if (isMealProduct(product)) return false;
      const matchesCategory = activeCategory === "all" || product.category.slug === activeCategory;
      const matchesQuery =
        query.length === 0 ||
        product.name.toLowerCase().includes(query.toLowerCase()) ||
        product.description.toLowerCase().includes(query.toLowerCase());
      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, products, query]);

  const visibleCategories = useMemo(() => {
    return categories
      .filter((category) => category.slug !== "make-it-a-meal")
      .slice()
      .sort((left, right) => {
        const leftIndex = WEBSITE_CATEGORY_ORDER.indexOf(left.slug);
        const rightIndex = WEBSITE_CATEGORY_ORDER.indexOf(right.slug);
        const leftRank = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
        const rightRank = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
        return leftRank - rightRank || left.name.localeCompare(right.name);
      });
  }, [categories]);

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search shawarma, fries, shakes, or drinks" />
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
          {visibleCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setActiveCategory(category.slug)}
              className={cn(
                "rounded-md border px-3 py-2 text-sm font-semibold transition",
                activeCategory === category.slug ? "border-pocket-orange bg-pocket-orange text-white" : "border-pocket-navy/15 bg-white text-pocket-navy hover:bg-pocket-cream"
              )}
            >
              {getCategoryLabel(category)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((product) => (
          <ProductCard key={product.id} product={product} mealProduct={getMealProductForProduct(product, products)} branchSlug={branchSlug} />
        ))}
      </div>
    </div>
  );
}
