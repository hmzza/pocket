"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createAdminFixedExpense,
  deleteAdminFixedExpense,
  fetchAdminFixedExpenses,
  generateAdminFixedExpenses,
  updateAdminFixedExpense,
  updateAdminFixedExpenseOccurrence
} from "@/lib/admin-client";
import type { AdminFixedExpense, AdminFixedExpenseData, MoneySource } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

type FixedExpenseForm = {
  branchId: string;
  name: string;
  category: string;
  monthlyAmount: string;
  paymentSource: MoneySource;
  dueDay: string;
  autoRepeat: boolean;
  isActive: boolean;
};

const emptyForm: FixedExpenseForm = {
  branchId: "",
  name: "",
  category: "Rent",
  monthlyAmount: "",
  paymentSource: "CASH",
  dueDay: "1",
  autoRepeat: true,
  isActive: true
};

function formFromExpense(expense: AdminFixedExpense): FixedExpenseForm {
  return {
    branchId: expense.branchId,
    name: expense.name,
    category: expense.category,
    monthlyAmount: String(expense.monthlyAmount),
    paymentSource: expense.paymentSource,
    dueDay: String(expense.dueDay),
    autoRepeat: expense.autoRepeat,
    isActive: expense.isActive
  };
}

function SummaryCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <Card className="p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-pocket-orange">{label}</p><p className="mt-2 text-xl font-black text-pocket-navy">{value}</p><p className="mt-1 text-xs text-pocket-navy/60">{helper}</p></Card>;
}

type FixedExpenseManagementProps = {
  embedded?: boolean;
  onExpensesChanged?: () => void | Promise<void>;
};

