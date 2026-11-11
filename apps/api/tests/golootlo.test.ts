import assert from "node:assert/strict";
import { once } from "node:events";
import { mock, test } from "node:test";
import { GOLOOTLO_DEALS, GOLOOTLO_PAYMENTS, assertProductServiceType, golootloId, golootloReceivableWhere, golootloUnavailableReason, syncGolootloOptions, validateGolootloPayment, validateGolootloSelections } from "../src/lib/golootlo.js";
import { filterDealProductOptions } from "../src/lib/deal-options.js";
import { computeInventoryChanges } from "../src/lib/inventory.js";
import { publicProductWhere } from "../src/lib/public-catalog.js";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/pocket_test";
process.env.JWT_SECRET = "golootlo-test-secret-only";
const { buildPosOrderPayload, checkoutSchema } = await import("../src/routes/pos.js");
import { prisma } from "../src/lib/prisma.js";
import { createPnlAccumulator } from "../src/lib/profit-loss-report-data.js";
import { createReportAccumulator } from "../src/lib/investor-report-data.js";
import { formatOrderForReceipt } from "../src/lib/pos-receipt.js";

// Prisma model delegates are lazy proxies; assign their methods directly.
function stub(target: any, name: string, implementation: (...args: any[]) => any) {
  const original = target[name];
  const fn = mock.fn(implementation); target[name] = fn;
  return { mock: { restore: () => { target[name] = original; }, callCount: () => fn.mock.callCount() } };
}
const branchId = golootloId("branch");
const flavours = [
  ["classic-pocket", "shawarma"], ["spicy-pocket", "shawarma"],
  ["classic-wrap", "wraps"], ["new-seasonal-wrap", "wraps"], ["chipotle-wrap", "wraps"],
  ["blue-chiller", "chillers"], ["new-chiller", "chillers"]
].map(([slug, category]) => ({ id: golootloId(slug!), slug: slug!, name: slug!, isActive: true, requiredServiceType: null, category: { slug: category!, isActive: true }, branchPricing: [{ branchId, isAvailable: true }] }));

function makeDeal(slug: keyof typeof GOLOOTLO_DEALS) {
  return {
    id: golootloId(slug), slug, name: slug, basePrice: { "golootlo-deal-1": 550, "golootlo-deal-2": 1700, "golootlo-deal-3": 1000 }[slug],
    isActive: true, requiredServiceType: "GOLOOTLO", category: { slug: "golootlo-deals", isActive: true }, bundleComponents: [], branchPricing: [{ branchId, isAvailable: true }],
    addOnGroups: GOLOOTLO_DEALS[slug].map((slot, index) => ({
      id: golootloId(`${slug}:${index}`), name: slot.name, isRequired: true, minSelect: 1, maxSelect: 1,
      options: flavours.filter((f) => f.category.slug === ({ shawarma: "shawarma", wrap: "wraps", chiller: "chillers" })[slot.kind]).map((f) => ({
        id: golootloId(`${slug}:${index}:${f.id}`), name: `${slot.name}: ${f.name}`, linkedProductId: f.id, linkedProduct: f, priceDelta: 0
      }))
    }))
  };
}
const deals = Object.keys(GOLOOTLO_DEALS).map((slug) => makeDeal(slug as keyof typeof GOLOOTLO_DEALS));
const selected = (deal: ReturnType<typeof makeDeal>, indexes: number[] = []) => deal.addOnGroups.map((group, i) => ({ groupId: group.id, optionIds: [group.options[indexes[i] ?? 0]!.id] }));
const payload = (deal = deals[0]!, indexes: number[] = [], quantity = 1) => ({
  ...checkoutSchema.parse({ serviceType: "GOLOOTLO", paymentMethod: "GOLOOTLO", items: [{ type: "product", productId: deal.id, quantity, selections: selected(deal, indexes) }] }), branchId
});

