"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BellRing, CheckCircle2, ExternalLink, MapPin, MessageCircle, PackageCheck, Phone, RefreshCcw, Search, Volume2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { dispatchAdminDeliveryOrder, fetchAdminDeliveryLogs, fetchAdminDeliveryRiders, fetchAdminOrders, updateAdminDeliveryStatus } from "@/lib/admin-client";
import { getSelectedBranchId } from "@/lib/branch-selection";
import type { AdminOrder, DeliveryLog, DeliveryRider } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

const terminalStatuses = new Set(["DELIVERED", "CANCELLED"]);
const DELIVERY_POLL_MS = 4_000;
const DELIVERY_ALERTS_PREFERENCE_KEY = "pocket.delivery-alerts-enabled";

type AlarmNodes = {
  ringtone: AudioBufferSourceNode;
  output: GainNode;
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function createRingtoneBuffer(context: AudioContext) {
  const duration = 2;
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
  const samples = buffer.getChannelData(0);
  const notes = [
    { start: 0, duration: 0.18, frequency: 440 },
    { start: 0.28, duration: 0.18, frequency: 554.37 },
    { start: 0.58, duration: 0.3, frequency: 659.25 }
  ];

  for (const note of notes) {
    const startIndex = Math.floor(note.start * context.sampleRate);
    const endIndex = Math.min(samples.length, Math.ceil((note.start + note.duration) * context.sampleRate));
    for (let index = startIndex; index < endIndex; index += 1) {
      const elapsed = index / context.sampleRate - note.start;
      const attack = Math.min(1, elapsed / 0.018);
      const release = Math.min(1, (note.duration - elapsed) / 0.06);
      const envelope = attack * release * 0.22;
      const wave = Math.sin(2 * Math.PI * note.frequency * elapsed) + 0.12 * Math.sin(4 * Math.PI * note.frequency * elapsed);
      samples[index] = (samples[index] ?? 0) + wave * envelope;
    }
  }

  return buffer;
}

function formatOrderStatus(status: string) {
  return ({ PENDING: "New", CONFIRMED: "In progress", OUT_FOR_DELIVERY: "With rider", DELIVERED: "Delivered", CANCELLED: "Cancelled" } as Record<string, string>)[status] ?? status.replaceAll("_", " ");
}

function statusClass(status: string) {
  return status === "PENDING" ? "bg-amber-100 text-amber-800" : status === "CONFIRMED" ? "bg-blue-100 text-blue-800" : status === "OUT_FOR_DELIVERY" ? "bg-sky-100 text-sky-800" : status === "DELIVERED" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800";
}

function formatPlacedAt(value: string) {
  return new Intl.DateTimeFormat("en-PK", { timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function fullAddress(order: AdminOrder) {
  return [order.address?.addressLine1, order.address?.addressLine2, order.deliverySubsector ?? order.deliverySector, order.address?.city].filter(Boolean).join(", ");
}

function sourceLabel(order: AdminOrder) {
  return order.channel === "POS" ? `POS · ${order.cashierName ?? order.cashierUsername ?? "staff account"}` : "Website customer";
}

function staffTrail(order: AdminOrder) {
  return [
    `Placed: ${sourceLabel(order)}`,
    order.acceptedByName ? `Accepted: ${order.acceptedByName}` : null,
    order.dispatchedByName ? `Dispatched: ${order.dispatchedByName}` : null
  ].filter(Boolean).join(" · ");
}

export function DeliveryManagement() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState("");
  const [riderPickerOrderId, setRiderPickerOrderId] = useState("");
  const [selectedRiderId, setSelectedRiderId] = useState("");
  const [riders, setRiders] = useState<DeliveryRider[]>([]);
  const [logs, setLogs] = useState<DeliveryLog[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [view, setView] = useState<"ACTIVE" | "HISTORY" | "ALL">("ACTIVE");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [alertsPreferred, setAlertsPreferred] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const [installPromptAvailable, setInstallPromptAvailable] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const alarmNodesRef = useRef<AlarmNodes | null>(null);
  const soundEnabledRef = useRef(false);
  const knownPendingOrderIdsRef = useRef<Set<string> | null>(null);
  const installPromptRef = useRef<InstallPromptEvent | null>(null);

  const loadOrders = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    setError("");
    try {
      setOrders(await fetchAdminOrders({ segment: "delivery", preset: "custom", start: "2000-01-01T00:00:00.000Z", end: "2099-12-31T23:59:59.999Z" }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load delivery orders.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadRiders = useCallback(async () => {
    try {
      setRiders(await fetchAdminDeliveryRiders());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load delivery riders.");
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      setLogs(await fetchAdminDeliveryLogs());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load delivery logs.");
    } finally {
      setLogsLoading(false);
    }
  }, []);

  const stopAlarm = useCallback(() => {
    const alarm = alarmNodesRef.current;
    if (!alarm) return;
    alarm.ringtone.stop();
    alarm.ringtone.disconnect();
    alarm.output.disconnect();
    alarmNodesRef.current = null;
  }, []);

  const startAlarm = useCallback(() => {
    const context = audioContextRef.current;
    if (!context || context.state !== "running" || alarmNodesRef.current) return;

    const ringtone = context.createBufferSource();
    const output = context.createGain();
    ringtone.buffer = createRingtoneBuffer(context);
    ringtone.loop = true;
    output.gain.value = 0.45;
    ringtone.connect(output);
    output.connect(context.destination);
    ringtone.start();
    alarmNodesRef.current = { ringtone, output };
  }, []);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    void loadOrders();
    void loadRiders();
    const interval = window.setInterval(() => void loadOrders(), DELIVERY_POLL_MS);
    const refreshOnFocus = () => void loadOrders();
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [loadOrders, loadRiders]);

  useEffect(() => {
    const branchId = getSelectedBranchId();
    const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
    const events = new EventSource(`/api/admin/delivery-events${query}`, { withCredentials: true });

    const handleDeliveryOrderEvent = (event: Event) => {
      try {
        const deliveryEvent = JSON.parse((event as MessageEvent<string>).data) as { channel?: string; kind?: string };
        if (deliveryEvent.kind === "NEW" && deliveryEvent.channel === "ONLINE" && soundEnabledRef.current) {
          startAlarm();
        }
      } catch {
        // Refreshing is still useful if an older server sends an unexpected event payload.
      }
      void loadOrders();
    };

    events.addEventListener("delivery-order", handleDeliveryOrderEvent);
    return () => {
      events.removeEventListener("delivery-order", handleDeliveryOrderEvent);
      events.close();
    };
  }, [loadOrders, startAlarm]);

  useEffect(() => {
    const enabled = window.localStorage.getItem(DELIVERY_ALERTS_PREFERENCE_KEY) === "true";
    setAlertsPreferred(enabled);
    setNotificationPermission("Notification" in window ? Notification.permission : "unsupported");
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/pocket-delivery-worker.js").catch(() => {
      // The standard delivery-board alerts still work if a browser does not support PWA installation.
    });
  }, []);

  useEffect(() => {
    const captureInstallPrompt = (event: Event) => {
      event.preventDefault();
      installPromptRef.current = event as InstallPromptEvent;
      setInstallPromptAvailable(true);
    };
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
  }, []);

  const pendingCustomerOrders = useMemo(
    () => orders.filter((order) => order.channel === "ONLINE" && order.status === "PENDING"),
    [orders]
  );

  useEffect(() => {
    if (soundEnabled && pendingCustomerOrders.length) {
      startAlarm();
      return;
    }
    stopAlarm();
  }, [pendingCustomerOrders.length, soundEnabled, startAlarm, stopAlarm]);

  const showNewOrderNotification = useCallback((newOrders: AdminOrder[]) => {
    if (!newOrders.length || notificationPermission !== "granted" || !("Notification" in window)) return;
    const firstOrder = newOrders[0];
    if (!firstOrder) return;
    const countSuffix = newOrders.length > 1 ? ` and ${newOrders.length - 1} more` : "";
    new Notification(`New delivery order${countSuffix}`, {
      body: `${firstOrder.orderNumber} · ${firstOrder.customerName}`,
      icon: "/favicon.ico",
      tag: `pocket-delivery-${firstOrder.id}`,
      requireInteraction: true
    });
  }, [notificationPermission]);

  useEffect(() => {
    if (loading) return;
    const currentOrderIds = new Set(pendingCustomerOrders.map((order) => order.id));
    const knownOrderIds = knownPendingOrderIdsRef.current;
    if (!knownOrderIds) {
      knownPendingOrderIdsRef.current = currentOrderIds;
      return;
    }

    const newOrders = pendingCustomerOrders.filter((order) => !knownOrderIds.has(order.id));
    knownPendingOrderIdsRef.current = new Set([...knownOrderIds, ...currentOrderIds]);
    showNewOrderNotification(newOrders);
  }, [loading, pendingCustomerOrders, showNewOrderNotification]);

  useEffect(() => {
    return () => {
      stopAlarm();
      void audioContextRef.current?.close();
    };
  }, [stopAlarm]);

  async function activateSound(quietly = false) {
    try {
      const context = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = context;
      await context.resume();
      setSoundEnabled(context.state === "running");
      if (context.state !== "running" && !quietly) {
        setError("Chrome blocked the alarm. Click Enable sound once more.");
      }
    } catch {
      if (!quietly) setError("Chrome could not enable the delivery alarm.");
    }
  }

  async function enableDeliveryAlerts() {
    setError("");
    if ("Notification" in window && Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    } else if ("Notification" in window) {
      setNotificationPermission(Notification.permission);
    }
    window.localStorage.setItem(DELIVERY_ALERTS_PREFERENCE_KEY, "true");
    setAlertsPreferred(true);
    await activateSound();
  }

  async function installDeliveryApp() {
    const installPrompt = installPromptRef.current;
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setNotice("Pocket Delivery installed. Open the installed app for reliable no-click alerts.");
    }
    installPromptRef.current = null;
    setInstallPromptAvailable(false);
  }

  useEffect(() => {
    if (!alertsPreferred || soundEnabled) return;
    void activateSound(true);
    const unlockOnInteraction = () => void activateSound();
    document.addEventListener("pointerdown", unlockOnInteraction, { once: true });
    document.addEventListener("keydown", unlockOnInteraction, { once: true });
    return () => {
      document.removeEventListener("pointerdown", unlockOnInteraction);
      document.removeEventListener("keydown", unlockOnInteraction);
    };
  }, [activateSound, alertsPreferred, soundEnabled]);

  async function changeStatus(order: AdminOrder, status: "CONFIRMED" | "DELIVERED" | "CANCELLED") {
    if (status === "CANCELLED" && !window.confirm(`Cancel ${order.orderNumber}?`)) return;
    setBusyOrderId(order.id);
    setError("");
    setNotice("");
    try {
      await updateAdminDeliveryStatus(order.id, status);
      await loadOrders();
      if (logsOpen) await loadLogs();
      setNotice(status === "CONFIRMED" ? `${order.orderNumber} accepted and sent to the POS queue.` : `${order.orderNumber} updated.`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update the delivery order.");
    } finally {
      setBusyOrderId("");
    }
  }

  async function dispatch(order: AdminOrder) {
    const selectedRider = riders.find((rider) => rider.id === selectedRiderId && rider.isActive);
    if (!selectedRider) {
      setError("Select an active rider before dispatching.");
      return;
    }
    const whatsappWindow = window.open("", "_blank");
    setBusyOrderId(order.id);
    setError("");
    setNotice("");
    try {
      const result = await dispatchAdminDeliveryOrder(order.id, selectedRider.id);
      if (whatsappWindow) whatsappWindow.location.assign(result.whatsappUrl);
      else window.location.assign(result.whatsappUrl);
      await loadOrders();
      if (logsOpen) await loadLogs();
      setRiderPickerOrderId("");
      setNotice(`${order.orderNumber} dispatched to ${selectedRider.name}.`);
    } catch (actionError) {
      whatsappWindow?.close();
      setError(actionError instanceof Error ? actionError.message : "Unable to assign the rider.");
    } finally {
      setBusyOrderId("");
    }
  }

  const filteredOrders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesView = view === "ALL" || (view === "ACTIVE" ? !terminalStatuses.has(order.status) : terminalStatuses.has(order.status));
      const matchesStatus = statusFilter === "ALL" || order.status === statusFilter;
      const searchText = `${order.orderNumber} ${order.customerName} ${order.customerPhone ?? ""} ${order.deliverySector ?? ""} ${order.deliverySubsector ?? ""} ${sourceLabel(order)} ${order.acceptedByName ?? ""} ${order.dispatchedByName ?? ""}`.toLowerCase();
      return matchesView && matchesStatus && (!needle || searchText.includes(needle));
    });
  }, [orders, query, statusFilter, view]);

  function openRiderPicker(orderId: string) {
    setRiderPickerOrderId((current) => current === orderId ? "" : orderId);
    if (!selectedRiderId) setSelectedRiderId(riders.find((rider) => rider.isActive)?.id ?? "");
  }

  async function toggleLogs() {
    const nextOpen = !logsOpen;
    setLogsOpen(nextOpen);
    if (nextOpen) await loadLogs();
  }

  function deliveryLogLabel(action: string) {
    return ({
      "delivery.order_placed": "Order placed",
      "delivery.accepted": "Accepted",
      "delivery.whatsapp_opened": "WhatsApp dispatch opened",
      "delivery.delivered": "Delivered",
      "delivery.cancelled": "Cancelled"
    } as Record<string, string>)[action] ?? action.replace("delivery.", "").replaceAll("_", " ");
  }

  function renderOrder(order: AdminOrder) {
    const busy = busyOrderId === order.id;
    const canCancel = !terminalStatuses.has(order.status);
    const deliveryFee = Math.max(0, order.totalAmount - order.subtotal + order.discountAmount);
    return (
      <Card key={order.id} className="border-blue-200 bg-white/95 p-4 shadow-sm shadow-blue-950/5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-black text-pocket-navy">{order.orderNumber}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusClass(order.status)}`}>{formatOrderStatus(order.status)}</span></div><p className="mt-1 text-xs text-pocket-navy/60">{formatPlacedAt(order.placedAt)} · {sourceLabel(order)}</p></div>
          <div className="text-right"><p className="text-lg font-black text-pocket-orange">{formatCurrency(order.totalAmount)}</p><p className="text-xs text-pocket-navy/60">Items {formatCurrency(order.subtotal)} · Delivery {formatCurrency(deliveryFee)}</p></div>
        </div>
        <div className="mt-3 grid gap-2 border-t border-pocket-navy/10 pt-3 text-sm md:grid-cols-[1fr_1.35fr]"><div><p className="font-semibold text-pocket-navy">{order.customerName}</p>{order.customerPhone ? <a href={`tel:${order.customerPhone}`} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><Phone className="h-3.5 w-3.5" />{order.customerPhone}</a> : null}</div><p className="flex gap-2 leading-5 text-pocket-navy/70"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-pocket-orange" />{fullAddress(order) || "Address not available"}</p></div>
        <p className="mt-2 text-xs text-pocket-navy/60">{staffTrail(order)}</p>
        {order.riderName ? <p className="mt-1 text-xs font-semibold text-violet-700">Rider: {order.riderName}</p> : null}
        <details open className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-pocket-navy/75">
          <summary className="cursor-pointer font-semibold text-pocket-navy">Items & customer details ({order.items.length})</summary>
          <div className="mt-3 grid gap-3 border-t border-pocket-navy/10 pt-3 md:grid-cols-2">
            <div className="space-y-1"><p className="font-semibold text-pocket-navy">Customer entered</p><p>Name: {order.customerName}</p><p>WhatsApp: {order.customerPhone ?? "Not provided"}</p><p>City: {order.address?.city ?? "Islamabad"}</p><p>Sector: {order.deliverySubsector ?? order.deliverySector ?? "Not provided"}</p></div>
            <div className="space-y-1"><p className="font-semibold text-pocket-navy">Delivery address</p><p>{order.address?.addressLine1 ?? "Not provided"}</p>{order.address?.addressLine2 ? <p>{order.address.addressLine2}</p> : null}{order.address?.instructions ? <p>Location instructions: {order.address.instructions}</p> : null}{order.deliveryInstructions ? <p>Order instructions: {order.deliveryInstructions}</p> : null}</div>
          </div>
          <div className="mt-3 border-t border-pocket-navy/10 pt-3"><p className="font-semibold text-pocket-navy">Items</p><div className="mt-2 space-y-1.5">{order.items.map((item) => <div key={item.id} className="flex items-start justify-between gap-3"><div><p>{item.quantity}× {item.productName}</p>{item.customDescription ? <p className="text-pocket-navy/60">{item.customDescription}</p> : null}{item.addOns.length ? <p className="text-pocket-navy/60">{item.addOns.map((addOn) => addOn.optionName).join(", ")}</p> : null}</div><p className="shrink-0 font-semibold text-pocket-navy">{formatCurrency(item.unitPrice * item.quantity)}</p></div>)}</div></div>
        </details>
        <div className="mt-3 flex flex-wrap gap-2">
          {order.status === "PENDING" ? <Button type="button" size="sm" disabled={busy} onClick={() => void changeStatus(order, "CONFIRMED")}><PackageCheck className="h-4 w-4" />{busy ? "Accepting..." : "Accept"}</Button> : null}
          {order.status === "CONFIRMED" ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => openRiderPicker(order.id)}><MessageCircle className="h-4 w-4" />Assign rider</Button> : null}
          {order.status === "OUT_FOR_DELIVERY" ? <Button type="button" size="sm" disabled={busy} onClick={() => void changeStatus(order, "DELIVERED")}><CheckCircle2 className="h-4 w-4" />{busy ? "Completing..." : "Delivered"}</Button> : null}
          {canCancel ? <Button type="button" size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800" disabled={busy} onClick={() => void changeStatus(order, "CANCELLED")}><XCircle className="h-4 w-4" />Cancel</Button> : null}
        </div>
        {riderPickerOrderId === order.id ? <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2"><span className="text-xs font-semibold text-blue-900">Choose rider</span><select value={selectedRiderId} onChange={(event) => setSelectedRiderId(event.target.value)} className="h-9 min-w-44 rounded-md border border-blue-200 bg-white px-2 text-sm text-pocket-navy"><option value="">Select rider</option>{riders.filter((rider) => rider.isActive).map((rider) => <option key={rider.id} value={rider.id}>{rider.name} · {rider.phone}</option>)}</select><Button type="button" size="sm" className="bg-blue-700 hover:bg-blue-800" disabled={busy || !selectedRiderId} onClick={() => void dispatch(order)}>Open WhatsApp <ExternalLink className="h-4 w-4" /></Button>{!riders.some((rider) => rider.isActive) ? <span className="text-xs text-blue-800">Add an active rider in Users first.</span> : null}</div> : null}
      </Card>
    );
  }

  if (loading) return <Card className="border-blue-200 bg-blue-50 p-6 text-sm text-blue-900/70">Loading delivery orders...</Card>;

  return (
    <div className="space-y-4 rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 via-sky-50 to-indigo-50 p-3 md:p-4">
      <Card className="border-blue-200 bg-white/95 p-4 shadow-sm shadow-blue-950/5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-600">Direct delivery</p>
            <h2 className="mt-1 text-2xl font-black text-pocket-navy">Delivery board</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={view === "ACTIVE" ? "default" : "outline"} onClick={() => setView("ACTIVE")}>Active</Button>
            <Button type="button" size="sm" variant={view === "HISTORY" ? "default" : "outline"} onClick={() => setView("HISTORY")}>History</Button>
            <Button type="button" size="sm" variant={view === "ALL" ? "default" : "outline"} onClick={() => setView("ALL")}>All</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void toggleLogs()}>{logsOpen ? "Hide logs" : "Logs"}</Button>
            <Button type="button" size="sm" variant="outline" disabled={refreshing} onClick={() => void loadOrders(true)}><RefreshCcw className="h-4 w-4" />{refreshing ? "Refreshing" : "Refresh"}</Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
          <Button type="button" size="sm" variant={soundEnabled ? "outline" : "default"} onClick={() => void enableDeliveryAlerts()}><Volume2 className="h-4 w-4" />{soundEnabled ? "Delivery alerts enabled" : alertsPreferred ? "Enable delivery sound" : "Enable delivery alerts"}</Button>
          {installPromptAvailable ? <Button type="button" size="sm" variant="outline" onClick={() => void installDeliveryApp()}>Install delivery app</Button> : null}
          {notificationPermission === "denied" ? <span className="text-xs font-medium text-amber-700">Chrome notifications are blocked for this site.</span> : null}
          {pendingCustomerOrders.length ? <span className="inline-flex items-center gap-1 text-sm font-bold text-red-700"><BellRing className="h-4 w-4 animate-pulse" />Ringtone playing for {pendingCustomerOrders.length} new customer order{pendingCustomerOrders.length === 1 ? "" : "s"}</span> : <span className="text-xs font-medium text-pocket-navy/60">New customer orders trigger a repeating ringtone and Chrome notification while this Delivery tab remains open, including in the background.</span>}
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_170px]">
          <label className="flex h-10 items-center gap-2 rounded-md border border-pocket-navy/15 bg-white px-3"><Search className="h-4 w-4 text-pocket-navy/45" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Order, customer, sector, or staff" className="h-auto border-0 p-0 shadow-none focus-visible:ring-0" /></label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-md border border-pocket-navy/15 bg-white px-3 text-sm"><option value="ALL">All statuses</option><option value="PENDING">New</option><option value="CONFIRMED">In progress</option><option value="OUT_FOR_DELIVERY">With rider</option><option value="DELIVERED">Delivered</option><option value="CANCELLED">Cancelled</option></select>
        </div>
      </Card>

      {logsOpen ? <Card className="border-blue-200 bg-white/95 p-4 shadow-sm shadow-blue-950/5"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-600">Delivery activity</p><p className="mt-1 text-sm text-pocket-navy/60">Orders, staff actions, and WhatsApp dispatches.</p></div><Button type="button" size="sm" variant="outline" disabled={logsLoading} onClick={() => void loadLogs()}><RefreshCcw className="h-4 w-4" />{logsLoading ? "Loading" : "Refresh logs"}</Button></div><div className="mt-3 max-h-72 divide-y divide-blue-100 overflow-y-auto">{logs.length ? logs.map((log) => <div key={log.id} className="grid gap-1 py-2 text-sm md:grid-cols-[1fr_auto]"><div><p className="font-semibold text-pocket-navy">{deliveryLogLabel(log.action)} · {log.orderNumber}</p><p className="text-xs text-pocket-navy/60">{log.actorName}{log.riderName ? ` · Rider: ${log.riderName}` : ""}</p></div><p className="text-xs text-pocket-navy/55">{formatPlacedAt(log.createdAt)}</p></div>) : <p className="py-4 text-sm text-pocket-navy/60">{logsLoading ? "Loading delivery logs..." : "No delivery activity logged yet."}</p>}</div></Card> : null}

      {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
      {notice ? <p className="text-sm font-semibold text-emerald-700">{notice}</p> : null}
      <div className="flex items-center justify-between"><p className="text-sm font-bold text-pocket-navy">{filteredOrders.length} delivery order{filteredOrders.length === 1 ? "" : "s"}</p><p className="text-xs text-pocket-navy/55">Accept → dispatch → delivered</p></div>
      <div className="space-y-3">{filteredOrders.length ? filteredOrders.map(renderOrder) : <Card className="border-blue-300 bg-white/80 p-6 text-center text-sm text-blue-900/60">No delivery orders match these filters.</Card>}</div>
    </div>
  );
}
