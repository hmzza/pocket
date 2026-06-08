"use client";

import Link from "next/link";
import { Menu, Search, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { ThemeToggle } from "./theme-toggle";
import { useStore } from "@/components/store/store-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Home" },
  { href: "/menu", label: "Menu" },
  { href: "/search", label: "Search" },
  { href: "/orders", label: "Track Order" },
  { href: "/admin", label: "Admin" }
];

export function Header() {
  const [open, setOpen] = useState(false);
  const { cartCount } = useStore();

  return (
    <header className="sticky top-0 z-40 border-b border-pocket-navy/10 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-md bg-pocket-orange text-lg font-black text-white">P</div>
          <div>
            <p className="text-base font-black tracking-wide text-pocket-navy">POCKET</p>
            <p className="text-xs uppercase tracking-[0.2em] text-pocket-orange">The Shawarma Spot</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm font-medium text-pocket-navy transition hover:text-pocket-orange">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/search" className="hidden md:inline-flex">
            <Button variant="ghost" size="sm" className="h-9 w-9 px-0">
              <Search className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/cart" className="relative inline-flex">
            <Button variant="ghost" size="sm" className="h-9 w-9 px-0">
              <ShoppingBag className="h-4 w-4" />
            </Button>
            {cartCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-pocket-orange px-1 text-[10px] font-bold text-white">
                {cartCount}
              </span>
            ) : null}
          </Link>
          <ThemeToggle />
          <Button variant="ghost" size="sm" className="h-9 w-9 px-0 md:hidden" onClick={() => setOpen((value) => !value)}>
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className={cn("border-t border-pocket-navy/10 bg-white md:hidden", open ? "block" : "hidden")}>
        <div className="space-y-2 px-4 py-4">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="block rounded-md px-3 py-2 text-sm font-semibold text-pocket-navy hover:bg-pocket-cream" onClick={() => setOpen(false)}>
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}

