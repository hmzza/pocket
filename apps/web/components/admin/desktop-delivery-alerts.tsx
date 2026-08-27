"use client";

import { useCallback, useEffect, useRef } from "react";
import { fetchAdminOrders } from "@/lib/admin-client";
import { getSelectedBranchId } from "@/lib/branch-selection";

const DELIVERY_POLL_MS = 4_000;

/**
 * Keeps the native desktop alarm alive for every Admin screen. The renderer
 * owns the authenticated EventSource connection; Electron's main process owns
 * the actual sound, so it continues while the window is in the background.
 */
export function DesktopDeliveryAlerts() {
  const isPlayingRef = useRef(false);

  const refreshAlarm = useCallback(async () => {
    const desktop = window.pocketDesktop;
    if (!desktop) return;

    try {
      const orders = await fetchAdminOrders({
        segment: "delivery",
        preset: "custom",
        start: "2000-01-01T00:00:00.000Z",
        end: "2099-12-31T23:59:59.999Z"
      });
      const hasNewOnlineOrder = orders.some((order) => order.channel === "ONLINE" && order.status === "PENDING");

      if (hasNewOnlineOrder === isPlayingRef.current) return;
      isPlayingRef.current = hasNewOnlineOrder;
      if (hasNewOnlineOrder) {
        await desktop.startDeliveryAlarm();
      } else {
        await desktop.stopDeliveryAlarm();
      }
    } catch {
      // A temporary request error must never silence an already-playing alarm.
    }
  }, []);

  useEffect(() => {
    if (!window.pocketDesktop) return;

    void refreshAlarm();
    const interval = window.setInterval(() => void refreshAlarm(), DELIVERY_POLL_MS);
    const branchId = getSelectedBranchId();
    const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
    const events = new EventSource(`/api/admin/delivery-events${query}`, { withCredentials: true });
    const onDeliveryOrder = () => void refreshAlarm();
    events.addEventListener("delivery-order", onDeliveryOrder);

    return () => {
      window.clearInterval(interval);
      events.removeEventListener("delivery-order", onDeliveryOrder);
      events.close();
      isPlayingRef.current = false;
      void window.pocketDesktop?.stopDeliveryAlarm();
    };
  }, [refreshAlarm]);

  return null;
}
