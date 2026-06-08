"use client";

import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "./store-provider";

export function FavoriteButton({ productId }: { productId: string }) {
  const { favorites, toggleFavorite } = useStore();
  const active = favorites.includes(productId);

  return (
    <button
      type="button"
      onClick={() => toggleFavorite(productId)}
      aria-label="Save favorite"
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-md border border-pocket-navy/10 bg-white transition hover:bg-pocket-cream",
        active && "border-pocket-orange bg-pocket-orange/10 text-pocket-orange"
      )}
    >
      <Heart className={cn("h-4 w-4", active && "fill-current")} />
    </button>
  );
}

