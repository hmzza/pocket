import { AdminShell } from "@/components/admin/admin-shell";
import { ProductAnalytics } from "@/components/admin/product-analytics";

export default function AdminProductAnalyticsPage() {
  return (
    <AdminShell title="Product Analytics" description="See which menu items sell, earn, and contribute the most profit.">
        <ProductAnalytics />
      </AdminShell>
  );
}
