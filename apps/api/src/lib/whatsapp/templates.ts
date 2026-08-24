import { WhatsAppMessageKind } from "@prisma/client";
import { formatPakistanPhone } from "../phone.js";
import type { OutgoingWhatsAppMessage } from "./types.js";

export type AssignmentContext = {
  rider: { name: string; phone: string };
  order: {
    orderNumber: string;
    customerName: string | null;
    customerPhone: string | null;
    totalAmount: number | string;
    paymentMethod: string;
    deliveryInstructions?: string | null;
    items: Array<{ productName: string; quantity: number }>;
  };
  address: { addressLine1: string; addressLine2?: string | null; city: string; instructions?: string | null } | null;
  branch: { name: string; phone: string };
};

export type RevocationContext = {
  rider: { name: string; phone: string };
  order: { orderNumber: string };
  reason?: string | null;
  branch: { name: string; phone: string };
};

function formatRupees(value: number | string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return `Rs ${amount.toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;
}

function formatAddress(address: AssignmentContext["address"]) {
  if (!address) return "No address on file";
  return [address.addressLine1, address.addressLine2, address.city].filter(Boolean).join(", ");
}

function isCashOnDelivery(paymentMethod: string) {
  return paymentMethod === "CASH_ON_DELIVERY" || paymentMethod === "CASH";
}

/**
 * Assignment message. Carries the four things the rider cannot do the job
 * without: what to take, who it is for, where it goes, and the number to call.
 * Cash to collect is called out explicitly because getting that wrong costs
 * real money.
 */
export function buildRiderAssignmentMessage(context: AssignmentContext): OutgoingWhatsAppMessage {
  const { rider, order, address, branch } = context;
  const customerName = order.customerName?.trim() || "Customer";
  const customerPhone = formatPakistanPhone(order.customerPhone) || "Not provided";
  const addressText = formatAddress(address);
  const total = formatRupees(order.totalAmount);
  const itemLines = order.items.map((item) => `- ${item.quantity} x ${item.productName}`);

  const lines = [
    `Assalam o Alaikum ${rider.name},`,
    "",
    `You have a new delivery from ${branch.name}.`,
    "",
    `Order: ${order.orderNumber}`,
    `Customer: ${customerName}`,
    `Contact: ${customerPhone}`,
    `Address: ${addressText}`,
    ...(address?.instructions?.trim() ? [`Landmark: ${address.instructions.trim()}`] : []),
    ...(order.deliveryInstructions?.trim() ? [`Note: ${order.deliveryInstructions.trim()}`] : []),
    "",
    "Items",
    ...(itemLines.length ? itemLines : ["- See order in the app"]),
    "",
    isCashOnDelivery(order.paymentMethod) ? `COLLECT CASH: ${total}` : `Total: ${total} (already paid)`,
    "",
    `Please call the customer before you set off. Any problem, call the branch on ${branch.phone}.`
  ];

  return {
    kind: WhatsAppMessageKind.RIDER_ASSIGNED,
    toPhone: rider.phone,
    body: lines.join("\n"),
    // Order matters and must match the approved Cloud API template's {{1}}..{{7}}.
    templateParameters: [
      rider.name,
      order.orderNumber,
      customerName,
      customerPhone,
      addressText,
      isCashOnDelivery(order.paymentMethod) ? total : "0",
      branch.phone
    ]
  };
}

/**
 * Revocation message, sent to the rider who is losing the order. Deliberately
 * unambiguous: a rider who already set off has to know to stop.
 */
export function buildRiderRevocationMessage(context: RevocationContext): OutgoingWhatsAppMessage {
  const { rider, order, reason, branch } = context;

  const lines = [
    `${rider.name},`,
    "",
    `Order ${order.orderNumber} has been CANCELLED for you and given to another rider.`,
    "",
    "Please do NOT deliver this order.",
    ...(reason?.trim() ? ["", `Reason: ${reason.trim()}`] : []),
    "",
    `If you have already collected it, call the branch on ${branch.phone} right away.`
  ];

  return {
    kind: WhatsAppMessageKind.RIDER_REVOKED,
    toPhone: rider.phone,
    body: lines.join("\n"),
    templateParameters: [rider.name, order.orderNumber, branch.phone]
  };
}
