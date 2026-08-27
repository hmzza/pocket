import Link from "next/link";
import { ArrowRight, Clock3, ShieldCheck, Star, Truck } from "lucide-react";
import { ProductCard } from "@/components/site/product-card";
import { HeroSlider } from "@/components/site/hero-slider";
import { ReviewPrompt } from "@/components/site/review-prompt";
import { DeliveryUnavailableNotice } from "@/components/site/delivery-unavailable-notice";
import { SectionHeading } from "@/components/site/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getHomeData, getProducts } from "@/lib/api";
import { getMealProductForShawarma, isMealProduct } from "@/lib/meal-products";

export default async function HomePage({ searchParams }: { searchParams: { branch?: string } }) {
  const [data, products] = await Promise.all([getHomeData(searchParams.branch), getProducts(searchParams.branch)]);
  const branchQuery = data.branch?.slug ? `?branch=${encodeURIComponent(data.branch.slug)}` : "";
  const testimonials = [...data.customerReviews, ...data.testimonials].slice(0, 6);

  return (
    <>
      <DeliveryUnavailableNotice initialDeliveryEnabled={data.deliveryEnabled ?? true} />
      <section className="border-b border-pocket-navy/10 bg-[linear-gradient(180deg,_rgba(245,240,229,0.85),_rgba(255,252,247,1))]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-20">
          <div className="space-y-8">
            <div className="space-y-4">
              <Badge>{data.hero.eyebrow}</Badge>
              <h1 className="max-w-3xl text-5xl font-black leading-none text-pocket-navy md:text-7xl">{data.hero.headline}</h1>
              <p className="max-w-2xl text-xl font-semibold text-pocket-orange md:text-2xl">{data.hero.subheadline}</p>
              <p className="max-w-xl text-base leading-7 text-pocket-navy/75 md:text-lg">{data.hero.description}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={`/menu${branchQuery}`}>
                <Button size="lg">
                  Order Now
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href={`/menu${branchQuery}`}>
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
                <p className="mt-3 text-sm font-bold text-pocket-navy">Direct delivery from {data.branch.name}</p>
              </div>
              <div className="rounded-lg border border-pocket-navy/10 bg-white p-4">
                <ShieldCheck className="h-5 w-5 text-pocket-orange" />
                <p className="mt-3 text-sm font-bold text-pocket-navy">Fresh daily prep</p>
              </div>
            </div>
          </div>
          <HeroSlider images={data.heroImages ?? []} intervalMs={data.heroSliderIntervalMs} />
        </div>
      </section>

      <section className="bg-pocket-navy/5 py-14">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading eyebrow="Featured" title="Pocket's front line" description="Top sellers built for fast decisions and repeat orders." />
          <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {data.featured.filter((product) => !isMealProduct(product)).map((product) => (
              <ProductCard key={product.id} product={product} mealProduct={getMealProductForShawarma(product, products)} branchSlug={data.branch.slug} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white/75 py-14">
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

      <section className="bg-pocket-cream/70 py-14">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading eyebrow="Best Sellers" title="Most ordered right now" description="Menu leaders across shawarma, fries, shakes, and drinks." />
          <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {data.bestSellers.filter((product) => !isMealProduct(product)).map((product) => (
              <ProductCard key={product.id} product={product} mealProduct={getMealProductForShawarma(product, products)} branchSlug={data.branch.slug} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white/75 py-14">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading
            eyebrow="Testimonials"
            title="What customers keep coming back for"
            description="Pocket is built around speed, taste, and a brand that actually feels current."
            action={<ReviewPrompt />}
          />
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {testimonials.map((item: { author: string; body: string; rating: number }, index: number) => (
              <div key={`${item.author}-${index}`} className="border-t-4 border-pocket-orange bg-pocket-cream p-6">
                <div className="flex gap-0.5 text-pocket-orange" aria-label={`${item.rating} out of 5 stars`}>
                  {Array.from({ length: 5 }, (_, star) => <Star key={star} className={`h-4 w-4 ${star < item.rating ? "fill-current" : "text-pocket-navy/15"}`} />)}
                </div>
                <p className="text-base leading-7">"{item.body}"</p>
                <p className="mt-4 text-sm font-semibold uppercase tracking-[0.25em] text-pocket-orange">{item.author}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
