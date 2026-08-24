"use client";

import { useEffect, useMemo, useState } from "react";
import { Bike, PencilLine, Plus, RefreshCcw, Trash2, X } from "lucide-react";
import { AdminToast } from "@/components/admin/admin-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createAdminRider,
  deleteAdminRider,
  fetchAdminRiders,
  updateAdminRider,
  updateAdminRiderAvailability
} from "@/lib/admin-client";
import type { AdminRider, RiderVehicleType } from "@/lib/types";
import { cn } from "@/lib/utils";

type RiderFormState = {
  name: string;
  phone: string;
  altPhone: string;
  cnic: string;
  licenceNumber: string;
  vehicleType: RiderVehicleType;
  vehiclePlate: string;
  notes: string;
};

const emptyForm: RiderFormState = {
  name: "",
  phone: "",
  altPhone: "",
  cnic: "",
  licenceNumber: "",
  vehicleType: "MOTORCYCLE",
  vehiclePlate: "",
  notes: ""
};

const vehicleLabels: Record<RiderVehicleType, string> = {
  MOTORCYCLE: "Motorcycle",
  SCOOTER: "Scooter",
  BICYCLE: "Bicycle",
  CAR: "Car",
  RICKSHAW: "Rickshaw"
};

const availabilityStyles: Record<AdminRider["availability"], string> = {
  AVAILABLE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  ON_DELIVERY: "border-amber-200 bg-amber-50 text-amber-700",
  OFF_DUTY: "border-pocket-navy/15 bg-pocket-cream text-pocket-navy/70"
};

const availabilityLabels: Record<AdminRider["availability"], string> = {
  AVAILABLE: "Available",
  ON_DELIVERY: "On delivery",
  OFF_DUTY: "Off duty"
};

const riderGridColumns =
  "grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,0.9fr)] gap-4";

