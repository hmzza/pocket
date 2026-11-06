import { Prisma } from "@prisma/client";
import { businessMonthRange, getBusinessDateKey } from "./business-day.js";
import { cents, REPORT_FOODPANDA_COMMISSION_RATE } from "./investor-report-data.js";
import { prisma } from "./prisma.js";

type Amount = number | string | { toString(): string };
export type PnlOrder = {
  status: string; paymentStatus: string; serviceType: string; subtotal: Amount;
  discountAmount: Amount; totalAmount: Amount; taxAmount: Amount; deliveryFee: Amount;
};
export type PnlExpense = {
  title: string; category: string; amount: Amount; stockTransactionId: string | null;
  fixedExpenseOccurrence: { status: string } | null;
};

/** A month closes at 06:00 PKT on the first day of the next month. */
export function lastCompletePnlMonth(now = new Date()) {
  const current = getBusinessDateKey(now).slice(0, 7);
  const monthKey = new Date(Date.UTC(Number(current.slice(0, 4)), Number(current.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  return {
    monthKey, ...businessMonthRange(monthKey),
    label: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", month: "long", year: "numeric" }).format(new Date(`${monthKey}-15T12:00:00Z`))
  };
}

function isFoodpandaFee(expense: PnlExpense) {
  // Only explicitly named marketplace fee entries replace the estimate. Do not
  // infer that unrelated delivery, marketing or packaging spending is a fee.
  const pattern = /\bfood\s*panda[\s-]+(?:commission|fees?|charges?|deductions?)\b|\b(?:commission|fees?|charges?|deductions?)[\s-]+(?:to[\s-]+)?food\s*panda\b/i;
  return !expense.stockTransactionId && (pattern.test(expense.title) || pattern.test(expense.category) || pattern.test(`${expense.title} ${expense.category}`));
}

export function createPnlAccumulator() {
  const sales = {
    allOrders: 0, orders: 0, excludedOrders: 0, openOrders: 0, openValue: 0,
    subtotal: 0, discounts: 0, total: 0, tax: 0, delivery: 0, foodpanda: 0,
    paid: 0, fulfilledWithoutPayment: 0, paidAwaitingFulfilment: 0, arithmeticExceptions: 0
  };
  const costs = { total: 0, stock: 0, unpaidFixed: 0, ledgerMarketplace: 0, ledgerMarketplaceEntries: 0, entries: 0 };
  const channels = new Map<string, { label: string; orders: number; revenue: number }>();
  const categories = new Map<string, { label: string; amount: number; entries: number; lines: Map<string, { title: string; amount: number; entries: number; unpaid: number; stock: boolean }> }>();
  function addOrder(order: PnlOrder) {
    sales.allOrders++;
    if (order.status === "CANCELLED" || ["REFUNDED", "FAILED"].includes(order.paymentStatus)) { sales.excludedOrders++; return; }
    if (order.paymentStatus !== "PAID" && order.status !== "DELIVERED") {
      sales.openOrders++; sales.openValue += cents(order.totalAmount); return;
    }
    const total = cents(order.totalAmount), tax = cents(order.taxAmount), delivery = cents(order.deliveryFee);
    const subtotal = cents(order.subtotal), discount = cents(order.discountAmount);
    sales.orders++; sales.total += total; sales.tax += tax; sales.delivery += delivery;
    sales.subtotal += subtotal; sales.discounts += discount;
    if (order.serviceType === "FOODPANDA") sales.foodpanda += total;
    if (order.paymentStatus === "PAID") sales.paid += total;
    else sales.fulfilledWithoutPayment += total;
    if (order.paymentStatus === "PAID" && order.status !== "DELIVERED") sales.paidAwaitingFulfilment += total;
    if (Math.abs(subtotal - discount + tax + delivery - total) > 1) sales.arithmeticExceptions++;
    const bucket = channels.get(order.serviceType) ?? { label: order.serviceType, orders: 0, revenue: 0 };
    bucket.orders++; bucket.revenue += total - tax; channels.set(order.serviceType, bucket);
  }
  function addExpense(expense: PnlExpense) {
    const amount = cents(expense.amount);
    const unpaid = expense.fixedExpenseOccurrence?.status !== undefined && expense.fixedExpenseOccurrence.status !== "PAID" ? amount : 0;
    costs.total += amount; costs.unpaidFixed += unpaid; costs.entries++;
    if (expense.stockTransactionId) costs.stock += amount;
    if (isFoodpandaFee(expense)) { costs.ledgerMarketplace += amount; costs.ledgerMarketplaceEntries++; }
    const label = expense.category.trim() || "Uncategorised";
    const categoryKey = label.toLowerCase();
    const category = categories.get(categoryKey) ?? { label, amount: 0, entries: 0, lines: new Map() };
    category.amount += amount; category.entries++;
    const title = expense.title.trim() || "Untitled expense";
    const lineKey = `${title.toLowerCase()}|${Boolean(expense.stockTransactionId)}`;
    const line = category.lines.get(lineKey) ?? { title, amount: 0, entries: 0, unpaid: 0, stock: Boolean(expense.stockTransactionId) };
    line.amount += amount; line.entries++; line.unpaid += unpaid;
    category.lines.set(lineKey, line); categories.set(categoryKey, category);
  }
  function finish() {
    const feeSource = costs.ledgerMarketplaceEntries ? "ledger" : sales.foodpanda ? "estimate" : "none";
    const marketplaceFee = feeSource === "ledger" ? costs.ledgerMarketplace : Math.round(sales.foodpanda * REPORT_FOODPANDA_COMMISSION_RATE);
    const feeAdjustment = feeSource === "estimate" ? marketplaceFee : 0;
    const revenue = sales.total - sales.tax;
    const expenseTotal = costs.total + feeAdjustment;
    return {
      sales, costs, feeSource, marketplaceFee, feeAdjustment, revenue, expenseTotal,
      otherCosts: costs.total - costs.stock - costs.ledgerMarketplace,
      profit: revenue - expenseTotal,
      reconciliationAdjustment: revenue - (sales.subtotal - sales.discounts + sales.delivery),
      channels: [...channels.values()].sort((a, b) => b.revenue - a.revenue),
      categories: [...categories.values()].sort((a, b) => b.amount - a.amount).map((category) => ({
        ...category, lines: [...category.lines.values()].sort((a, b) => b.amount - a.amount)
      }))
    };
  }
  return { addOrder, addExpense, finish };
}

const orderSelect = {
  id: true, status: true, paymentStatus: true, serviceType: true, subtotal: true,
  discountAmount: true, totalAmount: true, taxAmount: true, deliveryFee: true
} satisfies Prisma.OrderSelect;
const expenseSelect = {
  id: true, title: true, category: true, amount: true, stockTransactionId: true,
  fixedExpenseOccurrence: { select: { status: true } }
} satisfies Prisma.ExpenseSelect;

export async function loadProfitLossReport(now = new Date()) {
  const period = lastCompletePnlMonth(now);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const accumulator = createPnlAccumulator();
    let cursor: string | undefined;
    for (;;) {
      const batch: Prisma.OrderGetPayload<{ select: typeof orderSelect }>[] = await tx.order.findMany({
        where: { placedAt: { gte: period.start, lte: period.end } }, select: orderSelect,
        orderBy: { id: "asc" }, take: 500, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
      });
      batch.forEach(accumulator.addOrder);
      if (batch.length < 500) break;
      cursor = batch.at(-1)!.id;
    }
    cursor = undefined;
    for (;;) {
      const batch: Prisma.ExpenseGetPayload<{ select: typeof expenseSelect }>[] = await tx.expense.findMany({
        where: { expenseDate: { gte: period.start, lte: period.end } }, select: expenseSelect,
        orderBy: { id: "asc" }, take: 500, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
      });
      batch.forEach(accumulator.addExpense);
      if (batch.length < 500) break;
      cursor = batch.at(-1)!.id;
    }
    const branches = await tx.branch.findMany({ select: { name: true, isActive: true }, orderBy: { name: "asc" } });
    return { ...accumulator.finish(), period, generatedAt: now, branches };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 10000, timeout: 60000 });
}

export type ProfitLossReport = Awaited<ReturnType<typeof loadProfitLossReport>>;
