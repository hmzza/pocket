"use client";

import { usePathname } from "next/navigation";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const usesStandaloneShell = pathname.startsWith("/admin") || pathname.startsWith("/pos");

  if (usesStandaloneShell) {
    return <main className="min-h-screen bg-pocket-cream/40">{children}</main>;
  }

  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}
