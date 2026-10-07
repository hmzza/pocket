"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, RefreshCcw, Save, ToggleLeft, ToggleRight, Truck } from "lucide-react";
import { AdminToast } from "@/components/admin/admin-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchAdminDeliveryConfig, fetchAdminRiderPayments, createAdminDeliverySector, updateAdminDeliverySector, updateAdminDeliveryTimings, updateAdminDeliveryToggle } from "@/lib/admin-client";
import type { DeliveryConfig, DeliverySector, RiderPaymentReport } from "@/lib/types";
import { formatCurrency, getCurrentBusinessDateKey } from "@/lib/utils";

function formatTime(value: string | null) {
  if (!value) return "Not set";
  const [hour, minute] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("en-PK", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(2020, 0, 1, hour, minute));
}

function currentPakistanTime() {
  return new Intl.DateTimeFormat("en-PK", { timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short" }).format(new Date());
}

export function DeliveryConfiguration() {
  const [config, setConfig] = useState<DeliveryConfig | null>(null);
  const [report, setReport] = useState<RiderPaymentReport | null>(null);
  const [businessDate, setBusinessDate] = useState(getCurrentBusinessDateKey());
  const [openTime, setOpenTime] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [sectorName, setSectorName] = useState("");
  const [sectorFee, setSectorFee] = useState("");
  const [editingSectorId, setEditingSectorId] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = async (date = businessDate) => {
    setLoading(true);
    setError("");
    try {
      const [nextConfig, nextReport] = await Promise.all([fetchAdminDeliveryConfig(), fetchAdminRiderPayments(date)]);
      setConfig(nextConfig);
      setOpenTime(nextConfig.openTime ?? "");
      setCloseTime(nextConfig.closeTime ?? "");
      setReport(nextReport);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load delivery configuration.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const sectors = useMemo(() => config?.sectors ?? [], [config]);

  async function toggleDelivery() {
    if (!config) return;
    setSaving(true);
    try {
      setConfig(await updateAdminDeliveryToggle(!config.deliveryEnabled));
      setNotice("Delivery availability updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update delivery availability.");
    } finally { setSaving(false); }
  }

  async function saveTimings(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const next = await updateAdminDeliveryTimings({ openTime: openTime || null, closeTime: closeTime || null });
      setConfig(next);
      setNotice(openTime && closeTime ? "Delivery timings saved." : "Delivery timings cleared.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save delivery timings.");
    } finally { setSaving(false); }
  }

  async function clearTimings() {
    setSaving(true);
    try {
      const next = await updateAdminDeliveryTimings({ openTime: null, closeTime: null });
      setOpenTime("");
      setCloseTime("");
      setConfig(next);
      setNotice("Delivery timings cleared.");
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Unable to clear delivery timings.");
    } finally { setSaving(false); }
  }

  async function saveSector(event: React.FormEvent) {
    event.preventDefault();
    const fee = Number(sectorFee);
    if (!sectorName.trim() || !Number.isFinite(fee) || fee < 0) { setError("Enter a sector name and a valid delivery fee."); return; }
    setSaving(true);
    try {
      if (editingSectorId) {
        await updateAdminDeliverySector(editingSectorId, { name: sectorName.trim(), deliveryFee: fee });
      } else {
        await createAdminDeliverySector({ name: sectorName.trim(), deliveryFee: fee, isActive: true });
      }
      setEditingSectorId(""); setSectorName(""); setSectorFee(""); await load(); setNotice("Delivery sector saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save delivery sector.");
    } finally { setSaving(false); }
  }

  async function toggleSector(sector: DeliverySector) {
    try { await updateAdminDeliverySector(sector.id, { isActive: !sector.isActive }); await load(); }
    catch (toggleError) { setError(toggleError instanceof Error ? toggleError.message : "Unable to update sector."); }
  }

  return <div className="space-y-6">
    {notice ? <AdminToast message={notice} variant="success" onClose={() => setNotice("")} className="top-4" /> : null}
    {error ? <AdminToast message={error} variant="error" onClose={() => setError("")} className="top-20" /> : null}
    <Card className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-pocket-orange/10 text-pocket-orange"><Truck className="h-5 w-5" /></div><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-orange">Website delivery</p><h2 className="mt-1 text-2xl font-black text-pocket-navy">{config?.deliveryEnabled ? "Open" : "Closed"}</h2><p className="mt-1 text-sm text-pocket-navy/65">Current Pakistan time: {currentPakistanTime()}</p>{config?.message ? <p className="mt-2 max-w-xl text-sm text-rose-700">{config.message}</p> : null}</div></div>
        <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => void toggleDelivery()} disabled={loading || saving || Boolean(config?.scheduleConfigured && !config.isWithinSchedule)}>{config?.scheduleConfigured && !config.isWithinSchedule ? "Outside schedule" : config?.deliveryEnabled ? "Turn delivery off" : "Turn delivery on"}</Button><Button type="button" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCcw className="h-4 w-4" />Refresh</Button></div>
      </div>
      <form onSubmit={(event) => void saveTimings(event)} className="mt-5 grid gap-3 rounded-2xl border border-pocket-navy/10 bg-pocket-cream/45 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end"><label className="space-y-1 text-sm font-semibold text-pocket-navy">Opens daily<Input type="time" value={openTime} onChange={(event) => setOpenTime(event.target.value)} /></label><label className="space-y-1 text-sm font-semibold text-pocket-navy">Closes daily<Input type="time" value={closeTime} onChange={(event) => setCloseTime(event.target.value)} /></label><div className="flex gap-2"><Button type="submit" disabled={saving}><Save className="h-4 w-4" />{config?.scheduleConfigured ? "Update timings" : "Set timings"}</Button><Button type="button" variant="ghost" onClick={() => void clearTimings()} disabled={saving}>Clear timings</Button></div></form>
      <p className="mt-3 text-xs text-pocket-navy/55">{config?.scheduleConfigured ? `Automatic window: ${formatTime(config.openTime)} to ${formatTime(config.closeTime)}. Next transition: ${config.nextTransitionAt ? new Date(config.nextTransitionAt).toLocaleString("en-PK", { timeZone: "Asia/Karachi" }) : "none"}.` : "No schedule configured. The manual toggle controls website delivery."}</p>
    </Card>

    <Card className="p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><h2 className="text-xl font-black text-pocket-navy">Delivery sectors</h2><p className="text-sm text-pocket-navy/60">Active sectors are available for website and POS delivery orders.</p></div><form onSubmit={(event) => void saveSector(event)} className="grid w-full gap-2 sm:grid-cols-[1fr_150px_auto] xl:max-w-2xl"><Input value={sectorName} onChange={(event) => setSectorName(event.target.value)} placeholder="Sector name" /><Input type="number" min="0" step="1" value={sectorFee} onChange={(event) => setSectorFee(event.target.value)} placeholder="Fee" /><Button type="submit" disabled={saving}>{editingSectorId ? "Save" : <><Plus className="h-4 w-4" />Add</>}</Button></form></div><div className="mt-5 divide-y divide-pocket-navy/10">{sectors.map((sector) => <div key={sector.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-pocket-navy">{sector.name} <span className="ml-2 text-sm font-semibold text-pocket-navy/55">{formatCurrency(sector.deliveryFee)}</span></p><p className="text-xs text-pocket-navy/55">{sector.subsectors.join(" · ")}</p></div><div className="flex items-center gap-2"><Button type="button" variant="ghost" size="icon" onClick={() => { setEditingSectorId(sector.id); setSectorName(sector.name); setSectorFee(String(sector.deliveryFee)); }} aria-label={`Edit ${sector.name}`}><Pencil className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" onClick={() => void toggleSector(sector)} aria-label={`${sector.isActive ? "Disable" : "Enable"} ${sector.name}`}>{sector.isActive ? <ToggleRight className="h-5 w-5 text-emerald-600" /> : <ToggleLeft className="h-5 w-5 text-slate-400" />}</Button></div></div>)}{!sectors.length ? <p className="py-6 text-sm text-pocket-navy/60">No sectors configured.</p> : null}</div></Card>

    <Card className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-black text-pocket-navy">Rider delivery fees</h2><p className="text-sm text-pocket-navy/60">Dispatched delivery orders for the selected Pakistan business day.</p></div><div className="flex gap-2"><Input type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} /><Button type="button" variant="outline" onClick={() => void load(businessDate)}><RefreshCcw className="h-4 w-4" />Refresh</Button></div></div><div className="mt-5 grid gap-4 lg:grid-cols-2">{report?.riders.map((rider) => <div key={rider.riderId ?? rider.riderName} className="rounded-2xl border border-pocket-navy/10 bg-pocket-cream/35 p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-black text-pocket-navy">{rider.riderName}</p><p className="text-sm text-pocket-navy/60">{rider.deliveryCount} deliveries</p></div><p className="text-xl font-black text-pocket-navy">{formatCurrency(rider.totalFee)}</p></div><div className="mt-3 space-y-2">{rider.sectors.map((sector) => <div key={sector.name} className="flex justify-between text-sm"><span className="text-pocket-navy/70">{sector.name} · {sector.deliveryCount}</span><span className="font-semibold text-pocket-navy">{formatCurrency(sector.totalFee)}</span></div>)}</div></div>)}{!report?.riders.length ? <p className="py-8 text-sm text-pocket-navy/60">No dispatched rider deliveries for this business day.</p> : null}</div></Card>
  </div>;
}
