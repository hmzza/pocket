"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Download, Pencil, Plus, RefreshCcw, Receipt, Search } from "lucide-react";
import { FixedExpenseManagement } from "@/components/admin/fixed-expense-management";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createAdminExpense,
  createAdminStockPurchase,
  deleteAdminExpense,
  downloadAdminExpenseExport,
  fetchAdminExpenses,
  fetchAdminInventory,
  fetchAdminSettings,
  fetchAdminExpenseTitleFavorites,
  updateAdminExpense,
  updateAdminStockPurchase,
  updateAdminSetting
} from "@/lib/admin-client";
import type { AdminExpense, AdminExpenseData, AdminInventoryData, AdminInventoryItem, AdminRangePreset } from "@/lib/types";
import { formatCompactCurrency, formatCurrency, getCurrentBusinessDateKey, toBusinessDateInputValue, toPakistanDateIso } from "@/lib/utils";

const presets: Array<{ value: AdminRangePreset; label: string }> = [
  { value: "yesterday", label: "Yesterday" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
  { value: "custom", label: "Custom" }
];

const COMMON_EXPENSE_CATEGORIES = ["Utilities", "Rent", "Salaries", "Maintenance", "Marketing", "Delivery", "Packaging", "Misc"];
const EXPENSE_CATEGORY_SETTING_KEY = "expense.categories";
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
};

type StockPurchaseFormState = {
  ingredientId: string;
  purchaseUnitId: string;
  purchaseQuantity: string;
  amount: string;
  paymentSource: (typeof MONEY_SOURCES)[number]["value"] | "";
  receivedDate: string;
  paymentDate: string;
};

type ExpenseEntryMode = "OTHER" | "STOCK";

function createEmptyExpenseForm(): ExpenseFormState {
  return {
    branchId: "",
    title: "",
    category: "",
    amount: "",
    paymentSource: "",
    expenseDate: getCurrentBusinessDateKey(),
  };
}

function createEmptyStockPurchaseForm(): StockPurchaseFormState {
  return {
    ingredientId: "",
    purchaseUnitId: "",
    purchaseQuantity: "",
    amount: "",
    paymentSource: "",
    receivedDate: getCurrentBusinessDateKey(),
    paymentDate: getCurrentBusinessDateKey(),
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
  };
}

