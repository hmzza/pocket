"use client";

import Link from "next/link";
import Image from "next/image";
import { Menu, Search, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { useStore } from "@/components/store/store-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Home" },
  { href: "/menu", label: "Menu" },
  { href: "/search", label: "Search" }
];

export function Header() {
  const [open, setOpen] = useState(false);
  const { cartCount } = useStore();

  return (
    <header className="sticky top-0 z-40 border-b border-pocket-navy/10 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center px-3 py-2.5 md:px-5 md:py-3">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white p-1 shadow-sm md:h-11 md:w-11">
            <Image
              src="/icon.png"
              alt="Pocket logo"
              width={44}
              height={44}
              sizes="44px"
              className="h-full w-full object-contain"
              priority
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black leading-none tracking-wide text-pocket-navy md:text-base">POCKET</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-pocket-orange md:text-xs">The Shawarma Spot</p>
          </div>
        </Link>

        <nav className="ml-auto hidden items-center gap-4 md:flex">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="text-[13px] font-medium text-pocket-navy transition hover:text-pocket-orange">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a href="/search" className="hidden md:inline-flex">
            <Button variant="ghost" size="sm" className="h-8 w-8 px-0">
              <Search className="h-3.5 w-3.5" />
            </Button>
          </a>
          <a href="/cart" className="relative inline-flex">
            <Button variant="ghost" size="sm" className="h-8 w-8 px-0">
              <ShoppingBag className="h-3.5 w-3.5" />
            </Button>
            {cartCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-pocket-orange px-1 text-[9px] font-bold text-white">
                {cartCount}
              </span>
            ) : null}
          </a>
          <Button variant="ghost" size="sm" className="h-8 w-8 px-0 md:hidden" onClick={() => setOpen((value) => !value)}>
            <Menu className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className={cn("border-t border-pocket-navy/10 bg-white md:hidden", open ? "block" : "hidden")}>
        <div className="space-y-1.5 px-4 py-3">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="block rounded-md px-3 py-1.5 text-sm font-semibold text-pocket-navy hover:bg-pocket-cream" onClick={() => setOpen(false)}>
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </header>
  );
}
