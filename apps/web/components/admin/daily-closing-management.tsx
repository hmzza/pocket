"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Printer, RefreshCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createAdminMoneyTransfer,
  deleteAdminMoneyTransfer,
  fetchAdminDailyClosing,
  fetchAdminInventory,
  saveAdminDailyClosing,
  saveAdminOpeningBalance
} from "@/lib/admin-client";
import type { AdminDailyClosingData, AdminInventoryData, MoneySource } from "@/lib/types";
import { formatCurrency, getCurrentBusinessDateKey } from "@/lib/utils";

const moneySources: Array<{ key: MoneySource; label: string }> = [
  { key: "CASH", label: "Cash" },
  { key: "EASYPAISA", label: "Easypaisa" },
  { key: "JAZZCASH", label: "JazzCash" }
];

const emptyMoneyText: Record<MoneySource, string> = { CASH: "", EASYPAISA: "", JAZZCASH: "" };

function todayKey() {
  return getCurrentBusinessDateKey();
}

function moneyLabel(source: MoneySource) {
  return moneySources.find((item) => item.key === source)?.label ?? source;
}

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeZone: "Asia/Karachi" }).format(new Date(value));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(new Date(value));
}

function differenceTone(value: number) {
  const magnitude = Math.abs(value);
  return magnitude <= 1 ? "text-emerald-700" : magnitude <= 500 ? "text-amber-700" : "text-red-700";
}

function differenceLabel(value: number) {
  const magnitude = Math.abs(value);
  if (magnitude <= 1) return "Balanced";
  return value < 0 ? "Short" : "Extra";
}

function sourceDescription(data: AdminDailyClosingData) {
  if (data.openingSource === "PREVIOUS_CLOSING") return `Started from previous closing on ${formatDate(data.openingSourceDate)}.`;
  if (data.openingSource === "OPENING_BALANCE") return `Started from opening balance setup on ${formatDate(data.openingSourceDate)}.`;
  return "Opening balances are required before closing this branch.";
}

