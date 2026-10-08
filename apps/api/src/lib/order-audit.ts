import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

type DatabaseClient = typeof prisma | Prisma.TransactionClient;

type AuditOrder = {
  id: string;
  orderNumber: string;
  branchId: string;
  [key: string]: any;
};

export type OrderAuditSource = "WEBSITE" | "POS" | "ADMIN" | "SYSTEM";

export const orderAuditInclude = {
  customer: { select: { name: true, phone: true } },
  cashier: { select: { name: true, username: true } },
  acceptedBy: { select: { name: true, username: true } },
  dispatchedBy: { select: { name: true, username: true } },
  address: true,
  items: { include: { addOns: true, bundleComponents: true } }
} as const;

function jsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object" && value && typeof (value as { toNumber?: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  if (Array.isArray(value)) return value.map(jsonValue);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, jsonValue(entry)]));
  }
  return value;
}

export function buildOrderAuditSnapshot(order: AuditOrder) {
  return jsonValue({
    id: order.id,
    orderNumber: order.orderNumber,
    customerId: order.customerId ?? null,
    cashierId: order.cashierId ?? null,
    branchId: order.branchId,
    addressId: order.addressId ?? null,
    couponId: order.couponId ?? null,
    status: order.status,
    channel: order.channel,
    serviceType: order.serviceType,
    customerName: order.customerName ?? order.customer?.name ?? null,
    customerPhone: order.customerPhone ?? order.customer?.phone ?? null,
    foodpandaOrderNumber: order.foodpandaOrderNumber ?? null,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    inventoryStatus: order.inventoryStatus,
    subtotal: order.subtotal,
    taxRate: order.taxRate,
    taxAmount: order.taxAmount,
    deliveryFee: order.deliveryFee,
    discountAmount: order.discountAmount,
    manualDiscountType: order.manualDiscountType ?? null,
    manualDiscountValue: order.manualDiscountValue ?? null,
    promotionName: order.promotionName ?? null,
    promotionDiscountAmount: order.promotionDiscountAmount ?? null,
    cashReceivedAmount: order.cashReceivedAmount ?? null,
    changeDueAmount: order.changeDueAmount ?? null,
    totalAmount: order.totalAmount,
    expectedDeliveryAt: order.expectedDeliveryAt ?? null,
    deliveryInstructions: order.deliveryInstructions ?? null,
    deliverySector: order.deliverySector ?? null,
    deliverySubsector: order.deliverySubsector ?? null,
    riderName: order.riderName ?? null,
    riderPhone: order.riderPhone ?? null,
    riderAssignedAt: order.riderAssignedAt ?? null,
    riderId: order.riderId ?? null,
    acceptedById: order.acceptedById ?? null,
    acceptedAt: order.acceptedAt ?? null,
    dispatchedById: order.dispatchedById ?? null,
    dispatchedAt: order.dispatchedAt ?? null,
    placedAt: order.placedAt,
    updatedAt: order.updatedAt,
    cashierName: order.cashier?.name ?? order.cashier?.username ?? null,
    acceptedByName: order.acceptedBy?.name ?? order.acceptedBy?.username ?? null,
    dispatchedByName: order.dispatchedBy?.name ?? order.dispatchedBy?.username ?? null,
    address: order.address
      ? {
          id: order.address.id ?? null,
          label: order.address.label ?? null,
          addressLine1: order.address.addressLine1 ?? null,
          addressLine2: order.address.addressLine2 ?? null,
          city: order.address.city ?? null,
          instructions: order.address.instructions ?? null
        }
      : null,
    items: (order.items ?? []).map((item: any) => ({
      id: item.id,
      productId: item.productId ?? null,
      productName: item.productName,
      customDescription: item.customDescription ?? null,
      quantity: item.quantity,
      unitPrice: jsonValue(item.unitPrice),
      promotionFreeQuantity: item.promotionFreeQuantity ?? 0,
      note: item.note ?? null,
      addOns: (item.addOns ?? []).map((addOn: any) => ({
        id: addOn.id,
        optionId: addOn.optionId,
        optionName: addOn.optionName,
        priceDelta: jsonValue(addOn.priceDelta),
        quantity: addOn.quantity ?? 1
      })),
      bundleComponents: (item.bundleComponents ?? []).map((component: any) => ({
        id: component.id,
        productId: component.productId ?? null,
        componentProductName: component.componentProductName,
        quantity: component.quantity,
        unitPrice: jsonValue(component.unitPrice)
      }))
    }))
  }) as Prisma.InputJsonValue;
}

export function diffOrderAuditSnapshots(previous: unknown, next: unknown) {
  if (!previous) return { created: true };
  if (!next || typeof previous !== "object" || typeof next !== "object") {
    return JSON.stringify(previous) === JSON.stringify(next) ? {} : { value: { from: previous, to: next } };
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const previousRecord = previous as Record<string, unknown>;
  const nextRecord = next as Record<string, unknown>;
  const keys = new Set([...Object.keys(previousRecord), ...Object.keys(nextRecord)]);

  for (const key of keys) {
    if (JSON.stringify(previousRecord[key]) !== JSON.stringify(nextRecord[key])) {
      changes[key] = { from: previousRecord[key] ?? null, to: nextRecord[key] ?? null };
    }
  }

  return changes;
}

export async function recordOrderAuditEvent(
  db: DatabaseClient,
  input: {
    order: AuditOrder;
    eventType: string;
    source: OrderAuditSource;
    actorId?: string | null;
    actorName?: string | null;
    previousOrder?: AuditOrder | null;
    changes?: unknown;
  }
) {
  const snapshot = buildOrderAuditSnapshot(input.order);
  const previousSnapshot = input.previousOrder ? buildOrderAuditSnapshot(input.previousOrder) : null;
  const changes = input.changes ?? diffOrderAuditSnapshots(previousSnapshot, snapshot);

  return db.orderAuditEvent.create({
    data: {
      orderId: input.order.id,
      branchId: input.order.branchId,
      orderNumber: input.order.orderNumber,
      eventType: input.eventType,
      source: input.source,
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      placedAt: new Date(input.order.placedAt),
      snapshot,
      changes: changes as Prisma.InputJsonValue
    }
  });
}