function EntryModeTabs({ mode, onChange }: { mode: ExpenseEntryMode; onChange: (mode: ExpenseEntryMode) => void }) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg bg-pocket-cream p-1">
      {([{ value: "OTHER", label: "Other expense" }, { value: "STOCK", label: "Stock purchase" }] as const).map((option) => (
        <button key={option.value} type="button" onClick={() => onChange(option.value)} className={`rounded-md px-3 py-2 text-sm font-bold transition ${mode === option.value ? "bg-white text-pocket-navy shadow-sm" : "text-pocket-navy/55 hover:text-pocket-navy"}`}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SearchableExpenseTitleSelect({
  options,
  value,
  onChange
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const filtered = options.filter((title) => title.toLowerCase().includes(search.toLowerCase()));
  const label = value === "__custom__" ? "Add custom title" : value || "Select an expense title";

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen((current) => !current)} className="flex h-11 w-full items-center justify-between rounded-md border border-pocket-navy/15 bg-white px-3 text-left text-sm text-pocket-charcoal focus:border-pocket-orange focus:outline-none focus:ring-2 focus:ring-pocket-orange/20">
        <span className={value ? "text-pocket-charcoal" : "text-pocket-navy/50"}>{label}</span>
        <ChevronDown className={`h-4 w-4 text-pocket-navy/50 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-20 overflow-hidden rounded-md border border-pocket-navy/15 bg-white shadow-panel">
          <div className="flex items-center gap-2 border-b border-pocket-navy/10 px-3 py-2">
            <Search className="h-4 w-4 text-pocket-navy/45" />
            <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search favorite titles" className="h-8 min-w-0 flex-1 bg-transparent text-sm text-pocket-charcoal outline-none" />
          </div>
          <div className="max-h-52 overflow-y-auto p-1">
            {filtered.map((title) => (
              <button key={title} type="button" onClick={() => { onChange(title); setOpen(false); setSearch(""); }} className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-pocket-navy hover:bg-pocket-cream">
                <span>{title}</span>
                {value === title ? <Check className="h-4 w-4 text-pocket-orange" /> : null}
              </button>
            ))}
            {!filtered.length ? <p className="px-3 py-2 text-sm text-pocket-navy/50">No favorite titles.</p> : null}
            <button type="button" onClick={() => { onChange("__custom__"); setOpen(false); setSearch(""); }} className="mt-1 flex w-full border-t border-pocket-navy/10 px-3 py-2 text-left text-sm font-bold text-pocket-orange hover:bg-pocket-cream">
              + Add custom title
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ExpenseEditor({
  open,
  value,
  editingExpense,
  titleOptions,
  titleChoice,
  addTitleToFavorites,
  categoryOptions,
  onAddCategory,
  onTitleChoiceChange,
  onAddTitleToFavoritesChange,
  saving,
  onChange,
  mode,
  onModeChange,
  onClose,
  onSubmit
}: {
  open: boolean;
  value: ExpenseFormState;
  editingExpense: AdminExpense | null;
  titleOptions: string[];
  titleChoice: string;
  addTitleToFavorites: boolean;
  categoryOptions: string[];
  onAddCategory: (category: string) => void | Promise<void>;
  onTitleChoiceChange: (nextTitle: string) => void;
  onAddTitleToFavoritesChange: (value: boolean) => void;
  saving: boolean;
  onChange: (next: ExpenseFormState) => void;
  mode: ExpenseEntryMode;
  onModeChange: (mode: ExpenseEntryMode) => void;
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

        <EntryModeTabs mode={mode} onChange={onModeChange} />

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Date</label>
            <Input type="date" value={value.expenseDate} onChange={(event) => onChange({ ...value, expenseDate: event.target.value })} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-semibold text-pocket-navy">Title</label>
            <SearchableExpenseTitleSelect
              options={titleOptions}
              value={titleChoice}
              onChange={(nextTitle) => {
                onTitleChoiceChange(nextTitle);
                onChange({ ...value, title: nextTitle === "__custom__" ? "" : nextTitle });
              }}
            />
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
          <div className="flex items-end gap-4 md:col-span-2">
            <div className="min-w-0 flex-1 space-y-2">
              <label className="text-sm font-semibold text-pocket-navy">Paid from</label>
              <select value={value.paymentSource} onChange={(event) => onChange({ ...value, paymentSource: event.target.value as ExpenseFormState["paymentSource"] })} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 py-2 text-sm text-pocket-charcoal outline-none transition focus:border-pocket-orange focus:ring-2 focus:ring-pocket-orange/20">
                <option value="" disabled>Select payment source</option>
                {MONEY_SOURCES.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
              </select>
            </div>
            {titleChoice === "__custom__" ? <label className="flex h-11 shrink-0 items-center gap-2 text-sm font-semibold text-pocket-navy"><input type="checkbox" checked={addTitleToFavorites} onChange={(event) => onAddTitleToFavoritesChange(event.target.checked)} className="h-4 w-4 accent-pocket-orange" />Add to favorites</label> : null}
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

function SearchableExpenseInventorySelect({
  items,
  value,
  disabled,
  onChange
}: {
  items: AdminInventoryItem[];
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = items.find((item) => item.ingredientId === value);
  const visible = items.filter((item) => `${item.name} ${item.sku} ${item.type}`.toLowerCase().includes(search.toLowerCase())).slice(0, 80);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen((current) => !current)} className="flex h-11 w-full items-center justify-between rounded-md border border-pocket-navy/15 bg-white px-3 text-left text-sm disabled:cursor-not-allowed disabled:bg-pocket-cream">
        <span className={selected ? "truncate" : "text-pocket-navy/50"}>{selected ? `${selected.name} (${selected.unit})` : "Select item"}</span>
        <span className="ml-2 text-pocket-navy/50">⌄</span>
      </button>
      {open ? (
        <div className="absolute z-30 mt-2 w-full rounded-md border border-pocket-navy/15 bg-white p-2 shadow-panel">
          <Input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search items" />
          <div className="mt-2 max-h-56 overflow-y-auto">
            {visible.map((item) => <button key={item.ingredientId} type="button" onClick={() => { onChange(item.ingredientId); setOpen(false); setSearch(""); }} className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-pocket-cream"><span>{item.name}</span><span className="text-xs text-pocket-navy/50">{item.unit}</span></button>)}
            {!visible.length ? <p className="px-3 py-2 text-sm text-pocket-navy/50">No matching items.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StockPurchaseEditor({
  open,
  value,
  items,
  editingExpense,
  saving,
  onChange,
  onModeChange,
  onClose,
  onSubmit
}: {
  open: boolean;
  value: StockPurchaseFormState;
  items: AdminInventoryItem[];
  editingExpense: AdminExpense | null;
  saving: boolean;
  onChange: (next: StockPurchaseFormState) => void;
  onModeChange: (mode: ExpenseEntryMode) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!open) return null;
  const selectedItem = items.find((item) => item.ingredientId === value.ingredientId) ?? null;
  const selectedUnit = selectedItem?.purchaseUnits.find((unit) => unit.id === value.purchaseUnitId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-pocket-charcoal/40 px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg border border-pocket-navy/10 bg-white p-6 shadow-panel">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Expense</p>
            <h2 className="mt-2 text-3xl font-black text-pocket-navy">{editingExpense ? "Edit stock purchase" : "Add stock purchase"}</h2>
          </div>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
        <EntryModeTabs mode="STOCK" onChange={onModeChange} />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Received date</label>
            <Input type="date" value={value.receivedDate} onChange={(event) => onChange({ ...value, receivedDate: event.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Payment date</label>
            <Input type="date" value={value.paymentDate} onChange={(event) => onChange({ ...value, paymentDate: event.target.value })} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-semibold text-pocket-navy">Inventory item</label>
            <SearchableExpenseInventorySelect items={items} value={value.ingredientId} disabled={Boolean(editingExpense)} onChange={(ingredientId) => onChange({ ...value, ingredientId, purchaseUnitId: "" })} />
            {selectedItem?.type === "PACKAGING" ? <p className="text-xs text-pocket-navy/55">Packaging has stock and cost but no calories.</p> : null}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Purchase unit</label>
            <select value={value.purchaseUnitId} onChange={(event) => onChange({ ...value, purchaseUnitId: event.target.value })} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
              <option value="">Base unit ({selectedItem?.unit ?? "unit"})</option>
              {(selectedItem?.purchaseUnits ?? []).map((unit) => <option key={unit.id} value={unit.id}>{unit.name} = {unit.quantityInBaseUnits} {selectedItem?.unit}</option>)}
            </select>
            {selectedUnit ? <p className="text-xs text-pocket-navy/55">Adds {selectedUnit.quantityInBaseUnits} {selectedItem?.unit} per purchase unit.</p> : null}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Quantity purchased</label>
            <Input type="number" min="0" step="0.001" value={value.purchaseQuantity} onChange={(event) => onChange({ ...value, purchaseQuantity: event.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Total purchase cost</label>
            <Input type="number" min="0" step="0.01" value={value.amount} onChange={(event) => onChange({ ...value, amount: event.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Paid from</label>
            <select value={value.paymentSource} onChange={(event) => onChange({ ...value, paymentSource: event.target.value as StockPurchaseFormState["paymentSource"] })} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
              <option value="" disabled>Select payment source</option>
              {MONEY_SOURCES.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSubmit} disabled={saving}>{saving ? "Saving..." : editingExpense ? "Save Changes" : "Add Stock Purchase"}</Button>
        </div>
      </div>
    </div>
  );
}

export function ExpenseManagement() {
  const [data, setData] = useState<AdminExpenseData | null>(null);
  const [inventory, setInventory] = useState<AdminInventoryData | null>(null);
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
  const [entryMode, setEntryMode] = useState<ExpenseEntryMode>("OTHER");
  const [form, setForm] = useState<ExpenseFormState>(createEmptyExpenseForm);
  const [stockForm, setStockForm] = useState<StockPurchaseFormState>(createEmptyStockPurchaseForm);
  const [formDateEdited, setFormDateEdited] = useState(false);
  const lastBusinessDateRef = useRef(getCurrentBusinessDateKey());
  const [titleChoice, setTitleChoice] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [fixedExpensesOpen, setFixedExpensesOpen] = useState(false);
  const [addTitleToFavorites, setAddTitleToFavorites] = useState(false);

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
        const [settings, inventoryData, favoriteTitles] = await Promise.all([fetchAdminSettings(), fetchAdminInventory(), fetchAdminExpenseTitleFavorites()]);
        if (cancelled) return;

        const savedCategorySetting = settings.find((setting) => setting.key === EXPENSE_CATEGORY_SETTING_KEY);
        const savedCategories = Array.isArray(savedCategorySetting?.value) ? savedCategorySetting.value.map((entry) => String(entry).trim()).filter(Boolean) : [];
        setExpenseCategories(savedCategories);
        setExpenseTitles(favoriteTitles);
        setInventory(inventoryData);
        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          if (params.get("entry") === "stock") {
            setEntryMode("STOCK");
            setStockForm((current) => ({ ...current, ingredientId: params.get("ingredientId") ?? current.ingredientId }));
            setEditorOpen(true);
          }
        }
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
    if (!branchId) return;
    void fetchAdminExpenseTitleFavorites().then(setExpenseTitles).catch(() => undefined);
  }, [branchId]);

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
    return data.expenses
      .filter((expense) => {
      const matchesSearch =
        !search ||
        `${expense.title} ${expense.category}`.toLowerCase().includes(search.toLowerCase());
      return matchesSearch;
      })
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }, [data, search]);

  const categoryOptions = useMemo(() => {
    const fromData = data?.categories.map((entry) => entry.label) ?? [];
    return [...new Set([...COMMON_EXPENSE_CATEGORIES, ...expenseCategories, ...fromData, ...(form.category ? [form.category] : [])])]
      .filter((category) => !["inventory", "barf"].includes(category.toLowerCase()))
      .sort((left, right) => left.localeCompare(right));
  }, [data, expenseCategories, form.category]);

  const titleOptions = useMemo(() => [...new Set(expenseTitles)].sort((left, right) => left.localeCompare(right)), [expenseTitles]);

  const stockItems = useMemo(
    () => (inventory?.items ?? []).filter((item) => item.isActive && item.type !== "PREPARED"),
    [inventory]
  );

  function openCreate() {
    setEditingExpense(null);
    setFormDateEdited(false);
    setForm({
      ...createEmptyExpenseForm(),
      branchId: branchId || data?.branches[0]?.id || "",
      category: ""
    });
    setTitleChoice("");
    setAddTitleToFavorites(false);
    setEntryMode("OTHER");
    setStockForm(createEmptyStockPurchaseForm());
    setEditorOpen(true);
  }

  function openEdit(expense: AdminExpense) {
    if (expense.stockPurchase) {
      setEditingExpense(expense);
      setEntryMode("STOCK");
      setStockForm({
        ...createEmptyStockPurchaseForm(),
        ingredientId: expense.stockPurchase.ingredientId,
        purchaseUnitId: expense.stockPurchase.purchaseUnitId ?? "",
        purchaseQuantity: String(expense.stockPurchase.purchaseQuantity || expense.stockPurchase.baseQuantity),
        amount: String(expense.amount),
        paymentSource: expense.paymentSource,
        receivedDate: toBusinessDateInputValue(expense.stockPurchase.receivedDate ?? expense.stockPurchase.purchaseDate ?? expense.expenseDate),
        paymentDate: toBusinessDateInputValue(expense.stockPurchase.paymentDate ?? expense.expenseDate),
      });
      setEditorOpen(true);
      return;
    }
    setEditingExpense(expense);
    setFormDateEdited(true);
    setForm(mapExpenseToForm(expense));
    setTitleChoice(titleOptions.includes(expense.title) ? expense.title : "__custom__");
    setAddTitleToFavorites(false);
    setEntryMode("OTHER");
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

  async function submitStockPurchase() {
    const item = stockItems.find((entry) => entry.ingredientId === stockForm.ingredientId);
    if (!item || !stockForm.purchaseQuantity || !stockForm.amount || !stockForm.paymentSource || !stockForm.receivedDate || !stockForm.paymentDate) {
      setError("Inventory item, purchase quantity, cost, paid from, received date, and payment date are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        branchId: branchId || data?.branches[0]?.id || "",
        ingredientId: stockForm.ingredientId,
        purchaseUnitId: stockForm.purchaseUnitId || null,
        purchaseQuantity: Number(stockForm.purchaseQuantity),
        amount: Number(stockForm.amount),
        paymentSource: stockForm.paymentSource,
        receivedDate: new Date(`${stockForm.receivedDate}T12:00:00+05:00`).toISOString(),
        paymentDate: new Date(`${stockForm.paymentDate}T12:00:00+05:00`).toISOString(),
      };
      if (editingExpense) await updateAdminStockPurchase(editingExpense.id, payload);
      else await createAdminStockPurchase(payload);
      setEditorOpen(false);
      setEditingExpense(null);
      setEntryMode("OTHER");
      await Promise.all([
        loadExpenses(preset, branchId, categoryFilter, selectedMonth, customStart, customEnd),
        fetchAdminInventory().then(setInventory)
      ]);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save stock purchase.");
    } finally {
      setSaving(false);
    }
  }

  async function submitExpense() {
    const nextCategory = form.category.trim();
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
        addToFavorites: titleChoice === "__custom__" && addTitleToFavorites,
        expenseDate: new Date(`${form.expenseDate}T12:00:00+05:00`).toISOString(),
      };

      if (editingExpense) {
        await updateAdminExpense(editingExpense.id, payload);
      } else {
        await createAdminExpense(payload);
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
      {entryMode === "STOCK" ? (
        <StockPurchaseEditor
          key={editingExpense?.id ?? "new-stock"}
          open={editorOpen}
          value={stockForm}
          items={stockItems}
          editingExpense={editingExpense}
          saving={saving}
          onChange={setStockForm}
          onModeChange={(mode) => setEntryMode(mode)}
          onClose={() => setEditorOpen(false)}
          onSubmit={() => void submitStockPurchase()}
        />
      ) : (
        <ExpenseEditor
          open={editorOpen}
          value={form}
          editingExpense={editingExpense}
          titleOptions={titleOptions}
          titleChoice={titleChoice}
          addTitleToFavorites={addTitleToFavorites}
          categoryOptions={categoryOptions}
          onAddCategory={(nextCategory) => void addExpenseCategory(nextCategory)}
          onTitleChoiceChange={setTitleChoice}
          onAddTitleToFavoritesChange={setAddTitleToFavorites}
          saving={saving}
          mode={entryMode}
          onModeChange={(mode) => { setEntryMode(mode); if (mode === "STOCK") setStockForm(createEmptyStockPurchaseForm()); }}
          onChange={(next) => {
            if (next.expenseDate !== form.expenseDate) {
              setFormDateEdited(true);
            }
            setForm(next);
          }}
          onClose={() => setEditorOpen(false)}
          onSubmit={() => void submitExpense()}
        />
      )}

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
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title or category" />
        </div>
      </Card>

      {loading || !data ? (
        <Card className="p-6 text-sm text-pocket-navy/60">Loading expenses...</Card>
      ) : (
        <>
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
                  <div key={expense.id} className={`rounded-xl border p-4 ${expense.stockPurchase ? "border-emerald-200 bg-emerald-50/60" : "border-pocket-navy/10 bg-white"}`}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div>
                          <p className="font-black text-pocket-navy">{expense.stockPurchase?.ingredientName ?? expense.title.replace(/^Stock purchase:\s*/i, "")}</p>
                          <p className="text-sm text-pocket-navy/60">
                            {expense.category}
                          </p>
                        </div>
                        <div className="grid gap-2 text-sm text-pocket-navy/70 sm:grid-cols-2">
                          <p>
                            Logged at: {new Intl.DateTimeFormat("en-PK", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                              hour12: true,
                              timeZone: "Asia/Karachi"
                            }).format(new Date(expense.createdAt))} PKT
                          </p>
                          <p>{expense.stockPurchase ? `Payment date: ${toBusinessDateInputValue(expense.stockPurchase.paymentDate ?? expense.expenseDate)}` : `Expense date: ${toBusinessDateInputValue(expense.expenseDate)}`}</p>
                          {expense.stockPurchase?.receivedDate ? <p>Received date: {toBusinessDateInputValue(expense.stockPurchase.receivedDate)}</p> : null}
                          <p>Paid from: {MONEY_SOURCES.find((source) => source.value === expense.paymentSource)?.label ?? expense.paymentSource}</p>
                          {expense.stockPurchase ? <p>Added: {expense.stockPurchase.purchaseQuantity} {expense.stockPurchase.purchaseUnitLabel} ({expense.stockPurchase.baseQuantity} base units)</p> : null}
                          {expense.createdByName ? <p>Logged by: {expense.createdByName}</p> : null}
                        </div>
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
