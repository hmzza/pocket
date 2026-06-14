import { PosOrderQueue } from "@/components/pos/order-queue";

export default function PosOrdersPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_22%),linear-gradient(135deg,_#111827,_#1f2937_55%,_#0f172a)] px-4 py-6">
      <div className="mx-auto max-w-7xl">
        <PosOrderQueue />
      </div>
    </div>
  );
}
