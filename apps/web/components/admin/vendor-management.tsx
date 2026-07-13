"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, RefreshCcw, Search, Trash2 } from "lucide-react";
import { AdminToast } from "@/components/admin/admin-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createAdminVendor,
  deleteAdminVendor,
  fetchAdminVendors,
  updateAdminVendor
} from "@/lib/admin-client";
import type { AdminVendor } from "@/lib/types";

type VendorFormState = {
  ingredientCategory: string;
  vendorName: string;
  contactNumber: string;
  type: string;
  quotedPrice: string;
  notes: string;
};

const EMPTY_FORM: VendorFormState = {
  ingredientCategory: "",
  vendorName: "",
  contactNumber: "",
  type: "Vendor",
  quotedPrice: "",
  notes: ""
};

function mapVendorToForm(vendor: AdminVendor): VendorFormState {
  return {
    ingredientCategory: vendor.ingredientCategory,
    vendorName: vendor.vendorName,
    contactNumber: vendor.contactNumber ?? "",
    type: vendor.type ?? "Vendor",
    quotedPrice: vendor.quotedPrice ?? "",
    notes: vendor.notes ?? ""
  };
}

function VendorEditor({
  open,
  categories,
  value,
  editingVendor,
  saving,
  onChange,
  onClose,
  onSubmit
}: {
  open: boolean;
  categories: string[];
  value: VendorFormState;
  editingVendor: AdminVendor | null;
  saving: boolean;
  onChange: (next: VendorFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-pocket-charcoal/40 px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg border border-pocket-navy/10 bg-white p-6 shadow-panel">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Vendor Portal</p>
            <h2 className="mt-2 text-3xl font-black text-pocket-navy">{editingVendor ? "Edit vendor" : "Add vendor"}</h2>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Ingredient / Category</label>
            <select
              value={value.ingredientCategory}
              onChange={(event) => onChange({ ...value, ingredientCategory: event.target.value })}
              className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 py-2 text-sm text-pocket-charcoal outline-none transition focus:border-pocket-orange focus:ring-2 focus:ring-pocket-orange/20"
            >
              <option value="">Select category</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Vendor name</label>
            <Input value={value.vendorName} onChange={(event) => onChange({ ...value, vendorName: event.target.value })} placeholder="Mehrban" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Contact number</label>
            <Input value={value.contactNumber} onChange={(event) => onChange({ ...value, contactNumber: event.target.value })} placeholder="0300 1234567" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Type</label>
            <Input value={value.type} onChange={(event) => onChange({ ...value, type: event.target.value })} placeholder="Vendor" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-pocket-navy">Quoted price</label>
            <Input value={value.quotedPrice} onChange={(event) => onChange({ ...value, quotedPrice: event.target.value })} placeholder="660/kg - boneless" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-semibold text-pocket-navy">Notes</label>
            <Textarea value={value.notes} onChange={(event) => onChange({ ...value, notes: event.target.value })} placeholder="Delivery notes, rates, and reminders." />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? "Saving..." : editingVendor ? "Save Changes" : "Add Vendor"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function VendorManagement() {
  const [vendors, setVendors] = useState<AdminVendor[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<AdminVendor | null>(null);
  const [form, setForm] = useState<VendorFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  async function loadVendors() {
    try {
      setError("");
      const data = await fetchAdminVendors();
      setVendors(data.vendors);
      setCategories(data.categories);
      setForm((current) => ({
        ...current,
        ingredientCategory: current.ingredientCategory || data.categories[0] || ""
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load vendors.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadVendors();
  }, []);

  const filteredVendors = useMemo(() => {
    return vendors.filter((vendor) => {
      const matchesCategory = !categoryFilter || vendor.ingredientCategory === categoryFilter;
      const matchesSearch =
        !search ||
        `${vendor.ingredientCategory} ${vendor.vendorName} ${vendor.contactNumber ?? ""} ${vendor.type ?? ""} ${vendor.notes ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [categoryFilter, search, vendors]);

  function flashNotice(type: "success" | "error", message: string) {
    setNotice({ type, message });
    window.setTimeout(() => {
      setNotice((current) => (current?.message === message ? null : current));
    }, 3500);
  }

  function openCreate() {
    setEditingVendor(null);
    setForm({
      ...EMPTY_FORM,
      ingredientCategory: categories[0] ?? ""
    });
    setEditorOpen(true);
  }

  function openEdit(vendor: AdminVendor) {
    setEditingVendor(vendor);
    setForm(mapVendorToForm(vendor));
    setEditorOpen(true);
  }

  async function submitVendor() {
    if (!form.ingredientCategory.trim() || !form.vendorName.trim()) {
      setError("Category and vendor name are required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        ingredientCategory: form.ingredientCategory.trim(),
        vendorName: form.vendorName.trim(),
        contactNumber: form.contactNumber.trim() || undefined,
        type: form.type.trim() || "Vendor",
        quotedPrice: form.quotedPrice.trim() || undefined,
        notes: form.notes.trim() || undefined
      };

      if (editingVendor) {
        await updateAdminVendor(editingVendor.id, payload);
        flashNotice("success", "Vendor updated.");
      } else {
        await createAdminVendor(payload);
        flashNotice("success", "Vendor added.");
      }

      setEditorOpen(false);
      await loadVendors();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save vendor.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteVendor(vendor: AdminVendor) {
    const confirmed = window.confirm(`Delete ${vendor.vendorName}?`);
    if (!confirmed) return;

    setDeletingId(vendor.id);
    setError("");
    try {
      await deleteAdminVendor(vendor.id);
      flashNotice("success", "Vendor deleted.");
      await loadVendors();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete vendor.");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div className="space-y-6">
      {notice ? (
        <AdminToast
          message={notice.message}
          variant={notice.type}
          onClose={() => setNotice(null)}
          className={notice.type === "success" ? "top-4" : "top-20"}
        />
      ) : null}
      {error ? <AdminToast message={error} variant="error" onClose={() => setError("")} className={notice ? "top-36" : "top-4"} /> : null}

      <VendorEditor
        open={editorOpen}
        categories={categories}
        value={form}
        editingVendor={editingVendor}
        saving={saving}
        onChange={setForm}
        onClose={() => setEditorOpen(false)}
        onSubmit={() => void submitVendor()}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Total vendors</p>
          <p className="mt-3 text-3xl font-black text-pocket-navy">{vendors.length}</p>
          <p className="mt-2 text-sm text-pocket-navy/60">Workbook-backed entries stored locally.</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Categories</p>
          <p className="mt-3 text-3xl font-black text-pocket-navy">{categories.length}</p>
          <p className="mt-2 text-sm text-pocket-navy/60">Ingredient and supplier groups in use.</p>
        </Card>
        <Card className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Actions</p>
            <p className="mt-3 text-sm text-pocket-navy/60">Create, edit, remove, or refresh vendor records.</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setRefreshing(true);
                void loadVendors();
              }}
              disabled={refreshing}
            >
              <RefreshCcw className="h-4 w-4" />
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add Vendor
            </Button>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="grid gap-3 md:grid-cols-[220px_220px_1fr]">
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 py-2 text-sm text-pocket-charcoal outline-none transition focus:border-pocket-orange focus:ring-2 focus:ring-pocket-orange/20"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pocket-navy/40" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search vendor, category, contact, or notes" className="pl-9" />
          </div>
          <div className="rounded-md border border-dashed border-pocket-navy/10 px-4 py-3 text-sm text-pocket-navy/60">
            Vendors are stored in <span className="font-semibold text-pocket-navy">data/vendors.xlsx</span>.
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_1fr_0.8fr_1fr_0.8fr] gap-4 border-b border-pocket-navy/10 bg-pocket-cream px-5 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60">
          <span>Category</span>
          <span>Vendor</span>
          <span>Contact</span>
          <span>Type</span>
          <span>Quoted Price</span>
          <span>Actions</span>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-sm text-pocket-navy/60">Loading vendors...</div>
        ) : filteredVendors.length ? (
          filteredVendors.map((vendor) => (
            <div key={vendor.id} className="grid grid-cols-[1fr_1fr_1fr_0.8fr_1fr_0.8fr] gap-4 border-b border-pocket-navy/10 px-5 py-4 text-sm last:border-0">
              <div className="font-semibold text-pocket-navy">{vendor.ingredientCategory}</div>
              <div className="font-bold text-pocket-navy">{vendor.vendorName}</div>
              <div className="text-pocket-navy/70">{vendor.contactNumber || "—"}</div>
              <div className="text-pocket-navy/70">{vendor.type || "Vendor"}</div>
              <div className="text-pocket-orange">{vendor.quotedPrice || "—"}</div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(vendor)}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => void deleteVendor(vendor)}
                  disabled={deletingId === vendor.id}
                >
                  <Trash2 className="h-4 w-4" />
                  {deletingId === vendor.id ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="px-5 py-8 text-sm text-pocket-navy/60">No vendors match the current filters.</div>
        )}
      </Card>
    </div>
  );
}
