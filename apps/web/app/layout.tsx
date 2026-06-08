import type { Metadata } from "next";
import { AppShell } from "@/components/site/app-shell";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "POCKET - The Shawarma Spot",
    template: "%s | POCKET"
  },
  description: "Pocket Shawarma Spot in Islamabad serving bold wraps, loaded fries, combos, and fast delivery.",
  metadataBase: new URL("https://pocketshawarma.example"),
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg"
  },
  openGraph: {
    title: "POCKET - The Shawarma Spot",
    description: "Real Shawarma, Served The Pocket Way",
    images: ["/images/hero-pocket.svg"]
  },
  twitter: {
    card: "summary_large_image",
    title: "POCKET - The Shawarma Spot",
    description: "Real Shawarma, Served The Pocket Way",
    images: ["/images/hero-pocket.svg"]
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
