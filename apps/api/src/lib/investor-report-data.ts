import { Prisma } from "@prisma/client";
import { BUSINESS_DAY_START_HOUR, PAKISTAN_UTC_OFFSET_MS, businessDayStart, getBusinessDateKey } from "./business-day.js";
import { prisma } from "./prisma.js";

export const INVESTOR_REPORT_START = "2026-06-01";
export const REPORT_FOODPANDA_COMMISSION_RATE = 0.38;
type Money = number | string | { toString(): string };
export const cents = (value: Money) => Math.round(Number(value.toString()) * 100);
export const rupees = (value: number) => value / 100;

export type ReportOrder = {
  branchId: string; placedAt: Date; status: string; paymentStatus: string; serviceType: string; paymentMethod?: string;
  customerId: string | null; customerPhone: string | null; customer: { phone: string | null } | null;
  totalAmount: Money; subtotal: Money; discountAmount: Money; taxAmount: Money; deliveryFee: Money;
  items: Array<{ productName: string; quantity: number; unitPrice: Money }>;
};
export type SalesBucket = { label: string; orders: number; sales: number };
export type MonthBucket = SalesBucket & {
  key: string; complete: boolean; expenses: number; stockPurchases: number; foodpanda: number;
  tax: number; delivery: number; discounts: number;
};

function customerKey(order: ReportOrder) {
  let phone = (order.customerPhone || order.customer?.phone || "").replace(/\D/g, "");
  if (phone.startsWith("0092")) phone = phone.slice(2);
  if (/^03\d{9}$/.test(phone)) phone = `92${phone.slice(1)}`;
  // Anonymous walk-ins must never be counted as one returning customer.
  if (/^923\d{9}$/.test(phone)) return `phone:${phone}`;
  return order.customerId ? `id:${order.customerId}` : null;
}

function addBucket(map: Map<string, SalesBucket>, key: string, sales: number) {
  const bucket = map.get(key) ?? { label: key, orders: 0, sales: 0 };
  bucket.orders++;
  bucket.sales += sales;
  map.set(key, bucket);
}

