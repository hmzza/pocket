import type { MetadataRoute } from "next";
import { products } from "@/lib/mock-data";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://pocketshawarma.example";

  return [
    "",
    "/menu",
    "/search",
    "/orders",
    "/account"
  ].map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date()
  })).concat(
    products.map((product) => ({
      url: `${base}/menu/${product.slug}`,
      lastModified: new Date()
    }))
  );
}
