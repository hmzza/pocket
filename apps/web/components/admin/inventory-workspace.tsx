"use client";

import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import { BarChart3, ChefHat, ClipboardList, History, Pencil, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { VendorManagement } from "@/components/admin/vendor-management";
import {
  createAdminInventoryItem,
  createAdminInventoryTransaction,
  deleteAdminInventoryItem,
  deleteAdminPackagingRule,
  fetchAdminInventory,
  fetchAdminInventoryForecast,
  fetchAdminPackagingRules,
  fetchAdminInventoryRecipes,
  saveAdminInventoryPurchaseUnits,
  saveAdminPackagingRule,
  updateAdminInventoryItem,
  updateAdminInventoryItemStatus,
  updateAdminInventoryTransaction,
  updateAdminPreparedRecipe,
  updateAdminProductPackagingRules,
  updateAdminProductRecipe
} from "@/lib/admin-client";
import type { AdminInventoryData, AdminInventoryForecast, AdminInventoryItem, AdminInventoryTransaction, AdminPackagingRuleData, AdminRecipeData } from "@/lib/types";
import { formatCompactCurrency, formatCurrency, toBusinessDateInputValue } from "@/lib/utils";

type InventoryTab = "stock" | "vendors" | "prep" | "recipes" | "rules" | "wastage" | "forecast" | "logs";
type StockStatusFilter = "all" | "active" | "inactive";

const INVENTORY_UNITS = ["g", "kg", "ml", "litre", "bottles", "pieces", "slices", "loafs"];
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
const TABS: Array<{ id: InventoryTab; label: string; icon: typeof ClipboardList }> = [
  { id: "stock", label: "Stock", icon: ClipboardList },
  { id: "vendors", label: "Vendors", icon: ClipboardList },
  { id: "prep", label: "Prep Items", icon: ChefHat },
  { id: "recipes", label: "Recipes & Costing", icon: ChefHat },
  { id: "rules", label: "Rules", icon: ClipboardList },
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
  purchaseUnits: Array<{ id?: string; name: string; quantityInBaseUnits: string; isActive: boolean }>;
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

const EMPTY_ITEM_FORM: ItemFormState = {
  name: "",
  unit: "kg",
  type: "RAW",
  reorderLevel: "",
  costPerUnit: "0",
  caloriesPerUnit: "0",
  openingStock: "0",
  purchaseUnits: []
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
    openingStock: String(item.quantityOnHand),
    purchaseUnits: item.purchaseUnits.map((unit) => ({
      id: unit.id,
      name: unit.name,
      quantityInBaseUnits: String(unit.quantityInBaseUnits),
      isActive: unit.isActive
    }))
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
        <details className="mt-5 rounded-lg border border-pocket-navy/10 px-4 py-3">
          <summary className="cursor-pointer text-sm font-bold text-pocket-navy">Purchase units (optional)</summary>
          <p className="mt-2 text-xs text-pocket-navy/60">Define how suppliers sell this item. Each quantity is converted into the base unit above.</p>
          <div className="mt-4 space-y-3">
            {value.purchaseUnits.map((unit, index) => (
              <div key={unit.id ?? index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input value={unit.name} placeholder="e.g. carton" onChange={(event) => onChange({ ...value, purchaseUnits: value.purchaseUnits.map((current, currentIndex) => currentIndex === index ? { ...current, name: event.target.value } : current) })} />
                <Input type="number" min="0.000001" step="0.001" value={unit.quantityInBaseUnits} placeholder={`Quantity in ${value.unit}`} onChange={(event) => onChange({ ...value, purchaseUnits: value.purchaseUnits.map((current, currentIndex) => currentIndex === index ? { ...current, quantityInBaseUnits: event.target.value } : current) })} />
                <Button type="button" variant="ghost" className="text-red-600" onClick={() => onChange({ ...value, purchaseUnits: value.purchaseUnits.filter((_, currentIndex) => currentIndex !== index) })}>Remove</Button>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => onChange({ ...value, purchaseUnits: [...value.purchaseUnits, { name: "", quantityInBaseUnits: "", isActive: true }] })}><Plus className="h-4 w-4" />Add purchase unit</Button>
          </div>
        </details>
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
      <Card className="min-w-0 p-5"><p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Stock value</p><p className="mt-3 min-w-0 break-words text-[clamp(1rem,1.6vw,1.5rem)] font-black leading-tight tracking-tight text-pocket-navy">{formatCompactCurrency(data?.summary.totalStockValue ?? 0)}</p><p className="mt-2 text-sm text-pocket-navy/60">On-hand value.</p></Card>
      <Card className="min-w-0 p-5"><p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Tomorrow buy</p><p className="mt-3 min-w-0 break-words text-[clamp(1rem,1.6vw,1.5rem)] font-black leading-tight tracking-tight text-pocket-navy">{formatCompactCurrency(tomorrow?.suggestedPurchaseCost ?? 0)}</p><p className="mt-2 text-sm text-pocket-navy/60">Forecasted purchase.</p></Card>
      <Card className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center"><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Actions</p><p className="mt-3 text-sm text-pocket-navy/60">Refresh or add item.</p></div><div className="flex w-full flex-wrap gap-2 sm:w-auto"><Button variant="outline" onClick={onRefresh} className="shrink-0"><RefreshCcw className="h-4 w-4" /></Button><Button onClick={onAddItem} className="min-w-0 shrink-0"><Plus className="h-4 w-4" />Add</Button></div></Card>
    </div>
  );
}

function StockTable({
  items,
  loading,
  onEdit,
  onPurchase,
  onWastage,
  onToggleStatus,
  onDelete
}: {
  items: AdminInventoryItem[];
  loading: boolean;
  onEdit: (item: AdminInventoryItem) => void;
  onPurchase: (item: AdminInventoryItem) => void;
  onWastage: (item: AdminInventoryItem) => void;
  onToggleStatus: (item: AdminInventoryItem) => void;
  onDelete: (item: AdminInventoryItem) => void;
}) {
  if (loading) return <Card className="p-5 text-sm text-pocket-navy/60">Loading stock...</Card>;
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-4 border-b border-pocket-navy/10 bg-pocket-cream px-5 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60 lg:grid-cols-[1.4fr_0.7fr_0.8fr_0.8fr_0.8fr_1.2fr]">
        <span>Item</span><span>Type</span><span>On hand</span><span>Unit cost</span><span>Value</span><span>Actions</span>
      </div>
      {items.map((item) => (
        <div key={item.id} className={`grid gap-4 border-b border-pocket-navy/10 px-5 py-4 text-sm last:border-0 lg:grid-cols-[1.4fr_0.7fr_0.8fr_0.8fr_0.8fr_1.2fr] ${item.isActive ? "" : "bg-pocket-cream/45"}`}>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold text-pocket-navy">{item.name}</p>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] ${item.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                {item.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="mt-1 text-xs text-pocket-navy/60">{item.linkedProducts.length ? `Used in ${item.linkedProducts.length} product${item.linkedProducts.length === 1 ? "" : "s"}` : "Not linked to a product yet"}</p>
          </div>
          <span className="font-semibold text-pocket-navy">{ITEM_TYPE_LABELS[item.type as keyof typeof ITEM_TYPE_LABELS] ?? item.type}</span>
          <span className={item.lowStockAlert ? "font-bold text-red-600" : "font-bold text-pocket-navy"}>{item.quantityOnHand} {item.unit}</span>
          <span>{formatCurrency(item.costPerUnit)}</span>
          <span>{formatCurrency(item.stockValue)}</span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onPurchase(item)} disabled={!item.isActive}>Buy</Button>
            <Button size="sm" variant="outline" onClick={() => onWastage(item)} disabled={!item.isActive}>Waste</Button>
            <Button size="sm" variant="ghost" onClick={() => onEdit(item)}><Pencil className="h-4 w-4" /></Button>
            <Button size="sm" variant="outline" onClick={() => onToggleStatus(item)}>{item.isActive ? "Disable" : "Enable"}</Button>
            <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => onDelete(item)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      ))}
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
                <div className="text-right"><p className={entry.quantity >= 0 ? "font-black text-emerald-700" : "font-black text-red-600"}>{entry.quantity >= 0 ? "+" : ""}{entry.quantity}</p><Button size="sm" variant="outline" onClick={() => setEdit({ transactionId: entry.id, quantity: String(entry.quantity), note: entry.note ?? "", vendorName: entry.vendorName ?? "", purchaseDate: entry.purchaseDate ? toBusinessDateInputValue(entry.purchaseDate) : "", purchaseCost: entry.purchaseCost ? String(entry.purchaseCost) : "", wastageReason: entry.wastageReason ?? "" })}>Edit</Button></div>
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
  const initialTab: InventoryTab = mode === "movement" ? "stock" : mode === "log" ? "logs" : "stock";
  const [activeTab, setActiveTab] = useState<InventoryTab>(initialTab);
  const [data, setData] = useState<AdminInventoryData | null>(null);
  const [forecast, setForecast] = useState<AdminInventoryForecast | null>(null);
  const [recipes, setRecipes] = useState<AdminRecipeData | null>(null);
  const [rules, setRules] = useState<AdminPackagingRuleData | null>(null);
  const [search, setSearch] = useState("");
  const [stockStatusFilter, setStockStatusFilter] = useState<StockStatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [itemEditorOpen, setItemEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AdminInventoryItem | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState>(EMPTY_ITEM_FORM);
  const [wastageForm, setWastageForm] = useState<WastageFormState>(EMPTY_WASTAGE_FORM);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(EMPTY_RULE_FORM);
  const [logEdit, setLogEdit] = useState<LogEditState | null>(null);
  const [recipeEdit, setRecipeEdit] = useState<RecipeEditState | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    try {
      setError("");
      const inventoryData = await fetchAdminInventory();
      setData(inventoryData);
      const [forecastResult, recipeResult, ruleResult] = await Promise.allSettled([
        fetchAdminInventoryForecast(),
        fetchAdminInventoryRecipes(),
        fetchAdminPackagingRules()
      ]);
      if (forecastResult.status === "fulfilled") setForecast(forecastResult.value);
      if (recipeResult.status === "fulfilled") setRecipes(recipeResult.value);
      if (ruleResult.status === "fulfilled") setRules(ruleResult.value);
      const first = inventoryData.items.find((item) => item.isActive)?.ingredientId ?? "";
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
    const statusFiltered = stockStatusFilter === "active"
      ? source.filter((item) => item.isActive)
      : stockStatusFilter === "inactive"
        ? source.filter((item) => !item.isActive)
        : source;
    if (!search.trim()) return statusFiltered;
    const value = search.toLowerCase();
    return statusFiltered.filter((item) => `${item.name} ${item.sku} ${item.type} ${item.isActive ? "active" : "inactive"} ${item.linkedProducts.map((product) => product.productName).join(" ")}`.toLowerCase().includes(value));
  }, [data, search, stockStatusFilter]);

  const activeItems = useMemo(() => (data?.items ?? []).filter((item) => item.isActive), [data]);

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
      const saved = editingItem
        ? await updateAdminInventoryItem(editingItem.ingredientId, payload)
        : await createAdminInventoryItem(payload);
      const ingredientId = editingItem?.ingredientId ?? saved.id;
      const purchaseUnits = itemForm.purchaseUnits
        .filter((unit) => unit.name.trim() && numberValue(unit.quantityInBaseUnits) > 0)
        .map((unit) => ({
          ...(unit.id ? { id: unit.id } : {}),
          name: unit.name.trim(),
          quantityInBaseUnits: numberValue(unit.quantityInBaseUnits),
          isActive: unit.isActive
        }));
      await saveAdminInventoryPurchaseUnits(ingredientId, purchaseUnits);
      setItemEditorOpen(false);
      await loadAll();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save item.");
    } finally {
      setSaving(false);
    }
  }

  async function submitWastage() {
    const branchId = data?.branches[0]?.id;
    if (!branchId || !wastageForm.ingredientId) return;
    if (!activeItems.some((item) => item.ingredientId === wastageForm.ingredientId)) {
      setError("Enable this inventory item before recording wastage.");
      return;
    }
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
        purchaseDate: logEdit.purchaseDate ? new Date(`${logEdit.purchaseDate}T12:00:00+05:00`).toISOString() : null,
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

  async function toggleItemStatus(item: AdminInventoryItem) {
    const nextActive = !item.isActive;
    const confirmed = nextActive
      ? true
      : window.confirm(`Disable ${item.name}? It will stay in stock history but disappear from new stock, recipe, wastage, rule, forecast, and POS setup selections.`);
    if (!confirmed) return;
    setSaving(true);
    setError("");
    try {
      await updateAdminInventoryItemStatus(item.ingredientId, nextActive);
      await loadAll();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Failed to update item status.");
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

  return (
    <div className="space-y-6">
      <ItemEditor open={itemEditorOpen} value={itemForm} editingItem={editingItem} saving={saving} onChange={setItemForm} onClose={() => setItemEditorOpen(false)} onSubmit={() => void saveItem()} />
      <SummaryCards data={data} forecast={forecast} onRefresh={() => void loadAll()} onAddItem={openCreateItem} />
      <TabNav activeTab={activeTab} onChange={setActiveTab} />
      {error ? (
        <Card className="border-red-200 bg-red-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-700">Action needed</p>
          <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm font-semibold text-red-700">{error}</pre>
        </Card>
      ) : null}
      <Card className="p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search inventory, type, status, or linked product" />
          <select value={stockStatusFilter} onChange={(event) => setStockStatusFilter(event.target.value as StockStatusFilter)} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
            <option value="all">All statuses</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </div>
      </Card>
      {activeTab === "stock" ? <StockTable items={items} loading={loading} onEdit={openEditItem} onPurchase={(item) => window.location.assign(`/admin/expenses?entry=stock&ingredientId=${encodeURIComponent(item.ingredientId)}`)} onWastage={(item) => { setWastageForm((current) => ({ ...current, ingredientId: item.ingredientId })); setActiveTab("wastage"); }} onToggleStatus={(item) => void toggleItemStatus(item)} onDelete={(item) => void deleteItem(item)} /> : null}
      {activeTab === "vendors" ? <VendorManagement /> : null}
      {activeTab === "prep" ? <PrepItemsSection data={recipes} ingredients={recipes?.ingredients ?? []} edit={recipeEdit} setEdit={setRecipeEdit} saving={saving} onSave={() => void saveRecipe()} /> : null}
      {activeTab === "rules" ? <RulesSection data={rules} form={ruleForm} setForm={setRuleForm} saving={saving} onSubmit={() => void saveRule()} onDelete={(ruleId) => void deleteRule(ruleId)} /> : null}
      {activeTab === "wastage" ? <WastageForm items={activeItems} form={wastageForm} setForm={setWastageForm} saving={saving} onSubmit={() => void submitWastage()} /> : null}
      {activeTab === "forecast" ? <ForecastSection forecast={forecast} loading={loading} /> : null}
      {activeTab === "recipes" ? <RecipesCostingSection data={recipes} ingredients={recipes?.ingredients ?? []} edit={recipeEdit} setEdit={setRecipeEdit} saving={saving} onSave={() => void saveRecipe()} /> : null}
      {activeTab === "logs" ? <LogsSection entries={data?.recentTransactions ?? []} edit={logEdit} setEdit={setLogEdit} saving={saving} onSave={() => void saveLogEdit()} /> : null}
    </div>
  );
}
