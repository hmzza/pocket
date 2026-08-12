"use client";

import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { fetchAdminIndependencePromotion, updateAdminIndependencePromotion } from "@/lib/admin-client";
import { Card } from "@/components/ui/card";
import type { PosPromotion } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export function PromotionManagement() {
  const [promotion, setPromotion] = useState<PosPromotion | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void fetchAdminIndependencePromotion()
      .then(setPromotion)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load promotion."))
      .finally(() => setLoading(false));
  }, []);

  async function togglePromotion() {
    if (!promotion) return;
    try {
      setSaving(true);
      setError("");
      setMessage("");
      const updated = await updateAdminIndependencePromotion(!promotion.isActive);
      setPromotion(updated);
      setMessage(updated.isActive ? "Independence Day Offer is now active." : "Independence Day Offer is now inactive.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update promotion.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Card className="p-6 text-sm text-pocket-navy/60">Loading promotions...</Card>;
  if (!promotion) return <Card className="p-6 text-sm text-red-700">{error || "Promotion is unavailable."}</Card>;

  return (
    <div className="space-y-6">
      {error ? <Card className="border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</Card> : null}
      {message ? <Card className="border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{message}</Card> : null}
      <Card className="p-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-pocket-cream text-pocket-orange"><Gift className="h-5 w-5" /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-orange">Promotion</p>
              <h2 className="mt-1 text-2xl font-black text-pocket-navy">{promotion.name}</h2>
              <p className="mt-2 text-sm text-pocket-navy/65">Buy any 3 Shawarmas and get 1 Loaded Fries free.</p>
            </div>
          </div>
          <button type="button" onClick={() => void togglePromotion()} disabled={saving} className={`relative h-7 w-12 shrink-0 rounded-full transition ${promotion.isActive ? "bg-pocket-orange" : "bg-pocket-navy/20"}`} aria-label={`${promotion.isActive ? "Deactivate" : "Activate"} ${promotion.name}`}>
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${promotion.isActive ? "left-6" : "left-1"}`} />
          </button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <PromotionDetail label="Status" value={promotion.isActive ? "Active" : "Inactive"} />
          <PromotionDetail label="Eligible items" value="Shawarma category" />
          <PromotionDetail label="Reward" value="Loaded Fries" />
          <PromotionDetail label="Channels" value="Dine-in and Takeaway" />
        </div>
        <p className="mt-4 text-sm text-pocket-navy/60">Current branch Loaded Fries price: {promotion.rewardUnitPrice == null ? "Unavailable" : formatCurrency(promotion.rewardUnitPrice)}. {promotion.available ? "" : promotion.unavailableReason}</p>
      </Card>
    </div>
  );
}

function PromotionDetail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-pocket-cream px-4 py-3"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-pocket-navy/55">{label}</p><p className="mt-1 font-bold text-pocket-navy">{value}</p></div>;
}
