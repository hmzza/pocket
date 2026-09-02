import { resolvePocketImagePath } from "./image-paths";
import { categories } from "./mock-data";
import type { Product } from "./types";

export const API_URL =
  typeof window === "undefined"
    ? process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
    : "";

export function normalizeProducts(items: any[] | undefined): Product[] {
  if (!items?.length) return [];

  return items.map((item) => {
    const category = item.category
      ? {
          id: item.category.id,
          slug: item.category.slug,
          name: item.category.name,
          description: item.category.description ?? undefined,
          imageUrl: resolvePocketImagePath(item.category.imageUrl ?? "/images/classic-shawarma.png")
        }
      : categories[0]!;
    const isCanonicalMeal = item.slug === "make-it-a-meal" && category.slug === "make-it-a-meal";

    return {
      id: item.id,
      slug: item.slug,
      name: item.name,
      description: item.description,
      price: isCanonicalMeal ? 250 : Number(item.branchPricing?.[0]?.price ?? item.basePrice),
      calories: item.calories ?? undefined,
      category,
      imageUrl: resolvePocketImagePath(item.images?.[0]?.url ?? category.imageUrl),
      gallery: (item.images?.map((image: any) => resolvePocketImagePath(image.url)) ?? [resolvePocketImagePath(category.imageUrl)]),
      featured: Boolean(item.featured),
      bestSeller: Boolean(item.bestSeller),
      ingredients: item.ingredients ?? [],
      nutrition: {
        calories: item.nutritionInfo?.calories ?? item.calories ?? 0,
        protein: item.nutritionInfo?.macros?.protein ?? 0,
        carbs: item.nutritionInfo?.macros?.carbs ?? 0,
        fats: item.nutritionInfo?.macros?.fats ?? 0
      },
      addOnGroups:
        item.slug === "loaded-fries"
          ? []
          : item.addOnGroups?.map((group: any) => ({
              id: group.id,
              name: group.name,
              minSelect: group.minSelect,
              maxSelect: group.maxSelect,
              options: group.options.map((option: any) => ({
                id: option.id,
                name: option.name,
                priceDelta: Number(option.priceDelta),
                linkedProductId: option.linkedProductId ?? null
              }))
            })) ?? [],
      reviews:
        item.reviews?.map((review: any) => ({
          id: review.id,
          author: review.user?.name ?? "Pocket Customer",
          rating: review.rating,
          title: review.title,
          body: review.body
        })) ?? []
    };
  });
}
