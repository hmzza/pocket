import type { Product } from "@/lib/types";

export function isMealProduct(product: Product) {
  return product.category.slug === "make-it-a-meal" || product.slug.endsWith("-make-it-a-meal");
}

export function getMealProductForShawarma(product: Product, products: Product[]) {
  if (product.category.slug !== "shawarma") return undefined;
  const exactMatch = products.find((candidate) => isMealProduct(candidate) && candidate.slug === `${product.slug}-make-it-a-meal`);
  if (exactMatch) return exactMatch;

  const normalizedName = product.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return products.find((candidate) =>
    isMealProduct(candidate) && candidate.name.toLowerCase().replace(/[^a-z0-9]/g, "").startsWith(normalizedName)
  );
}
