"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { resolvePocketImagePath } from "@/lib/image-paths";

type HeroSliderImage = {
  url: string;
  alt: string;
};

export function HeroSlider({ images, intervalMs = 4500 }: { images: HeroSliderImage[]; intervalMs?: number }) {
  const slides = images.length ? images : [{ url: "/images/pocket-mai-rocket-shawarma.png", alt: "Pocket" }];
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length <= 1) return;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs, slides.length]);

  return (
    <div className="relative min-h-[420px] overflow-hidden rounded-lg border border-pocket-navy/10 bg-pocket-navy shadow-panel">
      {slides.map((slide, index) => (
        <div
          key={`${slide.url}-${index}`}
          className={cn(
            "absolute inset-0 transition-opacity duration-700 ease-out",
            index === activeIndex ? "opacity-100" : "opacity-0"
          )}
        >
          <Image
            src={resolvePocketImagePath(slide.url)}
            alt={slide.alt}
            fill
            className={cn(
              "object-cover transition-transform duration-1000 ease-out",
              index === activeIndex ? "scale-100" : "scale-[1.03]"
            )}
            sizes="(max-width: 1024px) 100vw, 50vw"
            priority={index === 0}
          />
        </div>
      ))}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-pocket-charcoal/35 via-pocket-charcoal/5 to-transparent p-4">
        <p className="rounded-full bg-white/85 px-3 py-1 text-xs font-semibold tracking-[0.25em] text-pocket-navy">
          {String(activeIndex + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}
        </p>
        <div className="flex items-center gap-2">
          {slides.map((slide, index) => (
            <button
              key={`${slide.url}-dot-${index}`}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={cn(
                "h-2.5 rounded-full transition-all",
                index === activeIndex ? "w-8 bg-white" : "w-2.5 bg-white/45 hover:bg-white/70"
              )}
              aria-label={`Show slide ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
