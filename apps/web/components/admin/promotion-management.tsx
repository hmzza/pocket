"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ChevronDown, Gift } from "lucide-react";
import { createAdminCoupon, fetchAdminCoupons, fetchAdminIndependencePromotion, updateAdminCoupon, updateAdminIndependencePromotion } from "@/lib/admin-client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { AdminCoupon, AdminPromotionData, PosPromotion, PromotionStats } from "@/lib/types";
import { formatCurrency, getCurrentBusinessDateKey } from "@/lib/utils";

const ranges = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "custom", label: "Specific business day" }
] as const;

export function PromotionManagement() {
  const [data, setData] = useState<AdminPromotionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState("");
  const [range, setRange] = useState<(typeof ranges)[number]["value"]>("all");
  const [customDate, setCustomDate] = useState(getCurrentBusinessDateKey());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void fetchAdminIndependencePromotion()
      .then(setData)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load promotion."))
      .finally(() => setLoading(false));
  }, []);

  async function loadStats(nextRange = range) {
    if (!data || nextRange === "all") return;
    try {
      setStatsLoading(true);
      setStatsError("");
      const params = nextRange === "custom"
        ? { preset: nextRange, date: customDate }
        : { preset: nextRange };
      const next = await fetchAdminIndependencePromotion(params);
      setData((current) => current ? { ...current, stats: next.stats } : next);
    } catch (loadError) {
      setStatsError(loadError instanceof Error ? loadError.message : "Could not load promotion statistics.");
    } finally {
      setStatsLoading(false);
    }
  }

  async function togglePromotion() {
    if (!data) return;
    try {
      setSaving(true);
      setError("");
      setMessage("");
      const updated = await updateAdminIndependencePromotion(!data.promotion.isActive);
      setData((current) => current ? { ...current, promotion: updated } : current);
      setMessage(updated.isActive ? "Independence Day Offer is now active." : "Independence Day Offer is now inactive.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update promotion.");
    } finally {
      setSaving(false);
    }
  }

  function changeRange(nextRange: (typeof ranges)[number]["value"]) {
    setRange(nextRange);
    if (nextRange !== "all" && statsOpen) void loadStats(nextRange);
  }

  if (loading) return <Card className="p-6 text-sm text-pocket-navy/60">Loading promotions...</Card>;
  if (!data) return <Card className="p-6 text-sm text-red-700">{error || "Promotion is unavailable."}</Card>;

  const promotion = data.promotion;
  const stats = range === "all" ? data.stats.allTime : data.stats.period;

  return (
    <div className="space-y-6">
      {error ? <Card className="border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</Card> : null}
      {message ? <Card className="border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{message}</Card> : null}
      <Card className="overflow-hidden p-5">
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

        <button type="button" onClick={() => { const next = !statsOpen; setStatsOpen(next); if (next && range !== "all") void loadStats(); }} className="mt-5 flex w-full items-center justify-between border-t border-pocket-navy/10 pt-4 text-left">
          <span><span className="block font-black text-pocket-navy">{statsOpen ? "Hide performance" : "View performance"}</span><span className="mt-1 block text-xs text-pocket-navy/55">{data.stats.allTime.promotionOrders} promotion orders recorded</span></span>
          <ChevronDown className={`h-5 w-5 text-pocket-navy transition-transform ${statsOpen ? "rotate-180" : ""}`} />
        </button>

        {statsOpen ? <PromotionStatsPanel stats={stats} range={range} customDate={customDate} statsLoading={statsLoading} statsError={statsError} onRangeChange={changeRange} onDateChange={setCustomDate} onApplyCustom={() => void loadStats("custom")} /> : null}
      </Card>
      <CouponManagement />
    </div>
  );
}

function CouponManagement() {
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<AdminCoupon["type"]>("PERCENTAGE");
  const [value, setValue] = useState("");
  const [minimum, setMinimum] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  useEffect(() => {
    void fetchAdminCoupons()
      .then(setCoupons)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load coupons."))
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSaving(true);
      setError("");
      const coupon = await createAdminCoupon({
        code: code.trim().toUpperCase(),
        title: title.trim(),
        type,
        value: Number(value),
        ...(minimum ? { minOrderValue: Number(minimum) } : {}),
        ...(usageLimit ? { usageLimit: Number(usageLimit) } : {}),
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
        isActive: true
      });
      setCoupons((current) => [coupon, ...current]);
      setCode("");
      setTitle("");
      setValue("");
      setMinimum("");
      setUsageLimit("");
      setExpiresAt("");
      setMessage("Coupon created for the selected branch.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not create coupon.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(coupon: AdminCoupon) {
    try {
      setError("");
      const updated = await updateAdminCoupon(coupon.id, !coupon.isActive);
      setCoupons((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Could not update coupon.");
    }
  }

  return <Card className="p-5">
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-orange">Coupons</p>
      <h2 className="mt-1 text-2xl font-black text-pocket-navy">Branch coupons</h2>
      <p className="mt-2 text-sm text-pocket-navy/65">Coupons are created for the selected branch. Codes can be reused at another branch.</p>
    </div>
    {error ? <p className="mt-4 whitespace-pre-line text-sm font-semibold text-red-700">{error}</p> : null}
    {message ? <p className="mt-4 text-sm font-semibold text-emerald-700">{message}</p> : null}
    <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Code" minLength={3} required />
      <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" minLength={3} required />
      <select value={type} onChange={(event) => setType(event.target.value as AdminCoupon["type"])} className="h-10 rounded-md border border-pocket-navy/15 bg-white px-3 text-sm text-pocket-navy"><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed amount</option></select>
      <Input value={value} onChange={(event) => setValue(event.target.value)} type="number" min="0.01" step="0.01" placeholder="Value" required />
      <Input value={minimum} onChange={(event) => setMinimum(event.target.value)} type="number" min="0" step="0.01" placeholder="Minimum order (optional)" />
      <Input value={usageLimit} onChange={(event) => setUsageLimit(event.target.value)} type="number" min="1" step="1" placeholder="Usage limit (optional)" />
      <Input value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} type="datetime-local" aria-label="Expiry (optional)" />
      <Button type="submit" disabled={saving}>{saving ? "Adding..." : "Add coupon"}</Button>
    </form>
    <div className="mt-6 space-y-2">
      {loading ? <p className="text-sm text-pocket-navy/60">Loading coupons...</p> : null}
      {!loading && !coupons.length ? <p className="text-sm text-pocket-navy/60">No coupons for this branch yet.</p> : null}
      {coupons.map((coupon) => <div key={coupon.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-pocket-navy/10 bg-pocket-cream/50 p-3">
        <div className="min-w-0"><p className="font-black text-pocket-navy">{coupon.code} <span className="font-normal text-pocket-navy/60">{coupon.title}</span></p><p className="text-xs text-pocket-navy/60">{coupon.type === "PERCENTAGE" ? `${coupon.value}% off` : `Rs ${coupon.value} off`} · Used {coupon.usedCount}{coupon.usageLimit ? ` / ${coupon.usageLimit}` : ""}{coupon.expiresAt ? ` · Expires ${new Date(coupon.expiresAt).toLocaleDateString("en-PK")}` : ""}</p></div>
        <button type="button" onClick={() => void toggle(coupon)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${coupon.isActive ? "bg-emerald-100 text-emerald-800" : "bg-pocket-navy/10 text-pocket-navy/70"}`}>{coupon.isActive ? "Active" : "Inactive"}</button>
      </div>)}
    </div>
  </Card>;
}

function PromotionStatsPanel({ stats, range, customDate, statsLoading, statsError, onRangeChange, onDateChange, onApplyCustom }: {
  stats: PromotionStats;
  range: (typeof ranges)[number]["value"];
  customDate: string;
  statsLoading: boolean;
  statsError: string;
  onRangeChange: (value: (typeof ranges)[number]["value"]) => void;
  onDateChange: (value: string) => void;
  onApplyCustom: () => void;
}) {
  const peak = Math.max(...stats.trend.map((entry) => entry.netRevenue), 1);
  return <div className="mt-4 border-t border-pocket-navy/10 pt-5">
    <div className="flex flex-wrap items-center gap-2">
      {ranges.map((option) => <button key={option.value} type="button" onClick={() => onRangeChange(option.value)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${range === option.value ? "bg-pocket-orange text-white" : "bg-pocket-cream text-pocket-navy/70"}`}>{option.label}</button>)}
    </div>
    {range === "custom" ? <div className="mt-3 flex flex-wrap items-end gap-3"><label className="text-xs font-bold text-pocket-navy/60">Business day<input type="date" value={customDate} onChange={(event) => onDateChange(event.target.value)} className="mt-1 block rounded-md border border-pocket-navy/15 px-2 py-1.5 text-sm text-pocket-navy" /></label><button type="button" onClick={onApplyCustom} className="rounded-md bg-pocket-navy px-3 py-2 text-xs font-bold text-white">Apply</button></div> : null}
    {statsError ? <p className="mt-4 text-sm font-semibold text-red-700">{statsError}</p> : null}
    {statsLoading ? <p className="mt-5 text-sm text-pocket-navy/60">Loading promotion performance...</p> : <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Promotion orders" value={`${stats.promotionOrders} / ${stats.totalOrders}`} helper={`${stats.participationRate.toFixed(1)}% of orders`} />
        <Stat label="Revenue from promotion orders" value={formatCurrency(stats.netRevenue)} helper="After promotion discount" />
        <Stat label="Gross promotion sales" value={formatCurrency(stats.grossSales)} helper="Before discount" />
        <Stat label="Promotion discount" value={formatCurrency(stats.promotionDiscount)} helper={`${stats.discountRate.toFixed(1)}% of gross`} />
        <Stat label="Free Loaded Fries" value={`${stats.freeRewardUnits}`} helper={`Avg discount ${formatCurrency(stats.averageDiscountPerOrder)}`} />
      </div>
      <div className="mt-5 rounded-xl bg-pocket-cream/60 p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-black text-pocket-navy">Promotion revenue trend</p><p className="text-xs text-pocket-navy/55">Daily net revenue for {stats.range.label.toLowerCase()}.</p></div><p className="text-sm font-bold text-pocket-navy">Avg order {formatCurrency(stats.averageOrderValue)}</p></div>{stats.trend.length ? <div className="mt-5 flex min-h-48 items-end gap-2 overflow-x-auto pb-1">{stats.trend.map((entry) => <div key={entry.date} className="flex w-12 shrink-0 flex-col items-center gap-2"><div className="flex h-36 w-full items-end"><div className="w-full rounded-t-md bg-pocket-orange" style={{ height: `${Math.max(8, (entry.netRevenue / peak) * 100)}%` }} title={`${entry.orders} orders · ${formatCurrency(entry.netRevenue)}`} /></div><span className="text-[10px] font-bold text-pocket-navy/55">{entry.label}</span><span className="text-[10px] font-bold text-pocket-navy">{entry.orders}</span></div>)}</div> : <p className="mt-6 text-sm text-pocket-navy/60">No promotion orders in this period.</p>}</div>
    </>}
  </div>;
}

function PromotionDetail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-pocket-cream px-4 py-3"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-pocket-navy/55">{label}</p><p className="mt-1 font-bold text-pocket-navy">{value}</p></div>;
}

function Stat({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <div className="rounded-xl border border-pocket-navy/10 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-pocket-navy/55">{label}</p><p className="mt-2 break-words text-xl font-black text-pocket-navy">{value}</p><p className="mt-1 text-xs text-pocket-navy/55">{helper}</p></div>;
}
