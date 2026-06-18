"use client";

import Link from "next/link";
import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import { ClipboardList, History, Pencil, Plus, RefreshCcw, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createAdminInventoryItem,
  createAdminInventoryTransaction,
  fetchAdminInventory,
  updateAdminInventoryItem
} from "@/lib/admin-client";
import type { AdminInventoryData, AdminInventoryItem } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

const INVENTORY_UNITS = ["kg", "slices", "litre", "bottles", "loafs", "pieces"];
const STOCK_ACTIONS = [
  { value: "PURCHASE", label: "Purchase / Restock" },
  { value: "ADJUSTMENT", label: "Manual Adjustment" },
  { value: "WASTAGE", label: "Wastage" },
  { value: "RETURN", label: "Return to Stock" },
  { value: "CLOSING", label: "Daily Closing Count" }
] as const;

const INVENTORY_ROUTES = [
  {
    href: "/admin/inventory/stock-movement",
    label: "Stock Movement",
    description: "Post restocks, wastage, corrections, and daily closing counts.",
    icon: Warehouse
  },
  {
    href: "/admin/inventory/stock-log",
    label: "Recent Stock Log",
    description: "Review every movement with actor, note, and running balance.",
    icon: History
  },
  {
    href: "/admin/inventory/inventory-list",
    label: "Inventory List",
    description: "See all tracked ingredients, values, reorder levels, and edit items.",
    icon: ClipboardList
  }
] as const;

export type InventoryViewMode = "overview" | "movement" | "log" | "list";

type InventoryItemFormState = {
  branchId: string;
  name: string;
  sku: string;
  unit: string;
  reorderLevel: string;
  costPerUnit: string;
  openingStock: string;
};

type StockFormState = {
  branchId: string;
  ingredientId: string;
  action: (typeof STOCK_ACTIONS)[number]["value"];
  quantity: string;
  countedQuantity: string;
  note: string;
};

const EMPTY_ITEM_FORM: InventoryItemFormState = {
  branchId: "",
  name: "",
  sku: "",
  unit: "kg",
  reorderLevel: "",
  costPerUnit: "0",
  openingStock: "0"
};

const EMPTY_STOCK_FORM: StockFormState = {
  branchId: "",
  ingredientId: "",
  action: "PURCHASE",
  quantity: "",
  countedQuantity: "",
  note: ""
};

function mapItemToForm(item: AdminInventoryItem): InventoryItemFormState {
  return {
    branchId: item.branchId,
    name: item.name,
    sku: item.sku,
    unit: item.unit,
    reorderLevel: String(item.reorderLevel),
    costPerUnit: String(item.costPerUnit),
    openingStock: String(item.quantityOnHand)
  };
}

