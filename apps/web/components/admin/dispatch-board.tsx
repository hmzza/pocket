"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bike, CheckCircle2, MapPin, Phone, RefreshCcw, Send, Truck, XCircle } from "lucide-react";
import { AdminToast } from "@/components/admin/admin-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  assignAdminDelivery,
  fetchAdminDispatch,
  markAdminDeliveryMessageSent,
  reassignAdminDelivery,
  retryAdminDeliveryMessage,
  updateAdminDeliveryStatus
} from "@/lib/admin-client";
import type {
  AdminAssignableOrder,
  AdminDelivery,
  AdminDeliveryMessage,
  AdminDispatchData,
  AdminRider,
  DeliveryStatus
} from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

const deliveryStatusStyles: Record<string, string> = {
  ASSIGNED: "border-sky-200 bg-sky-50 text-sky-700",
  ACCEPTED: "border-sky-200 bg-sky-50 text-sky-700",
  PICKED_UP: "border-amber-200 bg-amber-50 text-amber-700",
  ON_THE_WAY: "border-orange-200 bg-orange-50 text-orange-700",
  DELIVERED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  FAILED: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-red-200 bg-red-50 text-red-700",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
  REASSIGNED: "border-pocket-navy/15 bg-pocket-cream text-pocket-navy/70"
};

const messageStatusStyles: Record<string, string> = {
  QUEUED: "border-pocket-navy/15 bg-white text-pocket-navy/60",
  MANUAL_PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  SENT: "border-emerald-200 bg-emerald-50 text-emerald-700",
  FAILED: "border-red-200 bg-red-50 text-red-700"
};

/** Deliveries move in minutes, so the board refreshes fairly briskly. */
const DISPATCH_POLL_MS = 15_000;

