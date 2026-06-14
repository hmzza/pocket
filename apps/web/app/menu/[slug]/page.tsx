import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      <RecentlyViewedTracker productId={product.id} />
      <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-pocket-navy/10 bg-white shadow-panel">
            <Image src={product.gallery[0] ?? product.imageUrl} alt={product.name} fill className="object-cover" sizes="(max-width: 1024px) 100vw, 55vw" />
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
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-pocket-navy/10 bg-white p-5 shadow-panel">
            <div>
              <p className="text-4xl font-black text-pocket-orange">{formatCurrency(product.price)}</p>
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
