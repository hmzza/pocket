import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import { AddToCartButton } from "@/components/store/add-to-cart-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { averageRating, formatCompactCurrency } from "@/lib/utils";
import type { Product } from "@/lib/types";

export function ProductCard({ product, mealProduct, branchSlug }: { product: Product; mealProduct?: Product; branchSlug?: string }) {
  const rating = averageRating(product.reviews.map((review) => review.rating));
  const thumbnail = product.gallery[0] ?? product.imageUrl;
  const productHref = `/menu/${product.slug}${branchSlug ? `?branch=${encodeURIComponent(branchSlug)}` : ""}`;

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <Link href={productHref} className="relative block aspect-[4/3] overflow-hidden bg-pocket-cream">
        <Image src={thumbnail} alt={product.name} fill className="object-contain p-3" sizes="(max-width: 768px) 100vw, 33vw" />
      </Link>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {product.bestSeller ? <Badge>Best Seller</Badge> : null}
              {product.featured ? <Badge className="bg-pocket-navy text-pocket-cream">Featured</Badge> : null}
            </div>
            <Link href={productHref} className="text-xl font-black text-pocket-navy">
              {product.name}
            </Link>
            <p className="text-sm leading-6 text-pocket-navy/70">{product.description}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-xs font-medium uppercase tracking-wide text-pocket-navy/60">
          <span className="inline-flex items-center gap-1">
            <Star className="h-3.5 w-3.5" />
            {rating || "New"}
          </span>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <div>
            <p className="min-w-0 break-words text-[clamp(1rem,4vw,1.5rem)] font-black leading-tight tracking-tight text-pocket-navy">{formatCompactCurrency(product.price)}</p>
          </div>
          <AddToCartButton product={product} mealProduct={mealProduct} />
        </div>
      </div>
    </Card>
  );
}
