import { SearchExplorer } from "@/components/site/search-explorer";
import { getProducts } from "@/lib/api";

export const metadata = {
  title: "Search"
};

export default async function SearchPage() {
  const products = await getProducts();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 md:px-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Global Search</p>
        <h1 className="text-4xl font-black text-pocket-navy">Instant menu lookup</h1>
        <p className="text-sm text-pocket-navy/70">Search shawarmas, drinks, combos, or category keywords with immediate results.</p>
      </div>
      <div className="mt-8">
        <SearchExplorer products={products} />
      </div>
    </div>
  );
}