export function createReportAccumulator(now: Date) {
  const reportStart = businessDayStart(INVESTOR_REPORT_START);
  const months = new Map<string, MonthBucket>();
  const currentMonth = getBusinessDateKey(now).slice(0, 7);
  for (let date = businessDayStart(INVESTOR_REPORT_START); getBusinessDateKey(date).slice(0, 7) <= currentMonth;) {
    const key = getBusinessDateKey(date).slice(0, 7);
    months.set(key, {
      key, label: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", month: "short", year: "numeric" }).format(date),
      complete: key < currentMonth, orders: 0, sales: 0, expenses: 0, stockPurchases: 0,
      foodpanda: 0, tax: 0, delivery: 0, discounts: 0
    });
    date = businessDayStart(`${new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 1)).toISOString().slice(0, 7)}-01`);
  }
  const services = new Map<string, SalesBucket>();
  const branches = new Map<string, SalesBucket>();
  const days = new Map<string, SalesBucket>();
  const hours = new Map<string, SalesBucket>();
  const weekdays = new Map<string, SalesBucket>();
  const products = new Map<string, { label: string; units: number; lineSales: number }>();
  const customers = new Map<string, number>();
  const summary = {
    allOrders: 0, excludedOrders: 0, excludedValue: 0, openOrders: 0, openValue: 0,
    orders: 0, sales: 0, paidSales: 0, unverifiedSales: 0, identifiedOrders: 0,
    tax: 0, delivery: 0, discounts: 0, subtotal: 0, foodpanda: 0, golootloReceivables: 0, fulfilledOrders: 0,
    firstOrder: null as Date | null, lastOrder: null as Date | null, reconciliationExceptions: 0
  };
  function addOrder(order: ReportOrder) {
    if (order.placedAt < reportStart || order.placedAt > now) return;
    const total = cents(order.totalAmount);
    summary.allOrders++;
    if (order.status === "CANCELLED" || ["REFUNDED", "FAILED"].includes(order.paymentStatus)) {
      summary.excludedOrders++;
      summary.excludedValue += total;
      return;
    }
    // POS starts at CONFIRMED / UNSET; an unverified ticket is not evidence of realised sales.
    if (order.paymentStatus !== "PAID" && order.status !== "DELIVERED") {
      summary.openOrders++;
      summary.openValue += total;
      return;
    }
    // Pakistan has a fixed UTC offset. Compute this once per order instead of
    // constructing several Intl formatters for every ticket in the full history.
    const pakistanTime = new Date(order.placedAt.getTime() + PAKISTAN_UTC_OFFSET_MS);
    const businessTime = new Date(pakistanTime.getTime() - BUSINESS_DAY_START_HOUR * 3600000);
    const dayKey = businessTime.toISOString().slice(0, 10);
    const month = months.get(dayKey.slice(0, 7))!;
    const tax = cents(order.taxAmount), delivery = cents(order.deliveryFee), discount = cents(order.discountAmount);
    summary.orders++;
    summary.sales += total;
    summary.tax += tax;
    summary.delivery += delivery;
    summary.discounts += discount;
    summary.subtotal += cents(order.subtotal);
    summary.fulfilledOrders += order.status === "DELIVERED" ? 1 : 0;
    if (order.paymentStatus === "PAID" && order.paymentMethod === "GOLOOTLO") summary.golootloReceivables += total;
    if (order.paymentStatus === "PAID") summary.paidSales += total;
    else summary.unverifiedSales += total;
    if (Math.abs(cents(order.subtotal) - discount + tax + delivery - total) > 1) summary.reconciliationExceptions++;
    if (!summary.firstOrder || order.placedAt < summary.firstOrder) summary.firstOrder = order.placedAt;
    if (!summary.lastOrder || order.placedAt > summary.lastOrder) summary.lastOrder = order.placedAt;
    month.orders++; month.sales += total; month.tax += tax; month.delivery += delivery; month.discounts += discount;
    if (order.serviceType === "FOODPANDA") { summary.foodpanda += total; month.foodpanda += total; }
    addBucket(services, order.serviceType, total);
    addBucket(branches, order.branchId, total);
    addBucket(days, dayKey, total);
    addBucket(hours, String(pakistanTime.getUTCHours()), total);
    addBucket(weekdays, String(businessTime.getUTCDay()), total);
    const identity = customerKey(order);
    if (identity) { customers.set(identity, (customers.get(identity) ?? 0) + 1); summary.identifiedOrders++; }
    for (const item of order.items) {
      const product = products.get(item.productName) ?? { label: item.productName, units: 0, lineSales: 0 };
      product.units += item.quantity;
      product.lineSales += cents(item.unitPrice) * item.quantity;
      products.set(item.productName, product);
    }
  }
  function addExpense(date: Date, amount: Money, stockPurchase: boolean) {
    const month = months.get(getBusinessDateKey(date).slice(0, 7));
    if (!month || date > now || date < businessDayStart(INVESTOR_REPORT_START)) return;
    month.expenses += cents(amount);
    if (stockPurchase) month.stockPurchases += cents(amount);
  }
  function finish() {
    const sortSales = (map: Map<string, SalesBucket>) => [...map.values()].sort((a, b) => b.sales - a.sales);
    const today = businessDayStart(getBusinessDateKey(now)).getTime();
    const trailing = { orders: 0, sales: 0, previousOrders: 0, previousSales: 0 };
    for (const [key, bucket] of days) {
      const age = (today - businessDayStart(key).getTime()) / 86400000;
      if (age >= 1 && age <= 28) { trailing.orders += bucket.orders; trailing.sales += bucket.sales; }
      else if (age > 28 && age <= 56) { trailing.previousOrders += bucket.orders; trailing.previousSales += bucket.sales; }
    }
    return {
      summary, months: [...months.values()], services: sortSales(services), branches: sortSales(branches),
      hours: sortSales(hours), weekdays: sortSales(weekdays), trailing,
      products: [...products.values()].sort((a, b) => b.lineSales - a.lineSales),
      customers: { identified: customers.size, repeat: [...customers.values()].filter((count) => count > 1).length }
    };
  }
  return { addOrder, addExpense, finish };
}

const orderSelect = {
  id: true, branchId: true, placedAt: true, status: true, paymentStatus: true, serviceType: true, paymentMethod: true,
  customerId: true, customerPhone: true, customer: { select: { phone: true } }, totalAmount: true,
  subtotal: true, discountAmount: true, taxAmount: true, deliveryFee: true,
  items: { select: { productName: true, quantity: true, unitPrice: true } }
} satisfies Prisma.OrderSelect;

