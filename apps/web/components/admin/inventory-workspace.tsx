"use client";

import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import { BarChart3, ChefHat, ChevronDown, ClipboardList, History, Pencil, Plus, RefreshCcw, Search, Trash2, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { VendorManagement } from "@/components/admin/vendor-management";
import {
  createAdminInventoryItem,
  createAdminInventoryTransaction,
  createAdminMoneyTransfer,
  deleteAdminDailyClosing,
  deleteAdminInventoryItem,
  deleteAdminMoneyTransfer,
  deleteAdminPackagingRule,
  fetchAdminDailyClosing,
  fetchAdminInventory,
  fetchAdminInventoryForecast,
  fetchAdminMoneyTransfers,
  fetchAdminPackagingRules,
  fetchAdminInventoryRecipes,
  fetchAdminVendors,
  saveAdminDailyClosing,
  saveAdminPackagingRule,
  updateAdminInventoryItem,
  updateAdminInventoryTransaction,
  updateAdminPreparedRecipe,
  updateAdminProductPackagingRules,
  updateAdminProductRecipe
} from "@/lib/admin-client";
import type { AdminDailyClosingData, AdminInventoryData, AdminInventoryForecast, AdminInventoryItem, AdminInventoryTransaction, AdminMoneyTransferData, AdminPackagingRuleData, AdminRecipeData, AdminVendor, MoneySource } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

type InventoryTab = "stock" | "add-stock" | "vendors" | "prep" | "recipes" | "rules" | "transfers" | "closing" | "wastage" | "forecast" | "logs";

const INVENTORY_UNITS = ["kg", "litre", "bottles", "pieces", "slices", "loafs"];
const ITEM_TYPES = ["RAW", "PREPARED", "PACKAGING", "RETAIL"] as const;
const ITEM_TYPE_LABELS: Record<(typeof ITEM_TYPES)[number], string> = {
  RAW: "Ingredient",
  PREPARED: "Prep Item",
  PACKAGING: "Packaging",
  RETAIL: "Retail Item"
};
const SERVICE_TYPES = ["DEFAULT", "INSHOP", "FOODPANDA", "DINE_IN", "TAKEAWAY", "DELIVERY"] as const;
const SERVICE_TYPE_LABELS: Record<(typeof SERVICE_TYPES)[number], string> = {
  DEFAULT: "Default",
  INSHOP: "In-shop",
  FOODPANDA: "Foodpanda",
  DINE_IN: "Dine-in",
  TAKEAWAY: "Takeaway",
  DELIVERY: "Delivery"
};
const WASTAGE_REASONS = ["expired", "spilled", "over-prepped", "damaged", "staff meal", "wrong order", "other"] as const;
const MONEY_SOURCES: Array<{ value: MoneySource; label: string }> = [
  { value: "CASH", label: "Cash" },
  { value: "EASYPAISA", label: "Easypaisa" },
  { value: "JAZZCASH", label: "JazzCash" }
];

const TABS: Array<{ id: InventoryTab; label: string; icon: typeof Warehouse }> = [
  { id: "stock", label: "Stock", icon: ClipboardList },
  { id: "add-stock", label: "Add Stock", icon: Warehouse },
  { id: "vendors", label: "Vendors", icon: ClipboardList },
  { id: "prep", label: "Prep Items", icon: ChefHat },
  { id: "recipes", label: "Recipes & Costing", icon: ChefHat },
  { id: "rules", label: "Rules", icon: ClipboardList },
  { id: "transfers", label: "Transfers", icon: RefreshCcw },
  { id: "closing", label: "Daily Closing", icon: History },
  { id: "wastage", label: "Wastage", icon: Trash2 },
  { id: "forecast", label: "Forecast / Buy List", icon: BarChart3 },
  { id: "logs", label: "Stock Logs", icon: History }
];

type ItemFormState = {
  name: string;
  unit: string;
  type: (typeof ITEM_TYPES)[number];
  reorderLevel: string;
  costPerUnit: string;
  caloriesPerUnit: string;
  openingStock: string;
};

type StockFormState = {
  ingredientId: string;
  quantity: string;
  vendorName: string;
  purchaseDate: string;
  purchaseCost: string;
  note: string;
};

type WastageFormState = {
  ingredientId: string;
  quantity: string;
  wastageReason: (typeof WASTAGE_REASONS)[number];
  note: string;
};

type LogEditState = {
  transactionId: string;
  quantity: string;
  note: string;
  vendorName: string;
  purchaseDate: string;
  purchaseCost: string;
  wastageReason: string;
};

type RecipeEditState = {
  mode: "product" | "prepared" | "packaging";
  id: string;
  components: Array<{ ingredientId: string; quantityNeeded: string; serviceType?: string }>;
};

type RuleFormState = {
  id: string;
  scope: "ORDER" | "CATEGORY" | "PRODUCT";
  productId: string;
  categoryId: string;
  serviceType: string;
  packagingIngredientId: string;
  quantityMode: "FIXED" | "PER_ITEM_STEP";
  quantity: string;
  itemStep: string;
};

type TransferFormState = {
  branchId: string;
  fromSource: MoneySource;
  toSource: MoneySource;
  amount: string;
  transferDate: string;
  note: string;
};

type ClosingFormState = {
  branchId: string;
  closingDate: string;
  cashCounted: string;
  easypaisaCounted: string;
  jazzcashCounted: string;
  note: string;
};

const EMPTY_ITEM_FORM: ItemFormState = {
  name: "",
  unit: "kg",
  type: "RAW",
  reorderLevel: "",
  costPerUnit: "0",
  caloriesPerUnit: "0",
  openingStock: "0"
};

const EMPTY_STOCK_FORM: StockFormState = {
  ingredientId: "",
  quantity: "",
  vendorName: "",
  purchaseDate: new Date().toISOString().slice(0, 10),
  purchaseCost: "",
  note: ""
};

const EMPTY_WASTAGE_FORM: WastageFormState = {
  ingredientId: "",
  quantity: "",
  wastageReason: "expired",
  note: ""
};

const EMPTY_RULE_FORM: RuleFormState = {
  id: "",
  scope: "ORDER",
  productId: "",
  categoryId: "",
  serviceType: "DEFAULT",
  packagingIngredientId: "",
  quantityMode: "FIXED",
  quantity: "1",
  itemStep: "1"
};

const EMPTY_TRANSFER_FORM: TransferFormState = {
  branchId: "",
  fromSource: "CASH",
  toSource: "EASYPAISA",
  amount: "",
  transferDate: new Date().toISOString().slice(0, 10),
  note: ""
};

const EMPTY_CLOSING_FORM: ClosingFormState = {
  branchId: "",
  closingDate: new Date().toISOString().slice(0, 10),
  cashCounted: "",
  easypaisaCounted: "",
  jazzcashCounted: "",
  note: ""
};

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function itemToForm(item: AdminInventoryItem): ItemFormState {
  return {
    name: item.name,
    unit: item.unit,
    type: (ITEM_TYPES.includes(item.type as any) ? item.type : "RAW") as ItemFormState["type"],
    reorderLevel: String(item.reorderLevel),
    costPerUnit: String(item.costPerUnit),
    caloriesPerUnit: String(item.caloriesPerUnit),
    openingStock: String(item.quantityOnHand)
  };
}

function TabNav({ activeTab, onChange }: { activeTab: InventoryTab; onChange: (tab: InventoryTab) => void }) {
  return (
    <Card className="overflow-x-auto p-3">
      <div className="flex min-w-max gap-2 md:min-w-0 md:flex-wrap">
        {TABS.map((tab) => (
          <Button key={tab.id} variant={activeTab === tab.id ? "default" : "outline"} onClick={() => onChange(tab.id)} className="shrink-0 justify-start">
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </Button>
        ))}
      </div>
    </Card>
  );
}

function ItemEditor({
  open,
  value,
  editingItem,
  saving,
  onChange,
  onClose,
  onSubmit
}: {
  open: boolean;
  value: ItemFormState;
  editingItem: AdminInventoryItem | null;
  saving: boolean;
  onChange: (value: ItemFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-pocket-charcoal/40 px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg border border-pocket-navy/10 bg-white p-6 shadow-panel">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Inventory Item</p>
            <h2 className="mt-2 text-2xl font-black text-pocket-navy">{editingItem ? `Edit ${editingItem.name}` : "Add item"}</h2>
          </div>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-semibold text-pocket-navy">Item name</label>
            <Input value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Type</label>
            <select value={value.type} onChange={(event) => onChange({ ...value, type: event.target.value as ItemFormState["type"] })} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
              {ITEM_TYPES.map((type) => <option key={type} value={type}>{ITEM_TYPE_LABELS[type]}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Unit</label>
            <select value={value.unit} onChange={(event) => onChange({ ...value, unit: event.target.value })} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
              {INVENTORY_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Reorder level</label>
            <Input type="number" min="0" step="0.001" value={value.reorderLevel} onChange={(event) => onChange({ ...value, reorderLevel: event.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Cost per unit</label>
            <Input type="number" min="0" step="0.01" value={value.costPerUnit} onChange={(event) => onChange({ ...value, costPerUnit: event.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Calories per unit</label>
            <Input type="number" min="0" step="1" value={value.type === "PACKAGING" ? "0" : value.caloriesPerUnit} disabled={value.type === "PACKAGING"} onChange={(event) => onChange({ ...value, caloriesPerUnit: event.target.value })} />
          </div>
          {!editingItem ? (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-pocket-navy">Opening stock</label>
              <Input type="number" min="0" step="0.001" value={value.openingStock} onChange={(event) => onChange({ ...value, openingStock: event.target.value })} />
            </div>
          ) : null}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSubmit} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </div>
      </div>
    </div>
  );
}

function SummaryCards({ data, forecast, onRefresh, onAddItem }: { data: AdminInventoryData | null; forecast: AdminInventoryForecast | null; onRefresh: () => void; onAddItem: () => void }) {
  const tomorrow = forecast?.horizons[0];
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Tracked</p><p className="mt-3 text-3xl font-black text-pocket-navy">{data?.summary.totalItems ?? 0}</p><p className="mt-2 text-sm text-pocket-navy/60">Inventory items.</p></Card>
      <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Low stock</p><p className="mt-3 text-3xl font-black text-pocket-navy">{data?.summary.lowStockItems ?? 0}</p><p className="mt-2 text-sm text-pocket-navy/60">Needs attention.</p></Card>
      <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Stock value</p><p className="mt-3 text-2xl font-black text-pocket-navy">{formatCurrency(data?.summary.totalStockValue ?? 0)}</p><p className="mt-2 text-sm text-pocket-navy/60">On-hand value.</p></Card>
      <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Tomorrow buy</p><p className="mt-3 text-2xl font-black text-pocket-navy">{formatCurrency(tomorrow?.suggestedPurchaseCost ?? 0)}</p><p className="mt-2 text-sm text-pocket-navy/60">Forecasted purchase.</p></Card>
      <Card className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center"><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Actions</p><p className="mt-3 text-sm text-pocket-navy/60">Refresh or add item.</p></div><div className="flex w-full flex-wrap gap-2 sm:w-auto"><Button variant="outline" onClick={onRefresh} className="shrink-0"><RefreshCcw className="h-4 w-4" /></Button><Button onClick={onAddItem} className="min-w-0 shrink-0"><Plus className="h-4 w-4" />Add</Button></div></Card>
    </div>
  );
}

function StockTable({ items, loading, onEdit, onAddStock, onWastage, onDelete }: { items: AdminInventoryItem[]; loading: boolean; onEdit: (item: AdminInventoryItem) => void; onAddStock: (item: AdminInventoryItem) => void; onWastage: (item: AdminInventoryItem) => void; onDelete: (item: AdminInventoryItem) => void }) {
  if (loading) return <Card className="p-5 text-sm text-pocket-navy/60">Loading stock...</Card>;
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-[1.4fr_0.7fr_0.8fr_0.8fr_0.8fr_1fr] gap-4 border-b border-pocket-navy/10 bg-pocket-cream px-5 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60">
        <span>Item</span><span>Type</span><span>On hand</span><span>Unit cost</span><span>Value</span><span>Actions</span>
      </div>
      {items.map((item) => (
        <div key={item.id} className="grid grid-cols-[1.4fr_0.7fr_0.8fr_0.8fr_0.8fr_1fr] gap-4 border-b border-pocket-navy/10 px-5 py-4 text-sm last:border-0">
          <div>
            <p className="font-bold text-pocket-navy">{item.name}</p>
            <p className="mt-1 text-xs text-pocket-navy/60">{item.linkedProducts.length ? `Used in ${item.linkedProducts.length} product${item.linkedProducts.length === 1 ? "" : "s"}` : "Not linked to a product yet"}</p>
          </div>
          <span className="font-semibold text-pocket-navy">{ITEM_TYPE_LABELS[item.type as keyof typeof ITEM_TYPE_LABELS] ?? item.type}</span>
          <span className={item.lowStockAlert ? "font-bold text-red-600" : "font-bold text-pocket-navy"}>{item.quantityOnHand} {item.unit}</span>
          <span>{formatCurrency(item.costPerUnit)}</span>
          <span>{formatCurrency(item.stockValue)}</span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onAddStock(item)}>Add</Button>
            <Button size="sm" variant="outline" onClick={() => onWastage(item)}>Waste</Button>
            <Button size="sm" variant="ghost" onClick={() => onEdit(item)}><Pencil className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => onDelete(item)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      ))}
    </Card>
  );
}

function VendorSelect({
  vendors,
  value,
  onChange
}: {
  vendors: AdminVendor[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState(false);
  const filteredVendors = useMemo(() => {
    const search = query.toLowerCase();
    return vendors
      .filter((vendor) => `${vendor.vendorName} ${vendor.provides ?? ""} ${vendor.ingredientCategory} ${vendor.contactNumber ?? ""}`.toLowerCase().includes(search))
      .slice(0, 20);
  }, [query, vendors]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  if (manual) {
    return (
      <Field label="Vendor">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Other vendor name" />
          <Button type="button" variant="outline" onClick={() => setManual(false)}>List</Button>
        </div>
      </Field>
    );
  }

  return (
    <Field label="Vendor">
      <div className="relative">
        <button type="button" onClick={() => setOpen((current) => !current)} className="flex h-11 w-full items-center justify-between rounded-md border border-pocket-navy/15 bg-white px-3 text-left text-sm">
          <span className={value ? "font-medium text-pocket-navy" : "text-pocket-navy/45"}>{value || "Select vendor"}</span>
          <ChevronDown className="h-4 w-4 text-pocket-navy/50" />
        </button>
        {open ? (
          <div className="absolute z-30 mt-2 w-full rounded-md border border-pocket-navy/10 bg-white p-2 shadow-panel">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pocket-navy/40" />
              <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search vendors" className="pl-9" />
            </div>
            <div className="mt-2 max-h-64 overflow-auto">
              {filteredVendors.map((vendor) => (
                <button
                  type="button"
                  key={vendor.id}
                  onClick={() => {
                    onChange(vendor.vendorName);
                    setOpen(false);
                  }}
                  className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-pocket-cream"
                >
                  <span className="font-semibold text-pocket-navy">{vendor.vendorName}</span>
                  <span className="block text-xs text-pocket-navy/55">{vendor.provides || vendor.ingredientCategory || "Vendor"}</span>
                </button>
              ))}
              {!filteredVendors.length ? <p className="px-3 py-2 text-sm text-pocket-navy/55">No vendor found.</p> : null}
            </div>
            <Button type="button" variant="outline" className="mt-2 w-full justify-start" onClick={() => { setManual(true); setOpen(false); onChange(""); }}>Other / Manual vendor</Button>
          </div>
        ) : null}
        </div>
    </Field>
  );
}

function AddStockForm({ items, vendors, form, setForm, saving, onSubmit }: { items: AdminInventoryItem[]; vendors: AdminVendor[]; form: StockFormState; setForm: Dispatch<SetStateAction<StockFormState>>; saving: boolean; onSubmit: () => void }) {
  const [itemType, setItemType] = useState<(typeof ITEM_TYPES)[number] | "ALL">("ALL");
  const filteredItems = itemType === "ALL" ? items : items.filter((item) => item.type === itemType);
  return (
    <Card className="p-5">
      <p className="text-lg font-black text-pocket-navy">Add Stock</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="Stock type">
          <select value={itemType} onChange={(event) => setItemType(event.target.value as typeof itemType)} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
            <option value="ALL">All stock</option>
            {ITEM_TYPES.map((type) => <option key={type} value={type}>{ITEM_TYPE_LABELS[type]}</option>)}
          </select>
        </Field>
        <SelectItem items={filteredItems} value={form.ingredientId} onChange={(ingredientId) => setForm((current) => ({ ...current, ingredientId }))} />
        <Field label="Quantity"><Input type="number" min="0" step="0.001" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} /></Field>
        <VendorSelect vendors={vendors} value={form.vendorName} onChange={(vendorName) => setForm((current) => ({ ...current, vendorName }))} />
        <Field label="Purchase date"><Input type="date" value={form.purchaseDate} onChange={(event) => setForm((current) => ({ ...current, purchaseDate: event.target.value }))} /></Field>
        <Field label="Purchase cost"><Input type="number" min="0" step="0.01" value={form.purchaseCost} onChange={(event) => setForm((current) => ({ ...current, purchaseCost: event.target.value }))} /></Field>
        <div className="space-y-2 md:col-span-2"><label className="text-sm font-semibold text-pocket-navy">Note</label><Textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></div>
      </div>
      <div className="mt-5 flex justify-end"><Button onClick={onSubmit} disabled={saving}>{saving ? "Saving..." : "Add Stock"}</Button></div>
    </Card>
  );
}

function WastageForm({ items, form, setForm, saving, onSubmit }: { items: AdminInventoryItem[]; form: WastageFormState; setForm: Dispatch<SetStateAction<WastageFormState>>; saving: boolean; onSubmit: () => void }) {
  return (
    <Card className="p-5">
      <p className="text-lg font-black text-pocket-navy">Record Wastage</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <SelectItem items={items} value={form.ingredientId} onChange={(ingredientId) => setForm((current) => ({ ...current, ingredientId }))} />
        <Field label="Quantity"><Input type="number" min="0" step="0.001" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} /></Field>
        <Field label="Reason"><select value={form.wastageReason} onChange={(event) => setForm((current) => ({ ...current, wastageReason: event.target.value as WastageFormState["wastageReason"] }))} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">{WASTAGE_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select></Field>
        <div className="space-y-2 md:col-span-2"><label className="text-sm font-semibold text-pocket-navy">Note</label><Textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></div>
      </div>
      <div className="mt-5 flex justify-end"><Button onClick={onSubmit} disabled={saving}>{saving ? "Saving..." : "Record Wastage"}</Button></div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><label className="text-sm font-semibold text-pocket-navy">{label}</label>{children}</div>;
}

function SelectItem({ items, value, onChange }: { items: AdminInventoryItem[]; value: string; onChange: (value: string) => void }) {
  return (
    <Field label="Inventory item">
      <select value={value} onChange={(event) => onChange(event.target.value)} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
        <option value="">Select item</option>
        {items.map((item) => <option key={item.ingredientId} value={item.ingredientId}>{item.name} ({item.quantityOnHand} {item.unit})</option>)}
      </select>
    </Field>
  );
}

function ForecastSection({ forecast, loading }: { forecast: AdminInventoryForecast | null; loading: boolean }) {
  if (loading) return <Card className="p-5 text-sm text-pocket-navy/60">Loading forecast...</Card>;
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      {(forecast?.horizons ?? []).map((horizon) => (
        <Card key={horizon.label} className="p-5">
          <p className="text-lg font-black text-pocket-navy">{horizon.label}</p>
          <p className="mt-1 text-sm text-pocket-navy/60">Suggested purchase: {formatCurrency(horizon.suggestedPurchaseCost)}</p>
          <div className="mt-4 space-y-3">
            {horizon.items.slice(0, 12).map((item) => (
              <div key={item.ingredientId} className="rounded-lg border border-pocket-navy/10 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-bold text-pocket-navy">{item.name}</p><p className="text-xs text-pocket-navy/60">Use {item.expectedUsage} {item.unit} · have {item.currentStock}</p></div>
                  <div className="text-right"><p className="font-black text-pocket-orange">Buy {item.suggestedBuy}</p><p className="text-xs text-pocket-navy/60">{formatCurrency(item.estimatedCost)}</p></div>
                </div>
              </div>
            ))}
            {!horizon.items.length ? <p className="text-sm text-pocket-navy/60">No purchase needed from current trend.</p> : null}
          </div>
        </Card>
      ))}
    </div>
  );
}

function RecipesSection({ data, ingredients, edit, setEdit, saving, onSave }: { data: AdminRecipeData | null; ingredients: AdminRecipeData["ingredients"]; edit: RecipeEditState | null; setEdit: Dispatch<SetStateAction<RecipeEditState | null>>; saving: boolean; onSave: () => void }) {
  const selectedName = edit?.mode === "product" || edit?.mode === "packaging" ? data?.products.find((product) => product.id === edit.id)?.name : data?.preparedItems.find((item) => item.id === edit?.id)?.name;
  const foodIngredients = ingredients.filter((ingredient) => ingredient.type !== "PACKAGING");
  const packagingIngredients = ingredients.filter((ingredient) => ingredient.type === "PACKAGING");
  const editorIngredients = edit?.mode === "packaging" ? packagingIngredients : foodIngredients;
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
      <Card className="p-5">
        <p className="text-lg font-black text-pocket-navy">Recipes & Costing</p>
        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-pocket-orange">Prepared items</p>
            {(data?.preparedItems ?? []).map((item) => (
              <RecipeRow key={item.id} name={item.name} meta={`${formatCurrency(item.totalCost)} · ${item.components.length} components`} onEdit={() => setEdit({ mode: "prepared", id: item.id, components: item.components.map((component) => ({ ingredientId: component.ingredientId, quantityNeeded: String(component.quantityNeeded) })) })} />
            ))}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-pocket-orange">Menu products</p>
            {(data?.products ?? []).map((product) => (
              <RecipeRow key={product.id} name={product.name} meta={`${formatCurrency(product.costSummary.totalCost)} cost · ${product.costSummary.marginPercent}% margin · ${product.costSummary.calories} cal`} onEdit={() => setEdit({ mode: "product", id: product.id, components: product.costSummary.items.map((component) => ({ ingredientId: component.ingredientId, quantityNeeded: String(component.quantity) })) })} />
            ))}
          </div>
        </div>
      </Card>
      <Card className="p-5">
        <p className="text-lg font-black text-pocket-navy">{selectedName ? `Edit ${selectedName}` : "Recipe editor"}</p>
        {!edit ? <p className="mt-3 text-sm text-pocket-navy/60">Select a prepared item or product to edit its linked ingredients.</p> : (
          <>
            <div className="mt-4 space-y-3">
              {edit.components.map((component, index) => (
                <div key={`${index}-${component.ingredientId}`} className="grid gap-3 md:grid-cols-[1fr_140px_auto]">
                  <select value={component.ingredientId} onChange={(event) => setEdit((current) => current ? { ...current, components: current.components.map((entry, entryIndex) => entryIndex === index ? { ...entry, ingredientId: event.target.value } : entry) } : current)} className="flex h-11 rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
                    <option value="">Select ingredient</option>
                    {ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.unit})</option>)}
                  </select>
                  <Input type="number" min="0" step="0.001" value={component.quantityNeeded} onChange={(event) => setEdit((current) => current ? { ...current, components: current.components.map((entry, entryIndex) => entryIndex === index ? { ...entry, quantityNeeded: event.target.value } : entry) } : current)} />
                  <Button variant="ghost" onClick={() => setEdit((current) => current ? { ...current, components: current.components.map((entry, entryIndex) => entryIndex === index ? { ...entry, quantityNeeded: "0" } : entry) } : current)}>Set 0</Button>
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-between gap-3">
              <Button variant="outline" onClick={() => setEdit((current) => current ? { ...current, components: [...current.components, { ingredientId: "", quantityNeeded: "0" }] } : current)}><Plus className="h-4 w-4" />Add ingredient</Button>
              <Button onClick={onSave} disabled={saving}>{saving ? "Saving..." : "Save recipe"}</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function RecipeRow({ name, meta, onEdit }: { name: string; meta: string; onEdit: () => void }) {
  return <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-pocket-navy/10 p-3"><div><p className="font-bold text-pocket-navy">{name}</p><p className="text-xs text-pocket-navy/60">{meta}</p></div><Button size="sm" variant="outline" onClick={onEdit}>Edit</Button></div>;
}

function RecipesCostingSection({ data, ingredients, edit, setEdit, saving, onSave }: { data: AdminRecipeData | null; ingredients: AdminRecipeData["ingredients"]; edit: RecipeEditState | null; setEdit: Dispatch<SetStateAction<RecipeEditState | null>>; saving: boolean; onSave: () => void }) {
  const selectedName = edit?.mode === "product" || edit?.mode === "packaging" ? data?.products.find((product) => product.id === edit.id)?.name : data?.preparedItems.find((item) => item.id === edit?.id)?.name;
  const foodIngredients = ingredients.filter((ingredient) => ingredient.type !== "PACKAGING");
  const packagingIngredients = ingredients.filter((ingredient) => ingredient.type === "PACKAGING");
  const editorIngredients = edit?.mode === "packaging" ? packagingIngredients : foodIngredients;

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
      <Card className="p-5">
        <p className="text-lg font-black text-pocket-navy">Recipes & Costing</p>
        <div className="mt-4 space-y-3">
          {(data?.products ?? []).map((product) => (
            <div key={product.id} className="rounded-lg border border-pocket-navy/10 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold text-pocket-navy">{product.name}</p>
                  <p className="text-xs text-pocket-navy/60">
                    {formatCurrency(product.costSummary.recipeCost)} food + {formatCurrency(product.costSummary.packagingCost)} packaging = {formatCurrency(product.costSummary.totalCost)} total · {product.costSummary.calories} cal
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEdit({ mode: "product", id: product.id, components: product.costSummary.items.filter((component) => component.ingredientType !== "PACKAGING").map((component) => ({ ingredientId: component.ingredientId, quantityNeeded: String(component.quantity) })) })}>Food</Button>
                  <Button size="sm" variant="outline" onClick={() => setEdit({ mode: "packaging", id: product.id, components: (product.costSummary.packagingRules ?? []).map((rule) => ({ ingredientId: rule.ingredientId, quantityNeeded: String(rule.quantity), serviceType: rule.serviceType })) })}>Packaging</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-5">
        <p className="text-lg font-black text-pocket-navy">{selectedName ? `Edit ${selectedName}` : "Recipe editor"}</p>
        {!edit ? <p className="mt-3 text-sm text-pocket-navy/60">Select food recipe or packaging rules.</p> : (
          <>
            <div className="mt-4 space-y-3">
              {edit.components.map((component, index) => (
                <div key={`${index}-${component.ingredientId}`} className={edit.mode === "packaging" ? "grid gap-3 md:grid-cols-[150px_1fr_140px_auto]" : "grid gap-3 md:grid-cols-[1fr_140px_auto]"}>
                  {edit.mode === "packaging" ? (
                    <select value={component.serviceType ?? "DEFAULT"} onChange={(event) => setEdit((current) => current ? { ...current, components: current.components.map((entry, entryIndex) => entryIndex === index ? { ...entry, serviceType: event.target.value } : entry) } : current)} className="flex h-11 rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
                      {SERVICE_TYPES.map((serviceType) => <option key={serviceType} value={serviceType}>{SERVICE_TYPE_LABELS[serviceType]}</option>)}
                    </select>
                  ) : null}
                  <select value={component.ingredientId} onChange={(event) => setEdit((current) => current ? { ...current, components: current.components.map((entry, entryIndex) => entryIndex === index ? { ...entry, ingredientId: event.target.value } : entry) } : current)} className="flex h-11 rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
                    <option value="">{edit.mode === "packaging" ? "Select packaging" : "Select ingredient or prep item"}</option>
                    {editorIngredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.unit})</option>)}
                  </select>
                  <Input type="number" min="0" step="0.001" value={component.quantityNeeded} onChange={(event) => setEdit((current) => current ? { ...current, components: current.components.map((entry, entryIndex) => entryIndex === index ? { ...entry, quantityNeeded: event.target.value } : entry) } : current)} />
                  <Button variant="ghost" onClick={() => setEdit((current) => current ? { ...current, components: current.components.map((entry, entryIndex) => entryIndex === index ? { ...entry, quantityNeeded: "0" } : entry) } : current)}>Set 0</Button>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap justify-between gap-3">
              <Button variant="outline" onClick={() => setEdit((current) => current ? { ...current, components: [...current.components, { ingredientId: "", quantityNeeded: "0", serviceType: edit.mode === "packaging" ? "DEFAULT" : undefined }] } : current)}><Plus className="h-4 w-4" />{edit.mode === "packaging" ? "Add packaging" : "Add ingredient"}</Button>
              <Button onClick={onSave} disabled={saving}>{saving ? "Saving..." : edit.mode === "packaging" ? "Save packaging" : "Save recipe"}</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function PrepItemsSection({ data, ingredients, edit, setEdit, saving, onSave }: { data: AdminRecipeData | null; ingredients: AdminRecipeData["ingredients"]; edit: RecipeEditState | null; setEdit: Dispatch<SetStateAction<RecipeEditState | null>>; saving: boolean; onSave: () => void }) {
  const preparedEdit = edit?.mode === "prepared" ? edit : null;
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
      <Card className="p-5">
        <p className="text-lg font-black text-pocket-navy">Prep Items</p>
        <div className="mt-4 space-y-3">
          {(data?.preparedItems ?? []).map((item) => (
            <RecipeRow key={item.id} name={item.name} meta={`${formatCurrency(item.totalCost)} · ${item.totalCalories} cal · ${item.components.length} components`} onEdit={() => setEdit({ mode: "prepared", id: item.id, components: item.components.map((component) => ({ ingredientId: component.ingredientId, quantityNeeded: String(component.quantityNeeded) })) })} />
          ))}
        </div>
      </Card>
      <Card className="p-5">
        <p className="text-lg font-black text-pocket-navy">{preparedEdit ? "Edit prep recipe" : "Prep recipe editor"}</p>
        {!preparedEdit ? <p className="mt-3 text-sm text-pocket-navy/60">Select a prep item to edit the ingredients used to make it.</p> : (
          <>
            <div className="mt-4 space-y-3">
              {preparedEdit.components.map((component, index) => (
                <div key={`${index}-${component.ingredientId}`} className="grid gap-3 md:grid-cols-[1fr_140px_auto]">
                  <select value={component.ingredientId} onChange={(event) => setEdit((current) => current ? { ...current, components: current.components.map((entry, entryIndex) => entryIndex === index ? { ...entry, ingredientId: event.target.value } : entry) } : current)} className="flex h-11 rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
                    <option value="">Select ingredient</option>
                    {ingredients.filter((ingredient) => ingredient.type !== "PACKAGING").map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.unit})</option>)}
                  </select>
                  <Input type="number" min="0" step="0.001" value={component.quantityNeeded} onChange={(event) => setEdit((current) => current ? { ...current, components: current.components.map((entry, entryIndex) => entryIndex === index ? { ...entry, quantityNeeded: event.target.value } : entry) } : current)} />
                  <Button variant="ghost" onClick={() => setEdit((current) => current ? { ...current, components: current.components.map((entry, entryIndex) => entryIndex === index ? { ...entry, quantityNeeded: "0" } : entry) } : current)}>Set 0</Button>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap justify-between gap-3">
              <Button variant="outline" onClick={() => setEdit((current) => current ? { ...current, components: [...current.components, { ingredientId: "", quantityNeeded: "0" }] } : current)}><Plus className="h-4 w-4" />Add ingredient</Button>
              <Button onClick={onSave} disabled={saving}>{saving ? "Saving..." : "Save prep recipe"}</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function RulesSection({ data, form, setForm, saving, onSubmit, onDelete }: { data: AdminPackagingRuleData | null; form: RuleFormState; setForm: Dispatch<SetStateAction<RuleFormState>>; saving: boolean; onSubmit: () => void; onDelete: (ruleId: string) => void }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <Card className="p-5">
        <p className="text-lg font-black text-pocket-navy">{form.id ? "Edit packaging rule" : "Add packaging rule"}</p>
        <div className="mt-4 space-y-3">
          <Field label="Scope">
            <select value={form.scope} onChange={(event) => setForm((current) => ({ ...current, scope: event.target.value as RuleFormState["scope"], productId: "", categoryId: "" }))} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
              <option value="ORDER">Whole order</option>
              <option value="CATEGORY">Category</option>
              <option value="PRODUCT">Product</option>
            </select>
          </Field>
          {form.scope === "PRODUCT" ? (
            <Field label="Product"><select value={form.productId} onChange={(event) => setForm((current) => ({ ...current, productId: event.target.value }))} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm"><option value="">Select product</option>{(data?.products ?? []).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></Field>
          ) : null}
          {form.scope === "CATEGORY" ? (
            <Field label="Category"><select value={form.categoryId} onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm"><option value="">Select category</option>{(data?.categories ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
          ) : null}
          <Field label="Order type"><select value={form.serviceType} onChange={(event) => setForm((current) => ({ ...current, serviceType: event.target.value }))} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">{SERVICE_TYPES.map((type) => <option key={type} value={type}>{SERVICE_TYPE_LABELS[type]}</option>)}</select></Field>
          <Field label="Packaging"><select value={form.packagingIngredientId} onChange={(event) => setForm((current) => ({ ...current, packagingIngredientId: event.target.value }))} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm"><option value="">Select packaging</option>{(data?.packagingItems ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Quantity mode"><select value={form.quantityMode} onChange={(event) => setForm((current) => ({ ...current, quantityMode: event.target.value as RuleFormState["quantityMode"] }))} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm"><option value="FIXED">Fixed per item/order</option><option value="PER_ITEM_STEP">Per item step</option></select></Field>
          <Field label="Quantity"><Input type="number" min="0" step="0.001" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} /></Field>
          {form.quantityMode === "PER_ITEM_STEP" ? <Field label="Every X items"><Input type="number" min="1" step="1" value={form.itemStep} onChange={(event) => setForm((current) => ({ ...current, itemStep: event.target.value }))} /></Field> : null}
          <Button onClick={onSubmit} disabled={saving}>{saving ? "Saving..." : "Save rule"}</Button>
        </div>
      </Card>
      <Card className="p-5">
        <p className="text-lg font-black text-pocket-navy">Packaging Rules</p>
        <div className="mt-4 space-y-3">
          {(data?.rules ?? []).map((rule) => (
            <div key={rule.id} className="rounded-lg border border-pocket-navy/10 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-bold text-pocket-navy">{rule.packagingIngredientName}</p>
                  <p className="text-sm text-pocket-navy/60">{rule.productName ?? rule.categoryName ?? "Whole order"} · {SERVICE_TYPE_LABELS[rule.serviceType as keyof typeof SERVICE_TYPE_LABELS] ?? rule.serviceType}</p>
                  <p className="text-xs text-pocket-navy/55">{rule.quantityMode === "PER_ITEM_STEP" ? `${rule.quantity} per ${rule.itemStep ?? 1} items` : `${rule.quantity} fixed`}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setForm({ id: rule.id, scope: rule.productId ? "PRODUCT" : rule.categoryId ? "CATEGORY" : "ORDER", productId: rule.productId ?? "", categoryId: rule.categoryId ?? "", serviceType: rule.serviceType, packagingIngredientId: rule.packagingIngredientId, quantityMode: rule.quantityMode, quantity: String(rule.quantity), itemStep: String(rule.itemStep ?? 1) })}>Edit</Button>
                  <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => onDelete(rule.id)}><Trash2 className="h-4 w-4" />Delete</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function TransfersSection({ data, form, setForm, saving, onSubmit, onDelete }: { data: AdminMoneyTransferData | null; form: TransferFormState; setForm: Dispatch<SetStateAction<TransferFormState>>; saving: boolean; onSubmit: () => void; onDelete: (transferId: string) => void }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <Card className="p-5">
        <p className="text-lg font-black text-pocket-navy">Record Transfer</p>
        <div className="mt-4 space-y-3">
          <Field label="Branch"><select value={form.branchId} onChange={(event) => setForm((current) => ({ ...current, branchId: event.target.value }))} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">{(data?.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Field>
          <Field label="From"><select value={form.fromSource} onChange={(event) => setForm((current) => ({ ...current, fromSource: event.target.value as MoneySource }))} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">{MONEY_SOURCES.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}</select></Field>
          <Field label="To"><select value={form.toSource} onChange={(event) => setForm((current) => ({ ...current, toSource: event.target.value as MoneySource }))} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">{MONEY_SOURCES.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}</select></Field>
          <Field label="Amount"><Input type="number" min="0" step="0.01" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} /></Field>
          <Field label="Date"><Input type="date" value={form.transferDate} onChange={(event) => setForm((current) => ({ ...current, transferDate: event.target.value }))} /></Field>
          <Field label="Note"><Textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></Field>
          <Button onClick={onSubmit} disabled={saving}>{saving ? "Saving..." : "Record transfer"}</Button>
        </div>
      </Card>
      <Card className="p-5"><p className="text-lg font-black text-pocket-navy">Recent Transfers</p><div className="mt-4 space-y-3">{(data?.transfers ?? []).map((transfer) => <div key={transfer.id} className="rounded-lg border border-pocket-navy/10 p-3"><p className="font-bold text-pocket-navy">{formatCurrency(transfer.amount)} · {transfer.fromSource} to {transfer.toSource}</p><p className="text-sm text-pocket-navy/60">{transfer.branchName} · {new Date(transfer.transferDate).toLocaleDateString("en-PK")}</p>{transfer.note ? <p className="text-sm text-pocket-navy/60">{transfer.note}</p> : null}</div>)}</div></Card>
      <Card className="p-5">
        <p className="text-sm font-bold text-pocket-navy">Delete Transfers</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(data?.transfers ?? []).map((transfer) => (
            <Button key={transfer.id} size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => onDelete(transfer.id)}>
              <Trash2 className="h-4 w-4" />
              {formatCurrency(transfer.amount)}
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ClosingSection({ data, form, setForm, saving, onSubmit, onDelete }: { data: AdminDailyClosingData | null; form: ClosingFormState; setForm: Dispatch<SetStateAction<ClosingFormState>>; saving: boolean; onSubmit: () => void; onDelete: (closingId: string) => void }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <Card className="p-5">
        <p className="text-lg font-black text-pocket-navy">Daily Closing</p>
        <div className="mt-4 space-y-3">
          <Field label="Date"><Input type="date" value={form.closingDate} onChange={(event) => setForm((current) => ({ ...current, closingDate: event.target.value }))} /></Field>
          <Field label="Cash counted"><Input type="number" min="0" step="0.01" value={form.cashCounted} onChange={(event) => setForm((current) => ({ ...current, cashCounted: event.target.value }))} /></Field>
          <Field label="Easypaisa counted"><Input type="number" min="0" step="0.01" value={form.easypaisaCounted} onChange={(event) => setForm((current) => ({ ...current, easypaisaCounted: event.target.value }))} /></Field>
          <Field label="JazzCash counted"><Input type="number" min="0" step="0.01" value={form.jazzcashCounted} onChange={(event) => setForm((current) => ({ ...current, jazzcashCounted: event.target.value }))} /></Field>
          <Field label="Note"><Textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></Field>
          <Button onClick={onSubmit} disabled={saving}>{saving ? "Saving..." : "Close day"}</Button>
        </div>
      </Card>
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-3">
          {MONEY_SOURCES.map((source) => {
            const expected = data?.expected[source.value] ?? 0;
            const counted = source.value === "CASH" ? numberValue(form.cashCounted) : source.value === "EASYPAISA" ? numberValue(form.easypaisaCounted) : numberValue(form.jazzcashCounted);
            return <Card key={source.value} className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-orange">{source.label}</p><p className="mt-2 text-2xl font-black text-pocket-navy">{formatCurrency(expected)}</p><p className="mt-1 text-sm text-pocket-navy/60">Diff {formatCurrency(counted - expected)}</p></Card>;
          })}
        </div>
        <Card className="p-5"><p className="text-lg font-black text-pocket-navy">Recent Closings</p><div className="mt-4 space-y-3">{(data?.recentClosings ?? []).map((closing) => <div key={closing.id} className="rounded-lg border border-pocket-navy/10 p-3"><p className="font-bold text-pocket-navy">{new Date(closing.closingDate).toLocaleDateString("en-PK")}</p><p className="text-sm text-pocket-navy/60">Cash {formatCurrency(closing.cashCounted)} · Easypaisa {formatCurrency(closing.easypaisaCounted)} · JazzCash {formatCurrency(closing.jazzcashCounted)}</p>{closing.note ? <p className="text-sm text-pocket-navy/60">{closing.note}</p> : null}</div>)}</div></Card>
        <Card className="p-5">
          <p className="text-sm font-bold text-pocket-navy">Delete Closings</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(data?.recentClosings ?? []).map((closing) => (
              <Button key={closing.id} size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => onDelete(closing.id)}>
                <Trash2 className="h-4 w-4" />
                {new Date(closing.closingDate).toLocaleDateString("en-PK")}
              </Button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function LogsSection({ entries, edit, setEdit, saving, onSave }: { entries: AdminInventoryTransaction[]; edit: LogEditState | null; setEdit: Dispatch<SetStateAction<LogEditState | null>>; saving: boolean; onSave: () => void }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
      <Card className="p-5">
        <p className="text-lg font-black text-pocket-navy">Stock Logs</p>
        <div className="mt-4 space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-pocket-navy/10 p-3">
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-bold text-pocket-navy">{entry.ingredientName}</p><p className="text-xs font-semibold uppercase tracking-[0.18em] text-pocket-orange">{entry.type}{entry.editedAt ? " · Edited" : ""}</p><p className="mt-1 text-sm text-pocket-navy/60">{entry.note ?? "No note"}</p></div>
                <div className="text-right"><p className={entry.quantity >= 0 ? "font-black text-emerald-700" : "font-black text-red-600"}>{entry.quantity >= 0 ? "+" : ""}{entry.quantity}</p><Button size="sm" variant="outline" onClick={() => setEdit({ transactionId: entry.id, quantity: String(entry.quantity), note: entry.note ?? "", vendorName: entry.vendorName ?? "", purchaseDate: entry.purchaseDate?.slice(0, 10) ?? "", purchaseCost: entry.purchaseCost ? String(entry.purchaseCost) : "", wastageReason: entry.wastageReason ?? "" })}>Edit</Button></div>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-5">
        <p className="text-lg font-black text-pocket-navy">Edit Log</p>
        {!edit ? <p className="mt-3 text-sm text-pocket-navy/60">Pick a log entry to edit.</p> : (
          <div className="mt-4 space-y-3">
            <Field label="Quantity"><Input type="number" step="0.001" value={edit.quantity} onChange={(event) => setEdit((current) => current ? { ...current, quantity: event.target.value } : current)} /></Field>
            <Field label="Vendor"><Input value={edit.vendorName} onChange={(event) => setEdit((current) => current ? { ...current, vendorName: event.target.value } : current)} /></Field>
            <Field label="Purchase date"><Input type="date" value={edit.purchaseDate} onChange={(event) => setEdit((current) => current ? { ...current, purchaseDate: event.target.value } : current)} /></Field>
            <Field label="Purchase cost"><Input type="number" min="0" step="0.01" value={edit.purchaseCost} onChange={(event) => setEdit((current) => current ? { ...current, purchaseCost: event.target.value } : current)} /></Field>
            <Field label="Wastage reason"><Input value={edit.wastageReason} onChange={(event) => setEdit((current) => current ? { ...current, wastageReason: event.target.value } : current)} /></Field>
            <div className="space-y-2"><label className="text-sm font-semibold text-pocket-navy">Note</label><Textarea value={edit.note} onChange={(event) => setEdit((current) => current ? { ...current, note: event.target.value } : current)} /></div>
            <Button onClick={onSave} disabled={saving}>{saving ? "Saving..." : "Save log edit"}</Button>
          </div>
        )}
      </Card>
    </div>
  );
}

export function InventoryWorkspace({ mode = "overview" }: { mode?: "overview" | "movement" | "log" | "list" }) {
  const initialTab: InventoryTab = mode === "movement" ? "add-stock" : mode === "log" ? "logs" : "stock";
  const [activeTab, setActiveTab] = useState<InventoryTab>(initialTab);
  const [data, setData] = useState<AdminInventoryData | null>(null);
  const [forecast, setForecast] = useState<AdminInventoryForecast | null>(null);
  const [recipes, setRecipes] = useState<AdminRecipeData | null>(null);
  const [rules, setRules] = useState<AdminPackagingRuleData | null>(null);
  const [transfers, setTransfers] = useState<AdminMoneyTransferData | null>(null);
  const [closing, setClosing] = useState<AdminDailyClosingData | null>(null);
  const [vendors, setVendors] = useState<AdminVendor[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [itemEditorOpen, setItemEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AdminInventoryItem | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState>(EMPTY_ITEM_FORM);
  const [stockForm, setStockForm] = useState<StockFormState>(EMPTY_STOCK_FORM);
  const [wastageForm, setWastageForm] = useState<WastageFormState>(EMPTY_WASTAGE_FORM);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(EMPTY_RULE_FORM);
  const [transferForm, setTransferForm] = useState<TransferFormState>(EMPTY_TRANSFER_FORM);
  const [closingForm, setClosingForm] = useState<ClosingFormState>(EMPTY_CLOSING_FORM);
  const [logEdit, setLogEdit] = useState<LogEditState | null>(null);
  const [recipeEdit, setRecipeEdit] = useState<RecipeEditState | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    try {
      setError("");
      const [inventoryData, forecastData, recipeData, vendorData, ruleData] = await Promise.all([fetchAdminInventory(), fetchAdminInventoryForecast(), fetchAdminInventoryRecipes(), fetchAdminVendors(), fetchAdminPackagingRules()]);
      setData(inventoryData);
      setForecast(forecastData);
      setRecipes(recipeData);
      setVendors(vendorData.vendors);
      setRules(ruleData);
      const first = inventoryData.items[0]?.ingredientId ?? "";
      const branchId = inventoryData.branches[0]?.id ?? "";
      setStockForm((current) => ({ ...current, ingredientId: current.ingredientId || first }));
      setWastageForm((current) => ({ ...current, ingredientId: current.ingredientId || first }));
      setTransferForm((current) => ({ ...current, branchId: current.branchId || branchId }));
      setClosingForm((current) => ({ ...current, branchId: current.branchId || branchId }));
      if (branchId) {
        const [transferResult, closingResult] = await Promise.allSettled([
          fetchAdminMoneyTransfers(branchId),
          fetchAdminDailyClosing(branchId, closingForm.closingDate)
        ]);
        if (transferResult.status === "fulfilled") {
          setTransfers(transferResult.value);
        }
        if (closingResult.status === "fulfilled") {
          const closingData = closingResult.value;
          setClosing(closingData);
          setClosingForm((current) => ({
            ...current,
            cashCounted: current.cashCounted || String(closingData.expected.CASH),
            easypaisaCounted: current.easypaisaCounted || String(closingData.expected.EASYPAISA),
            jazzcashCounted: current.jazzcashCounted || String(closingData.expected.JAZZCASH)
          }));
        }
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load inventory.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const items = useMemo(() => {
    const source = data?.items ?? [];
    if (!search.trim()) return source;
    const value = search.toLowerCase();
    return source.filter((item) => `${item.name} ${item.sku} ${item.type} ${item.linkedProducts.map((product) => product.productName).join(" ")}`.toLowerCase().includes(value));
  }, [data, search]);

  function openCreateItem() {
    setEditingItem(null);
    setItemForm(EMPTY_ITEM_FORM);
    setItemEditorOpen(true);
  }

  function openEditItem(item: AdminInventoryItem) {
    setEditingItem(item);
    setItemForm(itemToForm(item));
    setItemEditorOpen(true);
  }

  async function saveItem() {
    const branchId = data?.branches[0]?.id;
    if (!branchId || !itemForm.name.trim()) {
      setError("Item name is required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        branchId,
        name: itemForm.name.trim(),
        unit: itemForm.unit,
        type: itemForm.type,
        reorderLevel: numberValue(itemForm.reorderLevel),
        costPerUnit: numberValue(itemForm.costPerUnit),
        caloriesPerUnit: numberValue(itemForm.caloriesPerUnit),
        openingStock: numberValue(itemForm.openingStock)
      };
      if (editingItem) await updateAdminInventoryItem(editingItem.ingredientId, payload);
      else await createAdminInventoryItem(payload);
      setItemEditorOpen(false);
      await loadAll();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save item.");
    } finally {
      setSaving(false);
    }
  }

  async function submitStock() {
    const branchId = data?.branches[0]?.id;
    if (!branchId || !stockForm.ingredientId) return;
    setSaving(true);
    try {
      await createAdminInventoryTransaction({
        branchId,
        ingredientId: stockForm.ingredientId,
        action: "PURCHASE",
        quantity: numberValue(stockForm.quantity),
        vendorName: stockForm.vendorName.trim() || undefined,
        purchaseDate: stockForm.purchaseDate ? new Date(stockForm.purchaseDate).toISOString() : undefined,
        purchaseCost: stockForm.purchaseCost ? numberValue(stockForm.purchaseCost) : undefined,
        note: stockForm.note.trim() || undefined
      });
      setStockForm({ ...EMPTY_STOCK_FORM, ingredientId: stockForm.ingredientId });
      await loadAll();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to add stock.");
    } finally {
      setSaving(false);
    }
  }

  async function submitWastage() {
    const branchId = data?.branches[0]?.id;
    if (!branchId || !wastageForm.ingredientId) return;
    setSaving(true);
    try {
      await createAdminInventoryTransaction({
        branchId,
        ingredientId: wastageForm.ingredientId,
        action: "WASTAGE",
        quantity: numberValue(wastageForm.quantity),
        wastageReason: wastageForm.wastageReason,
        note: wastageForm.note.trim() || undefined
      });
      setWastageForm({ ...EMPTY_WASTAGE_FORM, ingredientId: wastageForm.ingredientId });
      await loadAll();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to record wastage.");
    } finally {
      setSaving(false);
    }
  }

  async function saveLogEdit() {
    if (!logEdit) return;
    setSaving(true);
    try {
      await updateAdminInventoryTransaction(logEdit.transactionId, {
        quantity: numberValue(logEdit.quantity),
        note: logEdit.note,
        vendorName: logEdit.vendorName || undefined,
        purchaseDate: logEdit.purchaseDate ? new Date(logEdit.purchaseDate).toISOString() : null,
        purchaseCost: logEdit.purchaseCost ? numberValue(logEdit.purchaseCost) : null,
        wastageReason: logEdit.wastageReason || null
      });
      setLogEdit(null);
      await loadAll();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update log.");
    } finally {
      setSaving(false);
    }
  }

  async function saveRecipe() {
    if (!recipeEdit) return;
    setSaving(true);
    try {
      const components = recipeEdit.components.filter((component) => component.ingredientId).map((component) => ({ ingredientId: component.ingredientId, quantityNeeded: numberValue(component.quantityNeeded) }));
      if (recipeEdit.mode === "packaging") await updateAdminProductPackagingRules(recipeEdit.id, recipeEdit.components.filter((component) => component.ingredientId).map((component) => ({ serviceType: component.serviceType ?? "DEFAULT", ingredientId: component.ingredientId, quantityNeeded: numberValue(component.quantityNeeded) })));
      else if (recipeEdit.mode === "product") await updateAdminProductRecipe(recipeEdit.id, components);
      else await updateAdminPreparedRecipe(recipeEdit.id, components);
      setRecipeEdit(null);
      await loadAll();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save recipe.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(item: AdminInventoryItem) {
    const confirmed = window.confirm(`Delete ${item.name}? This cannot be undone.`);
    if (!confirmed) return;
    setSaving(true);
    setError("");
    try {
      await deleteAdminInventoryItem(item.ingredientId);
      await loadAll();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete item.");
    } finally {
      setSaving(false);
    }
  }

  async function saveRule() {
    if (!ruleForm.packagingIngredientId) {
      setError("Select packaging for the rule.");
      return;
    }
    setSaving(true);
    try {
      await saveAdminPackagingRule({
        id: ruleForm.id || undefined,
        productId: ruleForm.scope === "PRODUCT" ? ruleForm.productId || null : null,
        categoryId: ruleForm.scope === "CATEGORY" ? ruleForm.categoryId || null : null,
        serviceType: ruleForm.serviceType,
        packagingIngredientId: ruleForm.packagingIngredientId,
        quantityMode: ruleForm.quantityMode,
        quantity: numberValue(ruleForm.quantity),
        itemStep: ruleForm.quantityMode === "PER_ITEM_STEP" ? Math.max(1, Math.floor(numberValue(ruleForm.itemStep))) : null
      });
      setRuleForm(EMPTY_RULE_FORM);
      await loadAll();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save rule.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(ruleId: string) {
    const confirmed = window.confirm("Delete this packaging rule?");
    if (!confirmed) return;
    setSaving(true);
    setError("");
    try {
      await deleteAdminPackagingRule(ruleId);
      await loadAll();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete rule.");
    } finally {
      setSaving(false);
    }
  }

  async function saveTransfer() {
    if (!transferForm.branchId || !transferForm.amount) return;
    setSaving(true);
    try {
      await createAdminMoneyTransfer({
        branchId: transferForm.branchId,
        fromSource: transferForm.fromSource,
        toSource: transferForm.toSource,
        amount: numberValue(transferForm.amount),
        transferDate: new Date(`${transferForm.transferDate}T12:00:00`).toISOString(),
        note: transferForm.note.trim() || undefined
      });
      setTransferForm((current) => ({ ...EMPTY_TRANSFER_FORM, branchId: current.branchId }));
      await loadAll();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to record transfer.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTransfer(transferId: string) {
    const confirmed = window.confirm("Delete this money transfer?");
    if (!confirmed) return;
    setSaving(true);
    setError("");
    try {
      await deleteAdminMoneyTransfer(transferId);
      await loadAll();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete transfer.");
    } finally {
      setSaving(false);
    }
  }

  async function saveClosing() {
    if (!closingForm.branchId) return;
    setSaving(true);
    try {
      await saveAdminDailyClosing({
        branchId: closingForm.branchId,
        closingDate: new Date(`${closingForm.closingDate}T12:00:00`).toISOString(),
        cashCounted: numberValue(closingForm.cashCounted),
        easypaisaCounted: numberValue(closingForm.easypaisaCounted),
        jazzcashCounted: numberValue(closingForm.jazzcashCounted),
        note: closingForm.note.trim() || undefined
      });
      await loadAll();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save closing.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteClosing(closingId: string) {
    const confirmed = window.confirm("Delete this daily closing?");
    if (!confirmed) return;
    setSaving(true);
    setError("");
    try {
      await deleteAdminDailyClosing(closingId);
      await loadAll();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete closing.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <ItemEditor open={itemEditorOpen} value={itemForm} editingItem={editingItem} saving={saving} onChange={setItemForm} onClose={() => setItemEditorOpen(false)} onSubmit={() => void saveItem()} />
      <SummaryCards data={data} forecast={forecast} onRefresh={() => void loadAll()} onAddItem={openCreateItem} />
      <TabNav activeTab={activeTab} onChange={setActiveTab} />
      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
      <Card className="p-5">
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search inventory, type, or linked product" />
      </Card>
      {activeTab === "stock" ? <StockTable items={items} loading={loading} onEdit={openEditItem} onAddStock={(item) => { setStockForm((current) => ({ ...current, ingredientId: item.ingredientId })); setActiveTab("add-stock"); }} onWastage={(item) => { setWastageForm((current) => ({ ...current, ingredientId: item.ingredientId })); setActiveTab("wastage"); }} onDelete={(item) => void deleteItem(item)} /> : null}
      {activeTab === "add-stock" ? <AddStockForm items={items} vendors={vendors} form={stockForm} setForm={setStockForm} saving={saving} onSubmit={() => void submitStock()} /> : null}
      {activeTab === "vendors" ? <VendorManagement /> : null}
      {activeTab === "prep" ? <PrepItemsSection data={recipes} ingredients={recipes?.ingredients ?? []} edit={recipeEdit} setEdit={setRecipeEdit} saving={saving} onSave={() => void saveRecipe()} /> : null}
      {activeTab === "rules" ? <RulesSection data={rules} form={ruleForm} setForm={setRuleForm} saving={saving} onSubmit={() => void saveRule()} onDelete={(ruleId) => void deleteRule(ruleId)} /> : null}
      {activeTab === "transfers" ? <TransfersSection data={transfers} form={transferForm} setForm={setTransferForm} saving={saving} onSubmit={() => void saveTransfer()} onDelete={(transferId) => void deleteTransfer(transferId)} /> : null}
      {activeTab === "closing" ? <ClosingSection data={closing} form={closingForm} setForm={setClosingForm} saving={saving} onSubmit={() => void saveClosing()} onDelete={(closingId) => void deleteClosing(closingId)} /> : null}
      {activeTab === "wastage" ? <WastageForm items={items} form={wastageForm} setForm={setWastageForm} saving={saving} onSubmit={() => void submitWastage()} /> : null}
      {activeTab === "forecast" ? <ForecastSection forecast={forecast} loading={loading} /> : null}
      {activeTab === "recipes" ? <RecipesCostingSection data={recipes} ingredients={recipes?.ingredients ?? []} edit={recipeEdit} setEdit={setRecipeEdit} saving={saving} onSave={() => void saveRecipe()} /> : null}
      {activeTab === "logs" ? <LogsSection entries={data?.recentTransactions ?? []} edit={logEdit} setEdit={setLogEdit} saving={saving} onSave={() => void saveLogEdit()} /> : null}
    </div>
  );
}
