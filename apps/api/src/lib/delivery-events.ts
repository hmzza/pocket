import { OrderStatus, ServiceType } from "@prisma/client";
import type { Request, Response } from "express";
import { prisma } from "./prisma.js";

export type DeliveryOrderEvent = {
  branchId: string;
  orderId: string;
  orderNumber: string;
  channel: string;
  kind: "NEW" | "UPDATED";
};

type DeliveryOrderListener = (event: DeliveryOrderEvent) => void;

const listeners = new Map<string, Set<DeliveryOrderListener>>();
const knownPendingOrderIds = new Map<string, Set<string>>();
let pendingOrderPoller: NodeJS.Timeout | null = null;
let pendingOrderPollInFlight = false;

function emitDeliveryOrderEvent(event: DeliveryOrderEvent) {
  for (const listener of listeners.get(event.branchId) ?? []) {
    try {
      listener(event);
    } catch {
      // A disconnected browser must not prevent other boards from updating.
    }
  }
}

async function pollPendingDeliveryOrders() {
  if (pendingOrderPollInFlight || listeners.size === 0) return;

  pendingOrderPollInFlight = true;
  try {
    const branchIds = [...listeners.keys()];
    const pendingOrders = await prisma.order.findMany({
      where: {
        branchId: { in: branchIds },
        serviceType: ServiceType.DELIVERY,
        status: OrderStatus.PENDING
      },
      select: {
        id: true,
        branchId: true,
        orderNumber: true,
        channel: true
      }
    });

    const currentByBranch = new Map<string, typeof pendingOrders>();
    for (const order of pendingOrders) {
      const branchOrders = currentByBranch.get(order.branchId) ?? [];
      branchOrders.push(order);
      currentByBranch.set(order.branchId, branchOrders);
    }

    for (const branchId of branchIds) {
      const previousIds = knownPendingOrderIds.get(branchId) ?? new Set<string>();
      const currentOrders = currentByBranch.get(branchId) ?? [];
      const currentIds = new Set(currentOrders.map((order) => order.id));

      for (const order of currentOrders) {
        if (previousIds.has(order.id)) continue;
        emitDeliveryOrderEvent({
          branchId: order.branchId,
          orderId: order.id,
          orderNumber: order.orderNumber,
          channel: order.channel,
          kind: "NEW"
        });
      }

      knownPendingOrderIds.set(branchId, currentIds);
    }
  } catch {
    // The normal POS polling path remains available if the database watcher is unavailable.
  } finally {
    pendingOrderPollInFlight = false;
  }
}

function ensurePendingOrderPoller() {
  if (pendingOrderPoller) return;
  pendingOrderPoller = setInterval(() => {
    void pollPendingDeliveryOrders();
  }, 1_000);
  void pollPendingDeliveryOrders();
}

function stopPendingOrderPollerIfUnused() {
  if (listeners.size > 0 || !pendingOrderPoller) return;
  clearInterval(pendingOrderPoller);
  pendingOrderPoller = null;
  pendingOrderPollInFlight = false;
  knownPendingOrderIds.clear();
}

/**
 * Publishes an in-process delivery event to open Delivery boards. The pending
 * order watcher below is the cross-worker/reconnect fallback, so an event is
 * still detected when the order request and SSE connection use different API
 * workers.
 */
export function publishDeliveryOrderEvent(event: DeliveryOrderEvent) {
  if (listeners.has(event.branchId)) {
    const known = knownPendingOrderIds.get(event.branchId) ?? new Set<string>();
    known.add(event.orderId);
    knownPendingOrderIds.set(event.branchId, known);
  }
  emitDeliveryOrderEvent(event);
}

export function subscribeToDeliveryOrderEvents(branchId: string, listener: DeliveryOrderListener) {
  const branchListeners = listeners.get(branchId) ?? new Set<DeliveryOrderListener>();
  branchListeners.add(listener);
  listeners.set(branchId, branchListeners);
  ensurePendingOrderPoller();

  return () => {
    const currentListeners = listeners.get(branchId);
    currentListeners?.delete(listener);
    if (currentListeners?.size === 0) {
      listeners.delete(branchId);
      knownPendingOrderIds.delete(branchId);
    }
    stopPendingOrderPollerIfUnused();
  };
}

export function streamDeliveryOrderEvents(req: Request, res: Response, branchId: string) {
  res.status(200);
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.flushHeaders();

  let closed = false;
  let heartbeat: NodeJS.Timeout | null = null;
  let unsubscribe: () => void = () => undefined;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe();
  };
  const send = (eventName: string, payload: unknown) => {
    if (closed || res.destroyed) return;
    try {
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {
      cleanup();
    }
  };

  unsubscribe = subscribeToDeliveryOrderEvents(branchId, (event) => send("delivery-order", event));
  send("ready", { branchId });
  heartbeat = setInterval(() => {
    if (closed || res.destroyed) {
      cleanup();
      return;
    }
    try {
      res.write(": keepalive\n\n");
    } catch {
      cleanup();
    }
  }, 15_000);

  req.on("close", cleanup);
  res.on("close", cleanup);
  res.on("error", cleanup);
}
