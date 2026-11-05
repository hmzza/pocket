import assert from "node:assert/strict";
import { once } from "node:events";
import { test, mock } from "node:test";
import { createReportAccumulator, loadInvestorReport, type ReportOrder, type InvestorReportData } from "../src/lib/investor-report-data.js";
import { renderInvestorReport } from "../src/lib/investor-report-pdf.js";
import { prisma } from "../src/lib/prisma.js";

const now = new Date("2026-11-05T10:00:00Z");
function order(overrides: Partial<ReportOrder> = {}): ReportOrder {
  return {
    branchId: "branch-a", placedAt: new Date("2026-10-15T12:00:00Z"), status: "DELIVERED", paymentStatus: "PAID", serviceType: "TAKEAWAY",
    customerId: null, customerPhone: null, customer: null, totalAmount: "100.00", subtotal: "100.00", discountAmount: 0, taxAmount: 0, deliveryFee: 0,
    items: [{ productName: "Classic Shawarma", quantity: 1, unitPrice: "100.00" }], ...overrides
  };
}
function fixture(orders: ReportOrder[] = []): InvestorReportData {
  const accumulator = createReportAccumulator(now);
  orders.forEach(accumulator.addOrder);
  return {
    ...accumulator.finish(), generatedAt: now, start: new Date("2026-06-01T01:00:00Z"), unpaidFixedExpenses: 0,
    expenseCategories: [], expenses: 0, stockPurchases: 0,
    branchDirectory: [{ id: "branch-a", name: "Pocket Main", city: "Islamabad", isActive: true }],
    capital: { loans: 0, repayments: 0, outstandingLoans: 0, investments: 0, additions: 0, currentMonthlyFixed: 0 },
    settlements: { count: 0, partial: 0, gross: 0, charges: 0, received: 0 }
  };
}

test("Pakistan 06:00 boundaries, inception and cutoff are respected", () => {
  const a = createReportAccumulator(now);
  ["2026-06-01T00:59:59Z", "2026-06-01T01:00:00Z", "2026-07-01T00:59:59Z", "2026-07-01T01:00:00Z", "2026-11-05T10:00:01Z"].forEach((placedAt) => a.addOrder(order({ placedAt: new Date(placedAt) })));
  const result = a.finish();
  assert.equal(result.summary.orders, 3);
  assert.equal(result.months[0]?.orders, 2);
  assert.equal(result.months[1]?.orders, 1);
  assert.equal(result.months.length, 6);
  assert.equal(result.months.at(-1)?.complete, false);
  assert.equal(result.months.at(-2)?.complete, true);
});

test("paid or fulfilled eligibility excludes cancellations, refunds, failures and open tickets", () => {
  const a = createReportAccumulator(now);
  [order(), order({ status: "CONFIRMED", paymentStatus: "PAID" }), order({ paymentStatus: "PENDING" }),
    order({ status: "CANCELLED" }), order({ paymentStatus: "REFUNDED" }), order({ paymentStatus: "FAILED" }),
    order({ status: "CONFIRMED", paymentStatus: "UNSET" }), order({ status: "PENDING", paymentStatus: "PENDING" })].forEach(a.addOrder);
  const { summary } = a.finish();
  assert.equal(summary.allOrders, 8);
  assert.equal(summary.orders, 3);
  assert.equal(summary.sales, 30000);
  assert.equal(summary.paidSales, 20000);
  assert.equal(summary.unverifiedSales, 10000);
  assert.equal(summary.openOrders, 2);
  assert.equal(summary.excludedOrders, 3);
  assert.equal(summary.allOrders, summary.orders + summary.openOrders + summary.excludedOrders);
});

