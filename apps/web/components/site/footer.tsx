import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-pocket-navy/10 bg-pocket-navy text-pocket-cream">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:grid-cols-3 md:px-6">
        <div className="space-y-3">
          <p className="text-2xl font-black tracking-wide">POCKET</p>
          <p className="max-w-sm text-sm text-pocket-cream/80">Real Shawarma, Served The Pocket Way. Built for fast lunches, late cravings, and repeat orders.</p>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-pocket-orange">Quick links</p>
          <div className="flex flex-col gap-2 text-sm">
            <Link href="/menu">Menu</Link>
            <Link href="/cart">Cart</Link>
            <Link href="/orders">Track Order</Link>
            <Link href="/admin/login">Admin Login</Link>
          </div>
        </div>
        <div className="space-y-3 text-sm">
          <p className="font-semibold uppercase tracking-[0.2em] text-pocket-orange">Contact</p>
          <p>Shop #17, Al Ghaffar Mall, G-11 Markaz, Islamabad</p>
          <p>+92-300-POCKET1</p>
          <p>hello@pocketshawarma.com</p>
          <p>@pocket.pakistan</p>
        </div>
      </div>
    </footer>
  );
}