test("order type and payment are separate, with only the four approved Golootlo modes", () => {
  for (const method of GOLOOTLO_PAYMENTS) assert.doesNotThrow(() => validateGolootloPayment("GOLOOTLO", method));
  for (const method of ["CARD", "CASH_ON_DELIVERY", "PAY_AT_COUNTER", "FOODPANDA_PAYOUT"]) assert.throws(() => validateGolootloPayment("GOLOOTLO", method));
  for (const type of ["INSHOP", "TAKEAWAY", "FOODPANDA", "DELIVERY", "NASCON"]) assert.throws(() => validateGolootloPayment(type, "GOLOOTLO"));
  assert.throws(() => checkoutSchema.parse({ ...payload(), serviceType: "FOODPANDA", paymentMethod: "FOODPANDA_PAYOUT" }));
  assert.equal(checkoutSchema.parse({ ...payload(), serviceType: "FOODPANDA", paymentMethod: "FOODPANDA_PAYOUT", foodpandaOrderNumber: "FP-123" }).foodpandaOrderNumber, "FP-123");
  assert.equal(payload().foodpandaOrderNumber, undefined);
});

test("every deal combination and repeated flavours are valid, but missing or tampered slots fail", () => {
  let combinations = 0;
  function visit(deal: ReturnType<typeof makeDeal>, indexes: number[] = []) {
    if (indexes.length === deal.addOnGroups.length) { validateGolootloSelections(deal, selected(deal, indexes)); combinations++; return; }
    deal.addOnGroups[indexes.length]!.options.forEach((_, index) => visit(deal, [...indexes, index]));
  }
  deals.forEach((deal) => visit(deal));
  assert.equal(combinations, 4 + 27 + 6);
  for (const deal of deals) {
    assert.throws(() => validateGolootloSelections(deal, []));
    assert.throws(() => validateGolootloSelections(deal, selected(deal).slice(1)));
    assert.throws(() => validateGolootloSelections(deal, [...selected(deal), selected(deal)[0]!]));
    assert.throws(() => validateGolootloSelections(deal, selected(deal).map((s) => ({ ...s, optionIds: [golootloId("tampered")] }))));
    const tampered = structuredClone(deal); tampered.addOnGroups[0]!.options[0]!.priceDelta = 500;
    assert.throws(() => validateGolootloSelections(tampered, selected(tampered)));
    const empty = filterDealProductOptions([deal], new Set<string>())[0]!;
    assert.ok(golootloUnavailableReason(empty));
    assert.throws(() => validateGolootloSelections(empty, selected(deal)));
    assert.throws(() => assertProductServiceType(deal, "TAKEAWAY"));
    assert.doesNotThrow(() => assertProductServiceType({ name: "Regular wrap", requiredServiceType: null }, "GOLOOTLO"));
  }
  assert.equal(publicProductWhere(branchId).requiredServiceType, null);
});

test("generated options are idempotent, track new active flavours and never modify other deals", async () => {
  const groups = new Map<string, any>(), options = new Map<string, any>();
  let activeFlavours = flavours;
  const client: any = {
    product: { findMany: async (q: any) => q.where.requiredServiceType === "GOLOOTLO" ? deals : activeFlavours },
    addOnGroup: {
      upsert: async (q: any) => groups.set(q.where.id, { ...q.create, ...q.update }),
      updateMany: async (q: any) => { for (const g of groups.values()) if (g.productId === q.where.productId && !q.where.id.notIn.includes(g.id)) g.isActive = false; }
    },
    addOnOption: {
      upsert: async (q: any) => options.set(q.where.id, { ...q.create, ...q.update }),
      updateMany: async (q: any) => { for (const o of options.values()) if (o.groupId === q.where.groupId && !q.where.id.notIn.includes(o.id)) o.isActive = false; }
    }
  };
  groups.set("admin-managed", { id: "admin-managed", productId: "old-deal", name: "Custom", minSelect: 2, isActive: true });
  await syncGolootloOptions(client); const counts = [groups.size, options.size];
  await syncGolootloOptions(client); assert.deepEqual([groups.size, options.size], counts);
  assert.equal(groups.get("admin-managed").minSelect, 2);
  assert.equal([...groups.values()].filter((g) => g.productId !== "old-deal").length, 7);
  assert.ok([...options.values()].every((o) => o.priceDelta === 0));
  const removed = flavours.find((f) => f.slug === "new-seasonal-wrap")!;
  activeFlavours = flavours.filter((f) => f.id !== removed.id); await syncGolootloOptions(client);
  assert.ok([...options.values()].filter((o) => o.linkedProductId === removed.id).every((o) => !o.isActive));
});

