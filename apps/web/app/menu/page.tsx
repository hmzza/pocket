import { MenuBrowser } from "@/components/site/menu-browser";
import { SectionHeading } from "@/components/site/section-heading";
import { getProducts } from "@/lib/api";
import { categories } from "@/lib/mock-data";

export const metadata = {
  title: "Menu"
};

export default async function MenuPage() {
  const products = await getProducts();

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      <SectionHeading
        eyebrow="Menu"
        title="Built for fast browsing and faster ordering"
        description="Browse shawarma, fries, meal deals, chillers, shakes, and soft drinks with real pricing, product imagery, and quick cart actions."
      />
      <div className="mt-10">
        <MenuBrowser products={products} categories={categories} />
      </div>
    </div>
  );
}

