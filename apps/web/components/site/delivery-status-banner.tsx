"use client";

import { usePublicBranch } from "@/components/site/public-branch-provider";
import { useDeliveryAvailability } from "@/components/site/use-delivery-availability";

export function DeliveryStatusBanner() {
  const { selectedBranch } = usePublicBranch();
  const { deliveryEnabled, message, loading } = useDeliveryAvailability(selectedBranch?.slug);
  if (loading || deliveryEnabled) return null;
  return <div className="border-b border-pocket-orange/20 bg-pocket-orange/10 px-4 py-3 text-center text-sm font-semibold text-pocket-navy" role="status">{message ?? "Our riders are currently busy at the moment. Please call us to place your order."}</div>;
}