export function DailyClosingManagement() {
  const [inventory, setInventory] = useState<AdminInventoryData | null>(null);
  const [data, setData] = useState<AdminDailyClosingData | null>(null);
  const [branchId, setBranchId] = useState("");
  const [date, setDate] = useState(todayKey());
  const [actual, setActual] = useState<Record<MoneySource, string>>(emptyMoneyText);
  const [opening, setOpening] = useState<Record<MoneySource, string>>(emptyMoneyText);
  const [note, setNote] = useState("");
  const [transferForm, setTransferForm] = useState({ fromSource: "CASH" as MoneySource, toSource: "EASYPAISA" as MoneySource, amount: "", note: "" });
  const [showOpeningCorrection, setShowOpeningCorrection] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadSnapshot(nextBranchId = branchId, nextDate = date) {
    if (!nextBranchId) return;
    try {
      setLoading(true);
      setError("");
      const snapshot = await fetchAdminDailyClosing(nextBranchId, nextDate);
      setData(snapshot);
      if (snapshot.currentClosing) {
        setActual({
          CASH: String(snapshot.currentClosing.cashCounted),
          EASYPAISA: String(snapshot.currentClosing.easypaisaCounted),
          JAZZCASH: String(snapshot.currentClosing.jazzcashCounted)
        });
        setNote(snapshot.currentClosing.note ?? "");
      } else {
        setActual({ ...emptyMoneyText });
        setNote("");
      }
      setOpening({
        CASH: String(snapshot.opening.CASH),
        EASYPAISA: String(snapshot.opening.EASYPAISA),
        JAZZCASH: String(snapshot.opening.JAZZCASH)
      });
      setShowOpeningCorrection(snapshot.openingSource === "NONE");
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
    // Initial branch/date load is intentionally performed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const differences = useMemo(() => {
    if (!data) return { CASH: 0, EASYPAISA: 0, JAZZCASH: 0 };
    return {
      CASH: actual.CASH === "" ? 0 : numberValue(actual.CASH) - data.expected.CASH,
      EASYPAISA: actual.EASYPAISA === "" ? 0 : numberValue(actual.EASYPAISA) - data.expected.EASYPAISA,
      JAZZCASH: actual.JAZZCASH === "" ? 0 : numberValue(actual.JAZZCASH) - data.expected.JAZZCASH
    };
  }, [actual, data]);

  const totals = useMemo(() => {
    if (!data) return { sales: 0, expenses: 0, transfers: 0, loanIn: 0, investmentIn: 0, loanOut: 0 };
    return {
      sales: data.sales.CASH + data.sales.EASYPAISA + data.sales.JAZZCASH + data.foodpandaSales,
      expenses: data.expenses.CASH + data.expenses.EASYPAISA + data.expenses.JAZZCASH,
      transfers: data.transfersToday.reduce((sum, transfer) => sum + transfer.amount, 0),
      loanIn: data.loanIn.CASH + data.loanIn.EASYPAISA + data.loanIn.JAZZCASH,
      investmentIn: data.investmentIn.CASH + data.investmentIn.EASYPAISA + data.investmentIn.JAZZCASH,
      loanOut: data.loanOut.CASH + data.loanOut.EASYPAISA + data.loanOut.JAZZCASH
    };
  }, [data]);

  async function closeDay() {
    if (!data || !branchId) return;
    if (data.openingSource === "NONE") {
      setError("Set opening balances before closing this branch.");
      return;
    }
    if (moneySources.some(({ key }) => actual[key] === "")) {
      setError("Enter actual Cash, Easypaisa, and JazzCash balances before closing.");
      return;
    }
    try {
      setSaving(true);
      setError("");
      await saveAdminDailyClosing({
        branchId,
        closingDate: new Date(`${date}T12:00:00+05:00`).toISOString(),
        cashCounted: numberValue(actual.CASH),
        easypaisaCounted: numberValue(actual.EASYPAISA),
        jazzcashCounted: numberValue(actual.JAZZCASH),
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
    if (moneySources.some(({ key }) => opening[key] === "")) {
      setError("Enter opening Cash, Easypaisa, and JazzCash balances.");
      return;
    }
    try {
      setSaving(true);
      setError("");
      await saveAdminOpeningBalance({
        branchId,
        balanceDate: new Date(`${date}T12:00:00+05:00`).toISOString(),
        cashBalance: numberValue(opening.CASH),
        easypaisaBalance: numberValue(opening.EASYPAISA),
        jazzcashBalance: numberValue(opening.JAZZCASH),
        note: note.trim()
      });
      setShowOpeningCorrection(false);
      await loadSnapshot();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the opening balance.");
    } finally {
      setSaving(false);
    }
  }

  async function saveTransfer() {
    if (!branchId) return;
    if (!transferForm.amount) {
      setError("Enter a transfer amount.");
      return;
    }
    if (transferForm.fromSource === transferForm.toSource) {
      setError("Transfer destination must be different.");
      return;
    }
    try {
      setSaving(true);
      setError("");
      await createAdminMoneyTransfer({
        branchId,
        fromSource: transferForm.fromSource,
        toSource: transferForm.toSource,
        amount: numberValue(transferForm.amount),
        transferDate: new Date(`${date}T12:00:00+05:00`).toISOString(),
        note: transferForm.note.trim() || undefined
      });
      setTransferForm((current) => ({ ...current, amount: "", note: "" }));
      await loadSnapshot();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not record transfer.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTransfer(transferId: string) {
    const confirmed = window.confirm("Delete this money transfer?");
    if (!confirmed) return;
    try {
      setSaving(true);
      setError("");
      await deleteAdminMoneyTransfer(transferId);
      await loadSnapshot();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete transfer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 print:bg-white">
      <Card className="p-5 print:hidden">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-pocket-navy">
              Business day
              <Input className="mt-1" type="date" value={date} onChange={(event) => { setDate(event.target.value); void loadSnapshot(branchId, event.target.value); }} />
            </label>
          </div>
          <Button variant="outline" onClick={() => void loadSnapshot()}><RefreshCcw className="h-4 w-4" />Refresh</Button>
        </div>
      </Card>

      {error ? (
        <Card className="border-red-200 bg-red-50 p-4 print:hidden">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-700">Action needed</p>
          <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm font-semibold text-red-700">{error}</pre>
        </Card>
      ) : null}

      {loading || !data ? <Card className="p-6 text-sm text-pocket-navy/60">Loading daily closing...</Card> : (
        <>
          <Card className="p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-lg font-black text-pocket-navy">Opening balances</p>
                <p className="text-sm text-pocket-navy/60">{sourceDescription(data)}</p>
              </div>
              {data.openingSource !== "NONE" ? <Button className="print:hidden" variant="outline" onClick={() => setShowOpeningCorrection((value) => !value)}>{showOpeningCorrection ? "Hide correction" : "Correct opening balance"}</Button> : null}
            </div>
            {!showOpeningCorrection ? (
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {moneySources.map(({ key, label }) => <MoneyAmount key={key} label={label} value={data.opening[key]} description="Starting balance" />)}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-pocket-navy/10 p-4">
                <p className="text-sm font-bold text-pocket-navy">{data.openingSource === "NONE" ? "Set opening balances" : "Correct opening balances"}</p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {moneySources.map(({ key, label }) => (
                    <label key={key} className="text-sm font-semibold text-pocket-navy">
                      {label}
                      <Input className="mt-1" type="number" min="0" step="0.01" value={opening[key]} onChange={(event) => setOpening((current) => ({ ...current, [key]: event.target.value }))} placeholder="0" />
                    </label>
                  ))}
                </div>
                <div className="mt-4 flex justify-end">
                  <Button variant="outline" onClick={() => void saveOpening()} disabled={saving}>{saving ? "Saving..." : "Save opening balances"}</Button>
                </div>
              </div>
            )}
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Business day total sales" value={formatCurrency(totals.sales)} description="Includes Foodpanda for display only." />
            <SummaryCard label="Expenses paid" value={formatCurrency(totals.expenses)} description="Deducted from the selected payment source." />
            <SummaryCard label="Capital received" value={formatCurrency(totals.investmentIn)} description="Investment payments received in this business day." />
            <SummaryCard label="Transfers recorded" value={formatCurrency(totals.transfers)} description="Money moved between Cash, Easypaisa, and JazzCash." />
            <SummaryCard label="Foodpanda sales" value={formatCurrency(data.foodpandaSales)} description="Receivable only; not included in closing balance." />
          </div>

          <Card className="p-5">
            <p className="text-lg font-black text-pocket-navy">Expected balance calculation</p>
            <p className="text-sm text-pocket-navy/60">Opening + sales + loan received + investment received + transfers in - expenses - loan repayments - transfers out = expected.</p>
            <div className="mt-4 grid gap-4 xl:grid-cols-3">
              {moneySources.map(({ key, label }) => (
                <div key={key} className="rounded-xl border border-pocket-navy/10 p-4">
                  <p className="font-black text-pocket-navy">{label}</p>
                  <div className="mt-3 space-y-2 text-sm">
                    <MovementRow label="Opening" value={data.opening[key]} />
                    <MovementRow label="Sales" value={data.sales[key]} sign="plus" />
                    <MovementRow label="Loan received" value={data.loanIn[key]} sign="plus" />
                    <MovementRow label="Investment received" value={data.investmentIn[key]} sign="plus" />
                    <MovementRow label="Transfers in" value={data.transferIn[key]} sign="plus" />
                    <MovementRow label="Expenses" value={data.expenses[key]} sign="minus" />
                    <MovementRow label="Loan repayments" value={data.loanOut[key]} sign="minus" />
                    <MovementRow label="Transfers out" value={data.transferOut[key]} sign="minus" />
                  </div>
                  <div className="mt-4 border-t border-pocket-navy/10 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pocket-orange">Expected</p>
                    <p className="mt-1 text-2xl font-black text-pocket-navy">{formatCurrency(data.expected[key])}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5 print:hidden">
            <p className="text-lg font-black text-pocket-navy">Record transfer</p>
            <p className="text-sm text-pocket-navy/60">Use this when money moves between Cash, Easypaisa, and JazzCash during the selected business day.</p>
            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_160px_1fr_auto] lg:items-end">
              <label className="text-sm font-semibold text-pocket-navy">
                From
                <select className="mt-1 h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm" value={transferForm.fromSource} onChange={(event) => setTransferForm((current) => ({ ...current, fromSource: event.target.value as MoneySource }))}>
                  {moneySources.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold text-pocket-navy">
                To
                <select className="mt-1 h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm" value={transferForm.toSource} onChange={(event) => setTransferForm((current) => ({ ...current, toSource: event.target.value as MoneySource }))}>
                  {moneySources.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold text-pocket-navy">Amount<Input className="mt-1" type="number" min="0" step="0.01" value={transferForm.amount} onChange={(event) => setTransferForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0" /></label>
              <label className="text-sm font-semibold text-pocket-navy">Note<Input className="mt-1" value={transferForm.note} onChange={(event) => setTransferForm((current) => ({ ...current, note: event.target.value }))} placeholder="Optional" /></label>
              <Button onClick={() => void saveTransfer()} disabled={saving}>{saving ? "Saving..." : "Record"}</Button>
            </div>
            <div className="mt-4 space-y-2">
              {data.transfersToday.map((transfer) => (
                <div key={transfer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pocket-navy/10 px-4 py-3 text-sm">
                  <div>
                    <p className="font-bold text-pocket-navy">{formatCurrency(transfer.amount)} <span className="font-semibold text-pocket-navy/55">{moneyLabel(transfer.fromSource)}</span> <ArrowRight className="inline h-4 w-4" /> <span className="font-semibold text-pocket-navy/55">{moneyLabel(transfer.toSource)}</span></p>
                    <p className="text-pocket-navy/55">{formatDateTime(transfer.transferDate)}{transfer.note ? ` - ${transfer.note}` : ""}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => void deleteTransfer(transfer.id)}><Trash2 className="h-4 w-4" />Delete</Button>
                </div>
              ))}
              {!data.transfersToday.length ? <p className="text-sm text-pocket-navy/60">No transfers recorded for this business day.</p> : null}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-lg font-black text-pocket-navy">Close business day</p>
                <p className="text-sm text-pocket-navy/60">Enter the actual money left in Cash, Easypaisa, and JazzCash.</p>
              </div>
              <Button variant="outline" className="print:hidden" onClick={() => window.print()}><Printer className="h-4 w-4" />Print report</Button>
            </div>
            <div className="mt-5 grid gap-4 xl:grid-cols-3">
              {moneySources.map(({ key, label }) => {
                const hasCount = actual[key] !== "";
                const difference = differences[key];
                return (
                  <div key={key} className="rounded-xl bg-pocket-cream p-4">
                    <p className="font-bold text-pocket-navy">{label}</p>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div><p className="text-pocket-navy/55">Expected</p><p className="font-black text-pocket-navy">{formatCurrency(data.expected[key])}</p></div>
                      <div><p className="text-pocket-navy/55">Difference</p><p className={`font-black ${hasCount ? differenceTone(difference) : "text-pocket-navy/45"}`}>{hasCount ? formatCurrency(difference) : "Pending"}</p><p className={`text-xs font-semibold ${hasCount ? differenceTone(difference) : "text-pocket-navy/45"}`}>{hasCount ? differenceLabel(difference) : "Enter actual"}</p></div>
                    </div>
                    <label className="mt-4 block text-sm font-semibold text-pocket-navy">Actual balance<Input className="mt-1" type="number" min="0" step="0.01" value={actual[key]} onChange={(event) => setActual((current) => ({ ...current, [key]: event.target.value }))} placeholder="Counted amount" /></label>
                  </div>
                );
              })}
            </div>
            <label className="mt-4 block text-sm font-semibold text-pocket-navy">Closing note<Textarea className="mt-1" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note for this closing." /></label>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className={`text-sm font-bold ${differenceTone(Math.max(Math.abs(differences.CASH), Math.abs(differences.EASYPAISA), Math.abs(differences.JAZZCASH)))}`}>Overall difference: {moneySources.some(({ key }) => actual[key] === "") ? "Pending actual counts" : formatCurrency(differences.CASH + differences.EASYPAISA + differences.JAZZCASH)}</p>
              <Button onClick={() => void closeDay()} disabled={saving || data.openingSource === "NONE"}>{saving ? "Saving..." : "Save closing"}</Button>
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-lg font-black text-pocket-navy">Closing history</p>
            <p className="text-sm text-pocket-navy/60">Expected, actual, and difference are saved for each business day.</p>
            <div className="mt-4 space-y-3">
              {data.recentClosings.map((closing) => (
                <div key={closing.id} className="rounded-xl border border-pocket-navy/10 p-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-pocket-navy">{formatDate(closing.closingDate)}</p>
                      <p className="text-pocket-navy/55">Closed by {closing.closedByName ?? "Admin"} at {formatDateTime(closing.createdAt)}</p>
                    </div>
                    {closing.note ? <p className="max-w-xl text-pocket-navy/60">{closing.note}</p> : null}
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <HistorySource label="Cash" expected={closing.cashExpected} counted={closing.cashCounted} difference={closing.cashDifference} />
                    <HistorySource label="Easypaisa" expected={closing.easypaisaExpected} counted={closing.easypaisaCounted} difference={closing.easypaisaDifference} />
                    <HistorySource label="JazzCash" expected={closing.jazzcashExpected} counted={closing.jazzcashCounted} difference={closing.jazzcashDifference} />
                  </div>
                </div>
              ))}
              {!data.recentClosings.length ? <p className="text-sm text-pocket-navy/60">No previous closings.</p> : null}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, description }: { label: string; value: string; description: string }) {
  return <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-orange">{label}</p><p className="mt-3 break-words text-2xl font-black leading-tight text-pocket-navy">{value}</p><p className="mt-2 text-sm text-pocket-navy/60">{description}</p></Card>;
}

function MoneyAmount({ label, value, description }: { label: string; value: number; description: string }) {
  return <div className="rounded-xl bg-pocket-cream px-4 py-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-pocket-navy/55">{label}</p><p className="mt-2 text-2xl font-black text-pocket-navy">{formatCurrency(value)}</p><p className="mt-1 text-xs text-pocket-navy/60">{description}</p></div>;
}

function MovementRow({ label, value, sign }: { label: string; value: number; sign?: "plus" | "minus" }) {
  const signed = sign === "minus" ? -value : value;
  return <div className="flex items-center justify-between gap-3"><span className="text-pocket-navy/60">{label}</span><span className={signed < 0 ? "font-bold text-red-700" : signed > 0 ? "font-bold text-emerald-700" : "font-bold text-pocket-navy/50"}>{sign === "plus" && value > 0 ? "+" : sign === "minus" && value > 0 ? "-" : ""}{formatCurrency(value)}</span></div>;
}

function HistorySource({ label, expected, counted, difference }: { label: string; expected: number; counted: number; difference: number }) {
  return (
    <div className="rounded-lg bg-pocket-cream p-3">
      <p className="font-bold text-pocket-navy">{label}</p>
      <p className="mt-1 text-xs text-pocket-navy/60">Expected {formatCurrency(expected)}</p>
      <p className="text-xs text-pocket-navy/60">Actual {formatCurrency(counted)}</p>
      <p className={`mt-1 text-sm font-black ${differenceTone(difference)}`}>{differenceLabel(difference)} {formatCurrency(difference)}</p>
    </div>
  );
}
