import Image from "next/image";

export function Footer() {
  return (
    <footer className="border-t border-pocket-navy/10 bg-pocket-navy text-pocket-cream">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:grid-cols-3 md:px-6">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-md bg-white">
              <Image src="/icon.png" alt="Pocket logo" width={48} height={48} className="h-full w-full object-contain" />
            </div>
            <p className="text-2xl font-black tracking-wide">POCKET</p>
          </div>
          <p className="max-w-sm text-sm text-pocket-cream/80">Real Shawarma, Served The Pocket Way. Built for fast lunches, late cravings, and repeat orders.</p>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-pocket-orange">Quick links</p>
          <div className="flex flex-col gap-2 text-sm">
            <a href="/menu">Menu</a>
            <a href="/cart">Cart</a>
            <a href="/admin/login">Admin Login</a>
          </div>
        </div>
        <div className="space-y-3 text-sm">
          <p className="font-semibold uppercase tracking-[0.2em] text-pocket-orange">Contact</p>
          <p>Shop #17, Al Ghaffar Mall, G-11 Markaz, Islamabad</p>
          <p>+92 329 5196981</p>
          <p>hello@pocketshawarma.com</p>
          <p>@pocket.pakistan</p>
        </div>
      </div>
    </footer>
  );
}

