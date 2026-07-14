"use client";

import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import { BarChart3, ChefHat, ClipboardList, History, Pencil, Plus, RefreshCcw, Trash2, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { VendorManagement } from "@/components/admin/vendor-management";
import {
  createAdminInventoryItem,
  createAdminInventoryTransaction,
  fetchAdminInventory,
  fetchAdminInventoryForecast,
  fetchAdminInventoryRecipes,
  fetchAdminVendors,
  updateAdminInventoryItem,
  updateAdminInventoryTransaction,
  updateAdminPreparedRecipe,
  updateAdminProductRecipe
} from "@/lib/admin-client";
import type { AdminInventoryData, AdminInventoryForecast, AdminInventoryItem, AdminInventoryTransaction, AdminRecipeData, AdminVendor } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

type InventoryTab = "dashboard" | "stock" | "add-stock" | "vendors" | "recipes" | "wastage" | "forecast" | "logs";

const INVENTORY_UNITS = ["kg", "litre", "bottles", "pieces", "slices", "loafs"];
const ITEM_TYPES = ["RAW", "PREPARED", "PACKAGING"] as const;
const WASTAGE_REASONS = ["expired", "spilled", "over-prepped", "damaged", "staff meal", "wrong order", "other"] as const;

const TABS: Array<{ id: InventoryTab; label: string; icon: typeof Warehouse }> = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "stock", label: "Stock", icon: ClipboardList },
  { id: "add-stock", label: "Add Stock", icon: Warehouse },
  { id: "vendors", label: "Vendors", icon: ClipboardList },
  { id: "recipes", label: "Recipes & Costing", icon: ChefHat },
  { id: "wastage", label: "Wastage", icon: Trash2 },
  { id: "forecast", label: "Forecast / Buy List", icon: BarChart3 },
  { id: "logs", label: "Stock Logs", icon: History }
];

type ItemFormState = {
  name: string;
  sku: string;
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
  mode: "product" | "prepared";
  id: string;
  components: Array<{ ingredientId: string; quantityNeeded: string }>;
};

