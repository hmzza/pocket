"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/catalog";

export function useDeliveryAvailability(initialValue = true) {
  const [deliveryEnabled, setDeliveryEnabled] = useState(initialValue);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const response = await fetch(`${API_URL}/api/storefront/status`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { deliveryEnabled?: boolean };
        if (!cancelled) setDeliveryEnabled(data.deliveryEnabled !== false);
      } catch {
        // Keep the last known state so a transient request failure does not block the storefront.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadStatus();
    const timer = window.setInterval(() => void loadStatus(), 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return { deliveryEnabled, loading };
}
