import { MenuBrowser } from "@/components/site/menu-browser";
import { SectionHeading } from "@/components/site/section-heading";
import { getCategories, getProducts } from "@/lib/api";

export const metadata = {
  title: "Menu"
};

export default async function MenuPage({ searchParams }: { searchParams: { branch?: string } }) {
  const branchSlug = searchParams.branch;
  const [products, categories] = await Promise.all([getProducts(branchSlug), getCategories(branchSlug)]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      <SectionHeading
        eyebrow="Menu"
        title="Built for fast browsing and faster ordering"
        description="Browse shawarma, fries, chillers, shakes, and soft drinks with real pricing, product imagery, and quick cart actions."
      />
      <div className="mt-10">
        <MenuBrowser products={products} categories={categories} branchSlug={branchSlug} />
      </div>
    </div>
  );
}
