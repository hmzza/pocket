export type DeliveryOrderEvent = {
  branchId: string;
  orderId: string;
  orderNumber: string;
  channel: string;
  kind: "NEW" | "UPDATED";
};

type DeliveryOrderListener = (event: DeliveryOrderEvent) => void;

const listeners = new Set<DeliveryOrderListener>();

/**
 * Publishes an in-process delivery event to open Delivery boards. The normal
 * polling refresh remains as a fallback, while this avoids waiting for a
 * background-tab browser timer before the alarm reacts.
 */
export function publishDeliveryOrderEvent(event: DeliveryOrderEvent) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // A disconnected browser must not prevent other boards from updating.
    }
  }
}

export function subscribeToDeliveryOrderEvents(listener: DeliveryOrderListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
