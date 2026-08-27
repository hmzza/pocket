"use client";

import { useState } from "react";
import { Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useDeliveryAvailability } from "@/components/site/use-delivery-availability";

export function DeliveryUnavailableNotice({ initialDeliveryEnabled }: { initialDeliveryEnabled: boolean }) {
  const { deliveryEnabled } = useDeliveryAvailability(initialDeliveryEnabled);
  const [dismissed, setDismissed] = useState(false);

  if (deliveryEnabled || dismissed) return null;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/65 p-4" role="alertdialog" aria-modal="true" aria-labelledby="delivery-unavailable-title">
      <Card className="w-full max-w-md rounded-3xl border-pocket-navy/10 p-6 text-center shadow-2xl">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-pocket-orange/10 text-pocket-orange">
          <Truck className="h-6 w-6" />
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Delivery update</p>
        <h2 id="delivery-unavailable-title" className="mt-2 text-2xl font-black text-pocket-navy">Online deliveries are paused</h2>
        <p className="mt-3 text-sm leading-6 text-pocket-navy/70">We are not taking delivery orders online right now. Please check back shortly.</p>
        <Button className="mt-6 w-full" onClick={() => setDismissed(true)}>Got it</Button>
        <button type="button" onClick={() => setDismissed(true)} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-pocket-navy/60 hover:text-pocket-navy">
          <X className="h-4 w-4" /> Close
        </button>
      </Card>
    </div>
  );
}
