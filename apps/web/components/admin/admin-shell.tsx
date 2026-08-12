"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Activity, Banknote, BarChart3, Bike, Boxes, ChartNoAxesCombined, HandCoins, History, LayoutDashboard, LogOut, Menu, Package2, Receipt, ShoppingCart, SlidersHorizontal, Users, X } from "lucide-react";
import { BranchSwitcher } from "@/components/admin/branch-switcher";
import { Button } from "@/components/ui/button";
import { fetchAdminSession, logoutAdminSession } from "@/lib/admin-client";
import { cn } from "@/lib/utils";

const links: Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  permissionKey: string;
}> = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, permissionKey: "OVERVIEW" },
  { href: "/admin/analytics", label: "Business Analytics", icon: BarChart3, permissionKey: "BUSINESS_ANALYTICS" },
  { href: "/admin/analytics/products", label: "Product Analytics", icon: ChartNoAxesCombined, permissionKey: "PRODUCT_ANALYTICS" },
  { href: "/admin/foodpanda", label: "Foodpanda", icon: Bike, permissionKey: "FOODPANDA" },
  { href: "/admin/health", label: "Business Health", icon: Activity, permissionKey: "BUSINESS_HEALTH" },
  { href: "/admin/products", label: "Products", icon: Boxes, permissionKey: "PRODUCTS" },
  { href: "/admin/website", label: "Website Control", icon: SlidersHorizontal, permissionKey: "WEBSITE" },
  { href: "/admin/users", label: "Users", icon: Users, permissionKey: "USERS" },
  { href: "/admin/inventory", label: "Inventory", icon: Package2, permissionKey: "INVENTORY" },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart, permissionKey: "ORDERS" },
  { href: "/admin/customers", label: "Customers", icon: Users, permissionKey: "CUSTOMERS" },
  { href: "/admin/expenses", label: "Expenses", icon: Receipt, permissionKey: "EXPENSES" },
  { href: "/admin/capital", label: "Capital", icon: HandCoins, permissionKey: "CAPITAL" },
  { href: "/admin/finances", label: "Finances", icon: Banknote, permissionKey: "FINANCES" },
  { href: "/admin/finances/daily-closing", label: "Daily Closing", icon: History, permissionKey: "DAILY_CLOSING" },
  { href: "/admin/finances/foodpanda-settlements", label: "Foodpanda Settlements", icon: Bike, permissionKey: "FOODPANDA_SETTLEMENTS" },
  { href: "/pos", label: "POS", icon: ShoppingCart, permissionKey: "POS" }
];

type AdminSession = Awaited<ReturnType<typeof fetchAdminSession>>;

export function AdminShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [ready, setReady] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function validateSession() {
      try {
        const nextSession = await fetchAdminSession();
        if (
          !cancelled &&
          nextSession.user.role !== "SUPER_ADMIN" &&
          !nextSession.user.permissions.some((permission) => permission !== "POS")
        ) {
          router.replace("/admin/login");
          return;
        }

        if (!cancelled) {
          setSession(nextSession);
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          router.replace("/admin/login");
        }
      }
    }

    void validateSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const isStaff = session?.user.role !== "SUPER_ADMIN";
  const activeLink = [...links].sort((first, second) => second.href.length - first.href.length).find((link) => pathname === link.href || pathname.startsWith(`${link.href}/`));
  const restrictedForStaff = isStaff && (!activeLink || !session?.user.permissions.includes(activeLink.permissionKey));

  useEffect(() => {
    if (ready && restrictedForStaff && pathname === "/admin" && session?.user.permissions.length) {
      const firstAllowedLink = links.find((link) => session.user.permissions.includes(link.permissionKey));
      if (firstAllowedLink) router.replace(firstAllowedLink.href);
    }
  }, [ready, restrictedForStaff, router]);

  const visibleLinks = useMemo(() => {
    if (!isStaff) {
      return links;
    }

    return links.filter((link) => session?.user.permissions.includes(link.permissionKey));
  }, [isStaff, session?.user.permissions]);

  const username = session?.user.username?.trim() || session?.user.name?.trim() || "Admin";
  const initials = useMemo(() => {
    const parts = username.split(/[\s._-]+/).filter(Boolean);
    return (parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}` : username.slice(0, 2)).toUpperCase();
  }, [username]);
  const roleLabel = session?.user.role === "SUPER_ADMIN" ? "Super Admin" : "Staff";

  if (!ready) {
    return <div className="min-h-[60vh]" />;
  }

  if (restrictedForStaff) {
    return (
      <div className="mx-auto grid min-h-[60vh] w-full max-w-[1400px] place-items-center px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <div className="w-full rounded-xl border border-pocket-navy/10 bg-white p-8 text-center shadow-panel">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Access not assigned</p>
          <h2 className="mt-2 text-2xl font-black text-pocket-navy">This section is not available for your account.</h2>
          <p className="mt-2 text-sm text-pocket-navy/60">Ask a Super Admin to assign the required permission.</p>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-[1400px] gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8 lg:px-8 lg:py-10">
      <aside className="self-start rounded-xl border border-pocket-navy/10 bg-white p-4 shadow-panel lg:sticky lg:top-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-pocket-orange text-sm font-black text-white">{initials}</div>
          <div>
            <p className="truncate text-sm font-black text-pocket-navy">{username}</p>
            <p className="text-xs text-pocket-navy/60">{roleLabel}</p>
          </div>
          </div>
          <button type="button" aria-label={mobileNavOpen ? "Close admin navigation" : "Open admin navigation"} aria-expanded={mobileNavOpen} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-pocket-navy/10 text-pocket-navy transition hover:bg-pocket-cream lg:hidden" onClick={() => setMobileNavOpen((open) => !open)}>
            {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        <nav className={cn("mt-5 space-y-1.5", !mobileNavOpen && "hidden lg:block")}>
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pocket-orange/40",
                pathname === link.href ? "bg-pocket-orange text-white" : "text-pocket-navy hover:bg-pocket-cream"
              )}
              onClick={() => setMobileNavOpen(false)}
            >
              <link.icon className="h-4 w-4 shrink-0" />
              {link.label}
            </Link>
          ))}
        </nav>
        <div className={cn("mt-6 border-t border-pocket-navy/10 pt-4", !mobileNavOpen && "hidden lg:block")}>
          <Button
            variant="outline"
            className="h-10 w-full justify-start rounded-lg"
            onClick={async () => {
              await logoutAdminSession().catch(() => null);
              router.replace("/admin/login");
            }}
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </aside>
      <div className="min-w-0 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Admin</p>
            <h1 className="break-words text-2xl font-black text-pocket-navy sm:text-3xl">{title}</h1>
            <p className="text-sm text-pocket-navy/70">{description}</p>
          </div>
          {session ? <BranchSwitcher user={session.user} /> : null}
        </div>
        {children}
      </div>
    </div>
  );
}
