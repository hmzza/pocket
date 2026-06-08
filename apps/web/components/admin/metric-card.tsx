import { Card } from "@/components/ui/card";

export function MetricCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">{label}</p>
      <p className="mt-3 text-3xl font-black text-pocket-navy">{value}</p>
      <p className="mt-2 text-sm text-pocket-navy/60">{helper}</p>
    </Card>
  );
}

