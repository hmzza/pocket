"use client";

import { ThemeProvider } from "next-themes";
import { StoreProvider } from "@/components/store/store-provider";
import { PublicBranchProvider } from "@/components/site/public-branch-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <PublicBranchProvider>
        <StoreProvider>{children}</StoreProvider>
      </PublicBranchProvider>
    </ThemeProvider>
  );
}