test("POS normalization and create/edit/reopen preserve prices, components, exclusivity and ticket numbers", async (t) => {
  let available = new Set(flavours.map((f) => f.id));
  const mocks = [
    stub(prisma.product, "findMany", async (q: any) => q.include ? deals : q.where.requiredServiceType === "GOLOOTLO" ? deals : q.where.requiredServiceType === null ? flavours : []),
    stub(prisma.product, "findFirst", async () => null), stub(prisma.product, "findUnique", async () => null),
    stub(prisma.branch, "findFirst", async () => ({ id: branchId })),
    stub(prisma.category, "findUnique", async () => null),
    stub(prisma.setting, "findUnique", async () => ({ value: { isActive: true } })),
    stub(prisma.branchProduct, "findMany", async (q: any) => q.select.product ? [] : [...available].map((productId) => ({ productId }))),
    stub(prisma.addOnGroup, "upsert", async () => ({})), stub(prisma.addOnGroup, "updateMany", async () => ({})),
    stub(prisma.addOnOption, "upsert", async () => ({})), stub(prisma.addOnOption, "updateMany", async () => ({}))
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));
  for (const deal of deals) {
    const combinations: number[][] = [[]];
    for (const group of deal.addOnGroups) {
      const next = combinations.flatMap((indexes) => group.options.map((_, index) => [...indexes, index]));
      combinations.splice(0, combinations.length, ...next);
    }
    for (const indexes of combinations) {
      const normalized = await buildPosOrderPayload(payload(deal, indexes));
      assert.equal(normalized.totalAmount, deal.basePrice);
      assert.equal(normalized.normalizedItems[0]!.bundleComponents.reduce((n, c) => n + c.quantity, 0), deal.addOnGroups.length);
    }
    const r = await buildPosOrderPayload(payload(deal, [], 2));
    assert.equal(r.totalAmount, deal.basePrice * 2); assert.equal(r.promotionName, null);
    assert.equal(r.normalizedItems[0]!.bundleComponents.reduce((n, c) => n + c.quantity, 0), deal.addOnGroups.length * 2);
    assert.ok(r.normalizedItems[0]!.addOns.every((a) => a.priceDelta === 0));
    const discounted = await buildPosOrderPayload({ ...payload(deal), discountType: "FIXED", discountValue: 50 });
    assert.equal(discounted.totalAmount, deal.basePrice - 50);
    await assert.rejects(buildPosOrderPayload({ ...payload(deal), serviceType: "TAKEAWAY" }), /requires the Golootlo/);
  }
  const r = await buildPosOrderPayload(payload(deals[1]!, [0, 0, 0], 2));
  assert.equal(r.totalAmount, 3400);
  assert.deepEqual(r.normalizedItems[0]!.bundleComponents.map((c) => c.quantity), [6]);
  const item = r.normalizedItems[0]!;
  const ingredient: any = { id: "bread", type: "RAW", isActive: true, reorderLevel: 0 };
  const inventoryArgs: any = {
    productIngredients: [{ productId: item.bundleComponents[0]!.productId, ingredientId: "bread", quantityNeeded: 1, ingredient }, { productId: item.productId, ingredientId: "bread", quantityNeeded: 100, ingredient }],
    products: flavours, addOnOptions: [], optionIngredients: [],
    branchInventories: [{ id: "stock", ingredientId: "bread", quantityOnHand: 100, ingredient }], items: [item]
  };
  assert.equal(computeInventoryChanges({ ...inventoryArgs, mode: "consume" })[0]!.quantityDelta, -6);
  assert.equal(computeInventoryChanges({ ...inventoryArgs, mode: "return" })[0]!.quantityDelta, 6);
  available = new Set();
  await assert.rejects(buildPosOrderPayload(payload()), /unavailable/);
  available = new Set(flavours.map((f) => f.id));
  const { createApp } = await import("../src/app.js"); const { signToken } = await import("../src/lib/auth.js"); const { env } = await import("../src/config.js");
  let stored: any;
  const save = (data: any) => {
    stored = { ...stored, ...data, id: "test-order", branch: { id: branchId, name: "Test" }, placedAt: stored?.placedAt ?? new Date(),
      ...(data.items ? { items: data.items.create.map((item: any, i: number) => ({ ...item, id: `item-${i}`, product: { ...deals.find((d) => d.id === item.productId), category: { name: "Golootlo Deals" } }, addOns: item.addOns?.create ?? [], bundleComponents: item.bundleComponents?.create ?? [] })) } : {}) };
    return stored;
  };
  mocks.push(
    stub(prisma.user, "findUnique", async () => ({ id: "super", isActive: true, role: { code: "SUPER_ADMIN" }, email: "test@example.test", name: "Test", username: "test" })),
    stub(prisma.branch, "findMany", async () => [{ id: branchId, name: "Test", slug: "test", isActive: true }]),
    stub(prisma, "$transaction", async (callback: any) => callback(prisma)), stub(prisma, "$executeRaw", async () => 1),
    stub(prisma.branchInventoryControl, "findUnique", async () => null),
    stub(prisma.order, "findFirst", async () => stored ?? null), stub(prisma.order, "findUnique", async () => stored ?? null),
    stub(prisma.order, "create", async (q: any) => save(q.data)), stub(prisma.order, "update", async (q: any) => save(q.data)),
    stub(prisma.orderItemAddOn, "deleteMany", async () => ({})), stub(prisma.orderItem, "deleteMany", async () => ({})),
    stub(prisma.orderAuditEvent, "create", async () => ({})), stub(prisma.auditLog, "create", async () => ({}))
  );
  const server = createApp().listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  const headers = { Origin: env.WEB_ORIGINS[0]!, Authorization: `Bearer ${signToken({ sub: "super", role: "SUPER_ADMIN", email: "test@example.test" })}`, "Content-Type": "application/json", "x-branch-id": branchId };
  const request = async (path: string, method = "GET", body?: any) => fetch(`http://127.0.0.1:${address.port}/api/pos${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const response = await request("/checkout", "POST", payload(deals[1]!, [], 2));
  assert.equal(response.status, 201); const created: any = await response.json();
  assert.match(created.order.orderNumber, /^PKT-\d{4}-000001$/); assert.equal(created.order.foodpandaOrderNumber, null);
  assert.equal(created.order.totalAmount, 3400); assert.equal(created.order.items[0].bundleComponents[0].quantity, 6);
  const reopened = await request(`/orders/lookup?orderNumber=${created.order.orderNumber}`); assert.equal(reopened.status, 200);
  const reopenedData: any = await reopened.json(); assert.equal(reopenedData.editableOrder.items[0].requiredServiceType, "GOLOOTLO");
  const invalid = await request("/orders/test-order", "PATCH", { ...payload(deals[1]!), serviceType: "TAKEAWAY", paymentMethod: "CASH" });
  assert.equal(invalid.status, 400); assert.equal(stored.totalAmount, 3400);
  const edited = await request("/orders/test-order", "PATCH", { ...payload(deals[1]!), paymentMethod: "EASYPAISA" });
  assert.equal(edited.status, 200); const updated: any = await edited.json();
  assert.equal(updated.order.orderNumber, created.order.orderNumber); assert.equal(updated.order.paymentMethod, "EASYPAISA");
  assert.equal(updated.order.totalAmount, 1700); assert.equal(updated.order.items[0].bundleComponents[0].quantity, 3);
});

test("stock reversal uses the saved effects once, even after recipe edits", async () => {
  const { applyOrderInventory } = await import("../src/lib/inventory.js");
  let balance = 94, status = "APPLIED";
  const application = { id: "application", effects: [{ ingredientId: "bread", quantity: -6 }], status: "APPLIED" };
  const tx: any = {
    $executeRaw: async () => 1,
    branchInventoryControl: { findUnique: async () => ({ orderDeductionEnabled: true, generation: 1 }) },
    order: { findUnique: async () => ({ id: "order", branchId, inventoryStatus: status }), update: async (q: any) => { status = q.data.inventoryStatus; } },
    orderInventoryApplication: { findFirst: async () => application.status === "APPLIED" ? application : null, update: async () => { application.status = "REVERSED"; } },
    ingredient: { findMany: async () => [{ id: "bread" }] },
    branchInventory: { findUnique: async () => ({ id: "stock", quantityOnHand: balance, ingredient: { reorderLevel: 0 } }), update: async (q: any) => { balance = q.data.quantityOnHand; return { id: "stock" }; } },
    inventoryTransaction: { create: async () => ({ id: "return" }) }
  };
  const args: any = { transaction: tx, branchId, orderId: "order", items: [], mode: "return" };
  await applyOrderInventory(args); assert.equal(balance, 100); assert.equal(status, "REVERSED");
  await applyOrderInventory(args); assert.equal(balance, 100);
});

test("Golootlo receipts and report totals count parent revenue once and assume no commission", () => {
  const order: any = { id: "order", orderNumber: "PKT-001", branchId, branch: { id: branchId }, serviceType: "GOLOOTLO", paymentMethod: "GOLOOTLO", paymentStatus: "PAID", status: "DELIVERED", placedAt: new Date("2026-10-10T10:00:00Z"), subtotal: 3400, discountAmount: 0, taxAmount: 0, deliveryFee: 0, totalAmount: 3400, customer: null, customerId: null, customerPhone: null, items: [{ productName: "Golootlo Deal 2", quantity: 2, unitPrice: 1700, addOns: [], bundleComponents: [{ componentProductName: "Wrap", quantity: 6, unitPrice: 0 }] }] };
  const receipt = formatOrderForReceipt(order);
  assert.equal(receipt.orderNumber, "PKT-001"); assert.equal(receipt.foodpandaOrderNumber, null);
  assert.equal(receipt.items[0].bundleComponents[0].quantity, 6); assert.equal(receipt.items[0].lineTotal, 3400);
  const investor = createReportAccumulator(new Date("2026-11-08T10:00:00Z")), pnl = createPnlAccumulator();
  for (const o of [order, { ...order, paymentMethod: "CASH" }, { ...order, paymentStatus: "REFUNDED" }, { ...order, status: "CANCELLED" }]) { investor.addOrder(o); pnl.addOrder(o); }
  assert.equal(investor.finish().summary.sales, 680000); assert.equal(investor.finish().summary.golootloReceivables, 340000);
  assert.equal(pnl.finish().revenue, 680000); assert.equal(pnl.finish().sales.golootloReceivables, 340000); assert.equal(pnl.finish().marketplaceFee, 0);
  const where = golootloReceivableWhere(branchId, new Date("2026-11-01T01:00:00Z"), new Date("2026-11-02T00:59:59.999Z"));
  assert.equal(where.branchId, branchId); assert.equal(where.paymentMethod, "GOLOOTLO"); assert.equal(where.paymentStatus, "PAID");
  assert.deepEqual(where.status, { not: "CANCELLED" }); assert.equal(where.serviceType, undefined);
});

test("API create/edit reject invalid payment pairs and public cart cannot accept a restricted product", async (t) => {
  const { createApp } = await import("../src/app.js"); const { signToken } = await import("../src/lib/auth.js");
  const mocks = [
    stub(prisma.user, "findUnique", async () => ({ id: "super", isActive: true, role: { code: "SUPER_ADMIN" }, email: "test@example.test", name: "Test", username: "test" })),
    stub(prisma.product, "findFirst", async () => null),
    stub(prisma.branch, "findUniqueOrThrow", async () => ({ id: branchId })),
    stub(prisma.shoppingCart, "upsert", async () => { throw new Error("Must not persist a restricted item"); })
  ];
  const server = createApp().listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); mocks.forEach((m) => m.mock.restore()); });
  const { env } = await import("../src/config.js");
  const headers = { Origin: env.WEB_ORIGINS[0]!, Authorization: `Bearer ${signToken({ sub: "super", role: "SUPER_ADMIN", email: "test@example.test" })}`, "Content-Type": "application/json" };
  for (const [method, path] of [["POST", "/api/pos/checkout"], ["PATCH", "/api/pos/orders/order-1"]]) {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method, headers, body: JSON.stringify({ ...payload(), paymentMethod: "CARD" }) });
    assert.equal(response.status, 400);
  }
  const response = await fetch(`http://127.0.0.1:${address.port}/api/customer/cart/items`, { method: "POST", headers, body: JSON.stringify({ branchSlug: "test", productId: deals[0]!.id }) });
  assert.equal(response.status, 400); assert.equal(mocks.at(-1)!.mock.callCount(), 0);
  mocks.push(
    stub(prisma.branch, "findFirst", async () => ({ id: branchId, phone: "03001234567", hours: [] })),
    stub(prisma.product, "findMany", async (q: any) => { if (q.include) assert.equal(q.where.requiredServiceType, null); return []; }),
    stub(prisma.product, "findUnique", async () => deals[0]),
    stub(prisma.branchProduct, "findMany", async () => []), stub(prisma.setting, "findUnique", async () => null),
    stub(prisma.deliveryConfiguration, "upsert", async () => ({})), stub(prisma.storefrontConfiguration, "upsert", async () => ({})),
    stub(prisma.deliveryConfiguration, "findUniqueOrThrow", async () => ({ manualEnabled: true })), stub(prisma.storefrontConfiguration, "findUniqueOrThrow", async () => ({ manualEnabled: true })),
    stub(prisma.deliverySector, "count", async () => 1), stub(prisma.deliverySector, "findMany", async () => [])
  );
  const detail = await fetch(`http://127.0.0.1:${address.port}/api/products/golootlo-deal-1`);
  assert.equal(detail.status, 404);
  const direct = await fetch(`http://127.0.0.1:${address.port}/api/checkout`, { method: "POST", headers, body: JSON.stringify({ name: "Test Customer", phone: "03001234567", branchSlug: "test", fulfillment: "PICKUP", paymentMethod: "PAY_AT_COUNTER", items: [{ productId: deals[0]!.id, quantity: 1 }] }) });
  assert.equal(direct.status, 400);
});