export async function loadInvestorReport(now = new Date()) {
  const start = businessDayStart(INVESTOR_REPORT_START);
  // A single, read-only snapshot prevents concurrent POS updates from making sections disagree.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const accumulator = createReportAccumulator(now);
    let cursor: string | undefined;
    for (;;) {
      const batch = await tx.order.findMany({
        where: { placedAt: { gte: start, lte: now } }, select: orderSelect,
        orderBy: { id: "asc" }, take: 500, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
      });
      for (const order of batch) accumulator.addOrder(order);
      if (batch.length < 500) break;
      cursor = batch[batch.length - 1]!.id;
    }
    const expenses = await tx.expense.findMany({
      where: { expenseDate: { gte: start, lte: now } },
      select: { amount: true, category: true, expenseDate: true, stockTransactionId: true,
        fixedExpenseOccurrence: { select: { status: true } } }
    });
    const categories = new Map<string, number>();
    let unpaidFixedExpenses = 0;
    for (const expense of expenses) {
      if (expense.fixedExpenseOccurrence && expense.fixedExpenseOccurrence.status !== "PAID") {
        unpaidFixedExpenses += cents(expense.amount); continue;
      }
      accumulator.addExpense(expense.expenseDate, expense.amount, expense.stockTransactionId !== null);
      const category = expense.category.trim() || "Uncategorised";
      categories.set(category, (categories.get(category) ?? 0) + cents(expense.amount));
    }
    const branches = await tx.branch.findMany({ select: { id: true, name: true, city: true, isActive: true }, orderBy: { name: "asc" } });
    const settlements = await tx.foodpandaSettlement.findMany({
      where: { weekStart: { gte: start }, weekEnd: { lte: now } },
      select: { status: true, grossSales: true, commission: true, otherCharges: true, amountReceived: true, expectedNet: true, receivedAt: true }
    });
    const loans = await tx.loan.aggregate({ where: { loanDate: { gte: start, lte: now } }, _sum: { amount: true } });
    const repayments = await tx.loanRepayment.aggregate({ where: { paymentDate: { gte: start, lte: now } }, _sum: { amount: true } });
    const allLoans = await tx.loan.aggregate({ where: { loanDate: { lte: now } }, _sum: { amount: true } });
    const allRepayments = await tx.loanRepayment.aggregate({ where: { paymentDate: { lte: now } }, _sum: { amount: true } });
    const investments = await tx.investmentPayment.aggregate({ where: { paymentDate: { gte: start, lte: now } }, _sum: { amount: true } });
    const additions = await tx.moneyAddition.aggregate({ where: { additionDate: { gte: start, lte: now } }, _sum: { amount: true } });
    const fixedExpenses = await tx.fixedExpense.aggregate({ where: { isActive: true }, _sum: { monthlyAmount: true } });
    const result = accumulator.finish();
    const partialSettlements = await tx.foodpandaSettlement.count({ where: {
      weekStart: { lte: now }, weekEnd: { gte: start }, OR: [{ weekStart: { lt: start } }, { weekEnd: { gt: now } }]
    } });
    return {
      ...result, generatedAt: now, start, unpaidFixedExpenses,
      expenseCategories: [...categories].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount),
      branchDirectory: branches,
      expenses: result.months.reduce((sum, month) => sum + month.expenses, 0),
      stockPurchases: result.months.reduce((sum, month) => sum + month.stockPurchases, 0),
      capital: {
        loans: cents(loans._sum.amount ?? 0), repayments: cents(repayments._sum.amount ?? 0),
        outstandingLoans: cents(allLoans._sum.amount ?? 0) - cents(allRepayments._sum.amount ?? 0),
        investments: cents(investments._sum.amount ?? 0), additions: cents(additions._sum.amount ?? 0),
        currentMonthlyFixed: cents(fixedExpenses._sum.monthlyAmount ?? 0)
      },
      settlements: {
        count: settlements.filter((s) => s.status === "RECEIVED").length, partial: partialSettlements,
        gross: settlements.filter((s) => s.status === "RECEIVED").reduce((sum, s) => sum + cents(s.grossSales), 0),
        charges: settlements.filter((s) => s.status === "RECEIVED").reduce((sum, s) => sum + cents(s.commission) + cents(s.otherCharges), 0),
        received: settlements.filter((s) => s.status === "RECEIVED" && s.receivedAt && s.receivedAt <= now).reduce((sum, s) => sum + cents(s.amountReceived ?? 0), 0)
      }
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 10000, timeout: 60000 });
}

export type InvestorReportData = Awaited<ReturnType<typeof loadInvestorReport>>;
