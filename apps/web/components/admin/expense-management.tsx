"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Download, Pencil, Plus, RefreshCcw, Receipt } from "lucide-react";
import { FixedExpenseManagement } from "@/components/admin/fixed-expense-management";
import { SalesChart } from "@/components/admin/sales-chart";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createAdminExpense,
  deleteAdminExpense,
  downloadAdminExpenseExport,
  fetchAdminExpenses,
  fetchAdminSettings,
  fetchAdminVendors,
  updateAdminExpense,
  updateAdminSetting
} from "@/lib/admin-client";
import type { AdminExpense, AdminExpenseData, AdminRangePreset, AdminVendor } from "@/lib/types";
import { formatCompactCurrency, formatCurrency, getCurrentBusinessDateKey, toBusinessDateInputValue, toPakistanDateIso } from "@/lib/utils";

const presets: Array<{ value: AdminRangePreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "month", label: "This Month" },
  { value: "custom", label: "Custom" },
  { value: "year", label: "This Year" }
];

const COMMON_EXPENSE_CATEGORIES = ["Inventory", "Utilities", "Rent", "Salaries", "Maintenance", "Marketing", "Delivery", "Misc"];
const EXPENSE_CATEGORY_SETTING_KEY = "expense.categories";
const EXPENSE_TITLE_SETTING_KEY = "expense.titles";
const DEFAULT_EXPENSE_TITLES = [
  "Rent",
  "Salaries",
  "Electricity",
  "Gas",
  "Internet",
  "AC installment",
  "Maintenance",
  "Drinking water",
  "Marketing",
  "Breakfast",
  "Miscellaneous",
  "Cheese",
  "Electricity bill",
  "Boxes",
  "Opening stock purchase"
];
const MONEY_SOURCES = [
  { value: "CASH", label: "Cash" },
  { value: "EASYPAISA", label: "Easypaisa" },
  { value: "JAZZCASH", label: "JazzCash" }
] as const;

function getCurrentMonthKey() {
  return getCurrentBusinessDateKey().slice(0, 7);
}

function getTodayDateKey() {
  return getCurrentBusinessDateKey();
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
  paymentSource: (typeof MONEY_SOURCES)[number]["value"] | "";
  expenseDate: string;
  vendor: string;
  billReference: string;
  notes: string;
};

function createEmptyExpenseForm(): ExpenseFormState {
  return {
    branchId: "",
    title: "",
    category: "Inventory",
    amount: "",
    paymentSource: "",
    expenseDate: getCurrentBusinessDateKey(),
    vendor: "",
    billReference: "",
    notes: ""
  };
}

function mapExpenseToForm(expense: AdminExpense): ExpenseFormState {
  return {
    branchId: expense.branchId,
    title: expense.title,
    category: expense.category,
    amount: String(expense.amount),
    paymentSource: expense.paymentSource ?? "CASH",
    expenseDate: toBusinessDateInputValue(expense.expenseDate),
    vendor: expense.vendor ?? "",
    billReference: expense.billReference ?? "",
    notes: expense.notes ?? ""
  };
}

