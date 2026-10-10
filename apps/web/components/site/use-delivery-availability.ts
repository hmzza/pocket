"use client";

import { useCallback, useEffect, useState } from "react";
import { API_URL } from "@/lib/catalog";
import type { DeliveryConfig, DeliverySector } from "@/lib/types";

export function useDeliveryAvailability(branchSlug?: string, initialValue = true) {
  const [deliveryEnabled, setDeliveryEnabled] = useState(initialValue);
  const [message, setMessage] = useState<string | null>(null);
  const [sectors, setSectors] = useState<DeliverySector[]>([]);
  const [shopEnabled, setShopEnabled] = useState(true);
  const [pickupEnabled, setPickupEnabled] = useState(true);
  const [snapshot, setSnapshot] = useState<Partial<DeliveryConfig>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const query = branchSlug ? `?branchSlug=${encodeURIComponent(branchSlug)}` : "";
      const response = await fetch(`${API_URL}/api/storefront/status${query}`, { cache: "no-store" });
      if (!response.ok) return null;
      const data = (await response.json()) as Partial<DeliveryConfig>;
      const next = {
        deliveryEnabled: data.deliveryEnabled !== false,
        shopEnabled: data.shopEnabled !== false,
        pickupEnabled: data.pickupEnabled !== false,
        message: data.message ?? null,
        shopMessage: data.shopMessage ?? null,
        sectors: data.sectors ?? []
      };
      setDeliveryEnabled(next.deliveryEnabled);
      setShopEnabled(next.shopEnabled);
      setPickupEnabled(next.pickupEnabled);
      setMessage(next.message);
      setSectors(next.sectors);
      setSnapshot(data);
      return next;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, [branchSlug]);

  useEffect(() => {
    let cancelled = false;
    void refresh().then(() => {
      if (cancelled) return;
    });
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [refresh, initialValue]);

  return { deliveryEnabled, shopEnabled, pickupEnabled, message, shopMessage: snapshot.shopMessage ?? null, sectors, snapshot, loading, refresh };
}
