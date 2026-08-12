"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, ChevronDown, Loader2, MapPin, Plus, X } from "lucide-react";
import { AdminToast } from "@/components/admin/admin-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createAdminBranch } from "@/lib/admin-client";
import { ensureSelectedBranchId, setSelectedBranchId } from "@/lib/branch-selection";
import type { Branch } from "@/lib/types";

type BranchSwitcherUser = {
  role: string;
  branches: Branch[];
  primaryBranchId: string | null;
  canSwitchBranches: boolean;
};

const emptyBranchForm = {
  name: "",
  city: "",
  addressLine1: "",
  phone: "",
  email: "",
  deliveryFee: "0"
};

export function BranchSwitcher({ user }: { user: BranchSwitcherUser }) {
  const [selectedBranchId, setSelectedBranchIdState] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyBranchForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSelectedBranchIdState(ensureSelectedBranchId(user.branches.map((branch) => branch.id), user.primaryBranchId));
  }, [user.branches, user.primaryBranchId]);

  const selectedBranch = useMemo(
    () => user.branches.find((branch) => branch.id === selectedBranchId) ?? user.branches[0] ?? null,
    [selectedBranchId, user.branches]
  );
  const canOpenMenu = user.role === "SUPER_ADMIN" || user.canSwitchBranches;

  function switchBranch(branchId: string) {
    if (!branchId || branchId === selectedBranchId) {
      setMenuOpen(false);
      return;
    }

    setSelectedBranchId(branchId);
    window.location.reload();
  }

  async function addBranch() {
    setSaving(true);
    setError("");
    try {
      if (!form.name.trim() || !form.city.trim() || !form.addressLine1.trim() || !form.phone.trim()) {
        throw new Error("Branch name, city, address, and phone are required.");
      }

      const branch = await createAdminBranch({
        name: form.name,
        city: form.city,
        addressLine1: form.addressLine1,
        phone: form.phone,
        email: form.email,
        deliveryFee: Number(form.deliveryFee || 0),
        isActive: true
      });
      setSelectedBranchId(branch.id);
      window.location.reload();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not add branch.");
    } finally {
      setSaving(false);
    }
  }

  if (!selectedBranch) {
    return null;
  }

  return (
    <div className="relative">
      {error ? <AdminToast message={error} variant="error" onClose={() => setError("")} /> : null}
      <button
        type="button"
        onClick={() => canOpenMenu && setMenuOpen((current) => !current)}
        className="flex h-11 items-center gap-2 rounded-md border border-pocket-navy/10 bg-white px-3 text-left text-sm font-semibold text-pocket-navy shadow-sm transition hover:border-pocket-orange/40 disabled:cursor-default"
        disabled={!canOpenMenu}
      >
        <MapPin className="h-4 w-4 text-pocket-orange" />
        <span className="max-w-[180px] truncate">{selectedBranch.name}</span>
        {canOpenMenu ? <ChevronDown className="h-4 w-4 text-pocket-navy/50" /> : null}
      </button>

      {menuOpen ? (
        <div className="absolute right-0 top-12 z-40 w-72 overflow-hidden rounded-lg border border-pocket-navy/10 bg-white shadow-panel">
          <div className="border-b border-pocket-navy/10 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-orange">Current branch</p>
          </div>
          <div className="max-h-72 overflow-auto py-2">
            {user.branches.map((branch) => (
              <button
                key={branch.id}
                type="button"
                onClick={() => switchBranch(branch.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm font-semibold text-pocket-navy hover:bg-pocket-cream"
              >
                <span className="truncate">{branch.name}</span>
                {branch.id === selectedBranchId ? <span className="text-xs text-pocket-orange">Selected</span> : null}
              </button>
            ))}
          </div>
          {user.role === "SUPER_ADMIN" ? (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setModalOpen(true);
              }}
              className="flex w-full items-center gap-2 border-t border-pocket-navy/10 px-4 py-3 text-sm font-black text-pocket-orange hover:bg-pocket-cream"
            >
              <Plus className="h-4 w-4" />
              Add Branch
            </button>
          ) : null}
        </div>
      ) : null}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-pocket-charcoal/40 px-4 py-8">
          <div className="w-full max-w-xl rounded-lg bg-white p-6 shadow-panel">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Branch</p>
                <h2 className="mt-1 text-2xl font-black text-pocket-navy">Add branch</h2>
              </div>
              <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
                <X className="h-4 w-4" />
                Close
              </Button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-semibold text-pocket-navy">
                Name
                <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="G-11 Markaz" />
              </label>
              <label className="space-y-1 text-sm font-semibold text-pocket-navy">
                City
                <Input value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} placeholder="Islamabad" />
              </label>
              <label className="space-y-1 text-sm font-semibold text-pocket-navy sm:col-span-2">
                Address
                <Input value={form.addressLine1} onChange={(event) => setForm((current) => ({ ...current, addressLine1: event.target.value }))} placeholder="Shop address" />
              </label>
              <label className="space-y-1 text-sm font-semibold text-pocket-navy">
                Phone
                <Input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="0300..." />
              </label>
              <label className="space-y-1 text-sm font-semibold text-pocket-navy">
                Email
                <Input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="Optional" />
              </label>
              <label className="space-y-1 text-sm font-semibold text-pocket-navy">
                Delivery fee
                <Input type="number" min="0" value={form.deliveryFee} onChange={(event) => setForm((current) => ({ ...current, deliveryFee: event.target.value }))} />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void addBranch()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                {saving ? "Adding..." : "Add Branch"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

