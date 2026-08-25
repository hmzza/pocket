"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fetchDeliveryPushConfiguration,
  fetchPendingCustomerDeliveryAlerts,
  saveDeliveryPushSubscription,
  type PendingCustomerDeliveryAlert
} from "@/lib/admin-client";

const ALERT_POLL_MS = 8_000;

function toApplicationServerKey(publicKey: string) {
  const normalized = `${publicKey}${"=".repeat((4 - (publicKey.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = window.atob(normalized);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function formatPendingSummary(orders: PendingCustomerDeliveryAlert[]) {
  if (orders.length === 1) {
    const order = orders[0]!;
    return `${order.orderNumber} from ${order.customerName ?? "a customer"}`;
  }
  return `${orders.length} customer delivery orders need acceptance`;
}

export function PendingDeliveryAlert() {
  const [orders, setOrders] = useState<PendingCustomerDeliveryAlert[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const [error, setError] = useState("");
  const audioContextRef = useRef<AudioContext | null>(null);
  const seenOrderIdsRef = useRef(new Set<string>());
  const browserNotificationsRef = useRef(new Map<string, Notification>());

  const refreshAlerts = useCallback(async () => {
    try {
      const nextOrders = await fetchPendingCustomerDeliveryAlerts();
      setOrders(nextOrders);
      setError("");
    } catch {
      setError("Delivery alert connection interrupted. Reload this page if it does not recover.");
    }
  }, []);

  useEffect(() => {
    void refreshAlerts();
    const interval = window.setInterval(() => void refreshAlerts(), ALERT_POLL_MS);
    const refreshOnFocus = () => void refreshAlerts();
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [refreshAlerts]);

  useEffect(() => {
    setNotificationPermission("Notification" in window ? Notification.permission : "unsupported");
  }, []);

  const playAlarm = useCallback(() => {
    const context = audioContextRef.current;
    if (!context || context.state !== "running") return;

    const start = context.currentTime;
    [0, 0.26].forEach((offset, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(index === 0 ? 1046.5 : 783.99, start + offset);
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.24, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.2);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.22);
    });
  }, []);

  useEffect(() => {
    if (!audioEnabled || !orders.length) return;
    playAlarm();
    const interval = window.setInterval(playAlarm, 1_500);
    return () => window.clearInterval(interval);
  }, [audioEnabled, orders.length, playAlarm]);

  useEffect(() => {
    if (!("Notification" in window)) return;

    const pendingIds = new Set(orders.map((order) => order.id));
    for (const [orderId, notification] of browserNotificationsRef.current) {
      if (!pendingIds.has(orderId)) {
        notification.close();
        browserNotificationsRef.current.delete(orderId);
      }
    }

    if (notificationPermission !== "granted") return;
    for (const order of orders) {
      if (seenOrderIdsRef.current.has(order.id)) continue;
      seenOrderIdsRef.current.add(order.id);
      const notification = new Notification("New Pocket delivery order", {
        body: `${order.orderNumber} from ${order.customerName ?? "a customer"} needs acceptance.`,
        tag: `pocket-delivery-${order.id}`,
        requireInteraction: true,
        icon: "/icon.png"
      });
      notification.onclick = () => {
        window.focus();
        window.location.assign("/admin/delivery");
      };
      browserNotificationsRef.current.set(order.id, notification);
    }
  }, [notificationPermission, orders]);

  useEffect(() => {
    return () => {
      for (const notification of browserNotificationsRef.current.values()) notification.close();
      audioContextRef.current?.close().catch(() => null);
    };
  }, []);

  async function enableAlerts() {
    setError("");
    try {
      const AudioContextConstructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) {
        throw new Error("This browser cannot play delivery alarms.");
      }

      const audioContext = audioContextRef.current ?? new AudioContextConstructor();
      audioContextRef.current = audioContext;
      await audioContext.resume();
      setAudioEnabled(audioContext.state === "running");

      if ("Notification" in window && Notification.permission === "default") {
        setNotificationPermission(await Notification.requestPermission());
      } else if ("Notification" in window) {
        setNotificationPermission(Notification.permission);
      }

      const configuration = await fetchDeliveryPushConfiguration();
      if (!configuration.enabled || !configuration.publicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        return;
      }

      const registration = await navigator.serviceWorker.register("/delivery-alert-worker.js", { scope: "/" });
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription = existingSubscription ?? (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toApplicationServerKey(configuration.publicKey)
      }));
      const payload = subscription.toJSON();
      if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys.auth) {
        throw new Error("This browser did not return a valid push subscription.");
      }

      await saveDeliveryPushSubscription({
        endpoint: payload.endpoint,
        keys: {
          p256dh: payload.keys.p256dh,
          auth: payload.keys.auth
        }
      });
      setPushEnabled(true);
    } catch (enableError) {
      setError(enableError instanceof Error ? enableError.message : "Could not enable delivery alerts in this browser.");
    }
  }

  const hasPendingOrders = orders.length > 0;

  return (
    <div className={hasPendingOrders ? "rounded-lg border-2 border-red-500 bg-red-50 p-3 shadow-panel" : "rounded-lg border border-pocket-navy/10 bg-white px-3 py-2 shadow-sm"} role={hasPendingOrders ? "alert" : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {hasPendingOrders ? <BellRing className="h-5 w-5 shrink-0 animate-pulse text-red-600" /> : audioEnabled ? <Volume2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <VolumeX className="h-4 w-4 shrink-0 text-pocket-navy/45" />}
          <p className={hasPendingOrders ? "text-sm font-black text-red-800" : "text-xs font-semibold text-pocket-navy/70"}>
            {hasPendingOrders ? `Delivery alarm: ${formatPendingSummary(orders)}` : audioEnabled ? "Delivery sound alerts are armed for this browser." : "Enable delivery sound alerts on this device."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasPendingOrders ? <Link href="/admin/delivery" className="text-sm font-bold text-red-800 underline underline-offset-2">Open delivery board</Link> : null}
          <Button type="button" size="sm" variant={audioEnabled ? "outline" : "default"} onClick={() => void enableAlerts()}>
            <Volume2 className="h-4 w-4" />
            {audioEnabled ? (pushEnabled ? "Sound + push enabled" : "Sound enabled") : "Enable alerts"}
          </Button>
        </div>
      </div>
      {hasPendingOrders ? <p className="mt-1 text-xs font-medium text-red-700">The alarm repeats until every new customer delivery order is accepted or cancelled.</p> : null}
      {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
