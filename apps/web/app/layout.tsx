import type { Metadata } from "next";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "POCKET - The Shawarma Spot",
    template: "%s | POCKET"
  },
  description: "Pocket Shawarma Spot in Islamabad serving bold wraps, loaded fries, combos, and fast delivery.",
  metadataBase: new URL("https://pocketshawarma.example"),
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
          <Header />
          <main>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}

