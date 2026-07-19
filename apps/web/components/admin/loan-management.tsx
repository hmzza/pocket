"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createAdminLoan,
  createAdminLoanRepayment,
  deleteAdminLoan,
  deleteAdminLoanRepayment,
  fetchAdminLoans,
  updateAdminLoan
} from "@/lib/admin-client";
import type { AdminLoan, AdminLoanData, MoneySource } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

const MONEY_SOURCES: Array<{ value: MoneySource; label: string }> = [
  { value: "CASH", label: "Cash" },
  { value: "EASYPAISA", label: "Easypaisa" },
  { value: "JAZZCASH", label: "JazzCash" }
];

type LoanFormState = {
  branchId: string;
  lenderName: string;
  amount: string;
  receivedSource: MoneySource;
  loanDate: string;
  note: string;
};

type RepaymentFormState = {
  loanId: string;
  amount: string;
  paidFrom: MoneySource;
  paymentDate: string;
  note: string;
};

const EMPTY_LOAN_FORM: LoanFormState = {
  branchId: "",
  lenderName: "",
  amount: "",
  receivedSource: "CASH",
  loanDate: new Date().toISOString().slice(0, 10),
  note: ""
};

const EMPTY_REPAYMENT_FORM: RepaymentFormState = {
  loanId: "",
  amount: "",
  paidFrom: "CASH",
  paymentDate: new Date().toISOString().slice(0, 10),
  note: ""
};

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sourceLabel(value: string) {
  return MONEY_SOURCES.find((source) => source.value === value)?.label ?? value;
}

function statusLabel(status: AdminLoan["status"]) {
  if (status === "PARTIALLY_PAID") return "Partially Paid";
  if (status === "PAID") return "Paid";
  return "Open";
}

