import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Clock3, MapPin, ShieldCheck, Truck } from "lucide-react";
import { ProductCard } from "@/components/site/product-card";
import { SectionHeading } from "@/components/site/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getHomeData } from "@/lib/api";

export default async function HomePage() {
  const data = await getHomeData();

  return (
    <>
      <section className="border-b border-pocket-navy/10">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-20">
          <div className="space-y-8">
            <div className="space-y-4">
              <Badge>{data.hero.eyebrow}</Badge>
              <h1 className="max-w-3xl text-5xl font-black leading-none text-pocket-navy md:text-7xl">{data.hero.headline}</h1>
              <p className="max-w-2xl text-xl font-semibold text-pocket-orange md:text-2xl">{data.hero.subheadline}</p>
              <p className="max-w-xl text-base leading-7 text-pocket-navy/75 md:text-lg">{data.hero.description}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/menu">
                <Button size="lg">
                  Order Now
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/menu">
                <Button variant="outline" size="lg">
                  View Menu
                </Button>
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-pocket-navy/10 bg-white p-4">
                <Clock3 className="h-5 w-5 text-pocket-orange" />
                <p className="mt-3 text-sm font-bold text-pocket-navy">12-20 min prep</p>
              </div>
              <div className="rounded-lg border border-pocket-navy/10 bg-white p-4">
                <Truck className="h-5 w-5 text-pocket-orange" />
                <p className="mt-3 text-sm font-bold text-pocket-navy">Delivery ready</p>
              </div>
              <div className="rounded-lg border border-pocket-navy/10 bg-white p-4">
                <ShieldCheck className="h-5 w-5 text-pocket-orange" />
                <p className="mt-3 text-sm font-bold text-pocket-navy">Fresh daily prep</p>
              </div>
            </div>
          </div>
          <div className="relative min-h-[420px] overflow-hidden rounded-lg border border-pocket-navy/10 bg-pocket-navy shadow-panel">
            <Image src="/images/hero-pocket.svg" alt="Pocket hero graphic" fill className="object-cover" priority sizes="(max-width: 1024px) 100vw, 50vw" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 md:px-6">
        <SectionHeading eyebrow="Featured" title="Pocket's front line" description="Top sellers built for fast decisions and repeat orders." />
        <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {data.featured.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="bg-white/70 py-14">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading eyebrow="Why Pocket" title="Fast food startup energy, restaurant discipline" />
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {data.whyPocket.map((item: { title: string; description: string }) => (
              <div key={item.title} className="border-t-4 border-pocket-orange bg-pocket-cream p-6">
                <h3 className="text-2xl font-black text-pocket-navy">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-pocket-navy/75">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 md:px-6">
        <SectionHeading eyebrow="Best Sellers" title="Most ordered right now" description="Menu leaders across wraps, fries, and combo stacks." />
        <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {data.bestSellers.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="border-y border-pocket-navy/10 bg-pocket-navy py-14 text-pocket-cream">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading
            eyebrow="Testimonials"
            title="What customers keep coming back for"
            description="Pocket is built around speed, taste, and a brand that actually feels current."
          />
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {data.testimonials.map((item: { author: string; body: string; rating: number }) => (
              <div key={item.author} className="border border-white/10 bg-white/5 p-6">
                <p className="text-base leading-7">"{item.body}"</p>
                <p className="mt-4 text-sm font-semibold uppercase tracking-[0.25em] text-pocket-orange">{item.author}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:px-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Contact</p>
          <h2 className="text-3xl font-black text-pocket-navy">Islamabad branch live</h2>
          <div className="space-y-3 text-sm leading-6 text-pocket-navy/70">
            <p className="inline-flex items-start gap-2">
              <MapPin className="mt-1 h-4 w-4 shrink-0 text-pocket-orange" />
              {data.branch.addressLine1}, {data.branch.city}
            </p>
            <p>{data.contact.value.phone}</p>
            <p>{data.contact.value.email}</p>
            <p>{data.contact.value.instagram}</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-pocket-navy/10 bg-white shadow-panel">
          <Image src="/images/brand-grid.svg" alt="Pocket brand collage" width={1400} height={900} className="h-full w-full object-cover" />
        </div>
      </section>
    </>
  );
}