test("money is added in paisa and order arithmetic exceptions are disclosed", () => {
  const a = createReportAccumulator(now);
  a.addOrder(order({ totalAmount: "0.10", subtotal: "0.10" }));
  a.addOrder(order({ totalAmount: "0.20", subtotal: "0.20" }));
  a.addOrder(order({ totalAmount: "100.00", subtotal: "110.00", discountAmount: "30.00", taxAmount: "10.00", deliveryFee: "10.00" }));
  a.addOrder(order({ totalAmount: "100.00", subtotal: "90.00" }));
  a.addExpense(new Date("2026-10-15T01:00:00Z"), "40.25", true);
  a.addExpense(new Date("2026-10-15T01:00:00Z"), "10.50", false);
  assert.equal(a.finish().summary.sales, 20030);
  assert.equal(a.finish().summary.reconciliationExceptions, 1);
  assert.equal(a.finish().months[4]?.expenses, 5075);
  assert.equal(a.finish().months[4]?.stockPurchases, 4025);
});

test("repeat customers normalise Pakistan mobile numbers and never merge anonymous walk-ins", () => {
  const a = createReportAccumulator(now);
  [order({ customerPhone: "0300 1234567" }), order({ customerPhone: "+92 300 1234567" }),
    order({ customerPhone: "00923001234567" }), order({ customerId: "registered-only" }), order(), order()].forEach(a.addOrder);
  assert.deepEqual(a.finish().customers, { identified: 2, repeat: 1 });
  assert.equal(a.finish().summary.identifiedOrders, 4);
  assert.equal(JSON.stringify(a.finish()).includes("1234567"), false);
  assert.equal(JSON.stringify(a.finish()).includes("registered-only"), false);
});

test("trailing windows include zero days and exclude the current business day", () => {
  const a = createReportAccumulator(now);
  ["2026-11-05T01:00:00Z", "2026-11-04T23:59:59Z", "2026-10-08T01:00:00Z", "2026-10-07T01:00:00Z", "2026-09-10T01:00:00Z", "2026-09-09T01:00:00Z"].forEach((date) => a.addOrder(order({ placedAt: new Date(date) })));
  assert.deepEqual(a.finish().trailing, { orders: 2, sales: 20000, previousOrders: 2, previousSales: 20000 });
});

function snapshotMock() {
  const aggregate = async () => ({ _sum: { amount: "0.00", monthlyAmount: "0.00" } });
  return {
    $executeRaw: async () => 0,
    order: { findMany: async () => [order()] },
    expense: { findMany: async () => [
      { amount: "40.25", category: "Stock", expenseDate: order().placedAt, stockTransactionId: "stock-linked", fixedExpenseOccurrence: null },
      { amount: "10.50", category: "Rent", expenseDate: order().placedAt, stockTransactionId: null, fixedExpenseOccurrence: { status: "PAID" } },
      { amount: "20.00", category: "Rent", expenseDate: order().placedAt, stockTransactionId: null, fixedExpenseOccurrence: { status: "UNPAID" } }
    ] },
    branch: { findMany: async () => fixture().branchDirectory },
    foodpandaSettlement: { findMany: async () => [], count: async () => 0 },
    loan: { aggregate }, loanRepayment: { aggregate }, investmentPayment: { aggregate }, moneyAddition: { aggregate }, fixedExpense: { aggregate }
  };
}

test("snapshot loading counts linked stock spending once, excludes unpaid fixed bills and includes all branches", async () => {
  const tx = snapshotMock();
  const readOnly = mock.method(tx, "$executeRaw");
  const ordersRead = mock.method(tx.order, "findMany");
  const transaction = mock.method(prisma, "$transaction", async (callback: (tx: unknown) => unknown) => callback(tx));
  try {
    const result = await loadInvestorReport(now);
    assert.equal(result.expenses, 5075);
    assert.equal(result.stockPurchases, 4025);
    assert.equal(result.unpaidFixedExpenses, 2000);
    assert.equal(result.expenseCategories.reduce((sum, row) => sum + row.amount, 0), 5075);
    assert.ok(String(readOnly.mock.calls[0]?.arguments[0]).includes("SET TRANSACTION READ ONLY"));
    const query = ordersRead.mock.calls[0]?.arguments[0] as unknown as { where: Record<string, unknown> };
    assert.equal("branchId" in query.where, false);
    assert.equal(JSON.stringify(result).includes("stock-linked"), false);
  } finally { transaction.mock.restore(); }
});

