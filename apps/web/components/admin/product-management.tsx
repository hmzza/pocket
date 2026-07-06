"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Power, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createAdminProduct, deleteAdminProduct, fetchAdminProducts, updateAdminProduct } from "@/lib/admin-client";
import type { AdminProduct, Category } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

type ProductFormState = {
  categoryId: string;
  slug: string;
  sku: string;
  name: string;
  description: string;
  ingredients: string;
  basePrice: string;
  calories: string;
  featured: boolean;
  bestSeller: boolean;
  isActive: boolean;
  stockStatus: string;
  imageUrl: string;
  bundleComponents: Array<{
    componentProductId: string;
    quantity: string;
  }>;
};

const EMPTY_FORM: ProductFormState = {
  categoryId: "",
  slug: "",
  sku: "",
  name: "",
  description: "",
  ingredients: "",
  basePrice: "",
  calories: "",
  featured: false,
  bestSeller: false,
  isActive: true,
  stockStatus: "IN_STOCK",
  imageUrl: "/images/shawarma-pocket.svg",
  bundleComponents: []
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mapProductToForm(product: AdminProduct): ProductFormState {
  return {
    categoryId: product.categoryId,
    slug: product.slug,
    sku: product.sku,
    name: product.name,
    description: product.description,
    ingredients: product.ingredients.join(", "),
    basePrice: String(product.basePrice),
    calories: product.calories ? String(product.calories) : "",
    featured: product.featured,
    bestSeller: product.bestSeller,
    isActive: product.isActive,
    stockStatus: product.stockStatus,
    imageUrl: product.imageUrl,
    bundleComponents: product.bundleComponents.map((component) => ({
      componentProductId: component.productId,
      quantity: String(component.quantity)
    }))
  };
}

function ProductEditor({
  open,
  categories,
  products,
  value,
  editingName,
  editingProductId,
  saving,
  onChange,
  onClose,
  onSubmit
}: {
  open: boolean;
  categories: Category[];
  products: AdminProduct[];
  value: ProductFormState;
  editingName?: string;
  editingProductId?: string;
  saving: boolean;
  onChange: (next: ProductFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!open) return null;
  const bundleProductOptions = products.filter((product) => product.isActive && product.id !== editingProductId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-pocket-charcoal/40 px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg border border-pocket-navy/10 bg-white p-6 shadow-panel">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Product Editor</p>
            <h2 className="mt-2 text-3xl font-black text-pocket-navy">{editingName ? `Edit ${editingName}` : "Add product"}</h2>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-semibold text-pocket-navy">Name</label>
            <Input value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value, slug: value.slug || slugify(event.target.value) })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Slug <span className="text-pocket-navy/40">(optional)</span></label>
            <Input value={value.slug} onChange={(event) => onChange({ ...value, slug: slugify(event.target.value) })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">SKU <span className="text-pocket-navy/40">(optional)</span></label>
            <Input value={value.sku} onChange={(event) => onChange({ ...value, sku: event.target.value.toUpperCase() })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Category</label>
            <select
              value={value.categoryId}
              onChange={(event) => onChange({ ...value, categoryId: event.target.value })}
              className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 py-2 text-sm text-pocket-charcoal outline-none transition focus:border-pocket-orange focus:ring-2 focus:ring-pocket-orange/20"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Image URL <span className="text-pocket-navy/40">(optional)</span></label>
            <Input value={value.imageUrl} onChange={(event) => onChange({ ...value, imageUrl: event.target.value })} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-semibold text-pocket-navy">Description <span className="text-pocket-navy/40">(optional)</span></label>
            <Textarea value={value.description} onChange={(event) => onChange({ ...value, description: event.target.value })} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-semibold text-pocket-navy">Ingredients <span className="text-pocket-navy/40">(optional)</span></label>
            <Input value={value.ingredients} onChange={(event) => onChange({ ...value, ingredients: event.target.value })} placeholder="Chicken, Garlic sauce, Pickles" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Price</label>
            <Input type="number" min="0" value={value.basePrice} onChange={(event) => onChange({ ...value, basePrice: event.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Calories <span className="text-pocket-navy/40">(optional)</span></label>
            <Input type="number" min="0" value={value.calories} onChange={(event) => onChange({ ...value, calories: event.target.value })} />
          </div>
          <div className="space-y-3 md:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <label className="text-sm font-semibold text-pocket-navy">Bundle components <span className="text-pocket-navy/40">(optional)</span></label>
                <p className="text-xs text-pocket-navy/50">Add products here to make this item a meal, deal, or combo.</p>
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  onChange({
                    ...value,
                    bundleComponents: [...value.bundleComponents, { componentProductId: "", quantity: "1" }]
                  })
                }
              >
                <Plus className="h-4 w-4" />
                Add item
              </Button>
            </div>
            <div className="space-y-3">
              {value.bundleComponents.length ? (
                value.bundleComponents.map((component, index) => (
                  <div key={`${index}-${component.componentProductId}`} className="grid gap-3 md:grid-cols-[1fr_120px_auto]">
                    <select
                      value={component.componentProductId}
                      onChange={(event) =>
                        onChange({
                          ...value,
                          bundleComponents: value.bundleComponents.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, componentProductId: event.target.value } : entry
                          )
                        })
                      }
                      className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 py-2 text-sm text-pocket-charcoal outline-none transition focus:border-pocket-orange focus:ring-2 focus:ring-pocket-orange/20"
                    >
                      <option value="">Select product</option>
                      {bundleProductOptions.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={component.quantity}
                      onChange={(event) =>
                        onChange({
                          ...value,
                          bundleComponents: value.bundleComponents.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, quantity: event.target.value } : entry
                          )
                        })
                      }
                    />
                    <Button
                      variant="ghost"
                      onClick={() =>
                        onChange({
                          ...value,
                          bundleComponents: value.bundleComponents.filter((_, entryIndex) => entryIndex !== index)
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-dashed border-pocket-navy/15 px-4 py-3 text-sm text-pocket-navy/50">
                  Leave this empty for a normal product.
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Stock status <span className="text-pocket-navy/40">(optional)</span></label>
            <select
              value={value.stockStatus}
              onChange={(event) => onChange({ ...value, stockStatus: event.target.value })}
              className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 py-2 text-sm text-pocket-charcoal outline-none transition focus:border-pocket-orange focus:ring-2 focus:ring-pocket-orange/20"
            >
              <option value="IN_STOCK">In stock</option>
              <option value="LOW_STOCK">Low stock</option>
              <option value="OUT_OF_STOCK">Out of stock</option>
            </select>
          </div>
          <div className="grid gap-3">
            {[
              { key: "featured", label: "Featured" },
              { key: "bestSeller", label: "Best Seller" },
              { key: "isActive", label: "Active" }
            ].map((flag) => (
              <label key={flag.key} className="flex items-center gap-3 rounded-md border border-pocket-navy/10 px-4 py-3 text-sm font-medium text-pocket-navy">
                <input
                  type="checkbox"
                  checked={value[flag.key as keyof ProductFormState] as boolean}
                  onChange={(event) => onChange({ ...value, [flag.key]: event.target.checked })}
                />
                {flag.label}
              </label>
            ))}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? "Saving..." : editingName ? "Save Changes" : "Create Product"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ProductManagement() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [actionProductId, setActionProductId] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  async function loadProducts() {
    try {
      setError("");
      const data = await fetchAdminProducts();
      setProducts(data.products);
      setCategories(data.categories);
      setForm((current) => ({
        ...current,
        categoryId: current.categoryId || data.categories[0]?.id || ""
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load products.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function flashNotice(type: "success" | "error", message: string) {
    setNotice({ type, message });
    window.setTimeout(() => {
      setNotice((current) => (current?.message === message ? null : current));
    }, 3500);
  }

  useEffect(() => {
    void loadProducts();
  }, []);

  const activeProducts = useMemo(() => products.filter((product) => product.isActive).length, [products]);

  function openCreate() {
    setEditingProduct(null);
    setForm({
      ...EMPTY_FORM,
      categoryId: categories[0]?.id ?? ""
    });
    setEditorOpen(true);
  }

  function openEdit(product: AdminProduct) {
    setEditingProduct(product);
    setForm(mapProductToForm(product));
    setEditorOpen(true);
  }

  async function submitForm() {
    if (!form.categoryId || !form.name.trim() || !form.basePrice) {
      setError("Category, name, and price are required.");
      return;
    }

    const basePrice = Number(form.basePrice);
    if (Number.isNaN(basePrice)) {
      setError("Enter a valid price.");
      return;
    }

    const payload = {
      categoryId: form.categoryId,
      slug: form.slug.trim() || undefined,
      sku: form.sku.trim() || undefined,
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      ingredients: form.ingredients
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      basePrice,
      calories: form.calories ? Number(form.calories) : undefined,
      featured: form.featured,
      bestSeller: form.bestSeller,
      isActive: form.isActive,
      stockStatus: form.stockStatus,
      imageUrl: form.imageUrl.trim() || undefined,
      bundleComponents: form.bundleComponents
        .map((component, index) => ({
          componentProductId: component.componentProductId,
          quantity: Number(component.quantity),
          sortOrder: index
        }))
        .filter((component) => component.componentProductId && Number.isFinite(component.quantity) && component.quantity > 0)
    };

    setSaving(true);
    setError("");
    try {
      if (editingProduct) {
        await updateAdminProduct(editingProduct.id, payload);
        flashNotice("success", "Product updated.");
      } else {
        await createAdminProduct(payload);
        flashNotice("success", "Product added.");
      }
      setEditorOpen(false);
      await loadProducts();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save product.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(product: AdminProduct) {
    const confirmed = window.confirm(`Delete ${product.name}?`);
    if (!confirmed) return;

    setActionProductId(product.id);
    setError("");
    try {
      const result = await deleteAdminProduct(product.id);
      flashNotice("success", result.message);
      await loadProducts();
    } catch (disableError) {
      const message = disableError instanceof Error ? disableError.message : "Failed to delete product.";
      setError(message);
      flashNotice("error", message);
    } finally {
      setActionProductId("");
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Total</p>
          <p className="mt-3 text-3xl font-black text-pocket-navy">{products.length}</p>
          <p className="mt-2 text-sm text-pocket-navy/60">Products in catalog</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Active</p>
          <p className="mt-3 text-3xl font-black text-pocket-navy">{activeProducts}</p>
          <p className="mt-2 text-sm text-pocket-navy/60">Currently sellable items</p>
        </Card>
        <Card className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Actions</p>
            <p className="mt-3 text-sm text-pocket-navy/60">Create, edit, disable, and refresh the live menu.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => {
              setRefreshing(true);
              void loadProducts();
            }} disabled={refreshing}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add Product
            </Button>
          </div>
        </Card>
      </div>

      {notice ? (
        <div
          className={
            notice.type === "success"
              ? "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
              : "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
          }
        >
          {notice.message}
        </div>
      ) : null}

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1.6fr_1fr_0.8fr_0.8fr_0.9fr_1fr] gap-4 border-b border-pocket-navy/10 bg-pocket-cream px-5 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60">
          <span>Product</span>
          <span>Category</span>
          <span>Price</span>
          <span>Status</span>
          <span>Flags</span>
          <span>Actions</span>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-sm text-pocket-navy/60">Loading products...</div>
        ) : (
          products.map((product) => (
            <div key={product.id} className="grid grid-cols-[1.6fr_1fr_0.8fr_0.8fr_0.9fr_1fr] gap-4 border-b border-pocket-navy/10 px-5 py-4 text-sm last:border-0">
              <div>
                <p className="font-bold text-pocket-navy">{product.name}</p>
                <p className="text-pocket-navy/60">{product.description}</p>
                <p className="mt-2 text-xs font-medium uppercase tracking-wide text-pocket-navy/40">{product.sku}</p>
                {product.bundleComponents.length ? (
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-pocket-orange">
                    Bundle · {product.bundleComponents.length} component{product.bundleComponents.length === 1 ? "" : "s"}
                  </p>
                ) : null}
              </div>
              <span className="font-medium text-pocket-navy">{product.category.name}</span>
              <span className="font-bold text-pocket-orange">{formatCurrency(product.basePrice)}</span>
              <span className={product.isActive ? "font-semibold text-emerald-700" : "font-semibold text-red-600"}>{product.isActive ? "Active" : "Disabled"}</span>
              <span className="font-medium text-pocket-navy/70">
                {[product.featured ? "Featured" : null, product.bestSeller ? "Best Seller" : null, product.bundleComponents.length ? "Bundle" : null].filter(Boolean).join(", ") || "Base"}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(product)}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => void deleteProduct(product)}
                  disabled={actionProductId === product.id}
                >
                  <Power className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>
          ))
        )}
      </Card>

      <ProductEditor
        open={editorOpen}
        categories={categories}
        products={products}
        value={form}
        editingName={editingProduct?.name}
        editingProductId={editingProduct?.id}
        saving={saving}
        onChange={setForm}
        onClose={() => setEditorOpen(false)}
        onSubmit={() => void submitForm()}
      />
    </div>
  );
}
