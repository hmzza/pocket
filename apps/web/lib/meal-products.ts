import type { Product } from "@/lib/types";

export function isMealProduct(product: Product) {
  return product.category.slug === "make-it-a-meal" || product.slug.endsWith("-make-it-a-meal");
}

export function getMealProductForShawarma(product: Product, products: Product[]) {
  if (product.category.slug !== "shawarma") return undefined;
  return products.find((candidate) => candidate.category.slug === "make-it-a-meal" && candidate.slug === "make-it-a-meal");
}
