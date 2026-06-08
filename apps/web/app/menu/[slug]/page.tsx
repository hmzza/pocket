import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock3, Flame, Star } from "lucide-react";
import { AddToCartButton } from "@/components/store/add-to-cart-button";
import { FavoriteButton } from "@/components/store/favorite-button";
import { RecentlyViewedTracker } from "@/components/store/recently-viewed-tracker";
import { ProductCard } from "@/components/site/product-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getProductBySlug } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const data = await getProductBySlug(params.slug);
  if (!data) return {};
  return {
    title: data.product.name,
    description: data.product.description
  };
}

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const data = await getProductBySlug(params.slug);
  if (!data) notFound();

  const { product, related } = data;
  const rating = product.reviews.length ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / product.reviews.length : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      <RecentlyViewedTracker productId={product.id} />
      <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-pocket-navy/10 bg-white shadow-panel">
            <Image src={product.gallery[0] ?? product.imageUrl} alt={product.name} fill className="object-cover" sizes="(max-width: 1024px) 100vw, 55vw" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {product.gallery.map((image) => (
              <div key={image} className="relative aspect-[4/3] overflow-hidden rounded-lg border border-pocket-navy/10 bg-white">
                <Image src={image} alt={product.name} fill className="object-cover" sizes="20vw" />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{product.category.name}</Badge>
              {product.bestSeller ? <Badge className="bg-pocket-navy text-pocket-cream">Best Seller</Badge> : null}
            </div>
            <h1 className="text-4xl font-black text-pocket-navy">{product.name}</h1>
            <p className="text-base leading-7 text-pocket-navy/70">{product.description}</p>
            <div className="flex flex-wrap gap-4 text-sm font-semibold text-pocket-navy/70">
              <span className="inline-flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-pocket-orange" />
                {product.prepTimeMinutes} min
              </span>
              <span className="inline-flex items-center gap-2">
                <Flame className="h-4 w-4 text-pocket-orange" />
                Spice {product.spiceLevel}/5
              </span>
              <span className="inline-flex items-center gap-2">
                <Star className="h-4 w-4 text-pocket-orange" />
                {rating ? rating.toFixed(1) : "New"}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-pocket-navy/10 bg-white p-5 shadow-panel">
            <div>
              <p className="text-4xl font-black text-pocket-orange">{formatCurrency(product.price)}</p>
              <p className="text-sm text-pocket-navy/60">{product.calories} kcal</p>
            </div>
            <div className="flex gap-3">
              <FavoriteButton productId={product.id} />
              <AddToCartButton productId={product.id} />
            </div>
          </div>

          <Card className="p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-pocket-orange">Ingredients</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {product.ingredients.map((ingredient) => (
                <span key={ingredient} className="rounded-md bg-pocket-cream px-3 py-2 text-sm font-semibold text-pocket-navy">
                  {ingredient}
                </span>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-pocket-orange">Nutrition</p>
            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { label: "Calories", value: product.nutrition.calories },
                { label: "Protein", value: `${product.nutrition.protein}g` },
                { label: "Carbs", value: `${product.nutrition.carbs}g` },
                { label: "Fats", value: `${product.nutrition.fats}g` }
              ].map((item) => (
                <div key={item.label} className="rounded-md bg-pocket-cream p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-pocket-navy/50">{item.label}</p>
                  <p className="mt-2 text-xl font-black text-pocket-navy">{item.value}</p>
                </div>
              ))}
            </div>
          </Card>

          {product.addOnGroups.length ? (
            <Card className="p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-pocket-orange">Add-ons</p>
              <div className="mt-4 space-y-4">
                {product.addOnGroups.map((group) => (
                  <div key={group.id} className="space-y-3">
                    <p className="text-base font-bold text-pocket-navy">{group.name}</p>
                    <div className="grid gap-3">
                      {group.options.map((option) => (
                        <div key={option.id} className="flex items-center justify-between rounded-md border border-pocket-navy/10 px-4 py-3">
                          <p className="font-medium text-pocket-navy">{option.name}</p>
                          <p className="font-bold text-pocket-orange">{formatCurrency(option.priceDelta)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      <div className="mt-14 grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-pocket-orange">Reviews</p>
          <div className="mt-4 space-y-4">
            {product.reviews.length ? (
              product.reviews.map((review) => (
                <div key={review.id} className="border-b border-pocket-navy/10 pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-bold text-pocket-navy">{review.author}</p>
                    <p className="text-sm font-semibold text-pocket-orange">{review.rating}/5</p>
                  </div>
                  {review.title ? <p className="mt-2 text-sm font-semibold text-pocket-navy">{review.title}</p> : null}
                  {review.body ? <p className="mt-2 text-sm leading-6 text-pocket-navy/70">{review.body}</p> : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-pocket-navy/60">No reviews yet.</p>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Related</p>
              <h2 className="text-3xl font-black text-pocket-navy">Frequently bought together</h2>
            </div>
            <Link href="/menu" className="text-sm font-semibold text-pocket-orange">
              Browse full menu
            </Link>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