const EMPTY_ITEM_FORM: ItemFormState = {
  name: "",
  sku: "",
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

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function itemToForm(item: AdminInventoryItem): ItemFormState {
  return {
    name: item.name,
    sku: item.sku,
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
    <Card className="p-3">
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Button key={tab.id} variant={activeTab === tab.id ? "default" : "outline"} onClick={() => onChange(tab.id)} className="justify-start">
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
            <label className="text-sm font-semibold text-pocket-navy">SKU</label>
            <Input value={value.sku} onChange={(event) => onChange({ ...value, sku: event.target.value.toUpperCase() })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Type</label>
            <select value={value.type} onChange={(event) => onChange({ ...value, type: event.target.value as ItemFormState["type"] })} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
              {ITEM_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
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
            <Input type="number" min="0" step="1" value={value.caloriesPerUnit} onChange={(event) => onChange({ ...value, caloriesPerUnit: event.target.value })} />
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
      <Card className="flex items-center justify-between gap-3 p-5"><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Actions</p><p className="mt-3 text-sm text-pocket-navy/60">Refresh or add item.</p></div><div className="flex gap-2"><Button variant="outline" onClick={onRefresh}><RefreshCcw className="h-4 w-4" /></Button><Button onClick={onAddItem}><Plus className="h-4 w-4" />Add</Button></div></Card>
    </div>
  );
}

function StockTable({ items, loading, onEdit, onAddStock, onWastage }: { items: AdminInventoryItem[]; loading: boolean; onEdit: (item: AdminInventoryItem) => void; onAddStock: (item: AdminInventoryItem) => void; onWastage: (item: AdminInventoryItem) => void }) {
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
            <p className="text-xs text-pocket-navy/50">{item.sku}</p>
            <p className="mt-1 text-xs text-pocket-navy/60">{item.linkedProducts.length ? `Used in ${item.linkedProducts.length} product${item.linkedProducts.length === 1 ? "" : "s"}` : "Not linked to a product yet"}</p>
          </div>
          <span className="font-semibold text-pocket-navy">{item.type}</span>
          <span className={item.lowStockAlert ? "font-bold text-red-600" : "font-bold text-pocket-navy"}>{item.quantityOnHand} {item.unit}</span>
          <span>{formatCurrency(item.costPerUnit)}</span>
          <span>{formatCurrency(item.stockValue)}</span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onAddStock(item)}>Add</Button>
            <Button size="sm" variant="outline" onClick={() => onWastage(item)}>Waste</Button>
            <Button size="sm" variant="ghost" onClick={() => onEdit(item)}><Pencil className="h-4 w-4" /></Button>
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
  const [query, setQuery] = useState(value);
  const [manual, setManual] = useState(false);
  const filteredVendors = useMemo(() => {
    const search = query.toLowerCase();
    return vendors
      .filter((vendor) => `${vendor.vendorName} ${vendor.provides ?? ""} ${vendor.ingredientCategory} ${vendor.contactNumber ?? ""}`.toLowerCase().includes(search))
      .slice(0, 8);
  }, [query, vendors]);

  useEffect(() => {
    setQuery(value);
  }, [value]);

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
      <div className="space-y-2">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search vendor by name or provided items" />
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <select value={value} onChange={(event) => onChange(event.target.value)} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
            <option value="">Select vendor</option>
            {filteredVendors.map((vendor) => (
              <option key={vendor.id} value={vendor.vendorName}>
                {vendor.vendorName}{vendor.provides ? ` - ${vendor.provides}` : ""}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" onClick={() => { setManual(true); onChange(""); }}>Other</Button>
        </div>
      </div>
    </Field>
  );
}

function AddStockForm({ items, vendors, form, setForm, saving, onSubmit }: { items: AdminInventoryItem[]; vendors: AdminVendor[]; form: StockFormState; setForm: Dispatch<SetStateAction<StockFormState>>; saving: boolean; onSubmit: () => void }) {
  return (
    <Card className="p-5">
      <p className="text-lg font-black text-pocket-navy">Add Stock</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <SelectItem items={items} value={form.ingredientId} onChange={(ingredientId) => setForm((current) => ({ ...current, ingredientId }))} />
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
  const selectedName = edit?.mode === "product" ? data?.products.find((product) => product.id === edit.id)?.name : data?.preparedItems.find((item) => item.id === edit?.id)?.name;
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
  const initialTab: InventoryTab = mode === "movement" ? "add-stock" : mode === "log" ? "logs" : mode === "list" ? "stock" : "dashboard";
  const [activeTab, setActiveTab] = useState<InventoryTab>(initialTab);
  const [data, setData] = useState<AdminInventoryData | null>(null);
  const [forecast, setForecast] = useState<AdminInventoryForecast | null>(null);
  const [recipes, setRecipes] = useState<AdminRecipeData | null>(null);
  const [vendors, setVendors] = useState<AdminVendor[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [itemEditorOpen, setItemEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AdminInventoryItem | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState>(EMPTY_ITEM_FORM);
  const [stockForm, setStockForm] = useState<StockFormState>(EMPTY_STOCK_FORM);
  const [wastageForm, setWastageForm] = useState<WastageFormState>(EMPTY_WASTAGE_FORM);
  const [logEdit, setLogEdit] = useState<LogEditState | null>(null);
  const [recipeEdit, setRecipeEdit] = useState<RecipeEditState | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    try {
      setError("");
      const [inventoryData, forecastData, recipeData, vendorData] = await Promise.all([fetchAdminInventory(), fetchAdminInventoryForecast(), fetchAdminInventoryRecipes(), fetchAdminVendors()]);
      setData(inventoryData);
      setForecast(forecastData);
      setRecipes(recipeData);
      setVendors(vendorData.vendors);
      const first = inventoryData.items[0]?.ingredientId ?? "";
      setStockForm((current) => ({ ...current, ingredientId: current.ingredientId || first }));
      setWastageForm((current) => ({ ...current, ingredientId: current.ingredientId || first }));
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
        sku: itemForm.sku.trim() || undefined,
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
      if (recipeEdit.mode === "product") await updateAdminProductRecipe(recipeEdit.id, components);
      else await updateAdminPreparedRecipe(recipeEdit.id, components);
      setRecipeEdit(null);
      await loadAll();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save recipe.");
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
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search inventory, SKU, type, or linked product" />
      </Card>
      {activeTab === "dashboard" ? <StockTable items={items.filter((item) => item.lowStockAlert).slice(0, 8)} loading={loading} onEdit={openEditItem} onAddStock={(item) => { setStockForm((current) => ({ ...current, ingredientId: item.ingredientId })); setActiveTab("add-stock"); }} onWastage={(item) => { setWastageForm((current) => ({ ...current, ingredientId: item.ingredientId })); setActiveTab("wastage"); }} /> : null}
      {activeTab === "stock" ? <StockTable items={items} loading={loading} onEdit={openEditItem} onAddStock={(item) => { setStockForm((current) => ({ ...current, ingredientId: item.ingredientId })); setActiveTab("add-stock"); }} onWastage={(item) => { setWastageForm((current) => ({ ...current, ingredientId: item.ingredientId })); setActiveTab("wastage"); }} /> : null}
      {activeTab === "add-stock" ? <AddStockForm items={items} vendors={vendors} form={stockForm} setForm={setStockForm} saving={saving} onSubmit={() => void submitStock()} /> : null}
      {activeTab === "vendors" ? <VendorManagement /> : null}
      {activeTab === "wastage" ? <WastageForm items={items} form={wastageForm} setForm={setWastageForm} saving={saving} onSubmit={() => void submitWastage()} /> : null}
      {activeTab === "forecast" ? <ForecastSection forecast={forecast} loading={loading} /> : null}
      {activeTab === "recipes" ? <RecipesSection data={recipes} ingredients={recipes?.ingredients ?? []} edit={recipeEdit} setEdit={setRecipeEdit} saving={saving} onSave={() => void saveRecipe()} /> : null}
      {activeTab === "logs" ? <LogsSection entries={data?.recentTransactions ?? []} edit={logEdit} setEdit={setLogEdit} saving={saving} onSave={() => void saveLogEdit()} /> : null}
    </div>
  );
}