/** Next step offered for a delivery in each state. */
const nextSteps: Partial<Record<string, Array<{ status: DeliveryStatus; label: string }>>> = {
  ASSIGNED: [{ status: "PICKED_UP", label: "Picked up" }],
  ACCEPTED: [{ status: "PICKED_UP", label: "Picked up" }],
  PICKED_UP: [
    { status: "ON_THE_WAY", label: "On the way" },
    { status: "DELIVERED", label: "Delivered" }
  ],
  ON_THE_WAY: [{ status: "DELIVERED", label: "Delivered" }]
};

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatTime(value?: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-PK", {
    timeZone: "Asia/Karachi",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function MessageRow({
  message,
  onOpen,
  onRetry,
  busy
}: {
  message: AdminDeliveryMessage;
  onOpen: (message: AdminDeliveryMessage) => void;
  onRetry: (message: AdminDeliveryMessage) => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-pocket-navy/10 bg-white px-3 py-2">
      <span className="text-xs font-bold uppercase tracking-wide text-pocket-navy/60">
        {message.kind === "RIDER_ASSIGNED" ? "Assignment" : "Revocation"}
      </span>
      <span className={cn("rounded-full border px-2 py-0.5 text-xs font-bold", messageStatusStyles[message.status])}>
        {message.status === "MANUAL_PENDING" ? "Not sent yet" : formatLabel(message.status)}
      </span>
      <span className="text-xs text-pocket-navy/50">to {message.toPhone}</span>
      {message.attempts > 1 ? <span className="text-xs text-pocket-navy/40">{message.attempts} attempts</span> : null}
      {message.lastError ? (
        <span className="w-full break-words text-xs text-red-600" title={message.lastError}>
          {message.lastError}
        </span>
      ) : null}
      <div className="ml-auto flex gap-1">
        {message.requiresManualSend && message.deepLinkUrl ? (
          <Button type="button" size="sm" onClick={() => onOpen(message)} disabled={busy}>
            <Send className="h-4 w-4" />
            Open WhatsApp
          </Button>
        ) : null}
        {message.status === "FAILED" ? (
          <Button type="button" size="sm" variant="outline" onClick={() => onRetry(message)} disabled={busy}>
            <RefreshCcw className="h-4 w-4" />
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function DispatchBoard() {
  const [data, setData] = useState<AdminDispatchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [selectedRider, setSelectedRider] = useState<Record<string, string>>({});
  const [assignNote, setAssignNote] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState("");

  async function load() {
    try {
      setError("");
      setData(await fetchAdminDispatch());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load dispatch board.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Deliveries and new orders change from elsewhere, so refresh in the
  // background. Skipped while an action is in flight so a poll cannot land
  // mid-assignment, and skipped when the tab is not being looked at.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !busyId) void load();
    }, DISPATCH_POLL_MS);
    return () => window.clearInterval(timer);
  }, [busyId]);

  const availableRiders = useMemo(
    () => (data?.riders ?? []).filter((rider) => rider.isActive && rider.availability === "AVAILABLE"),
    [data?.riders]
  );

  const pendingMessageCount = useMemo(
    () => (data?.active ?? []).reduce((sum, delivery) => sum + delivery.messages.filter((m) => m.requiresManualSend).length, 0),
    [data?.active]
  );

  async function run(id: string, action: () => Promise<unknown>, successMessage: string) {
    setBusyId(id);
    setError("");
    try {
      await action();
      setNotice(successMessage);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed.");
    } finally {
      setBusyId("");
    }
  }

  function openWhatsApp(message: AdminDeliveryMessage) {
    if (!message.deepLinkUrl) return;
    window.open(message.deepLinkUrl, "_blank", "noopener,noreferrer");
    // Only the person who opened it can confirm it was actually sent, so we mark
    // it here rather than pretending the click alone delivered it.
    void run(message.id, () => markAdminDeliveryMessageSent(message.id), "Marked as sent.");
  }

  function assign(order: AdminAssignableOrder) {
    const riderId = selectedRider[order.id];
    if (!riderId) {
      setError(`Pick a rider for ${order.orderNumber} first.`);
      return;
    }
    void run(
      order.id,
      () => assignAdminDelivery({ orderId: order.id, riderId, note: assignNote[order.id]?.trim() || undefined }),
      `${order.orderNumber} assigned.`
    );
  }

  function reassign(delivery: AdminDelivery) {
    const riderId = selectedRider[delivery.id];
    if (!riderId) {
      setError(`Pick the new rider for ${delivery.orderNumber} first.`);
      return;
    }
    const reason = window.prompt(
      `Why is ${delivery.orderNumber} moving off ${delivery.rider?.name ?? "the current rider"}? ${
        delivery.rider?.name ?? "They"
      } will get a WhatsApp telling them not to deliver it.`
    );
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setError("A reassignment reason is required.");
      return;
    }
    void run(delivery.id, () => reassignAdminDelivery(delivery.id, { riderId, reason: reason.trim() }), `${delivery.orderNumber} reassigned.`);
  }

  function advance(delivery: AdminDelivery, status: DeliveryStatus, label: string) {
    void run(delivery.id, () => updateAdminDeliveryStatus(delivery.id, status), `${delivery.orderNumber}: ${label.toLowerCase()}.`);
  }

  function fail(delivery: AdminDelivery) {
    const reason = window.prompt(
      `Why did ${delivery.orderNumber} fail? For example "customer unreachable" or "wrong address". The order goes back to Ready so the shop can decide what to do with the food.`
    );
    if (reason === null) return;
    if (!reason.trim()) {
      setError("A failure reason is required.");
      return;
    }
    void run(
      delivery.id,
      () => updateAdminDeliveryStatus(delivery.id, "FAILED", { failureReason: reason.trim() }),
      `${delivery.orderNumber} marked as failed.`
    );
  }

  function RiderPicker({ id, exclude }: { id: string; exclude?: string | null }) {
    const options = availableRiders.filter((rider) => rider.id !== exclude);
    return (
      <select
        value={selectedRider[id] ?? ""}
        onChange={(event) => setSelectedRider((current) => ({ ...current, [id]: event.target.value }))}
        className="h-10 min-w-0 flex-1 rounded-md border border-pocket-navy/20 bg-white px-3 text-sm font-medium text-pocket-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pocket-orange/40"
      >
        <option value="">{options.length ? "Choose a rider..." : "No riders available"}</option>
        {options.map((rider: AdminRider) => (
          <option key={rider.id} value={rider.id}>
            {rider.name} · {rider.vehicleType.toLowerCase()}
            {rider.vehiclePlate ? ` · ${rider.vehiclePlate}` : ""}
          </option>
        ))}
      </select>
    );
  }

  if (loading) {
    return <Card className="p-6 text-sm text-pocket-navy/60">Loading dispatch board...</Card>;
  }

  return (
    <div className="space-y-6">
      {notice ? <AdminToast message={notice} variant="success" onClose={() => setNotice("")} /> : null}
      {error ? <AdminToast message={error} variant="error" onClose={() => setError("")} /> : null}

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-3 text-sm text-pocket-navy">
          <span className="font-semibold">Waiting for a rider:</span>
          <span className="rounded-full bg-white px-3 py-1 font-bold shadow-sm">{data?.assignable.length ?? 0}</span>
          <span className="font-semibold">Out now:</span>
          <span className="rounded-full bg-amber-50 px-3 py-1 font-bold text-amber-700 shadow-sm">{data?.active.length ?? 0}</span>
          <span className="font-semibold">Riders free:</span>
          <span className="rounded-full bg-emerald-50 px-3 py-1 font-bold text-emerald-700 shadow-sm">{availableRiders.length}</span>
          <Button type="button" variant="outline" className="ml-auto" onClick={() => void load()}>
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {data && !data.provider.automatic ? (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
            <p className="text-sm text-amber-900">
              <span className="font-bold">WhatsApp messages are not sent automatically.</span> Assigning a rider prepares the message; you
              still have to press <span className="font-semibold">Open WhatsApp</span> and send it.
              {pendingMessageCount > 0 ? (
                <span className="font-bold"> {pendingMessageCount} message(s) are waiting to be sent.</span>
              ) : null}
            </p>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-lg font-black text-pocket-navy">Waiting for a rider</h2>
          {!data?.assignable.length ? (
            <Card className="p-6 text-center text-sm text-pocket-navy/60">
              Nothing waiting. Accepted delivery orders show up here.
            </Card>
          ) : (
            data.assignable.map((order) => (
              <Card key={order.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-pocket-navy">{order.orderNumber}</p>
                    <p className="text-sm text-pocket-navy/60">
                      {order.customerName} · {order.customerPhoneDisplay}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-pocket-navy">{formatCurrency(order.totalAmount)}</p>
                    <p className="text-xs font-semibold uppercase tracking-wide text-pocket-navy/50">{formatLabel(order.status)}</p>
                  </div>
                </div>

                {order.address ? (
                  <p className="mt-2 flex items-start gap-2 text-sm text-pocket-navy/70">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-pocket-navy/40" />
                    <span>
                      {order.address.addressLine1}, {order.address.city}
                      {order.address.instructions ? ` (${order.address.instructions})` : ""}
                    </span>
                  </p>
                ) : null}

                {order.previousFailureReason ? (
                  <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                    Previous attempt failed: {order.previousFailureReason}
                  </p>
                ) : null}

                {order.canAssign ? (
                  <>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <RiderPicker id={order.id} />
                      <Button type="button" onClick={() => assign(order)} disabled={busyId === order.id || !availableRiders.length}>
                        <Bike className="h-4 w-4" />
                        Assign
                      </Button>
                    </div>
                    <Input
                      className="mt-2"
                      value={assignNote[order.id] ?? ""}
                      onChange={(event) => setAssignNote((current) => ({ ...current, [order.id]: event.target.value }))}
                      placeholder="Note for the rider (optional)"
                    />
                  </>
                ) : (
                  <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <span>
                      <span className="font-semibold">Cannot dispatch.</span> {order.blockedReason} Fix the order, then it can be assigned.
                    </span>
                  </p>
                )}
              </Card>
            ))
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-black text-pocket-navy">Out with a rider</h2>
          {!data?.active.length ? (
            <Card className="p-6 text-center text-sm text-pocket-navy/60">No deliveries in progress.</Card>
          ) : (
            data.active.map((delivery) => {
              const open = expanded === delivery.id;
              const steps = nextSteps[delivery.status] ?? [];
              return (
                <Card key={delivery.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-pocket-navy">{delivery.orderNumber}</p>
                      <p className="text-sm text-pocket-navy/60">
                        {delivery.order.customerName} · {delivery.order.customerPhoneDisplay}
                      </p>
                    </div>
                    <span className={cn("rounded-full border px-2.5 py-1 text-xs font-bold", deliveryStatusStyles[delivery.status])}>
                      {formatLabel(delivery.status)}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-pocket-navy/70">
                    <span className="flex items-center gap-1.5 font-semibold text-pocket-navy">
                      <Truck className="h-4 w-4 text-pocket-navy/40" />
                      {delivery.rider?.name ?? "Unassigned"}
                    </span>
                    {delivery.rider ? (
                      <span className="flex items-center gap-1.5">
                        <Phone className="h-4 w-4 text-pocket-navy/40" />
                        {delivery.rider.phoneDisplay}
                      </span>
                    ) : null}
                    {delivery.assignmentCount > 1 ? (
                      <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                        Attempt {delivery.assignmentCount}
                      </span>
                    ) : null}
                    {delivery.codAmount ? (
                      <span className="font-bold text-pocket-navy">Collect {formatCurrency(delivery.codAmount)}</span>
                    ) : null}
                  </div>

                  {delivery.order.address ? (
                    <p className="mt-2 flex items-start gap-2 text-sm text-pocket-navy/70">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-pocket-navy/40" />
                      <span>
                        {delivery.order.address.addressLine1}, {delivery.order.address.city}
                      </span>
                    </p>
                  ) : null}

                  {delivery.messages.length ? (
                    <div className="mt-3 space-y-2">
                      {delivery.messages
                        .filter((message) => message.requiresManualSend || message.status === "SENT")
                        // Hide an unsent assignment aimed at a rider who no longer holds
                        // this delivery. Sending it would tell a replaced rider to go
                        // anyway. Revocations always stay: those still need sending.
                        .filter(
                          (message) =>
                            message.kind === "RIDER_REVOKED" ||
                            message.status === "SENT" ||
                            !delivery.rider ||
                            message.toPhone === delivery.rider.phone
                        )
                        .slice(0, 3)
                        .map((message) => (
                          <MessageRow
                            key={message.id}
                            message={message}
                            busy={busyId === message.id}
                            onOpen={openWhatsApp}
                            onRetry={(m) => void run(m.id, () => retryAdminDeliveryMessage(m.id), "Retried.")}
                          />
                        ))}
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {steps.map((step) => (
                      <Button
                        key={step.status}
                        type="button"
                        size="sm"
                        onClick={() => advance(delivery, step.status, step.label)}
                        disabled={busyId === delivery.id}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {step.label}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
                      onClick={() => fail(delivery)}
                      disabled={busyId === delivery.id}
                    >
                      <XCircle className="h-4 w-4" />
                      Failed
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setExpanded(open ? "" : delivery.id)}>
                      {open ? "Hide" : "Reassign / history"}
                    </Button>
                  </div>

                  {open ? (
                    <div className="mt-3 space-y-3 rounded-lg bg-pocket-cream p-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60">Move to another rider</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <RiderPicker id={delivery.id} exclude={delivery.rider?.id} />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => reassign(delivery)}
                            disabled={busyId === delivery.id || !availableRiders.length}
                          >
                            Reassign
                          </Button>
                        </div>
                        <p className="mt-1 text-xs text-pocket-navy/50">
                          The current rider is sent a WhatsApp telling them not to deliver this order.
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60">History</p>
                        <ul className="mt-2 space-y-1.5">
                          {delivery.events.map((event) => (
                            <li key={event.id} className="text-sm text-pocket-navy/70">
                              <span className="font-semibold text-pocket-navy">{formatLabel(event.status)}</span>
                              {event.riderName ? ` · ${event.riderName}` : ""}
                              {formatTime(event.createdAt) ? ` · ${formatTime(event.createdAt)}` : ""}
                              {event.note ? <span className="block text-pocket-navy/50">{event.note}</span> : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}
                </Card>
              );
            })
          )}
        </div>
      </div>

      {data?.recent.length ? (
        <Card className="p-5">
          <h2 className="text-lg font-black text-pocket-navy">Recently finished</h2>
          <div className="mt-3 space-y-2">
            {data.recent.slice(0, 10).map((delivery) => (
              <div
                key={delivery.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-pocket-navy/10 pb-2 text-sm last:border-0 last:pb-0"
              >
                <span className="font-bold text-pocket-navy">{delivery.orderNumber}</span>
                <span className={cn("rounded-full border px-2 py-0.5 text-xs font-bold", deliveryStatusStyles[delivery.status])}>
                  {formatLabel(delivery.status)}
                </span>
                <span className="text-pocket-navy/60">{delivery.rider?.name ?? "Unassigned"}</span>
                {delivery.deliveredAt ? <span className="text-pocket-navy/40">{formatTime(delivery.deliveredAt)}</span> : null}
                {delivery.failureReason ? <span className="text-red-600">{delivery.failureReason}</span> : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
