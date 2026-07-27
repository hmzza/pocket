import { Card } from "@/components/ui/card";

export function MetricCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <Card className="min-w-0 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">{label}</p>
      <p className="mt-3 min-w-0 break-words text-[clamp(1rem,1.6vw,1.625rem)] font-black leading-tight tracking-tight text-pocket-navy">{value}</p>
      <p className="mt-2 break-words text-sm text-pocket-navy/60">{helper}</p>
    </Card>
  );
}
