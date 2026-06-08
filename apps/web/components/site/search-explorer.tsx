"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import type { Product } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export function SearchExplorer({ products }: { products: Product[] }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    if (!query) return products.slice(0, 6);
    return products.filter((product) => {
      const text = `${product.name} ${product.description} ${product.category.name}`.toLowerCase();
      return text.includes(query.toLowerCase());
    });
  }, [products, query]);

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pocket-navy/40" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search menu instantly" className="pl-9" />
      </div>

      <div className="grid gap-4">
        {results.map((product) => (
          <Link key={product.id} href={`/menu/${product.slug}`}>
            <Card className="flex items-center justify-between gap-4 p-4 transition hover:border-pocket-orange/50">
              <div>
                <p className="text-base font-bold text-pocket-navy">{product.name}</p>
                <p className="text-sm text-pocket-navy/70">{product.category.name} · {product.description}</p>
              </div>
              <p className="text-base font-black text-pocket-orange">{formatCurrency(product.price)}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

