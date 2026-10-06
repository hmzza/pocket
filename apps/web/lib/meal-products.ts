import type { Product } from "@/lib/types";

export function isMealProduct(product: Product) {
  return product.category.slug === "make-it-a-meal" || product.slug.endsWith("-make-it-a-meal");
}

const WEBSITE_MEAL_ELIGIBLE_CATEGORY_SLUGS = new Set(["shawarma", "wraps", "slider", "sliders"]);

export function getMealProductForProduct(product: Product, products: Product[]) {
  if (!WEBSITE_MEAL_ELIGIBLE_CATEGORY_SLUGS.has(product.category.slug)) return undefined;
  return products.find((candidate) => candidate.category.slug === "make-it-a-meal" && candidate.slug === "make-it-a-meal");
}
