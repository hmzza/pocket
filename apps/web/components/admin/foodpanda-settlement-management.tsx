"use client";

import { useEffect, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fetchAdminFoodpandaSettlements, ignoreAdminFoodpandaSettlement, receiveAdminFoodpandaSettlement } from "@/lib/admin-client";
import type { AdminFoodpandaSettlementData, MoneySource } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

type Period = "week" | "month" | "year";
const sourceOptions: Array<{ value: MoneySource; label: string }> = [{ value: "CASH", label: "Cash" }, { value: "EASYPAISA", label: "Easypaisa" }, { value: "JAZZCASH", label: "JazzCash" }];
const dateFormatter = new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeZone: "Asia/Karachi" });

export function FoodpandaSettlementManagement() {
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<AdminFoodpandaSettlementData | null>(null);
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState<MoneySource>("CASH");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load(nextPeriod = period) {
    try { setLoading(true); setError(""); setData(await fetchAdminFoodpandaSettlements(nextPeriod)); } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Could not load settlements."); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function receive() {
    if (!data?.nextPending) return;
    try {
      setSaving(true); setError("");
      await receiveAdminFoodpandaSettlement({ period, weekStart: data.nextPending.weekStart, amountReceived: Number(amount), receivedSource: source, transferReference: reference, notes });
      setAmount(""); setReference(""); setNotes(""); await load();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Could not save settlement."); } finally { setSaving(false); }
  }

  async function removeOldCycle(weekStart: string) {
    if (!window.confirm("Remove this old payout week from the tracker? You can add a settlement manually later if needed.")) return;
    try {
      setSaving(true); setError("");
      await ignoreAdminFoodpandaSettlement(weekStart);
      await load();
    } catch (removeError) { setError(removeError instanceof Error ? removeError.message : "Could not remove payout week."); } finally { setSaving(false); }
  }

  return <div className="space-y-6">
    <Card className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-lg font-black text-pocket-navy">Foodpanda settlement tracker</p><p className="text-sm text-pocket-navy/60">Orders are grouped Monday–Sunday. They remain receivables until you record the payout.</p></div><Button variant="outline" onClick={() => void load()}><RefreshCcw className="h-4 w-4" />Refresh</Button></div><div className="mt-4 flex flex-wrap gap-2">{(["week", "month", "year"] as Period[]).map((value) => <Button key={value} variant={period === value ? "default" : "outline"} onClick={() => { setPeriod(value); void load(value); }}>{value === "week" ? "Week" : value === "month" ? "Month" : "Year"}</Button>)}</div></Card>
    {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
    {loading || !data ? <Card className="p-6 text-sm text-pocket-navy/60">Loading settlements...</Card> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Summary label="Pending receivables" value={data.summary.pendingReceivables} /><Summary label="Expected this week" value={data.summary.expectedThisWeek} /><Summary label="Total received" value={data.summary.totalReceived} /><Summary label="Outstanding" value={data.summary.outstandingAmount} /><Summary label="Last settlement" value={data.summary.lastSettlementDate ? dateFormatter.format(new Date(data.summary.lastSettlementDate)) : "—"} text /></div>
      {data.nextPending ? <Card className="p-5"><p className="text-lg font-black text-pocket-navy">Receive settlement</p><p className="text-sm text-pocket-navy/60">Next unsettled week: {dateFormatter.format(new Date(data.nextPending.weekStart))} – {dateFormatter.format(new Date(data.nextPending.weekEnd))}. Expected {formatCurrency(data.nextPending.expectedNet)}.</p><div className="mt-4 grid gap-3 md:grid-cols-4"><Input type="number" min="0" step="0.01" placeholder="Amount received" value={amount} onChange={(event) => setAmount(event.target.value)} /><select className="h-11 rounded-md border border-pocket-navy/15 bg-white px-3 text-sm" value={source} onChange={(event) => setSource(event.target.value as MoneySource)}>{sourceOptions.map((option) => <option key={option.value} value={option.value}>Received into {option.label}</option>)}</select><Input placeholder="Transfer reference (optional)" value={reference} onChange={(event) => setReference(event.target.value)} /><Button onClick={() => void receive()} disabled={saving}>{saving ? "Saving..." : "Receive settlement"}</Button></div><Textarea className="mt-3" placeholder="Notes (optional)" value={notes} onChange={(event) => setNotes(event.target.value)} /></Card> : <Card className="p-5 text-sm text-emerald-700">No pending settlement in this period.</Card>}
      <Card className="overflow-hidden"><div className="border-b border-pocket-navy/10 p-5"><p className="text-lg font-black text-pocket-navy">Payout cycles</p><p className="text-sm text-pocket-navy/60">{data.range.label}: {dateFormatter.format(new Date(data.range.start))} – {dateFormatter.format(new Date(data.range.end))}</p></div><div className="overflow-x-auto"><table className="w-full min-w-[1020px] text-left text-sm"><thead className="bg-pocket-cream text-xs uppercase tracking-wide text-pocket-navy/55"><tr>{["Week", "Orders", "Gross sales", "Commission", "Other charges", "Expected net", "Status", "Action"].map((heading) => <th key={heading} className="px-5 py-3">{heading}</th>)}</tr></thead><tbody>{data.cycles.map((cycle) => { const isOld = new Date(cycle.weekEnd).getTime() < Date.now(); return <tr key={`${cycle.weekStart}-${cycle.weekEnd}`} className="border-t border-pocket-navy/10"><td className="px-5 py-4 font-semibold text-pocket-navy">{dateFormatter.format(new Date(cycle.weekStart))} – {dateFormatter.format(new Date(cycle.weekEnd))}</td><td className="px-5 py-4 text-pocket-navy/70">{cycle.totalOrders}</td><td className="px-5 py-4 font-semibold text-pocket-navy">{formatCurrency(cycle.grossSales)}</td><td className="px-5 py-4 text-red-700">{formatCurrency(cycle.commission)}</td><td className="px-5 py-4 text-pocket-navy/70">{formatCurrency(cycle.otherCharges)}</td><td className="px-5 py-4 font-black text-pocket-navy">{formatCurrency(cycle.expectedNet)}</td><td className="px-5 py-4"><span className={cycle.status === "RECEIVED" ? "font-bold text-emerald-700" : "font-bold text-pocket-orange"}>{cycle.status === "RECEIVED" ? `Received${cycle.amountReceived != null ? ` · ${formatCurrency(cycle.amountReceived)}` : ""}` : "Pending"}</span></td><td className="px-5 py-4">{isOld ? <Button size="sm" variant="outline" onClick={() => void removeOldCycle(cycle.weekStart)} disabled={saving}>Remove</Button> : <span className="text-pocket-navy/40">—</span>}</td></tr>; })}{!data.cycles.length ? <tr><td colSpan={8} className="px-5 py-8 text-center text-pocket-navy/60">No Foodpanda orders in this period.</td></tr> : null}</tbody></table></div></Card>
    </>}
  </div>;
}

function Summary({ label, value, text = false }: { label: string; value: number | string; text?: boolean }) { return <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-pocket-orange">{label}</p><p className={`mt-3 break-words font-black leading-tight text-pocket-navy ${text ? "text-lg" : "text-2xl"}`}>{typeof value === "number" ? formatCurrency(value) : value}</p></Card>; }
