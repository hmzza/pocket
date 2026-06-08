"use client";

import { useEffect } from "react";
import { useStore } from "./store-provider";

export function RecentlyViewedTracker({ productId }: { productId: string }) {
  const { markViewed } = useStore();

  useEffect(() => {
    markViewed(productId);
  }, [markViewed, productId]);

  return null;
}

