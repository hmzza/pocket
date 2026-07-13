"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Banknote, Boxes, Building2, LayoutDashboard, LogOut, Package2, Receipt, ShoppingCart, SlidersHorizontal, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchAdminSession, logoutAdminSession } from "@/lib/admin-client";
import { cn } from "@/lib/utils";

const links: Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  disabled?: boolean;
}> = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/products", label: "Products", icon: Boxes },
  { href: "/admin/website", label: "Website Control", icon: SlidersHorizontal },
  { href: "/admin/vendors", label: "Vendors", icon: Building2 },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/inventory", label: "Inventory", icon: Package2 },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/expenses", label: "Expenses", icon: Receipt },
  { href: "/admin/finances", label: "Finances", icon: Banknote }
];

export function AdminShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function validateSession() {
      try {
        const session = await fetchAdminSession();
        if (
          !cancelled &&
          !session.user.canAccessAdmin &&
          !["ADMIN", "SUPER_ADMIN"].includes(session.user.role)
        ) {
          router.replace("/admin/login");
          return;
        }

        if (!cancelled) {
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

  const initial = useMemo(() => title.charAt(0), [title]);

  if (!ready) {
    return <div className="min-h-[60vh]" />;
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
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.disabled ? "#" : link.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition",
                pathname === link.href ? "bg-pocket-orange text-white" : "text-pocket-navy hover:bg-pocket-cream",
                link.disabled && "pointer-events-none opacity-40"
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
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Admin</p>
          <h1 className="text-3xl font-black text-pocket-navy">{title}</h1>
          <p className="text-sm text-pocket-navy/70">{description}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