test("Golootlo filters apply independently to current and deleted audit snapshots", async (t) => {
  const { createApp } = await import("../src/app.js"); const { signToken } = await import("../src/lib/auth.js");
  const { buildOrderAuditSnapshot } = await import("../src/lib/order-audit.js");
  const date = new Date();
  const make = (id: string, serviceType: string, paymentMethod: string) => ({ id, orderNumber: id, branchId, serviceType, paymentMethod, status: "DELIVERED", paymentStatus: "PAID", channel: "POS", placedAt: date, updatedAt: date, totalAmount: 550, subtotal: 550, taxAmount: 0, discountAmount: 0, deliveryFee: 0, items: [] });
  const live = make("live", "GOLOOTLO", "GOLOOTLO"), deleted = make("deleted", "GOLOOTLO", "GOLOOTLO"), cash = make("cash", "GOLOOTLO", "CASH"), other = make("foodpanda", "FOODPANDA", "FOODPANDA_PAYOUT");
  const mocks = [
    stub(prisma.user, "findUnique", async () => ({ id: "super", isActive: true, role: { code: "SUPER_ADMIN" }, email: "test@example.test", name: "Test", username: "test" })),
    stub(prisma.branch, "findMany", async () => [{ id: branchId, name: "Test", slug: "test", isActive: true }]),
    stub(prisma.order, "findMany", async (q: any) => { assert.equal(q.where.branchId, branchId); assert.equal(q.where.serviceType, "GOLOOTLO"); return [live]; }),
    stub(prisma.orderAuditEvent, "findMany", async (q: any) => {
      assert.equal(q.where.branchId, branchId);
      return [deleted, cash, other].map((order) => ({ orderId: order.id, orderNumber: order.orderNumber, eventType: "DELETED", createdAt: date, snapshot: buildOrderAuditSnapshot(order) }));
    })
  ];
  const server = createApp().listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); mocks.forEach((m) => m.mock.restore()); });
  const headers = { Authorization: `Bearer ${signToken({ sub: "super", role: "SUPER_ADMIN", email: "test@example.test" })}`, "x-branch-id": branchId };
  for (const [scope, ids] of [["all", ["deleted", "live"]], ["deleted", ["deleted"]], ["active", ["live"]]] as const) {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/admin/order-audit?segment=golootlo&payment=GOLOOTLO&scope=${scope}`, { headers });
    assert.equal(response.status, 200); const data: any = await response.json();
    assert.deepEqual(data.orders.map((o: any) => o.id).sort(), [...ids].sort());
  }
});

test("finance API keeps Golootlo out of wallets, derives receivables after edits/refunds/deletions, and isolates branches", async (t) => {
  const { createApp } = await import("../src/app.js"); const { signToken } = await import("../src/lib/auth.js");
  const { businessDayRange, getBusinessDateKey } = await import("../src/lib/business-day.js");
  const date = businessDayRange(getBusinessDateKey()).start;
  let orders = [
    { branchId, placedAt: date, serviceType: "GOLOOTLO", paymentMethod: "GOLOOTLO", paymentStatus: "PAID", status: "DELIVERED", totalAmount: 600 },
    ...["CASH", "EASYPAISA", "JAZZCASH"].map((paymentMethod, i) => ({ branchId, placedAt: date, serviceType: "GOLOOTLO", paymentMethod, paymentStatus: "PAID", status: "DELIVERED", totalAmount: (i + 1) * 100 })),
    { branchId: "other", placedAt: date, serviceType: "GOLOOTLO", paymentMethod: "GOLOOTLO", paymentStatus: "PAID", status: "DELIVERED", totalAmount: 9999 },
    { branchId, placedAt: date, serviceType: "GOLOOTLO", paymentMethod: "GOLOOTLO", paymentStatus: "PAID", status: "CANCELLED", totalAmount: 9999 },
    { branchId, placedAt: date, serviceType: "GOLOOTLO", paymentMethod: "GOLOOTLO", paymentStatus: "REFUNDED", status: "DELIVERED", totalAmount: 9999 }
  ];
  const filter = (where: any) => {
    assert.equal(where.branchId, branchId);
    return orders.filter((o) => o.branchId === where.branchId && o.status !== "CANCELLED" && (!where.paymentStatus || o.paymentStatus === where.paymentStatus) && (!where.serviceType || o.serviceType === where.serviceType) && (!where.paymentMethod || (typeof where.paymentMethod === "string" ? o.paymentMethod === where.paymentMethod : where.paymentMethod.in.includes(o.paymentMethod))));
  };
  const mocks = [
    stub(prisma.user, "findUnique", async () => ({ id: "super", isActive: true, role: { code: "SUPER_ADMIN" }, email: "test@example.test", name: "Test", username: "test" })),
    stub(prisma.branch, "findMany", async () => [{ id: branchId, name: "Test", slug: "test", isActive: true }]),
    stub(prisma.order, "findMany", async (q: any) => filter(q.where)),
    stub(prisma.order, "aggregate", async (q: any) => ({ _sum: { totalAmount: filter(q.where).reduce((n, o) => n + o.totalAmount, 0) } })),
    ...[prisma.foodpandaSettlement, prisma.fixedExpense, prisma.loan, prisma.loanRepayment, prisma.expense, prisma.moneyTransfer, prisma.moneyAddition, prisma.investmentPayment, prisma.savingsMovement].map((model) => stub(model, "findMany", async () => [])),
    stub(prisma.dailyClosing, "findFirst", async () => null), stub(prisma.dailyClosing, "findUnique", async () => null), stub(prisma.dailyClosing, "findMany", async () => []),
    stub(prisma.openingBalance, "findFirst", async () => null)
  ];
  const server = createApp().listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); mocks.forEach((m) => m.mock.restore()); });
  const headers = { Authorization: `Bearer ${signToken({ sub: "super", role: "SUPER_ADMIN", email: "test@example.test" })}`, "x-branch-id": branchId };
  async function position() {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/admin/finance/cash-position`, { headers });
    assert.equal(response.status, 200); return response.json() as Promise<any>;
  }
  let result = await position();
  assert.deepEqual(result.available, { CASH: 100, EASYPAISA: 200, JAZZCASH: 300, total: 600 });
  assert.equal(result.pendingReceivables.golootlo, 600); assert.equal(result.pendingReceivables.total, 600);
  orders[0]!.totalAmount = 550; result = await position(); assert.equal(result.pendingReceivables.golootlo, 550);
  orders[0]!.paymentStatus = "REFUNDED"; result = await position(); assert.equal(result.pendingReceivables.golootlo, 0);
  orders = orders.slice(1); result = await position(); assert.equal(result.pendingReceivables.golootlo, 0); assert.equal(result.available.total, 600);
});
