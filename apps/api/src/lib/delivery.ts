import { OrderStatus, ServiceType } from "@prisma/client";
import { INVENTORY_TRANSACTION_OPTIONS, prisma } from "./prisma.js";

export const POCKET_RIDER = {
  name: "Zeeshan",
  phone: "+923086548469"
} as const;

export const DELIVERY_AREAS = {
  "G-11": { label: "G-11", fee: 100 },
  "G-10": { label: "G-10", fee: 150 },
  "F-11": { label: "F-11", fee: 150 },
  "G-12": { label: "G-12", fee: 180 },
  "G-13": { label: "G-13", fee: 180 },
  "F-10": { label: "F-10", fee: 180 },
  "G-9": { label: "G-9", fee: 180 }
} as const;

export type DeliveryArea = keyof typeof DELIVERY_AREAS;

export const DELIVERY_AREA_KEYS = Object.keys(DELIVERY_AREAS) as DeliveryArea[];
export const DELIVERY_CITY = "Islamabad";

export function getDeliveryArea(sector: string) {
  return DELIVERY_AREAS[sector as DeliveryArea] ?? null;
}

export function getDeliverySubsectors(sector: string) {
  if (!getDeliveryArea(sector)) return [];
  return [1, 2, 3, 4].map((number) => `${sector}/${number}`);
}

export function isDeliverySubsector(sector: string, subsector: string) {
  return getDeliverySubsectors(sector).includes(subsector);
}

export function formatDeliveryAddress(order: {
  customerName: string | null;
  customerPhone: string | null;
  deliverySector: string | null;
  deliverySubsector?: string | null;
  address: { addressLine1: string; addressLine2: string | null; city: string; instructions: string | null } | null;
  deliveryInstructions: string | null;
  items: Array<{ productName: string; quantity: number; addOns: Array<{ optionName: string }> }>;
  totalAmount: { toString(): string } | number;
  paymentMethod: string;
  orderNumber: string;
}) {
  const addressParts = [
    order.address?.addressLine1,
    order.address?.addressLine2,
    order.deliverySubsector ?? order.deliverySector,
    order.address?.city
  ].filter(Boolean);
  const itemLines = order.items.map((item) => {
    const addOns = item.addOns.length ? ` (${item.addOns.map((addOn) => addOn.optionName).join(", ")})` : "";
    return `• ${item.quantity}x ${item.productName}${addOns}`;
  });
  const notes = [order.address?.instructions, order.deliveryInstructions].filter(Boolean).join(" · ");

  return [
    `POCKET delivery — ${order.orderNumber}`,
    `Customer: ${order.customerName ?? "Customer"}`,
    `WhatsApp: ${order.customerPhone ?? "Not provided"}`,
    `Address: ${addressParts.join(", ") || "Not provided"}`,
    notes ? `Notes: ${notes}` : null,
    "Items:",
    ...itemLines,
    `Collect: Rs ${Number(order.totalAmount).toFixed(0)} (${order.paymentMethod.replaceAll("_", " ")})`
  ]
    .filter(Boolean)
    .join("\n");
}

export async function dispatchDeliveryOrder(input: { orderId: string; branchId: string; actorId: string }) {
  return prisma.$transaction(async (transaction) => {
    const currentOrder = await transaction.order.findUnique({
      where: { id: input.orderId },
      include: {
        address: true,
        items: { include: { addOns: true } }
      }
    });

    if (!currentOrder) {
      throw Object.assign(new Error("Delivery order not found."), { statusCode: 404 });
    }
    if (currentOrder.branchId !== input.branchId) {
      throw Object.assign(new Error("This order belongs to another branch."), { statusCode: 403 });
    }
    if (currentOrder.serviceType !== ServiceType.DELIVERY) {
      throw Object.assign(new Error("Only delivery orders can be assigned to a rider."), { statusCode: 400 });
    }
    if (currentOrder.status !== OrderStatus.CONFIRMED) {
      throw Object.assign(new Error("Accept this order before assigning it to a rider."), { statusCode: 409 });
    }

    const order = await transaction.order.update({
      where: { id: currentOrder.id },
      data: {
        status: OrderStatus.OUT_FOR_DELIVERY,
        riderName: POCKET_RIDER.name,
        riderPhone: POCKET_RIDER.phone,
        riderAssignedAt: new Date(),
        dispatchedById: input.actorId,
        dispatchedAt: new Date()
      }
    });

    return {
      order,
      whatsappUrl: `https://wa.me/${POCKET_RIDER.phone.replace(/\D/g, "")}?text=${encodeURIComponent(formatDeliveryAddress(currentOrder))}`
    };
  }, INVENTORY_TRANSACTION_OPTIONS);
}
