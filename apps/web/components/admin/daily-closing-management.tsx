"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, RefreshCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createAdminMoneyTransfer,
  createAdminMoneyAddition,
  deleteAdminMoneyTransfer,
  deleteAdminMoneyAddition,
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
  const [movementType, setMovementType] = useState<"TRANSFER" | "ADDITION">("TRANSFER");
  const [additionForm, setAdditionForm] = useState({ toSource: "CASH" as MoneySource, amount: "", reason: "" });
  const [showTransferHistory, setShowTransferHistory] = useState(false);
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
    if (!data) return { sales: 0, expenses: 0, loanIn: 0, investmentIn: 0, additionIn: 0, loanOut: 0, inflow: 0, outflow: 0, difference: 0 };
    const sales = data.sales.CASH + data.sales.EASYPAISA + data.sales.JAZZCASH;
    const loanIn = data.loanIn.CASH + data.loanIn.EASYPAISA + data.loanIn.JAZZCASH;
    const investmentIn = data.investmentIn.CASH + data.investmentIn.EASYPAISA + data.investmentIn.JAZZCASH;
    const additionIn = data.additionIn.CASH + data.additionIn.EASYPAISA + data.additionIn.JAZZCASH;
    const expenses = data.expenses.CASH + data.expenses.EASYPAISA + data.expenses.JAZZCASH;
    const loanOut = data.loanOut.CASH + data.loanOut.EASYPAISA + data.loanOut.JAZZCASH;
    const inflow = sales + loanIn + investmentIn + additionIn;
    const outflow = expenses + loanOut;
    return {
      sales,
      expenses,
      loanIn,
      investmentIn,
      additionIn,
      loanOut,
      inflow,
      outflow,
      difference: inflow - outflow
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

  async function saveAddition() {
    if (!branchId) return;
    if (!additionForm.amount || !additionForm.reason.trim()) {
      setError("Enter the added amount and reason.");
      return;
    }
    try {
      setSaving(true);
      setError("");
      await createAdminMoneyAddition({
        branchId,
        amount: numberValue(additionForm.amount),
        toSource: additionForm.toSource,
        reason: additionForm.reason.trim(),
        businessDate: date
      });
      setAdditionForm((current) => ({ ...current, amount: "", reason: "" }));
      await loadSnapshot();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not record money added.");
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

  async function deleteAddition(additionId: string) {
    if (!window.confirm("Delete this money addition?")) return;
    try {
      setSaving(true);
      setError("");
      await deleteAdminMoneyAddition(additionId);
      await loadSnapshot();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete money addition.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 print:bg-white">
      <Card className="p-5 print:hidden">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <label className="w-full text-sm font-semibold text-pocket-navy sm:max-w-xs">
            Business day
            <Input className="mt-1" type="date" value={date} onChange={(event) => { setDate(event.target.value); void loadSnapshot(branchId, event.target.value); }} />
          </label>
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

          <div className="grid gap-4 md:grid-cols-3">
            <MovementSummaryCard label="Inflow" value={totals.inflow} tone="positive" lines={[`Sales ${formatCurrency(totals.sales)}`, `Capital received ${formatCurrency(totals.investmentIn)}`, `Loans received ${formatCurrency(totals.loanIn)}`, `Other money added ${formatCurrency(totals.additionIn)}`]} />
            <MovementSummaryCard label="Outflow" value={totals.outflow} tone="negative" lines={[`Expenses ${formatCurrency(totals.expenses)}`, `Loan repayments ${formatCurrency(totals.loanOut)}`]} />
            <MovementSummaryCard label={totals.difference < -1 ? "Deficit" : totals.difference > 1 ? "Surplus" : "Balanced"} value={Math.abs(totals.difference)} tone={totals.difference < -1 ? "negative" : totals.difference > 1 ? "positive" : "neutral"} lines={[`Inflow ${formatCurrency(totals.inflow)}`, `Outflow ${formatCurrency(totals.outflow)}`]} />
          </div>

          <Card className="p-5 print:hidden">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-lg font-black text-pocket-navy">Money movement</p>
                <p className="text-sm text-pocket-navy/60">Record transfers between accounts or unusual money added on this business day.</p>
              </div>
              <button type="button" className="inline-flex items-center gap-2 text-sm font-bold text-pocket-orange" onClick={() => setShowTransferHistory((value) => !value)} aria-expanded={showTransferHistory}>
                {data.transfersToday.length + data.additionsToday.length} movement{data.transfersToday.length + data.additionsToday.length === 1 ? "" : "s"} history
                <ChevronDown className={`h-4 w-4 transition-transform ${showTransferHistory ? "rotate-180" : ""}`} />
              </button>
            </div>
            <div className="mt-4 inline-flex rounded-lg bg-pocket-cream p-1"><button type="button" onClick={() => setMovementType("TRANSFER")} className={`rounded-md px-3 py-2 text-sm font-bold ${movementType === "TRANSFER" ? "bg-white text-pocket-navy shadow-sm" : "text-pocket-navy/55"}`}>Transfer</button><button type="button" onClick={() => setMovementType("ADDITION")} className={`rounded-md px-3 py-2 text-sm font-bold ${movementType === "ADDITION" ? "bg-white text-pocket-navy shadow-sm" : "text-pocket-navy/55"}`}>Money added</button></div>
            {movementType === "TRANSFER" ? <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_160px_1fr_auto] lg:items-end">
              <label className="text-sm font-semibold text-pocket-navy">From<select className="mt-1 h-11 w-full rounded-lg border border-pocket-navy/15 bg-white px-3 text-sm" value={transferForm.fromSource} onChange={(event) => setTransferForm((current) => ({ ...current, fromSource: event.target.value as MoneySource }))}>{moneySources.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}</select></label>
              <label className="text-sm font-semibold text-pocket-navy">To<select className="mt-1 h-11 w-full rounded-lg border border-pocket-navy/15 bg-white px-3 text-sm" value={transferForm.toSource} onChange={(event) => setTransferForm((current) => ({ ...current, toSource: event.target.value as MoneySource }))}>{moneySources.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}</select></label>
              <label className="text-sm font-semibold text-pocket-navy">Amount<Input className="mt-1" type="number" min="0" step="0.01" value={transferForm.amount} onChange={(event) => setTransferForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0" /></label>
              <label className="text-sm font-semibold text-pocket-navy">Note<Input className="mt-1" value={transferForm.note} onChange={(event) => setTransferForm((current) => ({ ...current, note: event.target.value }))} placeholder="Optional" /></label>
              <Button onClick={() => void saveTransfer()} disabled={saving}>{saving ? "Saving..." : "Record"}</Button>
            </div> : <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_160px_1fr_auto] lg:items-end">
              <label className="text-sm font-semibold text-pocket-navy">Added to<select className="mt-1 h-11 w-full rounded-lg border border-pocket-navy/15 bg-white px-3 text-sm" value={additionForm.toSource} onChange={(event) => setAdditionForm((current) => ({ ...current, toSource: event.target.value as MoneySource }))}>{moneySources.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}</select></label>
              <label className="text-sm font-semibold text-pocket-navy">Amount<Input className="mt-1" type="number" min="0" step="0.01" value={additionForm.amount} onChange={(event) => setAdditionForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0" /></label>
              <label className="text-sm font-semibold text-pocket-navy">Reason<Input className="mt-1" value={additionForm.reason} onChange={(event) => setAdditionForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Why was money added?" /></label>
              <Button onClick={() => void saveAddition()} disabled={saving}>{saving ? "Saving..." : "Record"}</Button>
            </div>}
            {showTransferHistory ? <div className="mt-4 space-y-2">
              {data.transfersToday.map((transfer) => (
                <div key={transfer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pocket-navy/10 px-4 py-3 text-sm">
                  <div>
                    <p className="font-bold text-pocket-navy">{formatCurrency(transfer.amount)} <span className="font-semibold text-pocket-navy/55">{moneyLabel(transfer.fromSource)}</span> <ArrowRight className="inline h-4 w-4" /> <span className="font-semibold text-pocket-navy/55">{moneyLabel(transfer.toSource)}</span></p>
                    <p className="text-pocket-navy/55">{formatDateTime(transfer.transferDate)}{transfer.note ? ` - ${transfer.note}` : ""}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => void deleteTransfer(transfer.id)}><Trash2 className="h-4 w-4" />Delete</Button>
                </div>
              ))}
              {data.additionsToday.map((addition) => (
                <div key={addition.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-sm">
                  <div><p className="font-bold text-pocket-navy"><span className="mr-2 rounded-full bg-emerald-100 px-2 py-1 text-[10px] uppercase tracking-wide text-emerald-800">Money added</span>{formatCurrency(addition.amount)} to {moneyLabel(addition.toSource)}</p><p className="text-pocket-navy/55">{addition.reason} · {formatDateTime(addition.additionDate)}</p></div>
                  <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => void deleteAddition(addition.id)}><Trash2 className="h-4 w-4" />Delete</Button>
                </div>
              ))}
              {!data.transfersToday.length && !data.additionsToday.length ? <p className="text-sm text-pocket-navy/60">No money movement recorded for this business day.</p> : null}
            </div> : null}
          </Card>

          <Card className="p-5">
            <div>
              <p className="text-lg font-black text-pocket-navy">Balance calculation</p>
              <p className="text-sm text-pocket-navy/60">Opening + sales + capital + other money added + transfers in - outflows - transfers out = expected balance.</p>
            </div>
            <div className="mt-5 grid gap-4 xl:grid-cols-3">
              {moneySources.map(({ key, label }) => {
                const hasCount = actual[key] !== "";
                const difference = differences[key];
                return (
                  <div key={key} className="rounded-xl border border-pocket-navy/10 bg-pocket-cream/40 p-4">
                    <p className="font-black text-pocket-navy">{label}</p>
                    <div className="mt-3 space-y-2 text-sm">
                      <MovementRow label="Opening" value={data.opening[key]} />
                      <MovementRow label="Sales" value={data.sales[key]} sign="plus" />
                      <MovementRow label="Loan received" value={data.loanIn[key]} sign="plus" />
                      <MovementRow label="Investment received" value={data.investmentIn[key]} sign="plus" />
                      <MovementRow label="Other money added" value={data.additionIn[key]} sign="plus" />
                      <MovementRow label="Transfers in" value={data.transferIn[key]} sign="plus" />
                      <MovementRow label="Expenses" value={data.expenses[key]} sign="minus" />
                      <MovementRow label="Loan repayments" value={data.loanOut[key]} sign="minus" />
                      <MovementRow label="Transfers out" value={data.transferOut[key]} sign="minus" />
                    </div>
                    <div className="mt-4 border-t border-pocket-navy/10 pt-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pocket-orange">Expected</p>
                      <p className="mt-1 text-2xl font-black text-pocket-navy">{formatCurrency(data.expected[key])}</p>
                    </div>
                    <label className="mt-4 block text-sm font-semibold text-pocket-navy">Actual balance<Input className="mt-1" type="number" min="0" step="0.01" value={actual[key]} onChange={(event) => setActual((current) => ({ ...current, [key]: event.target.value }))} placeholder="Counted amount" /></label>
                    <div className="mt-3 border-t border-pocket-navy/10 pt-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pocket-orange">Difference</p>
                      <p className={`mt-1 font-black ${hasCount ? differenceTone(difference) : "text-pocket-navy/45"}`}>{hasCount ? formatCurrency(difference) : "Pending"}</p>
                      <p className={`text-xs font-semibold ${hasCount ? differenceTone(difference) : "text-pocket-navy/45"}`}>{hasCount ? differenceLabel(difference) : "Enter actual balance"}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 border-t border-pocket-navy/10 pt-5">
              <label className="block text-sm font-semibold text-pocket-navy">Closing note<Textarea className="mt-1" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note for this closing." /></label>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className={`text-sm font-bold ${differenceTone(Math.max(Math.abs(differences.CASH), Math.abs(differences.EASYPAISA), Math.abs(differences.JAZZCASH)))}`}>Overall difference: {moneySources.some(({ key }) => actual[key] === "") ? "Pending actual counts" : formatCurrency(differences.CASH + differences.EASYPAISA + differences.JAZZCASH)}</p>
                <Button onClick={() => void closeDay()} disabled={saving || data.openingSource === "NONE"}>{saving ? "Saving..." : "Save closing"}</Button>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function MovementSummaryCard({ label, value, lines, tone }: { label: string; value: number; lines: string[]; tone: "positive" | "negative" | "neutral" }) {
  const valueClass = tone === "positive" ? "text-emerald-700" : tone === "negative" ? "text-red-700" : "text-pocket-navy";
  return <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-orange">{label}</p><p className={`mt-3 break-words text-2xl font-black leading-tight ${valueClass}`}>{formatCurrency(value)}</p><div className="mt-2 space-y-1 text-sm text-pocket-navy/55">{lines.map((line) => <p key={line}>{line}</p>)}</div></Card>;
}

function MoneyAmount({ label, value, description }: { label: string; value: number; description: string }) {
  return <div className="rounded-xl bg-pocket-cream px-4 py-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-pocket-navy/55">{label}</p><p className="mt-2 text-2xl font-black text-pocket-navy">{formatCurrency(value)}</p><p className="mt-1 text-xs text-pocket-navy/60">{description}</p></div>;
}

function MovementRow({ label, value, sign }: { label: string; value: number; sign?: "plus" | "minus" }) {
  const signed = sign === "minus" ? -value : value;
  return <div className="flex items-center justify-between gap-3"><span className="text-pocket-navy/60">{label}</span><span className={signed < 0 ? "font-bold text-red-700" : signed > 0 ? "font-bold text-emerald-700" : "font-bold text-pocket-navy/50"}>{sign === "plus" && value > 0 ? "+" : sign === "minus" && value > 0 ? "-" : ""}{formatCurrency(value)}</span></div>;
}