function ExpenseEditor({
  open,
  value,
  editingExpense,
  titleOptions,
  titleChoice,
  vendorOptions,
  categoryOptions,
  onAddCategory,
  onTitleChoiceChange,
  saving,
  onChange,
  onVendorChoiceChange,
  vendorChoice,
  onClose,
  onSubmit
}: {
  open: boolean;
  value: ExpenseFormState;
  editingExpense: AdminExpense | null;
  titleOptions: string[];
  titleChoice: string;
  vendorOptions: string[];
  categoryOptions: string[];
  onAddCategory: (category: string) => void | Promise<void>;
  onTitleChoiceChange: (nextTitle: string) => void;
  saving: boolean;
  onChange: (next: ExpenseFormState) => void;
  onVendorChoiceChange: (next: string) => void;
  vendorChoice: string;
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
            <label className="text-sm font-semibold text-pocket-navy">Date</label>
            <Input type="date" value={value.expenseDate} onChange={(event) => onChange({ ...value, expenseDate: event.target.value })} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-semibold text-pocket-navy">Title</label>
            <select
              value={titleChoice}
              onChange={(event) => {
                const nextTitle = event.target.value;
                onTitleChoiceChange(nextTitle);
                onChange({ ...value, title: nextTitle === "__custom__" ? "" : nextTitle });
              }}
              className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 py-2 text-sm text-pocket-charcoal outline-none transition focus:border-pocket-orange focus:ring-2 focus:ring-pocket-orange/20"
            >
              <option value="">Select an expense title</option>
              {titleOptions.map((title) => <option key={title} value={title}>{title}</option>)}
              <option value="__custom__">+ Add custom title</option>
            </select>
            {titleChoice === "__custom__" ? <Input value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} placeholder="Enter custom expense title" /> : null}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Category</label>
            <select
              value={value.category}
              onChange={(event) => {
                if (event.target.value === "__add_category__") {
                  const nextCategory = window.prompt("Enter a new expense category:");
                  if (nextCategory) {
                    void onAddCategory(nextCategory);
                  }
                  return;
                }
                onChange({ ...value, category: event.target.value });
              }}
              className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 py-2 text-sm text-pocket-charcoal outline-none transition focus:border-pocket-orange focus:ring-2 focus:ring-pocket-orange/20"
            >
              <option value="" disabled>
                Select category
              </option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
              <option value="__add_category__">+ Add category</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Amount</label>
            <Input type="number" min="0" step="0.01" value={value.amount} onChange={(event) => onChange({ ...value, amount: event.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Paid from</label>
            <select value={value.paymentSource} onChange={(event) => onChange({ ...value, paymentSource: event.target.value as ExpenseFormState["paymentSource"] })} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 py-2 text-sm text-pocket-charcoal outline-none transition focus:border-pocket-orange focus:ring-2 focus:ring-pocket-orange/20">
              <option value="" disabled>Select payment source</option>
              {MONEY_SOURCES.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Vendor</label>
            <select
              value={vendorChoice}
              onChange={(event) => onVendorChoiceChange(event.target.value)}
              className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 py-2 text-sm text-pocket-charcoal outline-none transition focus:border-pocket-orange focus:ring-2 focus:ring-pocket-orange/20"
            >
              <option value="">Select vendor</option>
              {vendorOptions.map((vendor) => (
                <option key={vendor} value={vendor}>
                  {vendor}
                </option>
              ))}
              <option value="__custom__">Other / custom</option>
            </select>
            {vendorChoice === "__custom__" ? (
              <Input value={value.vendor ?? ""} onChange={(event) => onChange({ ...value, vendor: event.target.value })} placeholder="Capital Fresh Foods" />
            ) : null}
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
  const [vendors, setVendors] = useState<AdminVendor[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<string[]>([]);
  const [expenseTitles, setExpenseTitles] = useState<string[]>([]);
  const [preset, setPreset] = useState<AdminRangePreset>("today");
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey());
  const [customStart, setCustomStart] = useState(getTodayDateKey());
  const [customEnd, setCustomEnd] = useState(getTodayDateKey());
  const [branchId, setBranchId] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<AdminExpense | null>(null);
  const [form, setForm] = useState<ExpenseFormState>(createEmptyExpenseForm);
  const [formDateEdited, setFormDateEdited] = useState(false);
  const lastBusinessDateRef = useRef(getCurrentBusinessDateKey());
  const [titleChoice, setTitleChoice] = useState("");
  const [vendorChoice, setVendorChoice] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [fixedExpensesOpen, setFixedExpensesOpen] = useState(false);

  async function loadExpenses(
    nextPreset = preset,
    nextBranchId = branchId,
    nextCategory = categoryFilter,
    nextMonth = selectedMonth,
    nextStart = customStart,
    nextEnd = customEnd
  ) {
    try {
      setError("");
      if (nextPreset === "custom" && (!nextStart || !nextEnd)) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const nextData = await fetchAdminExpenses({
        preset: nextPreset,
        branchId: nextBranchId || undefined,
        category: nextCategory || undefined,
        monthKey: nextPreset === "month" ? nextMonth : undefined,
        start: nextPreset === "custom" ? toPakistanDateIso(nextStart) : undefined,
        end: nextPreset === "custom" ? toPakistanDateIso(nextEnd, true) : undefined
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
    let cancelled = false;

    async function loadMetadata() {
      try {
        const [settings, vendorData] = await Promise.all([fetchAdminSettings(), fetchAdminVendors()]);
        if (cancelled) return;

        const savedCategorySetting = settings.find((setting) => setting.key === EXPENSE_CATEGORY_SETTING_KEY);
        const savedCategories = Array.isArray(savedCategorySetting?.value) ? savedCategorySetting.value.map((entry) => String(entry).trim()).filter(Boolean) : [];
        setExpenseCategories(savedCategories);
        const savedTitleSetting = settings.find((setting) => setting.key === EXPENSE_TITLE_SETTING_KEY);
        const savedTitles = Array.isArray(savedTitleSetting?.value) ? savedTitleSetting.value.map((entry) => String(entry).trim()).filter(Boolean) : [];
        setExpenseTitles(savedTitles);
        setVendors(vendorData.vendors);
      } catch {
        // Metadata is helpful but not required for the page to render.
      }
    }

    void loadMetadata();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadExpenses(preset, branchId, categoryFilter, selectedMonth, customStart, customEnd);
  }, [preset, branchId, categoryFilter, selectedMonth, customStart, customEnd]);

  useEffect(() => {
    const checkBusinessDay = () => {
      const nextBusinessDate = getCurrentBusinessDateKey();
      if (nextBusinessDate === lastBusinessDateRef.current) return;

      lastBusinessDateRef.current = nextBusinessDate;
      if (editorOpen && !editingExpense && !formDateEdited) {
        setForm((current) => ({ ...current, expenseDate: nextBusinessDate }));
      }
      if (preset === "today") {
        void loadExpenses("today", branchId, categoryFilter, selectedMonth, customStart, customEnd);
      }
    };

    const interval = window.setInterval(checkBusinessDay, 30_000);
    window.addEventListener("focus", checkBusinessDay);
    document.addEventListener("visibilitychange", checkBusinessDay);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", checkBusinessDay);
      document.removeEventListener("visibilitychange", checkBusinessDay);
    };
  }, [editorOpen, editingExpense, formDateEdited, preset, branchId, categoryFilter, selectedMonth, customStart, customEnd]);

  const filteredExpenses = useMemo(() => {
    if (!data) return [];
    return data.expenses.filter((expense) => {
      const matchesSearch =
        !search ||
        `${expense.title} ${expense.category} ${expense.vendor ?? ""} ${expense.billReference ?? ""}`.toLowerCase().includes(search.toLowerCase());
      return matchesSearch;
    });
  }, [data, search]);

  const categoryOptions = useMemo(() => {
    const fromData = data?.categories.map((entry) => entry.label) ?? [];
    return [...new Set([...COMMON_EXPENSE_CATEGORIES, ...expenseCategories, ...fromData, ...(form.category ? [form.category] : [])])].sort((left, right) => left.localeCompare(right));
  }, [data, expenseCategories, form.category]);

  const titleOptions = useMemo(() => [...new Set([...DEFAULT_EXPENSE_TITLES, ...expenseTitles])].sort((left, right) => left.localeCompare(right)), [expenseTitles]);

  const vendorOptions = useMemo(() => {
    return [...new Set(vendors.map((vendor) => vendor.vendorName).filter(Boolean).concat(form.vendor && vendorChoice === "__custom__" ? [form.vendor] : []))].sort((left, right) =>
      left.localeCompare(right)
    );
  }, [form.vendor, vendorChoice, vendors]);

  function openCreate() {
    setEditingExpense(null);
    setFormDateEdited(false);
    setForm({
      ...createEmptyExpenseForm(),
      branchId: branchId || data?.branches[0]?.id || "",
      category: categoryOptions[0] ?? "Inventory"
    });
    setTitleChoice("");
    setVendorChoice("");
    setEditorOpen(true);
  }

  function openEdit(expense: AdminExpense) {
    setEditingExpense(expense);
    setFormDateEdited(true);
    setForm(mapExpenseToForm(expense));
    setTitleChoice(titleOptions.includes(expense.title) ? expense.title : "__custom__");
    setVendorChoice(expense.vendor && vendorOptions.includes(expense.vendor) ? expense.vendor : expense.vendor ? "__custom__" : "");
    setEditorOpen(true);
  }

  async function addExpenseCategory(nextCategory: string) {
    const trimmed = nextCategory.trim();
    if (!trimmed) {
      return;
    }

    const nextCategories = [...new Set([...expenseCategories, trimmed])].sort((left, right) => left.localeCompare(right));
    try {
      await updateAdminSetting(EXPENSE_CATEGORY_SETTING_KEY, nextCategories);
      setExpenseCategories(nextCategories);
      setForm((current) => ({ ...current, category: trimmed }));
    } catch (categoryError) {
      setError(categoryError instanceof Error ? categoryError.message : "Failed to save category.");
    }
  }

  async function submitExpense() {
    const nextCategory = form.category.trim();
    const nextVendor = vendorChoice === "__custom__" ? form.vendor.trim() : vendorChoice.trim();
    if (!form.branchId || !form.title.trim() || !nextCategory || !form.amount || !form.expenseDate || !form.paymentSource) {
      setError("Title, category, amount, paid from, and date are required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        branchId: form.branchId,
        title: form.title.trim(),
        category: nextCategory,
        amount: Number(form.amount),
        paymentSource: form.paymentSource,
        expenseDate: new Date(`${form.expenseDate}T12:00:00+05:00`).toISOString(),
        vendor: nextVendor || undefined,
        billReference: form.billReference.trim() || undefined,
        notes: form.notes.trim() || undefined
      };

      if (editingExpense) {
        await updateAdminExpense(editingExpense.id, payload);
      } else {
        await createAdminExpense(payload);
      }

      if (titleChoice === "__custom__") {
        const nextTitles = [...new Set([...expenseTitles, form.title.trim()])].sort((left, right) => left.localeCompare(right));
        if (nextTitles.length !== expenseTitles.length) {
          await updateAdminSetting(EXPENSE_TITLE_SETTING_KEY, nextTitles);
          setExpenseTitles(nextTitles);
        }
      }

      setEditorOpen(false);
      await loadExpenses(preset, branchId, categoryFilter, selectedMonth, customStart, customEnd);
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
      await loadExpenses(preset, branchId, categoryFilter, selectedMonth, customStart, customEnd);
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
      const exportParams =
        preset === "custom"
          ? customStart && customEnd
            ? {
                preset,
                branchId: branchId || undefined,
                category: categoryFilter || undefined,
                start: toPakistanDateIso(customStart),
                end: toPakistanDateIso(customEnd, true)
              }
            : null
          : {
              preset,
              branchId: branchId || undefined,
              category: categoryFilter || undefined,
              monthKey: preset === "month" ? selectedMonth : undefined
            };

      if (!exportParams) {
        setError("Choose a start and end date before exporting.");
        return;
      }

      await downloadAdminExpenseExport({
        ...exportParams
      });
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export expenses.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <ExpenseEditor
        open={editorOpen}
        value={form}
        editingExpense={editingExpense}
        titleOptions={titleOptions}
        titleChoice={titleChoice}
        vendorOptions={vendorOptions}
        categoryOptions={categoryOptions}
        onAddCategory={(nextCategory) => void addExpenseCategory(nextCategory)}
        onTitleChoiceChange={setTitleChoice}
        saving={saving}
        onChange={(next) => {
          if (next.expenseDate !== form.expenseDate) {
            setFormDateEdited(true);
          }
          setForm(next);
        }}
        onVendorChoiceChange={setVendorChoice}
        vendorChoice={vendorChoice}
        onClose={() => setEditorOpen(false)}
        onSubmit={() => void submitExpense()}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Total spend</p>
          <p className="mt-3 min-w-0 break-words text-[clamp(1rem,1.6vw,1.625rem)] font-black leading-tight tracking-tight text-pocket-navy">{formatCompactCurrency(data?.summary.totalAmount ?? 0)}</p>
          <p className="mt-2 text-sm text-pocket-navy/60">{data?.range.label ?? "Selected period"} expense outflow.</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Entries</p>
          <p className="mt-3 text-3xl font-black text-pocket-navy">{data?.summary.totalCount ?? 0}</p>
          <p className="mt-2 text-sm text-pocket-navy/60">Bills, cash expenses, and adjustments logged.</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Average ticket</p>
          <p className="mt-3 min-w-0 break-words text-[clamp(1rem,1.6vw,1.625rem)] font-black leading-tight tracking-tight text-pocket-navy">{formatCompactCurrency(data?.summary.averageAmount ?? 0)}</p>
          <p className="mt-2 text-sm text-pocket-navy/60">Average spend per recorded expense.</p>
        </Card>
        <Card className="flex flex-col gap-4 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Actions</p>
            <p className="mt-3 text-sm text-pocket-navy/60">Add new expenses, refresh records, or export the selected period.</p>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-[48px_minmax(0,1fr)]">
            <Button
              variant="outline"
              className="h-11 px-0"
              onClick={() => {
                setRefreshing(true);
                void loadExpenses(preset, branchId, categoryFilter, selectedMonth, customStart, customEnd);
              }}
              disabled={refreshing}
            >
              <RefreshCcw className="h-4 w-4" />
            </Button>
            <Button variant="outline" className="h-11 justify-center whitespace-nowrap" onClick={() => void exportMonthSheet()} disabled={exporting}>
              <Download className="h-4 w-4" />
              {exporting ? "Exporting..." : "Export Sheet"}
            </Button>
            <Button className="h-11 justify-center sm:col-span-2" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add Expense
            </Button>
          </div>
        </Card>
      </div>

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

      <Card className="overflow-hidden">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-4 p-5 text-left hover:bg-pocket-cream/30"
          onClick={() => setFixedExpensesOpen((current) => !current)}
          aria-expanded={fixedExpensesOpen}
        >
          <span>
            <span className="block text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Fixed expenses</span>
            <span className="mt-1 block text-sm text-pocket-navy/60">Manage recurring costs here. Generate them to add them to this expense ledger and profit calculations.</span>
          </span>
          <ChevronDown className={`h-5 w-5 shrink-0 text-pocket-navy transition-transform ${fixedExpensesOpen ? "rotate-180" : ""}`} />
        </button>
        {fixedExpensesOpen ? <div className="border-t border-pocket-navy/10 p-5"><FixedExpenseManagement embedded onExpensesChanged={() => loadExpenses(preset, branchId, categoryFilter, selectedMonth, customStart, customEnd)} /></div> : null}
      </Card>

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
          <p className="text-sm text-pocket-navy/60">Dates use the 6AM-6AM Pakistan business day.</p>
        </div>
        {preset === "month" ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedMonth((current) => shiftMonth(current, -1));
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="month"
              value={selectedMonth}
              onChange={(event) => {
                setSelectedMonth(event.target.value);
              }}
              className="w-[200px]"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedMonth((current) => shiftMonth(current, 1));
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
        {preset === "custom" ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
            <Input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
            <p className="text-sm text-pocket-navy/60">Set the same start and end date to view one specific day.</p>
          </div>
        ) : null}
        <div className="mt-4 grid gap-4 lg:grid-cols-[220px_1fr]">
          <select
            value={categoryFilter}
            onChange={(event) => {
              setCategoryFilter(event.target.value);
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
                          <p>Paid from: {MONEY_SOURCES.find((source) => source.value === expense.paymentSource)?.label ?? expense.paymentSource}</p>
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
