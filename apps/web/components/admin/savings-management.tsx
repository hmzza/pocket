"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createAdminSavingsMovement, deleteAdminSavingsMovement, fetchAdminSavings } from "@/lib/admin-client";
import type { AdminSavingsData, MoneySource } from "@/lib/types";
import { formatCurrency, getCurrentBusinessDateKey } from "@/lib/utils";

const sources: Array<{ value: MoneySource; label: string }> = [
  { value: "CASH", label: "Cash" },
  { value: "EASYPAISA", label: "Easypaisa" },
  { value: "JAZZCASH", label: "JazzCash" }
];

function sourceLabel(source: MoneySource) {
  return sources.find((item) => item.value === source)?.label ?? source;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeZone: "Asia/Karachi" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(new Date(value));
}

function SavingsCard({ source, value }: { source: MoneySource; value: number }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-orange">{sourceLabel(source)} savings</p>
      <p className="mt-3 text-2xl font-black text-pocket-navy">{formatCurrency(value)}</p>
      <p className="mt-2 text-sm text-pocket-navy/60">Current reserve held from this account.</p>
    </Card>
  );
}

export function SavingsManagement() {
  const [data, setData] = useState<AdminSavingsData | null>(null);
  const [date, setDate] = useState(getCurrentBusinessDateKey());
  const [addSource, setAddSource] = useState<MoneySource>("CASH");
  const [releaseSource, setReleaseSource] = useState<MoneySource>("CASH");
  const [addAmount, setAddAmount] = useState("");
  const [releaseAmount, setReleaseAmount] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");
      setData(await fetchAdminSavings());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load savings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveMovement(type: "ADD" | "RELEASE") {
    const amountText = type === "ADD" ? addAmount : releaseAmount;
    const source = type === "ADD" ? addSource : releaseSource;
    const amount = Number(amountText);
    if (!date || !Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid amount and business date.");
      return;
    }
    if (type === "RELEASE" && amount > (data?.balances[releaseSource] ?? 0)) {
      setError(`Release cannot exceed ${sourceLabel(releaseSource)} savings balance.`);
      return;
    }
    try {
      setSaving(true);
      setError("");
      await createAdminSavingsMovement({ type, amount, source, businessDate: date });
      if (type === "ADD") setAddAmount("");
      else setReleaseAmount("");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : `Could not record ${type === "ADD" ? "savings" : "savings release"}.`);
    } finally {
      setSaving(false);
    }
  }

  async function removeMovement(id: string) {
    if (!window.confirm("Delete this savings movement?")) return;
    try {
      setDeletingId(id);
      setError("");
      await deleteAdminSavingsMovement(id);
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete savings movement.");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div className="space-y-6">
      {error ? <pre className="whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 p-3 font-sans text-sm font-semibold text-red-700">{error}</pre> : null}

      <div className="grid gap-4 md:grid-cols-3">
        {sources.map((source) => <SavingsCard key={source.value} source={source.value} value={data?.balances[source.value] ?? 0} />)}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <p className="text-lg font-black text-pocket-navy">Add Savings</p>
          <p className="mt-1 text-sm text-pocket-navy/60">Move money from a wallet account into its savings reserve.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-semibold text-pocket-navy">Business day<Input className="mt-1" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
            <label className="text-sm font-semibold text-pocket-navy">Amount<Input className="mt-1" type="number" min="0" step="0.01" value={addAmount} onChange={(event) => setAddAmount(event.target.value)} placeholder="0" /></label>
            <label className="text-sm font-semibold text-pocket-navy">Payment source<select className="mt-1 h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm" value={addSource} onChange={(event) => setAddSource(event.target.value as MoneySource)}>{sources.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}</select></label>
          </div>
          <div className="mt-4 flex justify-end"><Button onClick={() => void saveMovement("ADD")} disabled={saving}>{saving ? "Saving..." : "Add Savings"}</Button></div>
        </Card>

        <Card className="p-5">
          <p className="text-lg font-black text-pocket-navy">Release Savings</p>
          <p className="mt-1 text-sm text-pocket-navy/60">Return saved money to the selected wallet account.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-semibold text-pocket-navy">Business day<Input className="mt-1" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
            <label className="text-sm font-semibold text-pocket-navy">Amount<Input className="mt-1" type="number" min="0" step="0.01" value={releaseAmount} onChange={(event) => setReleaseAmount(event.target.value)} placeholder="0" /></label>
            <label className="text-sm font-semibold text-pocket-navy">Payment source<select className="mt-1 h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm" value={releaseSource} onChange={(event) => setReleaseSource(event.target.value as MoneySource)}>{sources.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}</select></label>
          </div>
          <p className="mt-3 text-xs text-pocket-navy/55">Available {sourceLabel(releaseSource)} savings: {formatCurrency(data?.balances[releaseSource] ?? 0)}</p>
          <div className="mt-4 flex justify-end"><Button variant="outline" onClick={() => void saveMovement("RELEASE")} disabled={saving}>{saving ? "Saving..." : "Release Savings"}</Button></div>
        </Card>
      </div>

      <Card className="p-5">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setHistoryOpen((value) => !value)} aria-expanded={historyOpen}>
          <span><span className="block text-lg font-black text-pocket-navy">Savings history</span><span className="block text-sm text-pocket-navy/60">{data?.movements.length ?? 0} recorded movement{(data?.movements.length ?? 0) === 1 ? "" : "s"}</span></span>
          <span className="grid h-9 w-9 place-items-center rounded-md border border-pocket-navy/10 text-pocket-navy">{historyOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
        </button>
        {historyOpen ? <div className="mt-4 space-y-2">
          {loading ? <p className="text-sm text-pocket-navy/60">Loading savings...</p> : null}
          {!loading && !data?.movements.length ? <p className="text-sm text-pocket-navy/60">No savings movements recorded.</p> : null}
          {data?.movements.map((movement) => (
            <div key={movement.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${movement.type === "ADD" ? "border-amber-200 bg-amber-50/60" : "border-emerald-200 bg-emerald-50/60"}`}>
              <div>
                <p className="font-bold text-pocket-navy"><span className={`mr-2 rounded-full px-2 py-1 text-[10px] uppercase tracking-wide ${movement.type === "ADD" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{movement.type === "ADD" ? "Savings added" : "Savings released"}</span>{formatCurrency(movement.amount)} · {sourceLabel(movement.source)}</p>
                <p className="text-sm text-pocket-navy/55">Business day {formatDate(movement.businessDate)} · Logged {formatDateTime(movement.createdAt)}{movement.createdByName ? ` · ${movement.createdByName}` : ""}</p>
              </div>
              <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => void removeMovement(movement.id)} disabled={deletingId === movement.id}><Trash2 className="h-4 w-4" />Delete</Button>
            </div>
          ))}
        </div> : null}
      </Card>
    </div>
  );
}