function statusClass(status: AdminLoan["status"]) {
  if (status === "PAID") return "bg-emerald-50 text-emerald-700";
  if (status === "PARTIALLY_PAID") return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

export function LoanManagement() {
  const [data, setData] = useState<AdminLoanData | null>(null);
  const [form, setForm] = useState<LoanFormState>(EMPTY_LOAN_FORM);
  const [repaymentForm, setRepaymentForm] = useState<RepaymentFormState>(EMPTY_REPAYMENT_FORM);
  const [editingLoan, setEditingLoan] = useState<AdminLoan | null>(null);
  const [repayingLoan, setRepayingLoan] = useState<AdminLoan | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "paid">("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");

  async function loadLoans() {
    try {
      setError("");
      const nextData = await fetchAdminLoans({ preset: "month", status: statusFilter, search: search.trim() || undefined });
      setData(nextData);
      const branchId = nextData.branches[0]?.id ?? "";
      setForm((current) => ({ ...current, branchId: current.branchId || branchId }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load loans.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLoans();
  }, [statusFilter]);

  const loans = useMemo(() => {
    const source = data?.loans ?? [];
    return [...source].sort((left, right) => {
      if (left.outstandingAmount > 0 && right.outstandingAmount <= 0) return -1;
      if (left.outstandingAmount <= 0 && right.outstandingAmount > 0) return 1;
      return new Date(right.loanDate).getTime() - new Date(left.loanDate).getTime();
    });
  }, [data]);

  function startCreate() {
    setEditingLoan(null);
    setForm({ ...EMPTY_LOAN_FORM, branchId: data?.branches[0]?.id ?? "" });
  }

  function startEdit(loan: AdminLoan) {
    setEditingLoan(loan);
    setForm({
      branchId: loan.branchId,
      lenderName: loan.lenderName,
      amount: String(loan.amount),
      receivedSource: loan.receivedSource,
      loanDate: loan.loanDate.slice(0, 10),
      note: loan.note ?? ""
    });
  }

  function startRepayment(loan: AdminLoan) {
    setRepayingLoan(loan);
    setRepaymentForm({
      ...EMPTY_REPAYMENT_FORM,
      loanId: loan.id,
      amount: String(loan.outstandingAmount),
      paidFrom: loan.receivedSource
    });
  }

  async function saveLoan() {
    if (!form.branchId || !form.lenderName.trim() || !form.amount) {
      setError("Lender name, branch, and amount are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        branchId: form.branchId,
        lenderName: form.lenderName.trim(),
        amount: numberValue(form.amount),
        receivedSource: form.receivedSource,
        loanDate: new Date(`${form.loanDate}T12:00:00`).toISOString(),
        note: form.note.trim() || undefined
      };
      if (editingLoan) {
        await updateAdminLoan(editingLoan.id, payload);
      } else {
        await createAdminLoan(payload);
      }
      setEditingLoan(null);
      setForm({ ...EMPTY_LOAN_FORM, branchId: form.branchId });
      await loadLoans();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save loan.");
    } finally {
      setSaving(false);
    }
  }

  async function saveRepayment() {
    if (!repayingLoan || !repaymentForm.amount) return;
    const amount = numberValue(repaymentForm.amount);
    if (amount <= 0 || amount > repayingLoan.outstandingAmount) {
      setError(`Payment must be between Rs 1 and ${formatCurrency(repayingLoan.outstandingAmount)}.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createAdminLoanRepayment(repayingLoan.id, {
        amount,
        paidFrom: repaymentForm.paidFrom,
        paymentDate: new Date(`${repaymentForm.paymentDate}T12:00:00`).toISOString(),
        note: repaymentForm.note.trim() || undefined
      });
      setRepayingLoan(null);
      setRepaymentForm(EMPTY_REPAYMENT_FORM);
      await loadLoans();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to record payment.");
    } finally {
      setSaving(false);
    }
  }

  async function removeLoan(loan: AdminLoan) {
    const confirmed = window.confirm(`Delete loan from ${loan.lenderName}? This also deletes its repayment records.`);
    if (!confirmed) return;
    setDeletingId(loan.id);
    setError("");
    try {
      await deleteAdminLoan(loan.id);
      await loadLoans();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete loan.");
    } finally {
      setDeletingId("");
    }
  }

  async function removeRepayment(loanId: string, repaymentId: string) {
    const confirmed = window.confirm("Delete this loan payment?");
    if (!confirmed) return;
    setDeletingId(repaymentId);
    setError("");
    try {
      await deleteAdminLoanRepayment(loanId, repaymentId);
      await loadLoans();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete payment.");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Loan taken</p>
          <p className="mt-3 text-2xl font-black text-pocket-navy">{formatCurrency(data?.summary.totalLoanTaken ?? 0)}</p>
          <p className="mt-2 text-sm text-pocket-navy/60">{data?.range.label ?? "This month"}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Repaid</p>
          <p className="mt-3 text-2xl font-black text-emerald-700">{formatCurrency(data?.summary.totalLoanRepaid ?? 0)}</p>
          <p className="mt-2 text-sm text-pocket-navy/60">Payments recorded.</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Outstanding</p>
          <p className="mt-3 text-2xl font-black text-red-700">{formatCurrency(data?.summary.outstandingLoanBalance ?? 0)}</p>
          <p className="mt-2 text-sm text-pocket-navy/60">{data?.summary.openLoanCount ?? 0} open loans.</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Paid loans</p>
          <p className="mt-3 text-2xl font-black text-pocket-navy">{data?.summary.paidLoanCount ?? 0}</p>
          <p className="mt-2 text-sm text-pocket-navy/60">Fully repaid.</p>
        </Card>
        <Card className="flex flex-col items-start justify-between gap-4 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Actions</p>
            <p className="mt-3 text-sm text-pocket-navy/60">Refresh or start a new loan record.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void loadLoans()}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
            <Button onClick={startCreate}>
              <Plus className="h-4 w-4" />
              New Loan
            </Button>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search lender" />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
            <option value="all">All loans</option>
            <option value="open">Open loans</option>
            <option value="paid">Paid loans</option>
          </select>
          <Button variant="outline" onClick={() => void loadLoans()}>Apply</Button>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <Card className="p-5">
          <p className="text-lg font-black text-pocket-navy">{editingLoan ? "Edit Loan" : "Add Loan"}</p>
          <div className="mt-4 space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-pocket-navy">Branch</label>
              <select value={form.branchId} onChange={(event) => setForm((current) => ({ ...current, branchId: event.target.value }))} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
                {(data?.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-pocket-navy">From whom</label>
              <Input value={form.lenderName} onChange={(event) => setForm((current) => ({ ...current, lenderName: event.target.value }))} placeholder="Lender name" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-pocket-navy">Loan amount</label>
                <Input type="number" min="0" step="0.01" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-pocket-navy">Received into</label>
                <select value={form.receivedSource} onChange={(event) => setForm((current) => ({ ...current, receivedSource: event.target.value as MoneySource }))} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
                  {MONEY_SOURCES.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-pocket-navy">Loan date</label>
              <Input type="date" value={form.loanDate} onChange={(event) => setForm((current) => ({ ...current, loanDate: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-pocket-navy">Note</label>
              <Textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void saveLoan()} disabled={saving}>{saving ? "Saving..." : editingLoan ? "Save Loan" : "Add Loan"}</Button>
              {editingLoan ? <Button variant="outline" onClick={startCreate}>Cancel edit</Button> : null}
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          {loading ? <Card className="p-5 text-sm text-pocket-navy/60">Loading loans...</Card> : null}
          {!loading && !loans.length ? <Card className="p-5 text-sm text-pocket-navy/60">No loans match the current filters.</Card> : null}
          {loans.map((loan) => (
            <Card key={loan.id} className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-black text-pocket-navy">{loan.lenderName}</p>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(loan.status)}`}>{statusLabel(loan.status)}</span>
                  </div>
                  <p className="mt-1 text-sm text-pocket-navy/60">
                    {loan.branchName} | Received into {sourceLabel(loan.receivedSource)} | {new Date(loan.loanDate).toLocaleDateString("en-PK")}
                  </p>
                  {loan.note ? <p className="mt-2 text-sm text-pocket-navy/70">{loan.note}</p> : null}
                </div>
                <div className="grid min-w-[300px] gap-3 sm:grid-cols-3">
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-pocket-navy/50">Amount</p><p className="font-black text-pocket-navy">{formatCurrency(loan.amount)}</p></div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-pocket-navy/50">Repaid</p><p className="font-black text-emerald-700">{formatCurrency(loan.repaidAmount)}</p></div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-pocket-navy/50">Balance</p><p className="font-black text-red-700">{formatCurrency(loan.outstandingAmount)}</p></div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {loan.outstandingAmount > 0 ? <Button size="sm" onClick={() => startRepayment(loan)}>Record Payment</Button> : null}
                <Button size="sm" variant="outline" onClick={() => startEdit(loan)}><Pencil className="h-4 w-4" />Edit</Button>
                <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => void removeLoan(loan)} disabled={deletingId === loan.id}>
                  <Trash2 className="h-4 w-4" />
                  {deletingId === loan.id ? "Deleting..." : "Delete"}
                </Button>
              </div>
              {loan.repayments.length ? (
                <div className="mt-4 rounded-lg border border-pocket-navy/10">
                  {loan.repayments.map((repayment) => (
                    <div key={repayment.id} className="flex flex-col gap-2 border-b border-pocket-navy/10 px-3 py-2 text-sm last:border-0 sm:flex-row sm:items-center sm:justify-between">
                      <p className="font-semibold text-pocket-navy">{formatCurrency(repayment.amount)} paid from {sourceLabel(repayment.paidFrom)} on {new Date(repayment.paymentDate).toLocaleDateString("en-PK")}</p>
                      <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => void removeRepayment(loan.id, repayment.id)} disabled={deletingId === repayment.id}>
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      </div>

      {repayingLoan ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-pocket-charcoal/40 px-4 py-8">
          <div className="w-full max-w-md rounded-lg border border-pocket-navy/10 bg-white p-6 shadow-panel">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Loan Payment</p>
                <h2 className="mt-2 text-2xl font-black text-pocket-navy">{repayingLoan.lenderName}</h2>
                <p className="mt-1 text-sm text-pocket-navy/60">Remaining {formatCurrency(repayingLoan.outstandingAmount)}</p>
              </div>
              <Button variant="ghost" onClick={() => setRepayingLoan(null)}>Close</Button>
            </div>
            <div className="mt-5 space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-pocket-navy">Payment amount</label>
                <Input type="number" min="0" max={repayingLoan.outstandingAmount} step="0.01" value={repaymentForm.amount} onChange={(event) => setRepaymentForm((current) => ({ ...current, amount: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-pocket-navy">Paid from</label>
                <select value={repaymentForm.paidFrom} onChange={(event) => setRepaymentForm((current) => ({ ...current, paidFrom: event.target.value as MoneySource }))} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
                  {MONEY_SOURCES.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-pocket-navy">Payment date</label>
                <Input type="date" value={repaymentForm.paymentDate} onChange={(event) => setRepaymentForm((current) => ({ ...current, paymentDate: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-pocket-navy">Note</label>
                <Textarea value={repaymentForm.note} onChange={(event) => setRepaymentForm((current) => ({ ...current, note: event.target.value }))} />
              </div>
              <Button className="w-full" onClick={() => void saveRepayment()} disabled={saving}>{saving ? "Saving..." : "Record Payment"}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