export function RiderManagement() {
  const [riders, setRiders] = useState<AdminRider[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<RiderVehicleType[]>(Object.keys(vehicleLabels) as RiderVehicleType[]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRider, setEditingRider] = useState<AdminRider | null>(null);
  const [form, setForm] = useState<RiderFormState>(emptyForm);
  const [busyRiderId, setBusyRiderId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function loadRiders() {
    try {
      setError("");
      const data = await fetchAdminRiders({ search: search.trim() || undefined, includeInactive });
      setRiders(data.riders);
      if (data.vehicleTypes?.length) setVehicleTypes(data.vehicleTypes);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load riders.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRiders();
  }, [search, includeInactive]);

  const counts = useMemo(
    () => ({
      total: riders.length,
      available: riders.filter((rider) => rider.isActive && rider.availability === "AVAILABLE").length,
      onDelivery: riders.filter((rider) => rider.availability === "ON_DELIVERY").length,
      offDuty: riders.filter((rider) => rider.isActive && rider.availability === "OFF_DUTY").length,
      inactive: riders.filter((rider) => !rider.isActive).length
    }),
    [riders]
  );

  function openCreate() {
    setEditingRider(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(rider: AdminRider) {
    setEditingRider(rider);
    setForm({
      name: rider.name,
      phone: rider.phoneDisplay || rider.phone,
      altPhone: rider.altPhone ?? "",
      cnic: rider.cnic ?? "",
      licenceNumber: rider.licenceNumber ?? "",
      vehicleType: rider.vehicleType,
      vehiclePlate: rider.vehiclePlate ?? "",
      notes: rider.notes ?? ""
    });
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingRider(null);
    setForm(emptyForm);
  }

  async function submitForm() {
    if (!form.name.trim() || !form.phone.trim()) {
      setError("Rider name and phone number are required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        altPhone: form.altPhone.trim(),
        cnic: form.cnic.trim(),
        licenceNumber: form.licenceNumber.trim(),
        vehicleType: form.vehicleType,
        vehiclePlate: form.vehiclePlate.trim(),
        notes: form.notes.trim()
      };

      if (editingRider) {
        await updateAdminRider(editingRider.id, payload);
        setNotice(`${payload.name} updated.`);
      } else {
        await createAdminRider(payload);
        setNotice(`${payload.name} added to the rider roster.`);
      }

      closeForm();
      await loadRiders();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save rider.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleDuty(rider: AdminRider) {
    setBusyRiderId(rider.id);
    setError("");
    try {
      const next = rider.availability === "OFF_DUTY" ? "AVAILABLE" : "OFF_DUTY";
      await updateAdminRiderAvailability(rider.id, next);
      setNotice(`${rider.name} is now ${availabilityLabels[next].toLowerCase()}.`);
      await loadRiders();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Failed to update availability.");
    } finally {
      setBusyRiderId("");
    }
  }

  async function reactivate(rider: AdminRider) {
    setBusyRiderId(rider.id);
    setError("");
    try {
      await updateAdminRider(rider.id, { isActive: true });
      setNotice(`${rider.name} reactivated.`);
      await loadRiders();
    } catch (reactivateError) {
      setError(reactivateError instanceof Error ? reactivateError.message : "Failed to reactivate rider.");
    } finally {
      setBusyRiderId("");
    }
  }

  async function removeRider(rider: AdminRider) {
    const willDeactivate = rider.totalDeliveryCount > 0;
    const confirmed = window.confirm(
      willDeactivate
        ? `${rider.name} has ${rider.totalDeliveryCount} delivery record(s), so they will be deactivated rather than deleted. Past orders keep their history. Continue?`
        : `Remove ${rider.name}? They have no delivery history, so this deletes the record permanently.`
    );
    if (!confirmed) return;

    setBusyRiderId(rider.id);
    setError("");
    try {
      const result = await deleteAdminRider(rider.id);
      setNotice(result.deactivated ? `${rider.name} deactivated.` : `${rider.name} removed.`);
      await loadRiders();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to remove rider.");
    } finally {
      setBusyRiderId("");
    }
  }

  return (
    <div className="space-y-6">
      {notice ? <AdminToast message={notice} variant="success" onClose={() => setNotice("")} /> : null}

      <Card className="p-5">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-md bg-pocket-cream/70 px-4 py-3 text-sm text-pocket-navy">
            <span className="font-semibold">Roster:</span>
            <span className="rounded-full bg-white px-3 py-1 font-bold shadow-sm">{counts.total} shown</span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 font-bold text-emerald-700 shadow-sm">
              {counts.available} available
            </span>
            <span className="rounded-full bg-amber-50 px-3 py-1 font-bold text-amber-700 shadow-sm">
              {counts.onDelivery} on delivery
            </span>
            <span className="rounded-full bg-white px-3 py-1 font-bold text-pocket-navy/70 shadow-sm">
              {counts.offDuty} off duty
            </span>
            {includeInactive ? (
              <span className="rounded-full bg-white px-3 py-1 font-bold text-pocket-navy/50 shadow-sm">
                {counts.inactive} inactive
              </span>
            ) : null}
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search rider name, phone, plate, or CNIC"
            />
            <Button
              type="button"
              variant={includeInactive ? "default" : "outline"}
              onClick={() => setIncludeInactive((current) => !current)}
            >
              {includeInactive ? "Hiding none" : "Show inactive"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void loadRiders()}>
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
            <Button type="button" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add Rider
            </Button>
          </div>
        </div>
      </Card>

      {error ? <AdminToast message={error} variant="error" onClose={() => setError("")} /> : null}

      {formOpen ? (
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-black text-pocket-navy">{editingRider ? `Edit ${editingRider.name}` : "Add a rider"}</p>
              <p className="mt-1 text-sm text-pocket-navy/60">
                The phone number is where delivery assignments are sent on WhatsApp, so it must be a Pakistani mobile.
              </p>
            </div>
            <Button type="button" variant="ghost" className="h-9 w-9 px-0" onClick={closeForm} aria-label="Close rider form">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60">Full name</span>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Bilal Ahmed" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60">WhatsApp number</span>
              <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="0300 1234567" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60">Alternate number</span>
              <Input value={form.altPhone} onChange={(event) => setForm({ ...form, altPhone: event.target.value })} placeholder="Optional" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60">CNIC</span>
              <Input value={form.cnic} onChange={(event) => setForm({ ...form, cnic: event.target.value })} placeholder="61101-1234567-1" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60">Vehicle</span>
              <select
                value={form.vehicleType}
                onChange={(event) => setForm({ ...form, vehicleType: event.target.value as RiderVehicleType })}
                className="h-10 w-full rounded-md border border-pocket-navy/20 bg-white px-3 text-sm font-medium text-pocket-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pocket-orange/40"
              >
                {vehicleTypes.map((type) => (
                  <option key={type} value={type}>
                    {vehicleLabels[type] ?? type}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60">Number plate</span>
              <Input value={form.vehiclePlate} onChange={(event) => setForm({ ...form, vehiclePlate: event.target.value })} placeholder="ISB-1234" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60">Licence number</span>
              <Input value={form.licenceNumber} onChange={(event) => setForm({ ...form, licenceNumber: event.target.value })} placeholder="Optional" />
            </label>
            <label className="space-y-1.5 md:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60">Notes</span>
              <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Shift timings, areas covered, anything dispatch should know" />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="button" onClick={() => void submitForm()} disabled={saving}>
              {saving ? "Saving..." : editingRider ? "Save changes" : "Add rider"}
            </Button>
            <Button type="button" variant="outline" onClick={closeForm} disabled={saving}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div
          className={`${riderGridColumns} border-b border-pocket-navy/10 bg-pocket-cream px-5 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60`}
        >
          <span className="min-w-0">Rider</span>
          <span className="min-w-0">Vehicle</span>
          <span className="min-w-0">Status</span>
          <span className="min-w-0">Deliveries</span>
          <span className="min-w-0 text-right">Actions</span>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-sm text-pocket-navy/60">Loading riders...</div>
        ) : riders.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Bike className="mx-auto h-8 w-8 text-pocket-navy/25" />
            <p className="mt-3 text-sm font-semibold text-pocket-navy">No riders yet.</p>
            <p className="mt-1 text-sm text-pocket-navy/60">
              Add your delivery riders here so orders can be assigned to them from Dispatch.
            </p>
          </div>
        ) : (
          riders.map((rider) => (
            <div key={rider.id} className={`${riderGridColumns} border-b border-pocket-navy/10 px-5 py-4 text-sm last:border-0`}>
              <div className="min-w-0">
                <p className={cn("font-bold text-pocket-navy", !rider.isActive && "text-pocket-navy/40 line-through")}>{rider.name}</p>
                <p className="text-pocket-navy/60">{rider.phoneDisplay}</p>
                {rider.cnic ? <p className="text-xs text-pocket-navy/40">CNIC {rider.cnic}</p> : null}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-pocket-navy">{vehicleLabels[rider.vehicleType] ?? rider.vehicleType}</p>
                {rider.vehiclePlate ? <p className="text-pocket-navy/60">{rider.vehiclePlate}</p> : null}
              </div>
              <div className="min-w-0">
                <span
                  className={cn(
                    "inline-flex rounded-full border px-2.5 py-1 text-xs font-bold",
                    rider.isActive ? availabilityStyles[rider.availability] : "border-pocket-navy/15 bg-white text-pocket-navy/40"
                  )}
                >
                  {rider.isActive ? availabilityLabels[rider.availability] : "Inactive"}
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-pocket-navy">{rider.totalDeliveryCount}</p>
                <p className="text-xs text-pocket-navy/50">lifetime</p>
              </div>
              <div className="flex min-w-0 flex-wrap items-start justify-end gap-1">
                {rider.isActive ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void toggleDuty(rider)}
                    disabled={busyRiderId === rider.id || rider.availability === "ON_DELIVERY"}
                    title={
                      rider.availability === "ON_DELIVERY"
                        ? "Set automatically while a delivery is assigned"
                        : rider.availability === "OFF_DUTY"
                          ? "Put back on duty"
                          : "Take off duty"
                    }
                  >
                    {rider.availability === "OFF_DUTY" ? "On duty" : "Off duty"}
                  </Button>
                ) : (
                  <Button type="button" size="sm" variant="outline" onClick={() => void reactivate(rider)} disabled={busyRiderId === rider.id}>
                    Reactivate
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-9 w-9 px-0"
                  onClick={() => openEdit(rider)}
                  aria-label={`Edit ${rider.name}`}
                  title="Edit rider"
                >
                  <PencilLine className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
                  onClick={() => void removeRider(rider)}
                  disabled={busyRiderId === rider.id}
                  aria-label={`Remove ${rider.name}`}
                  title={rider.totalDeliveryCount > 0 ? "Deactivate rider (has delivery history)" : "Delete rider"}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
