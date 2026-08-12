"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Activity, Banknote, BarChart3, Bike, Boxes, ChartNoAxesCombined, HandCoins, History, LayoutDashboard, LogOut, Package2, Receipt, ShoppingCart, SlidersHorizontal, Users } from "lucide-react";
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

  const initial = useMemo(() => title.charAt(0), [title]);

  if (!ready) {
    return <div className="min-h-[60vh]" />;
  }

  if (restrictedForStaff) {
    return (
      <div className="grid min-h-[60vh] place-items-center rounded-lg border border-pocket-navy/10 bg-white p-8 text-center shadow-panel">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Access not assigned</p>
          <h2 className="mt-2 text-2xl font-black text-pocket-navy">This section is not available for your account.</h2>
          <p className="mt-2 text-sm text-pocket-navy/60">Ask a Super Admin to assign the required permission.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="rounded-lg border border-pocket-navy/10 bg-white p-4 shadow-panel">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-md bg-pocket-orange text-sm font-black text-white">{initial}</div>
          <div>
            <p className="text-sm font-black text-pocket-navy">Pocket Admin</p>
            <p className="text-xs text-pocket-navy/60">Operations console</p>
          </div>
        </div>
        <nav className="space-y-2">
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition",
                pathname === link.href ? "bg-pocket-orange text-white" : "text-pocket-navy hover:bg-pocket-cream"
              )}
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 border-t border-pocket-navy/10 pt-4">
          <Button
            variant="outline"
            className="w-full justify-start"
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
            <h1 className="text-3xl font-black text-pocket-navy">{title}</h1>
            <p className="text-sm text-pocket-navy/70">{description}</p>
          </div>
          {session ? <BranchSwitcher user={session.user} /> : null}
        </div>
        {children}
      </div>
    </div>
  );
}