export function FixedExpenseManagement({ embedded = false, onExpensesChanged }: FixedExpenseManagementProps = {}) {
  const [data, setData] = useState<AdminFixedExpenseData | null>(null);
  const [form, setForm] = useState<FixedExpenseForm>(emptyForm);
  const [editing, setEditing] = useState<AdminFixedExpense | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      setData(await fetchAdminFixedExpenses(data?.monthKey));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load fixed expenses.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const activeCount = useMemo(() => data?.fixedExpenses.filter((expense) => expense.isActive).length ?? 0, [data]);

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, branchId: data?.branches[0]?.id ?? "" });
    setShowForm(true);
    setError("");
  }

  function openEdit(expense: AdminFixedExpense) {
    setEditing(expense);
    setForm(formFromExpense(expense));
    setShowForm(true);
    setError("");
  }

  async function save() {
    if (!form.branchId || !form.name.trim() || !form.monthlyAmount) {
      setError("Expense name and monthly amount are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        branchId: form.branchId,
        name: form.name.trim(),
        category: form.category.trim() || "Misc",
        monthlyAmount: Number(form.monthlyAmount),
        paymentSource: form.paymentSource,
        dueDay: Number(form.dueDay),
        autoRepeat: form.autoRepeat,
        isActive: form.isActive
      };
      if (editing) await updateAdminFixedExpense(editing.id, payload);
      else await createAdminFixedExpense(payload);
      setShowForm(false);
      await load();
      await onExpensesChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save fixed expense.");
    } finally {
      setSaving(false);
    }
  }

  async function generate() {
    if (!data) return;
    setGenerating(true);
    setError("");
    try {
      await generateAdminFixedExpenses(data.monthKey);
      await load();
      await onExpensesChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not generate this month’s expenses.");
    } finally {
      setGenerating(false);
    }
  }

  async function togglePaid(expense: AdminFixedExpense) {
    if (!expense.currentMonth) {
      setError("Generate this month’s expenses first, then mark them paid.");
      return;
    }
    try {
      await updateAdminFixedExpenseOccurrence(expense.currentMonth.id, expense.currentMonth.status === "PAID" ? "UNPAID" : "PAID");
      await load();
      await onExpensesChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update payment status.");
    }
  }

  async function toggleActive(expense: AdminFixedExpense) {
    try {
      await updateAdminFixedExpense(expense.id, { isActive: !expense.isActive });
      await load();
      await onExpensesChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update fixed expense status.");
    }
  }

  async function remove(expense: AdminFixedExpense) {
    if (!window.confirm(`Remove ${expense.name} from recurring expenses? Existing ledger entries will be preserved.`)) return;
    try {
      await deleteAdminFixedExpense(expense.id);
      await load();
      await onExpensesChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not remove fixed expense.");
    }
  }

  return <div className={embedded ? "space-y-5" : "space-y-6"}>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Recurring costs</p><p className="mt-1 text-sm text-pocket-navy/60">Set each expense once, then generate the current month in one click. Generated entries appear in the main expense ledger.</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCcw className="mr-2 h-4 w-4" />Refresh</Button><Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Add fixed expense</Button></div></div>
    {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {data && <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><SummaryCard label="Total fixed expenses" value={formatCurrency(data.summary.totalFixedExpenses)} helper={`${activeCount} active recurring items`} /><SummaryCard label="Paid" value={formatCurrency(data.summary.paid)} helper={data.monthLabel} /><SummaryCard label="Remaining" value={formatCurrency(data.summary.remaining)} helper="Still unpaid this month" /><SummaryCard label="Upcoming due" value={formatCurrency(data.summary.upcomingDue)} helper="Unpaid due now or later" /></div>
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5"><div><h2 className="text-xl font-black text-pocket-navy">{data.monthLabel} expenses</h2><p className="mt-1 text-sm text-pocket-navy/60">Generate active monthly expenses once; repeating the action will not create duplicates.</p></div><Button onClick={() => void generate()} disabled={generating}>{generating ? "Generating..." : "Generate current month expenses"}</Button></Card>
      <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-sm"><thead className="border-b border-pocket-navy/10 bg-pocket-cream/40 text-xs uppercase tracking-[0.12em] text-pocket-navy/50"><tr><th className="px-5 py-3">Expense name</th><th className="px-5 py-3">Category</th><th className="px-5 py-3">Monthly amount</th><th className="px-5 py-3">Paid from</th><th className="px-5 py-3">Due date</th><th className="px-5 py-3">Repeat</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Active</th><th className="px-5 py-3" /></tr></thead><tbody>{data.fixedExpenses.map((expense) => <tr key={expense.id} className="border-b border-pocket-navy/5"><td className="px-5 py-4"><p className="font-bold text-pocket-navy">{expense.name}</p><p className="text-xs text-pocket-navy/55">{expense.branchName}</p></td><td className="px-5 py-4 text-pocket-navy/70">{expense.category}</td><td className="px-5 py-4 font-semibold text-pocket-navy">{formatCurrency(expense.monthlyAmount)}</td><td className="px-5 py-4 text-pocket-navy/70">{expense.paymentSource === "EASYPAISA" ? "Easypaisa" : expense.paymentSource === "JAZZCASH" ? "JazzCash" : "Cash"}</td><td className="px-5 py-4 text-pocket-navy/70">{expense.dueDay}{[11, 12, 13].includes(expense.dueDay) ? "th" : expense.dueDay % 10 === 1 ? "st" : expense.dueDay % 10 === 2 ? "nd" : expense.dueDay % 10 === 3 ? "rd" : "th"} of month</td><td className="px-5 py-4 text-pocket-navy/70">{expense.autoRepeat ? "Monthly" : "Manual"}</td><td className="px-5 py-4"><Button size="sm" variant={expense.currentMonth?.status === "PAID" ? "default" : "outline"} onClick={() => void togglePaid(expense)}>{expense.currentMonth?.status === "PAID" ? "Paid" : "Unpaid"}</Button></td><td className="px-5 py-4"><button type="button" aria-label={`Set ${expense.name} ${expense.isActive ? "inactive" : "active"}`} onClick={() => void toggleActive(expense)} className={`relative h-6 w-11 rounded-full transition ${expense.isActive ? "bg-pocket-orange" : "bg-pocket-navy/20"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${expense.isActive ? "left-6" : "left-1"}`} /></button></td><td className="px-5 py-4 text-right"><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => openEdit(expense)} aria-label={`Edit ${expense.name}`}><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="ghost" onClick={() => void remove(expense)} aria-label={`Delete ${expense.name}`} className="text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}</tbody></table></div>{!data.fixedExpenses.length && <p className="p-8 text-center text-sm text-pocket-navy/60">No fixed expenses configured yet.</p>}</Card></>}
    {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-pocket-charcoal/40 px-4 py-8"><Card className="w-full max-w-xl p-6 shadow-panel"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Fixed expense</p><h2 className="mt-1 text-2xl font-black text-pocket-navy">{editing ? "Edit recurring expense" : "Add recurring expense"}</h2></div><Button variant="ghost" onClick={() => setShowForm(false)}>Close</Button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="space-y-1 text-sm font-semibold text-pocket-navy sm:col-span-2">Expense name<Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Shop rent" /></label><label className="space-y-1 text-sm font-semibold text-pocket-navy">Category<Input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Rent" /></label><label className="space-y-1 text-sm font-semibold text-pocket-navy">Monthly amount<Input type="number" min="0" value={form.monthlyAmount} onChange={(event) => setForm({ ...form, monthlyAmount: event.target.value })} placeholder="150000" /></label><label className="space-y-1 text-sm font-semibold text-pocket-navy">Paid from<select value={form.paymentSource} onChange={(event) => setForm({ ...form, paymentSource: event.target.value as MoneySource })} className="flex h-10 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm font-normal"><option value="CASH">Cash</option><option value="EASYPAISA">Easypaisa</option><option value="JAZZCASH">JazzCash</option></select></label><label className="space-y-1 text-sm font-semibold text-pocket-navy">Due day<Input type="number" min="1" max="31" value={form.dueDay} onChange={(event) => setForm({ ...form, dueDay: event.target.value })} /></label><label className="flex items-center gap-2 text-sm font-semibold text-pocket-navy sm:col-span-2"><input type="checkbox" checked={form.autoRepeat} onChange={(event) => setForm({ ...form, autoRepeat: event.target.checked })} /> Auto repeat monthly</label><label className="flex items-center gap-2 text-sm font-semibold text-pocket-navy sm:col-span-2"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /> Active</label></div><div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button><Button onClick={() => void save()} disabled={saving}>{saving ? "Saving..." : editing ? "Save changes" : "Add expense"}</Button></div></Card></div>}
  </div>;
}
