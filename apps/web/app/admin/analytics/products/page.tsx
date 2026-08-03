import { AdminShell } from "@/components/admin/admin-shell";
import { ProductAnalytics } from "@/components/admin/product-analytics";

export default function AdminProductAnalyticsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      <AdminShell title="Product Analytics" description="See which menu items sell, earn, and contribute the most profit.">
        <ProductAnalytics />
      </AdminShell>
    </div>
  );
}
