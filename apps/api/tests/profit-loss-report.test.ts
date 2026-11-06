import assert from "node:assert/strict";
import { once } from "node:events";
import { mock, test } from "node:test";
import { createPnlAccumulator, lastCompletePnlMonth, loadProfitLossReport, type PnlOrder, type PnlExpense } from "../src/lib/profit-loss-report-data.js";
import { renderProfitLossReport } from "../src/lib/profit-loss-report-pdf.js";
import { prisma } from "../src/lib/prisma.js";

const now = new Date("2026-11-05T10:00:00Z");
const order = (overrides: Partial<PnlOrder> = {}): PnlOrder => ({
  status: "DELIVERED", paymentStatus: "PAID", serviceType: "TAKEAWAY", subtotal: "1000.00",
  discountAmount: "100.00", totalAmount: "1100.00", taxAmount: "100.00", deliveryFee: "100.00", ...overrides
});
const expense = (overrides: Partial<PnlExpense> = {}): PnlExpense => ({
  title: "Rent", category: "Rent", amount: "200.00", stockTransactionId: null, fixedExpenseOccurrence: null, ...overrides
});

test("last complete month uses calendar months and the Pakistan 06:00 close", () => {
  const period = lastCompletePnlMonth(now);
  assert.equal(period.monthKey, "2026-10");
  assert.equal(period.start.toISOString(), "2026-10-01T01:00:00.000Z");
  assert.equal(period.end.toISOString(), "2026-11-01T00:59:59.999Z");
  assert.equal(lastCompletePnlMonth(new Date("2026-11-01T00:59:59Z")).monthKey, "2026-09");
  assert.equal(lastCompletePnlMonth(new Date("2026-11-01T01:00:00Z")).monthKey, "2026-10");
  assert.equal(lastCompletePnlMonth(new Date("2027-01-05T10:00:00Z")).monthKey, "2026-12");
  assert.equal(lastCompletePnlMonth(new Date("2028-03-05T10:00:00Z")).end.toISOString(), "2028-03-01T00:59:59.999Z");
});

test("P&L includes delivery income, deducts tax/discount once, and includes unpaid fixed bills", () => {
  const a = createPnlAccumulator();
  a.addOrder(order());
  a.addExpense(expense({ title: "Chicken", category: "Inventory", amount: "400.00", stockTransactionId: "stock-1" }));
  a.addExpense(expense({ fixedExpenseOccurrence: { status: "UNPAID" } }));
  const r = a.finish();
  assert.equal(r.revenue, 100000);
  assert.equal(r.costs.total, 60000);
  assert.equal(r.costs.stock, 40000);
  assert.equal(r.costs.unpaidFixed, 20000);
  assert.equal(r.profit, 40000);
  assert.equal(r.reconciliationAdjustment, 0);
  assert.equal(r.expenseTotal, r.costs.stock + r.otherCosts + r.marketplaceFee);
  assert.equal(r.categories.reduce((sum, c) => sum + c.amount, 0), r.costs.total);
});

test("cancelled, refunded, failed and unverified orders do not inflate income", () => {
  const a = createPnlAccumulator();
  [order(), order({ status: "CONFIRMED" }), order({ status: "DELIVERED", paymentStatus: "UNSET" }),
    order({ status: "CANCELLED" }), order({ paymentStatus: "REFUNDED" }), order({ paymentStatus: "FAILED" }),
    order({ status: "CONFIRMED", paymentStatus: "UNSET" })].forEach(a.addOrder);
  const r = a.finish();
  assert.equal(r.sales.allOrders, 7);
  assert.equal(r.sales.orders, 3);
  assert.equal(r.sales.excludedOrders, 3);
  assert.equal(r.sales.openOrders, 1);
  assert.equal(r.sales.paidAwaitingFulfilment, 110000);
  assert.equal(r.sales.fulfilledWithoutPayment, 110000);
  assert.equal(r.revenue, 300000);
});

test("Foodpanda fee fallback is added once, while explicitly labelled ledger fees replace it", () => {
  const a = createPnlAccumulator();
  a.addOrder(order({ serviceType: "FOODPANDA" }));
  a.addExpense(expense({ title: "Foodpanda packaging", category: "Packaging", amount: "50" }));
  let r = a.finish();
  assert.equal(r.feeSource, "estimate");
  assert.equal(r.marketplaceFee, 41800);
  assert.equal(r.expenseTotal, 46800);
  a.addExpense(expense({ title: "Foodpanda commission - October", amount: "300" }));
  a.addExpense(expense({ title: "Other marketplace charges", category: "Foodpanda fees", amount: "20" }));
  a.addExpense(expense({ title: "Commission", category: "Foodpanda", amount: "10" }));
  r = a.finish();
  assert.equal(r.feeSource, "ledger");
  assert.equal(r.marketplaceFee, 33000);
  assert.equal(r.feeAdjustment, 0);
  assert.equal(r.expenseTotal, 38000);
  assert.equal(r.expenseTotal, r.costs.stock + r.otherCosts + r.marketplaceFee);
});

test("a recorded zero marketplace fee is not replaced with an invented expense", () => {
  const a = createPnlAccumulator();
  a.addOrder(order({ serviceType: "FOODPANDA" }));
  a.addExpense(expense({ title: "Commission to Foodpanda", amount: "0" }));
  assert.equal(a.finish().feeSource, "ledger");
  assert.equal(a.finish().marketplaceFee, 0);
});

