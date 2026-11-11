import { createHash } from "node:crypto";
import { PaymentMethod, Prisma } from "@prisma/client";

export const GOLOOTLO_DEALS = {
  "golootlo-deal-1": [{ name: "Shawarma 1 (paid)", kind: "shawarma" }, { name: "Shawarma 2 (free)", kind: "shawarma" }],
  "golootlo-deal-2": [{ name: "Wrap 1 (paid)", kind: "wrap" }, { name: "Wrap 2 (paid)", kind: "wrap" }, { name: "Wrap 3 (free)", kind: "wrap" }],
  "golootlo-deal-3": [{ name: "Wrap 1", kind: "wrap" }, { name: "Chiller 1", kind: "chiller" }]
} as const;
export const GOLOOTLO_PAYMENTS = ["CASH", "EASYPAISA", "JAZZCASH", "GOLOOTLO"] as const;
export const golootloId = (key: string) => `c${createHash("sha256").update(`golootlo:${key}`).digest("hex").slice(0, 24)}`;
const invalid = (message: string) => Object.assign(new Error(message), { statusCode: 400 });

export function validateGolootloPayment(serviceType: string, paymentMethod: string) {
  if (serviceType === "GOLOOTLO" && !(GOLOOTLO_PAYMENTS as readonly string[]).includes(paymentMethod)) throw invalid("Choose Cash, Easypaisa, JazzCash or Golootlo for a Golootlo order.");
  if (paymentMethod === "GOLOOTLO" && serviceType !== "GOLOOTLO") throw invalid("Golootlo payment can only be used for a Golootlo order.");
}

export function assertProductServiceType(product: { name?: string; requiredServiceType?: string | null }, serviceType: string) {
  if (product.requiredServiceType && product.requiredServiceType !== serviceType) throw invalid(`${product.name ?? "This product"} requires the ${product.requiredServiceType === "GOLOOTLO" ? "Golootlo" : product.requiredServiceType} order type.`);
}

export function golootloUnavailableReason(product: { slug: string; requiredServiceType?: string | null; addOnGroups: Array<{ name: string; options: unknown[] }> }) {
  if (product.requiredServiceType !== "GOLOOTLO") return null;
  const definitions = GOLOOTLO_DEALS[product.slug as keyof typeof GOLOOTLO_DEALS];
  if (!definitions) return "Golootlo deal configuration is unavailable.";
  return definitions.some((slot) => !product.addOnGroups.some((group) => group.name === slot.name && group.options.length))
    ? "A required Golootlo deal flavour is unavailable at this branch." : null;
}

export function validateGolootloSelections(product: { slug: string; requiredServiceType?: string | null; addOnGroups: Array<{ id: string; name: string; options: Array<{ id: string; linkedProductId?: string | null; priceDelta: unknown }> }> }, selections: Array<{ groupId: string; optionIds: string[] }>) {
  if (product.requiredServiceType !== "GOLOOTLO") return;
  const reason = golootloUnavailableReason(product);
  if (reason) throw invalid(reason);
  const definitions = GOLOOTLO_DEALS[product.slug as keyof typeof GOLOOTLO_DEALS]!;
  if (product.addOnGroups.length !== definitions.length || selections.length !== definitions.length || new Set(selections.map((s) => s.groupId)).size !== definitions.length) throw invalid("Choose exactly one item for each Golootlo deal slot.");
  for (const group of product.addOnGroups) {
    const selected = selections.find((s) => s.groupId === group.id);
    const option = group.options.find((o) => o.id === selected?.optionIds[0]);
    if (selected?.optionIds.length !== 1 || !option?.linkedProductId || Number(option.priceDelta) !== 0) throw invalid("Invalid or missing Golootlo deal choice.");
  }
}

/** Derived, gross receivables only. This feature deliberately does not track payouts. */
export function golootloReceivableWhere(branchId: string, start?: Date, end = new Date()): Prisma.OrderWhereInput {
  return { branchId, paymentMethod: PaymentMethod.GOLOOTLO, paymentStatus: "PAID", status: { not: "CANCELLED" }, placedAt: { ...(start ? { gte: start } : {}), lte: end } };
}

let syncing: Promise<void> | null = null;
export function syncGolootloOptions(client: Pick<Prisma.TransactionClient, "product" | "addOnGroup" | "addOnOption">) {
  if (syncing) return syncing;
  syncing = syncOptions(client).finally(() => { syncing = null; });
  return syncing;
}
async function syncOptions(client: Pick<Prisma.TransactionClient, "product" | "addOnGroup" | "addOnOption">) {
  const deals = await client.product.findMany({ where: { slug: { in: Object.keys(GOLOOTLO_DEALS) }, requiredServiceType: "GOLOOTLO", isActive: true }, select: { id: true, slug: true } });
  if (!deals.length) return;
  const choices = await client.product.findMany({
    where: { isActive: true, requiredServiceType: null, category: { isActive: true }, OR: [{ slug: { in: ["classic-pocket", "spicy-pocket"] } }, { category: { slug: { in: ["wraps", "chillers"] } } }] },
    select: { id: true, name: true, slug: true, category: { select: { slug: true } } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }]
  });
  for (const deal of deals) {
    const slots = GOLOOTLO_DEALS[deal.slug as keyof typeof GOLOOTLO_DEALS];
    const groupIds: string[] = [];
    for (const [index, slot] of slots.entries()) {
      const id = golootloId(`${deal.id}:slot:${index}`); groupIds.push(id);
      const values = { name: slot.name, minSelect: 1, maxSelect: 1, isRequired: true, isActive: true, sortOrder: index };
      await client.addOnGroup.upsert({ where: { id }, create: { id, productId: deal.id, ...values }, update: values });
      const options = choices.filter((choice) => slot.kind === "shawarma" ? ["classic-pocket", "spicy-pocket"].includes(choice.slug) : choice.category.slug === (slot.kind === "wrap" ? "wraps" : "chillers"));
      const ids: string[] = [];
      for (const [sortOrder, choice] of options.entries()) {
        const optionId = golootloId(`${id}:${choice.id}`); ids.push(optionId);
        const values = { name: `${slot.name}: ${choice.name}`, linkedProductId: choice.id, priceDelta: 0, isActive: true, sortOrder };
        await client.addOnOption.upsert({ where: { id: optionId }, create: { id: optionId, groupId: id, ...values }, update: values });
      }
      await client.addOnOption.updateMany({ where: { groupId: id, id: { notIn: ids } }, data: { isActive: false } });
    }
    await client.addOnGroup.updateMany({ where: { productId: deal.id, id: { notIn: groupIds } }, data: { isActive: false } });
  }
}
