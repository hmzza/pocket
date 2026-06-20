"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Pencil, Plus, RefreshCcw, Receipt } from "lucide-react";
import { SalesChart } from "@/components/admin/sales-chart";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createAdminExpense, deleteAdminExpense, downloadAdminExpenseExport, fetchAdminExpenses, updateAdminExpense } from "@/lib/admin-client";
import type { AdminExpense, AdminExpenseData, AdminRangePreset } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

const presets: Array<{ value: AdminRangePreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" }
];

const COMMON_EXPENSE_CATEGORIES = ["Inventory", "Utilities", "Rent", "Salaries", "Maintenance", "Marketing", "Delivery", "Misc"];

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(monthKey: string, delta: number) {
  const [yearPart, monthPart] = monthKey.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const nextDate = new Date(year, month - 1 + delta, 1);
  return `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;
}

type ExpenseFormState = {
  branchId: string;
  title: string;
  category: string;
  amount: string;
  expenseDate: string;
  vendor: string;
  billReference: string;
  notes: string;
};

const EMPTY_EXPENSE_FORM: ExpenseFormState = {
  branchId: "",
  title: "",
  category: "Inventory",
  amount: "",
  expenseDate: new Date().toISOString().slice(0, 10),
  vendor: "",
  billReference: "",
  notes: ""
};

function mapExpenseToForm(expense: AdminExpense): ExpenseFormState {
  return {
    branchId: expense.branchId,
    title: expense.title,
    category: expense.category,
    amount: String(expense.amount),
    expenseDate: expense.expenseDate.slice(0, 10),
    vendor: expense.vendor ?? "",
    billReference: expense.billReference ?? "",
    notes: expense.notes ?? ""
  };
}

function ExpenseEditor({
  open,
  branches,
  value,
  editingExpense,
  saving,
  onChange,
  onClose,
  onSubmit
}: {
  open: boolean;
  branches: AdminExpenseData["branches"];
  value: ExpenseFormState;
  editingExpense: AdminExpense | null;
  saving: boolean;
  onChange: (next: ExpenseFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-pocket-charcoal/40 px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg border border-pocket-navy/10 bg-white p-6 shadow-panel">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Expense</p>
            <h2 className="mt-2 text-3xl font-black text-pocket-navy">{editingExpense ? "Edit expense" : "Add expense"}</h2>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Branch</label>
            <select
              value={value.branchId}
              onChange={(event) => onChange({ ...value, branchId: event.target.value })}
              className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 py-2 text-sm text-pocket-charcoal outline-none transition focus:border-pocket-orange focus:ring-2 focus:ring-pocket-orange/20"
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Date</label>
            <Input type="date" value={value.expenseDate} onChange={(event) => onChange({ ...value, expenseDate: event.target.value })} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-semibold text-pocket-navy">Title</label>
            <Input value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} placeholder="Electricity bill" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Category</label>
            <Input list="expense-categories" value={value.category} onChange={(event) => onChange({ ...value, category: event.target.value })} />
            <datalist id="expense-categories">
              {COMMON_EXPENSE_CATEGORIES.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Amount</label>
            <Input type="number" min="0" step="0.01" value={value.amount} onChange={(event) => onChange({ ...value, amount: event.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Vendor</label>
            <Input value={value.vendor} onChange={(event) => onChange({ ...value, vendor: event.target.value })} placeholder="Capital Fresh Foods" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Bill reference</label>
            <Input value={value.billReference} onChange={(event) => onChange({ ...value, billReference: event.target.value })} placeholder="INV-1001" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-semibold text-pocket-navy">Notes</label>
            <Textarea value={value.notes} onChange={(event) => onChange({ ...value, notes: event.target.value })} placeholder="Any supporting detail for finance and closing." />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? "Saving..." : editingExpense ? "Save Changes" : "Add Expense"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ExpenseManagement() {
  const [data, setData] = useState<AdminExpenseData | null>(null);
  const [preset, setPreset] = useState<AdminRangePreset>("30d");
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey());
  const [branchId, setBranchId] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<AdminExpense | null>(null);
  const [form, setForm] = useState<ExpenseFormState>(EMPTY_EXPENSE_FORM);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  async function loadExpenses(nextPreset = preset, nextBranchId = branchId, nextCategory = categoryFilter, nextMonth = selectedMonth) {
    try {
      setError("");
      const nextData = await fetchAdminExpenses({
        preset: nextPreset,
        branchId: nextBranchId || undefined,
        category: nextCategory || undefined,
        monthKey: nextPreset === "month" ? nextMonth : undefined
      });
      setData(nextData);
      const defaultBranchId = nextData.branches[0]?.id || "";
      if (nextBranchId !== branchId) {
        setBranchId(nextBranchId);
      }
      setForm((current) => ({
        ...current,
        branchId: current.branchId || defaultBranchId
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load expenses.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadExpenses(preset, branchId, categoryFilter, selectedMonth);
  }, [preset, categoryFilter, selectedMonth]);

  const filteredExpenses = useMemo(() => {
    if (!data) return [];
    return data.expenses.filter((expense) => {
      const matchesBranch = !branchId || expense.branchId === branchId;
      const matchesSearch =
        !search ||
        `${expense.title} ${expense.category} ${expense.vendor ?? ""} ${expense.billReference ?? ""}`.toLowerCase().includes(search.toLowerCase());
      return matchesBranch && matchesSearch;
    });
  }, [branchId, data, search]);

  const categoryOptions = useMemo(() => {
    const fromData = data?.categories.map((entry) => entry.label) ?? [];
    return [...new Set([...COMMON_EXPENSE_CATEGORIES, ...fromData])];
  }, [data]);

  function openCreate() {
    setEditingExpense(null);
    setForm({
      ...EMPTY_EXPENSE_FORM,
      branchId: branchId || data?.branches[0]?.id || "",
      category: categoryOptions[0] ?? "Inventory"
    });
    setEditorOpen(true);
  }

  function openEdit(expense: AdminExpense) {
    setEditingExpense(expense);
    setForm(mapExpenseToForm(expense));
    setEditorOpen(true);
  }

  async function submitExpense() {
    if (!form.branchId || !form.title.trim() || !form.category.trim() || !form.amount || !form.expenseDate) {
      setError("Branch, title, category, amount, and date are required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        branchId: form.branchId,
        title: form.title.trim(),
        category: form.category.trim(),
        amount: Number(form.amount),
        expenseDate: new Date(`${form.expenseDate}T12:00:00`).toISOString(),
        vendor: form.vendor.trim() || undefined,
        billReference: form.billReference.trim() || undefined,
        notes: form.notes.trim() || undefined
      };

      if (editingExpense) {
        await updateAdminExpense(editingExpense.id, payload);
      } else {
        await createAdminExpense(payload);
      }

      setEditorOpen(false);
      await loadExpenses(preset, branchId, categoryFilter, selectedMonth);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save expense.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteExpense(expense: AdminExpense) {
    const confirmed = window.confirm(`Delete ${expense.title}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setDeletingId(expense.id);
    setError("");
    try {
      await deleteAdminExpense(expense.id);
      await loadExpenses(preset, branchId, categoryFilter, selectedMonth);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete expense.");
    } finally {
      setDeletingId("");
    }
  }

  async function exportMonthSheet() {
    setExporting(true);
    setError("");
    try {
      await downloadAdminExpenseExport({
        preset: "month",
        branchId: branchId || undefined,
        category: categoryFilter || undefined,
        monthKey: selectedMonth
      });
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export month sheet.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <ExpenseEditor
        open={editorOpen}
        branches={data?.branches ?? []}
        value={form}
        editingExpense={editingExpense}
        saving={saving}
        onChange={setForm}
        onClose={() => setEditorOpen(false)}
        onSubmit={() => void submitExpense()}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Total spend</p>
          <p className="mt-3 text-3xl font-black text-pocket-navy">{formatCurrency(data?.summary.totalAmount ?? 0)}</p>
          <p className="mt-2 text-sm text-pocket-navy/60">{data?.range.label ?? "Selected period"} expense outflow.</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Entries</p>
          <p className="mt-3 text-3xl font-black text-pocket-navy">{data?.summary.totalCount ?? 0}</p>
          <p className="mt-2 text-sm text-pocket-navy/60">Bills, cash expenses, and adjustments logged.</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Average ticket</p>
          <p className="mt-3 text-3xl font-black text-pocket-navy">{formatCurrency(data?.summary.averageAmount ?? 0)}</p>
          <p className="mt-2 text-sm text-pocket-navy/60">Average spend per recorded expense.</p>
        </Card>
        <Card className="flex flex-col gap-4 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Actions</p>
            <p className="mt-3 text-sm text-pocket-navy/60">Add new expenses, refresh records, or export the selected month.</p>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-[48px_minmax(0,1fr)]">
            <Button
              variant="outline"
              className="h-11 px-0"
              onClick={() => {
                setRefreshing(true);
                void loadExpenses(preset, branchId, categoryFilter, selectedMonth);
              }}
              disabled={refreshing}
            >
              <RefreshCcw className="h-4 w-4" />
            </Button>
            <Button variant="outline" className="h-11 justify-center whitespace-nowrap" onClick={() => void exportMonthSheet()} disabled={exporting}>
              <Download className="h-4 w-4" />
              {exporting ? "Exporting..." : "Month Sheet"}
            </Button>
            <Button className="h-11 justify-center sm:col-span-2" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add Expense
            </Button>
          </div>
        </Card>
      </div>

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

      <Card className="p-5">
        <div className="flex flex-wrap gap-2">
          {presets.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPreset(option.value)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                preset === option.value
                  ? "border-pocket-orange bg-pocket-orange text-white"
                  : "border-pocket-navy/10 bg-white text-pocket-navy hover:bg-pocket-cream"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPreset("month");
              setSelectedMonth((current) => shiftMonth(current, -1));
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input
            type="month"
            value={selectedMonth}
            onChange={(event) => {
              setPreset("month");
              setSelectedMonth(event.target.value);
            }}
            className="w-[200px]"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPreset("month");
              setSelectedMonth((current) => shiftMonth(current, 1));
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <p className="text-sm text-pocket-navy/60">Pick any month to review that month’s records and export its sheet.</p>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[220px_220px_1fr]">
          <select
            value={branchId}
            onChange={(event) => {
              const nextBranchId = event.target.value;
              setBranchId(nextBranchId);
              void loadExpenses(preset, nextBranchId, categoryFilter, selectedMonth);
            }}
            className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 py-2 text-sm text-pocket-charcoal outline-none transition focus:border-pocket-orange focus:ring-2 focus:ring-pocket-orange/20"
          >
            <option value="">All branches</option>
            {(data?.branches ?? []).map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(event) => {
              const nextCategory = event.target.value;
              setCategoryFilter(nextCategory);
              void loadExpenses(preset, branchId, nextCategory, selectedMonth);
            }}
            className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 py-2 text-sm text-pocket-charcoal outline-none transition focus:border-pocket-orange focus:ring-2 focus:ring-pocket-orange/20"
          >
            <option value="">All categories</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, vendor, or bill reference" />
        </div>
      </Card>

      {loading || !data ? (
        <Card className="p-6 text-sm text-pocket-navy/60">Loading expenses...</Card>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_360px]">
            <SalesChart sales={data.series} title="Expense trend" description={`Recorded spend for ${data.range.label.toLowerCase()}.`} />
            <Card className="p-5">
              <p className="text-lg font-black text-pocket-navy">Category split</p>
              <p className="text-sm text-pocket-navy/60">Which expense buckets are consuming the most cash.</p>
              <div className="mt-4 space-y-3">
                {data.categories.length ? (
                  data.categories.map((entry) => (
                    <div key={entry.label} className="rounded-xl border border-pocket-navy/10 px-4 py-3">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-semibold text-pocket-navy">{entry.label}</p>
                          <p className="text-sm text-pocket-navy/60">{entry.count} entries</p>
                        </div>
                        <p className="font-black text-pocket-orange">{formatCurrency(entry.amount)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-pocket-navy/60">No expenses in this period.</p>
                )}
              </div>
            </Card>
          </div>

          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-pocket-cream text-pocket-orange">
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg font-black text-pocket-navy">Expense ledger</p>
                <p className="text-sm text-pocket-navy/60">Detailed expense lines for review, closing, and corrections.</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {filteredExpenses.length ? (
                filteredExpenses.map((expense) => (
                  <div key={expense.id} className="rounded-xl border border-pocket-navy/10 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div>
                          <p className="font-black text-pocket-navy">{expense.title}</p>
                          <p className="text-sm text-pocket-navy/60">
                            {expense.category} · {expense.branchName}
                          </p>
                        </div>
                        <div className="grid gap-2 text-sm text-pocket-navy/70 sm:grid-cols-2">
                          <p>Date: {new Intl.DateTimeFormat("en-PK", { month: "short", day: "numeric", year: "numeric" }).format(new Date(expense.expenseDate))}</p>
                          {expense.vendor ? <p>Vendor: {expense.vendor}</p> : null}
                          {expense.billReference ? <p>Bill: {expense.billReference}</p> : null}
                          {expense.createdByName ? <p>Logged by: {expense.createdByName}</p> : null}
                        </div>
                        {expense.notes ? <p className="text-sm text-pocket-navy/60">{expense.notes}</p> : null}
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-2xl font-black text-pocket-orange">{formatCurrency(expense.amount)}</p>
                        <Button variant="outline" onClick={() => openEdit(expense)}>
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                          onClick={() => void deleteExpense(expense)}
                          disabled={deletingId === expense.id}
                        >
                          {deletingId === expense.id ? "Deleting..." : "Delete"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-pocket-navy/60">No expenses match the current filters.</p>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
