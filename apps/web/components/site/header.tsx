"use client";

import Link from "next/link";
import Image from "next/image";
import { Menu, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { useStore } from "@/components/store/store-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePublicBranch } from "@/components/site/public-branch-provider";

const links = [
  { href: "/", label: "Home" },
  { href: "/menu", label: "Menu" }
];

function withBranchQuery(href: string, branchSlug?: string) {
  return branchSlug ? `${href}?branch=${encodeURIComponent(branchSlug)}` : href;
}

export function Header() {
  const [open, setOpen] = useState(false);
  const { cartCount } = useStore();
  const { branches, selectedBranch, loading, selectBranch } = usePublicBranch();

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

        <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
          <nav className="hidden items-center gap-4 md:flex">
            {links.map((link) => (
              <Link key={link.href} href={withBranchQuery(link.href, selectedBranch?.slug)} className="text-[13px] font-medium text-pocket-navy transition hover:text-pocket-orange">
                {link.label}
              </Link>
            ))}
          </nav>

          {branches.length > 0 ? (
            <label className="sr-only" htmlFor="public-branch">Choose branch</label>
          ) : null}
          {branches.length > 0 ? (
            <select
              id="public-branch"
              value={selectedBranch?.slug ?? ""}
              onChange={(event) => selectBranch(event.target.value)}
              disabled={loading}
              className="max-w-[135px] rounded-md border border-pocket-navy/15 bg-pocket-cream px-2 py-1.5 text-xs font-semibold text-pocket-navy outline-none focus:border-pocket-orange"
            >
              {branches.map((branch) => <option key={branch.id} value={branch.slug}>{branch.name}</option>)}
            </select>
          ) : null}
          <Link
            href={withBranchQuery("/cart", selectedBranch?.slug)}
            aria-label={`View cart${cartCount ? `, ${cartCount} item${cartCount === 1 ? "" : "s"}` : ""}`}
            className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-pocket-navy transition-colors hover:bg-pocket-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pocket-orange focus-visible:ring-offset-2"
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            {cartCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-pocket-orange px-1 text-[9px] font-bold text-white">
                {cartCount}
              </span>
            ) : null}
          </Link>
          <Button variant="ghost" size="sm" className="h-8 w-8 px-0 md:hidden" onClick={() => setOpen((value) => !value)}>
            <Menu className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className={cn("border-t border-pocket-navy/10 bg-white md:hidden", open ? "block" : "hidden")}>
        <div className="space-y-1.5 px-4 py-3">
          {links.map((link) => (
            <Link key={link.href} href={withBranchQuery(link.href, selectedBranch?.slug)} className="block rounded-md px-3 py-1.5 text-sm font-semibold text-pocket-navy hover:bg-pocket-cream" onClick={() => setOpen(false)}>
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}
