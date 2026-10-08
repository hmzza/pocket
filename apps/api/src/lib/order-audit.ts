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

type AuditChange = { from: unknown; to: unknown };

function normalizedItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item: any) => ({
    productId: item.productId ?? null,
    productName: item.productName ?? "Item",
    customDescription: item.customDescription ?? null,
    quantity: Number(item.quantity ?? 0),
    unitPrice: Number(item.unitPrice ?? 0),
    promotionFreeQuantity: Number(item.promotionFreeQuantity ?? 0),
    note: item.note ?? null,
    addOns: (item.addOns ?? []).map((addOn: any) => ({
      optionName: addOn.optionName ?? "Option",
      priceDelta: Number(addOn.priceDelta ?? 0),
      quantity: Number(addOn.quantity ?? 1)
    })).sort((left: any, right: any) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    bundleComponents: (item.bundleComponents ?? []).map((component: any) => ({
      componentProductName: component.componentProductName ?? component.productName ?? "Component",
      quantity: Number(component.quantity ?? 0),
      unitPrice: Number(component.unitPrice ?? 0)
    })).sort((left: any, right: any) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
  }));
}

function meaningfulSnapshot(snapshot: any) {
  return {
    items: normalizedItems(snapshot?.items),
    discount: {
      discountAmount: Number(snapshot?.discountAmount ?? 0),
      manualDiscountType: snapshot?.manualDiscountType ?? null,
      manualDiscountValue: Number(snapshot?.manualDiscountValue ?? 0),
      promotionName: snapshot?.promotionName ?? null,
      promotionDiscountAmount: Number(snapshot?.promotionDiscountAmount ?? 0)
    },
    paymentMethod: snapshot?.paymentMethod ?? null,
    serviceType: snapshot?.serviceType ?? null,
    placedAt: snapshot?.placedAt ?? null
  };
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatMoney(value: unknown) {
  return `Rs ${Number(value ?? 0).toFixed(2)}`;
}

function formatServiceType(value: unknown) {
  const labels: Record<string, string> = {
    INSHOP: "Dine-in",
    DINE_IN: "Dine-in",
    TAKEAWAY: "Takeaway",
    DELIVERY: "Delivery",
    FOODPANDA: "Foodpanda"
  };
  return labels[String(value)] ?? String(value ?? "None").replaceAll("_", " ");
}

function formatPaymentMethod(value: unknown) {
  const labels: Record<string, string> = {
    CASH: "Cash",
    EASYPAISA: "Easypaisa",
    JAZZCASH: "JazzCash",
    CASH_ON_DELIVERY: "Cash on Delivery",
    FOODPANDA_PAYOUT: "Foodpanda payout"
  };
  return labels[String(value)] ?? String(value ?? "None").replaceAll("_", " ");
}

function formatPaymentStatus(value: unknown) {
  return ({ PENDING: "Unpaid", PAID: "Paid", UNSET: "Not applicable" } as Record<string, string>)[String(value)] ?? String(value ?? "Unknown");
}

function formatStatus(value: unknown) {
  return String(value ?? "Unknown").replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function formatAuditDate(value: unknown) {
  if (!value) return "None";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-PK", {
    timeZone: "Asia/Karachi",
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatItemLines(value: unknown) {
  const items = normalizedItems(value);
  if (!items.length) return ["No items"];
  return items.map((item: any) => {
    const addOns = item.addOns.length ? ` (${item.addOns.map((addOn: any) => addOn.optionName).join(", ")})` : "";
    const bundle = item.bundleComponents.length ? ` [${item.bundleComponents.map((component: any) => `${component.quantity} × ${component.componentProductName}`).join(", ")}]` : "";
    return `${item.quantity} × ${item.productName}${addOns}${bundle} — ${formatMoney(item.unitPrice)}`;
  });
}

function formatDiscount(snapshot: any) {
  const discount = meaningfulSnapshot(snapshot).discount;
  if (!discount.discountAmount && !discount.manualDiscountValue && !discount.promotionName) return "None";
  if (discount.promotionName) return `${discount.promotionName} (${formatMoney(discount.discountAmount)})`;
  if (discount.manualDiscountType === "PERCENTAGE") return `${discount.manualDiscountValue}% (${formatMoney(discount.discountAmount)})`;
  if (discount.manualDiscountType === "FIXED") return formatMoney(discount.discountAmount || discount.manualDiscountValue);
  return formatMoney(discount.discountAmount);
}

export function diffMeaningfulOrderAuditSnapshots(previous: unknown, next: unknown) {
  if (!previous) return { created: true };
  const previousValue = meaningfulSnapshot(previous);
  const nextValue = meaningfulSnapshot(next);
  const changes: Record<string, AuditChange> = {};

  if (!sameValue(previousValue.items, nextValue.items)) {
    changes.items = { from: formatItemLines((previous as any)?.items), to: formatItemLines((next as any)?.items) };
  }
  if (!sameValue(previousValue.discount, nextValue.discount)) {
    changes.discount = { from: formatDiscount(previous), to: formatDiscount(next) };
  }
  if (previousValue.paymentMethod !== nextValue.paymentMethod) {
    changes.paymentMethod = { from: formatPaymentMethod(previousValue.paymentMethod), to: formatPaymentMethod(nextValue.paymentMethod) };
  }
  if (previousValue.serviceType !== nextValue.serviceType) {
    changes.serviceType = { from: formatServiceType(previousValue.serviceType), to: formatServiceType(nextValue.serviceType) };
  }
  if (previousValue.placedAt !== nextValue.placedAt) {
    changes.placedAt = { from: formatAuditDate(previousValue.placedAt), to: formatAuditDate(nextValue.placedAt) };
  }

  return changes;
}

export function hasMeaningfulOrderEdit(changes: unknown) {
  if (!changes || typeof changes !== "object") return false;
  return Object.keys(changes as Record<string, unknown>).some((key) => ["items", "discount", "paymentMethod", "serviceType", "placedAt"].includes(key));
}

export function formatOperationalAuditChanges(eventType: string, previous: unknown, next: unknown, explicit?: unknown) {
  const previousSnapshot = previous as any;
  const nextSnapshot = next as any;
  if (explicit && typeof explicit === "object") {
    const result: Record<string, AuditChange> = {};
    const allowedKeys = eventType === "STATUS_CHANGED"
      ? new Set(["status"])
      : eventType === "PAYMENT_STATUS_CHANGED"
        ? new Set(["paymentStatus"])
        : eventType === "RIDER_DISPATCHED"
          ? new Set(["rider", "status"])
          : new Set(Object.keys(explicit as Record<string, any>));
    for (const [key, value] of Object.entries(explicit as Record<string, any>)) {
      if (!allowedKeys.has(key)) continue;
      if (!value || typeof value !== "object" || !("from" in value) || !("to" in value)) continue;
      const from = key === "status" ? formatStatus(value.from) : key === "paymentStatus" ? formatPaymentStatus(value.from) : value.from ?? "None";
      const to = key === "status" ? formatStatus(value.to) : key === "paymentStatus" ? formatPaymentStatus(value.to) : value.to ?? "None";
      if (from !== to) result[key] = { from, to };
    }
    if (Object.keys(result).length) return result;
  }
  if (eventType === "STATUS_CHANGED") {
    return { status: { from: formatStatus(previousSnapshot?.status), to: formatStatus(nextSnapshot?.status) } };
  }
  if (eventType === "PAYMENT_STATUS_CHANGED") {
    return { paymentStatus: { from: formatPaymentStatus(previousSnapshot?.paymentStatus), to: formatPaymentStatus(nextSnapshot?.paymentStatus) } };
  }
  if (eventType === "RIDER_DISPATCHED") {
    return {
      rider: { from: previousSnapshot?.riderName ?? "None", to: nextSnapshot?.riderName ?? "None" },
      status: { from: formatStatus(previousSnapshot?.status), to: formatStatus(nextSnapshot?.status) }
    };
  }
  return {};
}

export function formatStoredAuditChanges(eventType: string, changes: unknown, snapshot?: unknown) {
  if (!changes || typeof changes !== "object") return {};
  const source = changes as Record<string, any>;
  if (eventType === "UPDATED") {
    const result: Record<string, AuditChange> = {};
    if (source.items && typeof source.items === "object") {
      result.items = {
        from: Array.isArray(source.items.from) ? source.items.from : formatItemLines(source.items.from),
        to: Array.isArray(source.items.to) ? source.items.to : formatItemLines(source.items.to)
      };
    }
    if (source.discount && typeof source.discount === "object") result.discount = source.discount;
    if (source.manualDiscountType || source.manualDiscountValue || source.discountAmount || source.promotionName || source.promotionDiscountAmount) {
      result.discount = {
        from: source.manualDiscountType?.from ?? source.manualDiscountValue?.from ?? source.discountAmount?.from ?? "Changed",
        to: source.manualDiscountType?.to ?? source.manualDiscountValue?.to ?? source.discountAmount?.to ?? formatDiscount(snapshot)
      };
    }
    for (const key of ["paymentMethod", "serviceType", "placedAt"]) {
      if (source[key] && typeof source[key] === "object") {
        const formatter = key === "paymentMethod" ? formatPaymentMethod : key === "serviceType" ? formatServiceType : formatAuditDate;
        result[key] = { from: formatter(source[key].from), to: formatter(source[key].to) };
      }
    }
    return result;
  }
  if (eventType === "RECEIPT_PRINTED" && source.receipt) return { receipt: source.receipt };
  return formatOperationalAuditChanges(eventType, null, snapshot, changes);
}

export function diffOrderAuditSnapshots(previous: unknown, next: unknown) {
  return diffMeaningfulOrderAuditSnapshots(previous, next);
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
    printAttemptId?: string | null;
  }
) {
  const snapshot = buildOrderAuditSnapshot(input.order);
  const previousSnapshot = input.previousOrder ? buildOrderAuditSnapshot(input.previousOrder) : null;
  const changes = input.eventType === "UPDATED"
    ? diffMeaningfulOrderAuditSnapshots(previousSnapshot, snapshot)
    : input.eventType === "RECEIPT_PRINTED"
      ? input.changes ?? {}
      : formatOperationalAuditChanges(input.eventType, previousSnapshot, snapshot, input.changes);

  if (input.eventType === "UPDATED" && !hasMeaningfulOrderEdit(changes)) return null;

  if (input.printAttemptId) {
    const existing = await db.orderAuditEvent.findFirst({
      where: {
        orderId: input.order.id,
        eventType: input.eventType,
        printAttemptId: input.printAttemptId
      }
    });
    if (existing) return existing;
  }

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
      changes: changes as Prisma.InputJsonValue,
      meaningfulEdit: input.eventType === "UPDATED" && hasMeaningfulOrderEdit(changes),
      printAttemptId: input.printAttemptId ?? null
    }
  });
}
