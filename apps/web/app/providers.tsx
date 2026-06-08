"use client";

import { ThemeProvider } from "next-themes";
import { StoreProvider } from "@/components/store/store-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <StoreProvider>{children}</StoreProvider>
    </ThemeProvider>
  );
}