test("paisa arithmetic, reconciliation differences, grouping and losses remain explicit", () => {
  const a = createPnlAccumulator();
  a.addOrder(order({ subtotal: "0.10", discountAmount: "0", totalAmount: "0.20", taxAmount: "0", deliveryFee: "0" }));
  a.addExpense(expense({ title: " Rent ", category: "Rent", amount: "0.10" }));
  a.addExpense(expense({ title: "rent", category: "rent ", amount: "0.20" }));
  const r = a.finish();
  assert.equal(r.profit, -10);
  assert.equal(r.reconciliationAdjustment, 10);
  assert.equal(r.sales.arithmeticExceptions, 1);
  assert.equal(r.categories.length, 1);
  assert.equal(r.categories[0]?.lines.length, 1);
  assert.equal(r.categories[0]?.lines[0]?.entries, 2);
});

function snapshotMock() {
  return {
    $executeRaw: async () => 0,
    order: { findMany: async (_query: unknown) => [order()] },
    expense: { findMany: async (_query: unknown) => [expense()] },
    branch: { findMany: async () => [{ name: "Pocket Main", isActive: true }, { name: "Former branch", isActive: false }] }
  };
}

test("read-only snapshot bounds both ledgers to the complete month, across all branches", async () => {
  const tx = snapshotMock();
  const orderRead = mock.method(tx.order, "findMany"), expenseRead = mock.method(tx.expense, "findMany"), readOnly = mock.method(tx, "$executeRaw");
  const transaction = mock.method(prisma, "$transaction", async (callback: (tx: unknown) => unknown) => callback(tx));
  try {
    const r = await loadProfitLossReport(now);
    assert.equal(r.period.monthKey, "2026-10");
    assert.equal(r.branches.length, 2);
    assert.equal(r.costs.total, 20000);
    assert.ok(String(readOnly.mock.calls[0]?.arguments[0]).includes("READ ONLY"));
    const orders = orderRead.mock.calls[0]?.arguments[0] as { where: Record<string, unknown>; select: Record<string, unknown> };
    const expenses = expenseRead.mock.calls[0]?.arguments[0] as { where: Record<string, unknown> };
    assert.deepEqual(orders.where, { placedAt: { gte: r.period.start, lte: r.period.end } });
    assert.deepEqual(expenses.where, { expenseDate: { gte: r.period.start, lte: r.period.end } });
    assert.equal("branchId" in orders.where, false);
    assert.equal("customerPhone" in orders.select, false);
  } finally { transaction.mock.restore(); }
});

test("both order and expense ledgers paginate without losing the 501st record", async () => {
  const tx = snapshotMock();
  for (const [delegate, makeRow] of [[tx.order, order], [tx.expense, expense]] as const) {
    let calls = 0;
    delegate.findMany = async (query: unknown) => {
      calls++;
      if (calls === 1) return Array.from({ length: 500 }, (_, i) => ({ ...makeRow(), id: `row-${i}` })) as never;
      assert.deepEqual((query as { cursor: unknown }).cursor, { id: "row-499" });
      assert.equal((query as { skip: number }).skip, 1);
      return [{ ...makeRow(), id: "row-500" }] as never;
    };
  }
  const transaction = mock.method(prisma, "$transaction", async (callback: (tx: unknown) => unknown) => callback(tx));
  try {
    const r = await loadProfitLossReport(now);
    assert.equal(r.sales.orders, 501);
    assert.equal(r.costs.entries, 501);
    assert.equal(r.revenue, 50100000);
    assert.equal(r.costs.total, 10020000);
  } finally { transaction.mock.restore(); }
});

test("empty, negative and long expense statements render as complete PDF documents", async () => {
  for (const count of [0, 1, 90]) {
    const a = createPnlAccumulator();
    if (count) a.addOrder(order());
    for (let i = 0; i < count; i++) a.addExpense(expense({ title: `Detailed operating expense ${i}`, category: `Category ${i % 5}`, amount: "2000.01" }));
    const pdf = await renderProfitLossReport({ ...a.finish(), period: lastCompletePnlMonth(now), generatedAt: now, branches: [] });
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.ok(pdf.subarray(-50).toString().includes("%%EOF"));
    assert.ok((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length >= 3);
  }
});

test("P&L endpoint is private, Super Admin-only and ignores supplied date/branch filters", async () => {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/pocket_test";
  process.env.JWT_SECRET = "profit-loss-test-secret-only";
  const { createApp } = await import("../src/app.js");
  const { signToken } = await import("../src/lib/auth.js");
  const originalUserRead = prisma.user.findUnique, originalGrants = prisma.userPermission.findMany;
  const transaction = mock.method(prisma, "$transaction", async (callback: (tx: unknown) => unknown) => callback(snapshotMock()));
  prisma.user.findUnique = (async ({ where }: { where: { id: string } }) => ({
    id: where.id, isActive: true, role: { code: where.id === "super" ? "SUPER_ADMIN" : "POS_STAFF" }, email: "test@example.test", name: "Test", username: "test"
  })) as typeof prisma.user.findUnique;
  prisma.userPermission.findMany = (async () => [{ permission: { isActive: true, key: "OVERVIEW" } }]) as typeof prisma.userPermission.findMany;
  const server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/admin/dashboard/profit-loss-report?monthKey=2025-06&branchId=other`;
  try {
    assert.equal((await fetch(url)).status, 401);
    const staff = signToken({ sub: "staff", role: "POS_STAFF", email: "test@example.test" });
    assert.equal((await fetch(url, { headers: { Authorization: `Bearer ${staff}` } })).status, 403);
    assert.equal(transaction.mock.callCount(), 0);
    const token = signToken({ sub: "super", role: "SUPER_ADMIN", email: "test@example.test" });
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, "x-branch-id": "other" } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("content-disposition"), `attachment; filename="Pocket_PnL_${lastCompletePnlMonth().monthKey}.pdf"`);
    assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
    transaction.mock.restore(); prisma.user.findUnique = originalUserRead; prisma.userPermission.findMany = originalGrants;
  }
});
