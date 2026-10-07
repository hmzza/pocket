"use client";

import { usePathname } from "next/navigation";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { DeliveryStatusBanner } from "@/components/site/delivery-status-banner";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith("/admin");
  const isPosRoute = pathname.startsWith("/pos");
  const isReceiptRoute = pathname.startsWith("/pos/receipt");

  if (isAdminRoute || isPosRoute || isReceiptRoute) {
    return <main className="min-h-screen bg-pocket-cream/40">{children}</main>;
  }

  return (
    <>
      <Header />
      <DeliveryStatusBanner />
      <main>{children}</main>
      <Footer />
    </>
  );
}
