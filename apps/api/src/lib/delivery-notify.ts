import { DeliveryStatus, OrderStatus, WhatsAppMessageKind, WhatsAppMessageStatus } from "@prisma/client";
import { prisma } from "./prisma.js";
import { buildRiderAssignmentMessage, dispatchWhatsAppMessage, queueWhatsAppMessage } from "./whatsapp/index.js";

/**
 * The rider is told to collect when the food is actually ready, not when they
 * were assigned. Assignment often happens while the kitchen is still cooking, and
 * a rider sent for food that is not made yet just waits at the counter.
 *
 * Two things have to be true before the message goes out: a rider is assigned,
 * and the order is READY. Either can happen first, so both paths call this and
 * whichever completes the pair sends the message.
 *
 * Delivery.riderNotifiedAt is the guard. It is stamped when the message is
 * queued and cleared on assignment or reassignment, so an incoming rider is
 * notified in their own right and nobody is messaged twice for the same job.
 */
export async function notifyRiderIfOrderReady(orderId: string): Promise<string | null> {
  const delivery = await prisma.delivery.findUnique({
    where: { orderId },
    include: {
      rider: true,
      branch: { select: { name: true, phone: true } },
      order: {
        include: {
          address: true,
          items: { select: { productName: true, quantity: true } }
        }
      }
    }
  });

  if (!delivery) return null;
  if (!delivery.rider) return null;
  // Already told for this assignment.
  if (delivery.riderNotifiedAt) return null;
  // Nothing to collect yet.
  if (delivery.order.status !== OrderStatus.READY) return null;
  // A finished or abandoned delivery must not generate a fresh call-out.
  if (
    delivery.status === DeliveryStatus.DELIVERED ||
    delivery.status === DeliveryStatus.FAILED ||
    delivery.status === DeliveryStatus.CANCELLED ||
    delivery.status === DeliveryStatus.REJECTED
  ) {
    return null;
  }

  const message = buildRiderAssignmentMessage({
    rider: { name: delivery.rider.name, phone: delivery.rider.phone },
    order: {
      orderNumber: delivery.order.orderNumber,
      customerName: delivery.order.customerName,
      customerPhone: delivery.order.customerPhone,
      totalAmount: Number(delivery.order.totalAmount),
      paymentMethod: delivery.order.paymentMethod,
      deliveryInstructions: delivery.order.deliveryInstructions,
      items: delivery.order.items.map((item) => ({ productName: item.productName, quantity: item.quantity }))
    },
    address: delivery.order.address,
    branch: { name: delivery.branch.name, phone: delivery.branch.phone }
  });

  // Stamp and queue together, so two concurrent callers cannot both send. The
  // conditional update makes the stamp the lock: only one transaction can move
  // riderNotifiedAt away from null.
  const queuedId = await prisma.$transaction(async (transaction) => {
    const claimed = await transaction.delivery.updateMany({
      where: { id: delivery.id, riderNotifiedAt: null },
      data: { riderNotifiedAt: new Date() }
    });
    if (claimed.count === 0) return null;

    const queued = await queueWhatsAppMessage(transaction, {
      ...message,
      riderId: delivery.riderId,
      deliveryId: delivery.id,
      orderId: delivery.orderId
    });
    return queued.id;
  });

  if (!queuedId) return null;

  // After commit, and never allowed to surface: a notification problem must not
  // fail the status change that triggered it.
  void dispatchWhatsAppMessage(queuedId).catch(() => null);
  return queuedId;
}

/**
 * True when a rider is waiting on the kitchen: assigned, not yet told, and the
 * order is not ready. Used to explain the hold on the dispatch board.
 */
export function isWaitingOnKitchen(delivery: {
  riderId: string | null;
  riderNotifiedAt: Date | null;
  order: { status: OrderStatus };
}) {
  return Boolean(delivery.riderId) && !delivery.riderNotifiedAt && delivery.order.status !== OrderStatus.READY;
}

/**
 * Discards a call-out that was queued but never actually sent, used when a rider
 * loses the order before anyone pressed send. An already-sent message cannot be
 * unsent, so those are left alone and the revocation message covers it.
 */
export async function cancelUnsentRiderCallout(deliveryId: string, riderId: string | null) {
  if (!riderId) return;
  await prisma.whatsAppMessage.updateMany({
    where: {
      deliveryId,
      riderId,
      kind: WhatsAppMessageKind.RIDER_ASSIGNED,
      status: { in: [WhatsAppMessageStatus.QUEUED, WhatsAppMessageStatus.MANUAL_PENDING] }
    },
    data: {
      status: WhatsAppMessageStatus.FAILED,
      lastError: "Superseded: this rider no longer has the order."
    }
  });
}
