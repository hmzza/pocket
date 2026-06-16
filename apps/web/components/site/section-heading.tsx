import type { ReactNode } from "react";

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  tone = "dark"
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: "dark" | "light";
}) {
  const titleClassName = tone === "light" ? "text-3xl font-black text-pocket-cream md:text-4xl" : "text-3xl font-black text-pocket-navy md:text-4xl";
  const eyebrowClassName = tone === "light" ? "text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange/90" : "text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange";
  const descriptionClassName = tone === "light" ? "text-sm leading-6 text-pocket-cream/80 md:text-base" : "text-sm leading-6 text-pocket-navy/70 md:text-base";

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl space-y-2">
        <p className={eyebrowClassName}>{eyebrow}</p>
        <h2 className={titleClassName}>{title}</h2>
        {description ? <p className={descriptionClassName}>{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

