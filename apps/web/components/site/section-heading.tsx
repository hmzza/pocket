import type { ReactNode } from "react";

export function SectionHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">{eyebrow}</p>
        <h2 className="text-3xl font-black text-pocket-navy md:text-4xl">{title}</h2>
        {description ? <p className="text-sm leading-6 text-pocket-navy/70 md:text-base">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

