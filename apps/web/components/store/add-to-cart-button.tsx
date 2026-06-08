"use client";

import { ShoppingBag } from "lucide-react";
import { useStore } from "./store-provider";
import { Button } from "@/components/ui/button";

export function AddToCartButton({ productId }: { productId: string }) {
  const { addToCart } = useStore();

  return (
    <Button onClick={() => addToCart(productId)}>
      <ShoppingBag className="h-4 w-4" />
      Add to Cart
    </Button>
  );
}