function InventoryEditor({
  open,
  branches,
  value,
  editingItem,
  saving,
  onChange,
  onClose,
  onSubmit
}: {
  open: boolean;
  branches: AdminInventoryData["branches"];
  value: InventoryItemFormState;
  editingItem: AdminInventoryItem | null;
  saving: boolean;
  onChange: (next: InventoryItemFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-pocket-charcoal/40 px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg border border-pocket-navy/10 bg-white p-6 shadow-panel">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Inventory Item</p>
            <h2 className="mt-2 text-3xl font-black text-pocket-navy">{editingItem ? `Edit ${editingItem.name}` : "Add inventory item"}</h2>
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
              disabled={Boolean(editingItem)}
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Unit</label>
            <select
              value={value.unit}
              onChange={(event) => onChange({ ...value, unit: event.target.value })}
              className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 py-2 text-sm text-pocket-charcoal outline-none transition focus:border-pocket-orange focus:ring-2 focus:ring-pocket-orange/20"
            >
              {INVENTORY_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-semibold text-pocket-navy">Item name</label>
            <Input value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} placeholder="Chicken" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">SKU</label>
            <Input value={value.sku} onChange={(event) => onChange({ ...value, sku: event.target.value.toUpperCase() })} placeholder="ING-CHICKEN" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Reorder level</label>
            <Input type="number" min="0" step="0.001" value={value.reorderLevel} onChange={(event) => onChange({ ...value, reorderLevel: event.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Cost per unit</label>
            <Input type="number" min="0" step="0.01" value={value.costPerUnit} onChange={(event) => onChange({ ...value, costPerUnit: event.target.value })} />
          </div>
          {!editingItem ? (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-pocket-navy">Opening stock</label>
              <Input type="number" min="0" step="0.001" value={value.openingStock} onChange={(event) => onChange({ ...value, openingStock: event.target.value })} />
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? "Saving..." : editingItem ? "Save Changes" : "Create Item"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SectionNav({ current }: { current: InventoryViewMode }) {
  return (
    <Card className="p-5">
      <div className="grid gap-3 md:grid-cols-3">
        {INVENTORY_ROUTES.map((route) => {
          const active =
            (current === "movement" && route.href.endsWith("stock-movement")) ||
            (current === "log" && route.href.endsWith("stock-log")) ||
            (current === "list" && route.href.endsWith("inventory-list"));

          return (
            <Link
              key={route.href}
              href={route.href}
              className={`rounded-lg border px-4 py-4 transition ${active ? "border-pocket-orange bg-pocket-orange text-white" : "border-pocket-navy/10 bg-white text-pocket-navy hover:bg-pocket-cream"}`}
            >
              <div className="flex items-center gap-3">
                <route.icon className="h-5 w-5" />
                <div>
                  <p className="font-bold">{route.label}</p>
                  <p className={`text-sm ${active ? "text-white/80" : "text-pocket-navy/60"}`}>{route.description}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

function useInventoryAdminData() {
  const [data, setData] = useState<AdminInventoryData | null>(null);
  const [branchId, setBranchId] = useState("");
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AdminInventoryItem | null>(null);
  const [itemForm, setItemForm] = useState<InventoryItemFormState>(EMPTY_ITEM_FORM);
  const [itemSaving, setItemSaving] = useState(false);
  const [stockForm, setStockForm] = useState<StockFormState>(EMPTY_STOCK_FORM);
  const [stockSaving, setStockSaving] = useState(false);

  async function loadInventory(nextBranchId = branchId) {
    try {
      setError("");
      const nextData = await fetchAdminInventory(nextBranchId || undefined);
      setData(nextData);

      const defaultBranchId = nextData.branches[0]?.id || "";
      setBranchId(nextBranchId);
      setItemForm((current) => ({
        ...current,
        branchId: current.branchId || defaultBranchId
      }));
      setStockForm((current) => ({
        ...current,
        branchId: current.branchId || defaultBranchId,
        ingredientId:
          current.ingredientId ||
          nextData.items.find((item) => item.branchId === (current.branchId || defaultBranchId))?.ingredientId ||
          nextData.items[0]?.ingredientId ||
          ""
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load inventory.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadInventory();
  }, []);

  const visibleItems = useMemo(() => {
    if (!data) return [];
    return data.items.filter((item) => {
      const matchesBranch = !branchId || item.branchId === branchId;
      const matchesSearch = !search || `${item.name} ${item.sku} ${item.unit}`.toLowerCase().includes(search.toLowerCase());
      const matchesLowStock = !lowStockOnly || item.lowStockAlert;
      return matchesBranch && matchesSearch && matchesLowStock;
    });
  }, [branchId, data, lowStockOnly, search]);

  const visibleTransactions = useMemo(() => {
    if (!data) return [];
    return data.recentTransactions.filter((entry) => {
      const matchesBranch = !branchId || entry.branchId === branchId;
      const matchesSearch =
        !search ||
        `${entry.ingredientName} ${entry.note ?? ""} ${entry.actorName ?? ""} ${entry.type}`.toLowerCase().includes(search.toLowerCase());
      return matchesBranch && matchesSearch;
    });
  }, [branchId, data, search]);

  function openCreate() {
    setEditingItem(null);
    setItemForm({
      ...EMPTY_ITEM_FORM,
      branchId: branchId || data?.branches[0]?.id || "",
      unit: "kg"
    });
    setEditorOpen(true);
  }

  function openEdit(item: AdminInventoryItem) {
    setEditingItem(item);
    setItemForm(mapItemToForm(item));
    setEditorOpen(true);
  }

  async function submitItem() {
    if (!itemForm.branchId || !itemForm.name.trim()) {
      setError("Branch and item name are required.");
      return;
    }

    setItemSaving(true);
    setError("");
    try {
      const payload = {
        branchId: itemForm.branchId,
        name: itemForm.name.trim(),
        sku: itemForm.sku.trim() || undefined,
        unit: itemForm.unit,
        reorderLevel: Number(itemForm.reorderLevel || 0),
        costPerUnit: Number(itemForm.costPerUnit || 0),
        openingStock: Number(itemForm.openingStock || 0)
      };

      if (editingItem) {
        await updateAdminInventoryItem(editingItem.ingredientId, payload);
      } else {
        await createAdminInventoryItem(payload);
      }

      setEditorOpen(false);
      await loadInventory(itemForm.branchId);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save inventory item.");
    } finally {
      setItemSaving(false);
    }
  }

  async function submitStockMovement() {
    if (!stockForm.branchId || !stockForm.ingredientId) {
      setError("Pick a branch and item before posting stock movement.");
      return;
    }

    setStockSaving(true);
    setError("");
    try {
      await createAdminInventoryTransaction({
        branchId: stockForm.branchId,
        ingredientId: stockForm.ingredientId,
        action: stockForm.action,
        quantity: stockForm.action === "CLOSING" ? undefined : Number(stockForm.quantity || 0),
        countedQuantity: stockForm.action === "CLOSING" ? Number(stockForm.countedQuantity || 0) : undefined,
        note: stockForm.note.trim() || undefined
      });

      setStockForm((current) => ({
        ...current,
        quantity: "",
        countedQuantity: "",
        note: ""
      }));
      await loadInventory(stockForm.branchId);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to update inventory.");
    } finally {
      setStockSaving(false);
    }
  }

  return {
    data,
    branchId,
    setBranchId,
    search,
    setSearch,
    lowStockOnly,
    setLowStockOnly,
    loading,
    refreshing,
    setRefreshing,
    error,
    visibleItems,
    visibleTransactions,
    editorOpen,
    setEditorOpen,
    editingItem,
    itemForm,
    setItemForm,
    itemSaving,
    stockForm,
    setStockForm,
    stockSaving,
    loadInventory,
    openCreate,
    openEdit,
    submitItem,
    submitStockMovement
  };
}

function SummaryCards({
  summary,
  refreshing,
  onRefresh,
  onAddItem
}: {
  summary: AdminInventoryData["summary"] | undefined;
  refreshing: boolean;
  onRefresh: () => void;
  onAddItem: () => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card className="p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Tracked items</p>
        <p className="mt-3 text-3xl font-black text-pocket-navy">{summary?.totalItems ?? 0}</p>
        <p className="mt-2 text-sm text-pocket-navy/60">Inventory lines available across branches.</p>
      </Card>
      <Card className="p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Low stock</p>
        <p className="mt-3 text-3xl font-black text-pocket-navy">{summary?.lowStockItems ?? 0}</p>
        <p className="mt-2 text-sm text-pocket-navy/60">Items below or at reorder level.</p>
      </Card>
      <Card className="p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Stock value</p>
        <p className="mt-3 text-3xl font-black text-pocket-navy">{formatCurrency(summary?.totalStockValue ?? 0)}</p>
        <p className="mt-2 text-sm text-pocket-navy/60">Quantity on hand multiplied by unit cost.</p>
      </Card>
      <Card className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Actions</p>
          <p className="mt-3 text-sm text-pocket-navy/60">Refresh inventory data or add a new tracked item.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onRefresh} disabled={refreshing}>
            <RefreshCcw className="h-4 w-4" />
          </Button>
          <Button onClick={onAddItem}>
            <Plus className="h-4 w-4" />
            Add Item
          </Button>
        </div>
      </Card>
    </div>
  );
}

function FilterBar({
  data,
  branchId,
  onBranchChange,
  search,
  onSearchChange,
  lowStockOnly,
  onLowStockToggle,
  showLowStockToggle = true
}: {
  data: AdminInventoryData | null;
  branchId: string;
  onBranchChange: (value: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  lowStockOnly?: boolean;
  onLowStockToggle?: () => void;
  showLowStockToggle?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className={`grid gap-4 ${showLowStockToggle ? "lg:grid-cols-[220px_1fr_auto]" : "lg:grid-cols-[220px_1fr]"}`}>
        <select
          value={branchId}
          onChange={(event) => onBranchChange(event.target.value)}
          className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 py-2 text-sm text-pocket-charcoal outline-none transition focus:border-pocket-orange focus:ring-2 focus:ring-pocket-orange/20"
        >
          <option value="">All branches</option>
          {(data?.branches ?? []).map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
        <Input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search item name, SKU, note, or actor" />
        {showLowStockToggle ? (
          <Button variant={lowStockOnly ? "default" : "outline"} onClick={onLowStockToggle}>
            {lowStockOnly ? "Showing Low Stock" : "Low Stock Only"}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function MovementSection({
  data,
  stockForm,
  setStockForm,
  visibleItems,
  stockSaving,
  onSubmit
}: {
  data: AdminInventoryData | null;
  stockForm: StockFormState;
  setStockForm: Dispatch<SetStateAction<StockFormState>>;
  visibleItems: AdminInventoryItem[];
  stockSaving: boolean;
  onSubmit: () => void;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-pocket-cream text-pocket-orange">
          <Warehouse className="h-5 w-5" />
        </div>
        <div>
          <p className="text-lg font-black text-pocket-navy">Stock movement</p>
          <p className="text-sm text-pocket-navy/60">Use this for restocks, wastage, corrections, and daily closing counts.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-pocket-navy">Branch</label>
          <select
            value={stockForm.branchId}
            onChange={(event) => setStockForm({ ...stockForm, branchId: event.target.value, ingredientId: "" })}
            className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 py-2 text-sm text-pocket-charcoal outline-none transition focus:border-pocket-orange focus:ring-2 focus:ring-pocket-orange/20"
          >
            {(data?.branches ?? []).map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold text-pocket-navy">Action</label>
          <select
            value={stockForm.action}
            onChange={(event) => setStockForm({ ...stockForm, action: event.target.value as StockFormState["action"] })}
            className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 py-2 text-sm text-pocket-charcoal outline-none transition focus:border-pocket-orange focus:ring-2 focus:ring-pocket-orange/20"
          >
            {STOCK_ACTIONS.map((action) => (
              <option key={action.value} value={action.value}>
                {action.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-semibold text-pocket-navy">Inventory item</label>
          <select
            value={stockForm.ingredientId}
            onChange={(event) => setStockForm({ ...stockForm, ingredientId: event.target.value })}
            className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 py-2 text-sm text-pocket-charcoal outline-none transition focus:border-pocket-orange focus:ring-2 focus:ring-pocket-orange/20"
          >
            <option value="">Select an item</option>
            {visibleItems.map((item) => (
              <option key={`${item.branchId}-${item.ingredientId}`} value={item.ingredientId}>
                {item.name} ({item.quantityOnHand} {item.unit})
              </option>
            ))}
          </select>
        </div>
        {stockForm.action === "CLOSING" ? (
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Counted stock</label>
            <Input type="number" min="0" step="0.001" value={stockForm.countedQuantity} onChange={(event) => setStockForm({ ...stockForm, countedQuantity: event.target.value })} />
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">{stockForm.action === "ADJUSTMENT" ? "Adjustment quantity (+/-)" : "Quantity"}</label>
            <Input type="number" step="0.001" value={stockForm.quantity} onChange={(event) => setStockForm({ ...stockForm, quantity: event.target.value })} />
          </div>
        )}
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-semibold text-pocket-navy">Note</label>
          <Textarea value={stockForm.note} onChange={(event) => setStockForm({ ...stockForm, note: event.target.value })} placeholder="Supplier invoice, wastage reason, shift closing note..." />
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <Button onClick={onSubmit} disabled={stockSaving}>
          {stockSaving ? "Posting..." : "Update Stock"}
        </Button>
      </div>
    </Card>
  );
}

function LogSection({
  entries,
  loading
}: {
  entries: AdminInventoryData["recentTransactions"];
  loading: boolean;
}) {
  return (
    <Card className="p-5">
      <p className="text-lg font-black text-pocket-navy">Recent stock log</p>
      <p className="text-sm text-pocket-navy/60">Latest inventory movement for the selected branch and filters.</p>
      <div className="mt-4 space-y-3">
        {loading ? (
          <p className="text-sm text-pocket-navy/60">Loading stock log...</p>
        ) : entries.length ? (
          entries.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-pocket-navy/10 px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-pocket-navy">{entry.ingredientName}</p>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-orange">{entry.type.replaceAll("_", " ")}</p>
                </div>
                <div className="text-right">
                  <p className={`font-black ${entry.quantity >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                    {entry.quantity >= 0 ? "+" : ""}
                    {entry.quantity}
                  </p>
                  <p className="text-xs text-pocket-navy/60">Balance {entry.balanceAfter}</p>
                </div>
              </div>
              <div className="mt-2 grid gap-1 text-sm text-pocket-navy/60 md:grid-cols-[1fr_auto]">
                <p>{entry.note ?? "No note added."}</p>
                <p>{entry.branchName}</p>
              </div>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-pocket-navy/45">
                {new Intl.DateTimeFormat("en-PK", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit"
                }).format(new Date(entry.createdAt))}
                {entry.actorName ? ` · ${entry.actorName}` : ""}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-pocket-navy/60">No stock movements match the current filters.</p>
        )}
      </div>
    </Card>
  );
}

function ListSection({
  items,
  loading,
  onUpdateStock,
  onEdit
}: {
  items: AdminInventoryItem[];
  loading: boolean;
  onUpdateStock: (item: AdminInventoryItem) => void;
  onEdit: (item: AdminInventoryItem) => void;
}) {
  return (
    <Card className="p-5">
      <p className="text-lg font-black text-pocket-navy">Inventory list</p>
      <p className="text-sm text-pocket-navy/60">Each line shows live on-hand stock, reorder threshold, and inventory value.</p>
      {loading ? (
        <div className="mt-5 text-sm text-pocket-navy/60">Loading inventory...</div>
      ) : (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-pocket-navy/10 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-black text-pocket-navy">{item.name}</p>
                  <p className="text-sm text-pocket-navy/60">
                    {item.sku} · {item.branchName}
                  </p>
                </div>
                <div className={`rounded-full px-3 py-1 text-xs font-semibold ${item.lowStockAlert ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                  {item.lowStockAlert ? "Low Stock" : "Healthy"}
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-pocket-cream px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-orange">On hand</p>
                  <p className="mt-2 text-xl font-black text-pocket-navy">
                    {item.quantityOnHand} {item.unit}
                  </p>
                </div>
                <div className="rounded-lg bg-pocket-cream px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-orange">Reorder</p>
                  <p className="mt-2 text-xl font-black text-pocket-navy">
                    {item.reorderLevel} {item.unit}
                  </p>
                </div>
                <div className="rounded-lg bg-pocket-cream px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-orange">Value</p>
                  <p className="mt-2 text-xl font-black text-pocket-navy">{formatCurrency(item.stockValue)}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => onUpdateStock(item)}>
                  Update Stock
                </Button>
                <Button variant="ghost" onClick={() => onEdit(item)}>
                  <Pencil className="h-4 w-4" />
                  Edit Item
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function OverviewSection() {
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      {INVENTORY_ROUTES.map((route) => (
        <Card key={route.href} className="p-6">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-pocket-cream text-pocket-orange">
            <route.icon className="h-6 w-6" />
          </div>
          <p className="mt-5 text-2xl font-black text-pocket-navy">{route.label}</p>
          <p className="mt-2 text-sm text-pocket-navy/60">{route.description}</p>
          <div className="mt-6">
            <Link href={route.href} className="inline-flex h-10 items-center justify-center rounded-md bg-pocket-orange px-4 text-sm font-semibold text-white transition hover:bg-pocket-orangeDeep">
              {`Open ${route.label}`}
            </Link>
          </div>
        </Card>
      ))}
    </div>
  );
}

export function InventoryManagement({ mode = "overview" }: { mode?: InventoryViewMode }) {
  const inventory = useInventoryAdminData();

  const handleBranchChange = (value: string) => {
    inventory.setBranchId(value);
    inventory.setStockForm((current) => ({ ...current, branchId: value, ingredientId: "" }));
    inventory.setRefreshing(true);
    void inventory.loadInventory(value);
  };

  return (
    <div className="space-y-6">
      <InventoryEditor
        open={inventory.editorOpen}
        branches={inventory.data?.branches ?? []}
        value={inventory.itemForm}
        editingItem={inventory.editingItem}
        saving={inventory.itemSaving}
        onChange={inventory.setItemForm}
        onClose={() => inventory.setEditorOpen(false)}
        onSubmit={() => void inventory.submitItem()}
      />

      <SummaryCards
        summary={inventory.data?.summary}
        refreshing={inventory.refreshing}
        onRefresh={() => {
          inventory.setRefreshing(true);
          void inventory.loadInventory(inventory.branchId);
        }}
        onAddItem={inventory.openCreate}
      />

      {inventory.error ? <p className="text-sm font-medium text-red-600">{inventory.error}</p> : null}

      {mode === "overview" ? <OverviewSection /> : null}

      {mode !== "overview" ? <SectionNav current={mode} /> : null}

      {mode === "movement" ? (
        <MovementSection
          data={inventory.data}
          stockForm={inventory.stockForm}
          setStockForm={inventory.setStockForm}
          visibleItems={inventory.visibleItems}
          stockSaving={inventory.stockSaving}
          onSubmit={() => void inventory.submitStockMovement()}
        />
      ) : null}

      {mode === "log" ? (
        <>
          <FilterBar
            data={inventory.data}
            branchId={inventory.branchId}
            onBranchChange={handleBranchChange}
            search={inventory.search}
            onSearchChange={inventory.setSearch}
            showLowStockToggle={false}
          />
          <LogSection entries={inventory.visibleTransactions} loading={inventory.loading} />
        </>
      ) : null}

      {mode === "list" ? (
        <>
          <FilterBar
            data={inventory.data}
            branchId={inventory.branchId}
            onBranchChange={handleBranchChange}
            search={inventory.search}
            onSearchChange={inventory.setSearch}
            lowStockOnly={inventory.lowStockOnly}
            onLowStockToggle={() => inventory.setLowStockOnly((value) => !value)}
          />
          <ListSection
            items={inventory.visibleItems}
            loading={inventory.loading}
            onUpdateStock={(item) => {
              inventory.setStockForm((current) => ({
                ...current,
                branchId: item.branchId,
                ingredientId: item.ingredientId
              }));
            }}
            onEdit={inventory.openEdit}
          />
        </>
      ) : null}
    </div>
  );
}