test("order reads paginate without dropping or duplicating the next batch", async () => {
  const tx = snapshotMock();
  let calls = 0;
  const first = Array.from({ length: 500 }, (_, i) => ({ ...order(), id: `order-${i}` }));
  tx.order.findMany = async (...args: unknown[]) => {
    const query = args[0] as { cursor?: { id: string }; skip?: number };
    calls++;
    if (calls === 1) { assert.equal(query.cursor, undefined); return first; }
    assert.deepEqual(query.cursor, { id: "order-499" });
    assert.equal(query.skip, 1);
    return [{ ...order(), id: "order-500" }];
  };
  const transaction = mock.method(prisma, "$transaction", async (callback: (tx: unknown) => unknown) => callback(tx));
  try {
    const result = await loadInvestorReport(now);
    assert.equal(calls, 2);
    assert.equal(result.summary.orders, 501);
    assert.equal(result.summary.sales, 5010000);
  } finally { transaction.mock.restore(); }
});

test("PDF renderer produces valid multipage documents for empty and populated records", async () => {
  for (const data of [fixture(), fixture([order({ customerPhone: "03001234567", serviceType: "FOODPANDA" })])]) {
    const pdf = await renderInvestorReport(data);
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.ok(pdf.length > 10000);
    assert.ok((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length >= 8);
    assert.ok(pdf.subarray(-50).toString().includes("%%EOF"));
    assert.equal(pdf.toString("latin1").includes("03001234567"), false);
  }
});

test("investor endpoint rejects anonymous and staff requests and returns a private PDF for Super Admin", async () => {
  // Isolated test environment; no real database or production credentials are used.
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/pocket_test";
  process.env.JWT_SECRET = "investor-report-test-secret-only";
  const { createApp } = await import("../src/app.js");
  const { signToken } = await import("../src/lib/auth.js");
  const tx = snapshotMock();
  let snapshots = 0;
  const transaction = mock.method(prisma, "$transaction", async (callback: (tx: unknown) => unknown) => { snapshots++; return callback(tx); });
  const originalUserRead = prisma.user.findUnique;
  const originalGrants = prisma.userPermission.findMany;
  prisma.user.findUnique = (async ({ where }: { where: { id: string } }) => ({
    id: where.id, isActive: true, role: { code: where.id === "super" ? "SUPER_ADMIN" : "POS_STAFF" }, email: "test@example.test", username: "test", name: "Test"
  })) as typeof prisma.user.findUnique;
  prisma.userPermission.findMany = (async () => [{ permission: { isActive: true, key: "OVERVIEW" } }]) as typeof prisma.userPermission.findMany;
  const server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/admin/dashboard/investor-report`;
  try {
    assert.equal((await fetch(url)).status, 401);
    const staff = signToken({ sub: "staff", role: "POS_STAFF", email: "test@example.test" });
    assert.equal((await fetch(url, { headers: { Authorization: `Bearer ${staff}` } })).status, 403);
    assert.equal(snapshots, 0);
    const superToken = signToken({ sub: "super", role: "SUPER_ADMIN", email: "test@example.test" });
    const response = await fetch(url, { headers: { Authorization: `Bearer ${superToken}`, "x-branch-id": "unrelated-branch" } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /application\/pdf/);
    assert.match(response.headers.get("content-disposition") ?? "", /attachment; filename="Pocket_Investor_Report/);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
    assert.equal(snapshots, 1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    transaction.mock.restore();
    prisma.user.findUnique = originalUserRead;
    prisma.userPermission.findMany = originalGrants;
  }
});
