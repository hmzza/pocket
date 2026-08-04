"use client";

import { useEffect, useMemo, useState } from "react";
import { Printer, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fetchAdminDailyClosing, fetchAdminInventory, saveAdminDailyClosing, saveAdminOpeningBalance } from "@/lib/admin-client";
import type { AdminDailyClosingData, AdminInventoryData, MoneySource } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

const moneySources: Array<{ key: MoneySource; label: string }> = [
  { key: "CASH", label: "Cash" },
  { key: "EASYPAISA", label: "Easypaisa" },
  { key: "JAZZCASH", label: "JazzCash" }
];

function todayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
  return parts;
}

function differenceTone(value: number) {
  const magnitude = Math.abs(value);
  return magnitude <= 1 ? "text-emerald-700" : magnitude <= 500 ? "text-amber-700" : "text-red-700";
}

function differenceLabel(value: number) {
  const magnitude = Math.abs(value);
  return magnitude <= 1 ? "Balanced" : magnitude <= 500 ? "Minor difference" : "Major difference";
}

export function DailyClosingManagement() {
  const [inventory, setInventory] = useState<AdminInventoryData | null>(null);
  const [data, setData] = useState<AdminDailyClosingData | null>(null);
  const [branchId, setBranchId] = useState("");
  const [date, setDate] = useState(todayKey());
  const [actual, setActual] = useState<Record<MoneySource, string>>({ CASH: "", EASYPAISA: "", JAZZCASH: "" });
  const [opening, setOpening] = useState<Record<MoneySource, string>>({ CASH: "", EASYPAISA: "", JAZZCASH: "" });
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (data?.openingBalance) {
      setOpening({
        CASH: String(data.openingBalance.cashBalance),
        EASYPAISA: String(data.openingBalance.easypaisaBalance),
        JAZZCASH: String(data.openingBalance.jazzcashBalance)
      });
    }
  }, [data?.openingBalance]);

  async function loadSnapshot(nextBranchId = branchId, nextDate = date) {
    if (!nextBranchId) return;
    try {
      setLoading(true);
      setError("");
      setData(await fetchAdminDailyClosing(nextBranchId, nextDate));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the daily closing.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const result = await fetchAdminInventory();
        setInventory(result);
        const firstBranch = result.branches[0]?.id ?? "";
        setBranchId(firstBranch);
        await loadSnapshot(firstBranch, date);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load branches.");
        setLoading(false);
      }
    })();
    // The initial branch/date load is intentionally performed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const differences = useMemo(() => {
    if (!data) return { CASH: 0, EASYPAISA: 0, JAZZCASH: 0 };
    return {
      CASH: Number(actual.CASH || 0) - data.expected.CASH,
      EASYPAISA: Number(actual.EASYPAISA || 0) - data.expected.EASYPAISA,
      JAZZCASH: Number(actual.JAZZCASH || 0) - data.expected.JAZZCASH
    };
  }, [actual, data]);

  const totals = useMemo(() => {
    if (!data) return { sales: 0, expenses: 0 };
    return {
      sales: data.sales.CASH + data.sales.EASYPAISA + data.sales.JAZZCASH + data.foodpandaSales,
      expenses: data.expenses.CASH + data.expenses.EASYPAISA + data.expenses.JAZZCASH
    };
  }, [data]);

  async function closeDay() {
    if (!data || !branchId) return;
    try {
      setSaving(true);
      setError("");
      await saveAdminDailyClosing({
        branchId,
        closingDate: new Date(`${date}T12:00:00+05:00`).toISOString(),
        cashCounted: Number(actual.CASH || 0),
        easypaisaCounted: Number(actual.EASYPAISA || 0),
        jazzcashCounted: Number(actual.JAZZCASH || 0),
        note: note.trim()
      });
      await loadSnapshot();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not close the day.");
    } finally {
      setSaving(false);
    }
  }

  async function saveOpening() {
    if (!branchId) return;
    try {
      setSaving(true);
      setError("");
      await saveAdminOpeningBalance({
        branchId,
        balanceDate: new Date(`${date}T12:00:00+05:00`).toISOString(),
        cashBalance: Number(opening.CASH || 0),
        easypaisaBalance: Number(opening.EASYPAISA || 0),
        jazzcashBalance: Number(opening.JAZZCASH || 0),
        note: note.trim()
      });
      await loadSnapshot();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the opening balance.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 print:bg-white">
      <Card className="p-5 print:hidden">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-pocket-navy">Branch<select className="mt-1 h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm" value={branchId} onChange={(event) => { setBranchId(event.target.value); void loadSnapshot(event.target.value, date); }}>{inventory?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <label className="text-sm font-semibold text-pocket-navy">Closing date<Input className="mt-1" type="date" value={date} onChange={(event) => { setDate(event.target.value); void loadSnapshot(branchId, event.target.value); }} /></label>
          </div>
          <Button variant="outline" onClick={() => void loadSnapshot()}><RefreshCcw className="h-4 w-4" />Refresh</Button>
        </div>
      </Card>

      {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
      {loading || !data ? <Card className="p-6 text-sm text-pocket-navy/60">Loading daily closing...</Card> : (
        <>
          <Card className="p-5 print:hidden">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"><div><p className="text-lg font-black text-pocket-navy">Opening balance</p><p className="text-sm text-pocket-navy/60">Enter the money already in each account before today’s activity. Use the first of each month, or today’s date now for your initial setup.</p></div><p className="text-xs font-semibold uppercase tracking-wide text-pocket-navy/50">{data.openingBalance ? `Saved for ${date}` : "Not set for this date"}</p></div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">{moneySources.map(({ key, label }) => <label key={key} className="text-sm font-semibold text-pocket-navy">{label}<Input className="mt-1" type="number" min="0" step="0.01" value={opening[key]} onChange={(event) => setOpening((current) => ({ ...current, [key]: event.target.value }))} placeholder="0" /></label>)}</div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-pocket-navy/55">This becomes the starting balance for Daily Closing until a newer closing or opening balance is recorded.</p><Button variant="outline" onClick={() => void saveOpening()} disabled={saving}>{saving ? "Saving..." : "Save opening balance"}</Button></div>
          </Card>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Today's total sales" value={formatCurrency(totals.sales)} description="Includes Foodpanda for display only." />
            <SummaryCard label="Cash sales" value={formatCurrency(data.sales.CASH)} description="Included in today's cash reconciliation." />
            <SummaryCard label="Easypaisa sales" value={formatCurrency(data.sales.EASYPAISA)} description="Included in today's Easypaisa reconciliation." />
            <SummaryCard label="JazzCash sales" value={formatCurrency(data.sales.JAZZCASH)} description="Included in today's JazzCash reconciliation." />
            <SummaryCard label="Foodpanda sales" value={formatCurrency(data.foodpandaSales)} description="Receivable only — never included in closing balance." />
            <SummaryCard label="Expenses paid today" value={formatCurrency(totals.expenses)} description="Paid expenses only; unpaid fixed items are excluded." />
          </div>

          <Card className="p-5">
            <p className="text-lg font-black text-pocket-navy">Expense breakdown by payment source</p>
            <p className="text-sm text-pocket-navy/60">These amounts are deducted from the corresponding expected account balance. Select the correct source when recording an expense.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {moneySources.map(({ key, label }) => <div key={key} className="rounded-2xl bg-pocket-cream px-4 py-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-pocket-navy/55">{label} expenses</p><p className="mt-2 text-2xl font-black text-pocket-navy">{formatCurrency(data.expenses[key])}</p><p className="mt-1 text-xs text-pocket-navy/60">Paid from {label}</p></div>)}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div><p className="text-lg font-black text-pocket-navy">Close today</p><p className="text-sm text-pocket-navy/60">Expected balance = previous closing + sales − paid expenses. Foodpanda is paid later.</p></div>
              <Button variant="outline" className="print:hidden" onClick={() => window.print()}><Printer className="h-4 w-4" />Print report</Button>
            </div>
            <div className="mt-5 grid gap-4 xl:grid-cols-3">
              {moneySources.map(({ key, label }) => <div key={key} className="rounded-2xl bg-pocket-cream p-4"><p className="font-bold text-pocket-navy">{label}</p><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><p className="text-pocket-navy/55">Expected</p><p className="font-black text-pocket-navy">{formatCurrency(data.expected[key])}</p></div><div><p className="text-pocket-navy/55">Difference</p><p className={`font-black ${differenceTone(differences[key])}`}>{formatCurrency(differences[key])}</p><p className={`text-xs font-semibold ${differenceTone(differences[key])}`}>{differenceLabel(differences[key])}</p></div></div><label className="mt-4 block text-sm font-semibold text-pocket-navy">Actual balance<Input className="mt-1" type="number" min="0" step="0.01" value={actual[key]} onChange={(event) => setActual((current) => ({ ...current, [key]: event.target.value }))} placeholder="0" /></label></div>)}
            </div>
            <label className="mt-4 block text-sm font-semibold text-pocket-navy">Notes (optional)<Textarea className="mt-1" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Explain any difference if needed." /></label>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className={`text-sm font-bold ${differenceTone(Math.max(Math.abs(differences.CASH), Math.abs(differences.EASYPAISA), Math.abs(differences.JAZZCASH)))}`}>Overall difference: {formatCurrency(differences.CASH + differences.EASYPAISA + differences.JAZZCASH)}</p><Button onClick={() => void closeDay()} disabled={saving}>{saving ? "Saving..." : "Close day"}</Button></div>
          </Card>

          <Card className="p-5">
            <p className="text-lg font-black text-pocket-navy">Closing history</p><p className="text-sm text-pocket-navy/60">One editable closing is stored per branch and day.</p>
            <div className="mt-4 space-y-2">{data.recentClosings.map((closing) => <div key={closing.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pocket-navy/10 px-4 py-3 text-sm"><div><p className="font-bold text-pocket-navy">{new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeZone: "Asia/Karachi" }).format(new Date(closing.closingDate))}</p><p className="text-pocket-navy/55">Closed by {closing.closedByName ?? "Admin"}</p></div><p className="font-semibold text-pocket-navy">Cash {formatCurrency(closing.cashCounted)} · Easypaisa {formatCurrency(closing.easypaisaCounted)} · JazzCash {formatCurrency(closing.jazzcashCounted)}</p></div>)}{!data.recentClosings.length ? <p className="text-sm text-pocket-navy/60">No previous closings.</p> : null}</div>
          </Card>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, description }: { label: string; value: string; description: string }) {
  return <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-orange">{label}</p><p className="mt-3 break-words text-2xl font-black leading-tight text-pocket-navy">{value}</p><p className="mt-2 text-sm text-pocket-navy/60">{description}</p></Card>;
}
