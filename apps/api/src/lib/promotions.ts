import type { PrismaClient } from "@prisma/client";
import { getBusinessDateKey, formatPakistanDate } from "./business-day.js";

export const INDEPENDENCE_PROMOTION_KEY = "promotion.independence-day";
export const INDEPENDENCE_PROMOTION_NAME = "Independence Day Offer";
export const INDEPENDENCE_PROMOTION_THRESHOLD = 3;

type PromotionClient = Pick<PrismaClient, "setting" | "category" | "product" | "branchProduct">;
type PromotionStatsClient = Pick<PrismaClient, "order" | "setting">;

type PromotionSettingValue = {
  isActive?: boolean;
  activePeriods?: Array<{ start: string; end?: string | null }>;
};

export type IndependencePromotion = {
  key: string;
  name: string;
  isActive: boolean;
  threshold: number;
  eligibleCategorySlug: "shawarma";
  rewardProductSlug: "loaded-fries";
  rewardProductId: string | null;
  rewardProductName: string;
  rewardUnitPrice: number | null;
  appliesTo: ["INSHOP", "TAKEAWAY"];
  available: boolean;
  unavailableReason?: string;
};

export type PromotionStatsRange = {
  preset: string;
  label: string;
  start?: Date;
  end?: Date;
};

export type PromotionStats = {
  range: PromotionStatsRange;
  promotionOrders: number;
  totalOrders: number;
  participationRate: number;
  netRevenue: number;
  grossSales: number;
  promotionDiscount: number;
  averageOrderValue: number;
  freeRewardUnits: number;
  averageDiscountPerOrder: number;
  discountRate: number;
  trend: Array<{ date: string; label: string; orders: number; netRevenue: number; discount: number }>;
};

export async function readIndependencePromotion(client: PromotionClient, branchId: string): Promise<IndependencePromotion> {
  const setting = await client.setting.findUnique({ where: { key: INDEPENDENCE_PROMOTION_KEY } });
  const settingValue = setting?.value && typeof setting.value === "object" && !Array.isArray(setting.value)
    ? setting.value as PromotionSettingValue
    : {};
  const category = await client.category.findUnique({ where: { slug: "shawarma" }, select: { id: true, isActive: true } });
  const rewardProduct = await client.product.findUnique({
    where: { slug: "loaded-fries" },
    select: { id: true, name: true, isActive: true, category: { select: { isActive: true } } }
  });
  const branchPrice = rewardProduct
    ? await client.branchProduct.findUnique({ where: { branchId_productId: { branchId, productId: rewardProduct.id } }, select: { price: true, isAvailable: true } })
    : null;
  const available = Boolean(category?.isActive && rewardProduct?.isActive && rewardProduct.category.isActive && branchPrice?.isAvailable !== false && branchPrice);

  return {
    key: INDEPENDENCE_PROMOTION_KEY,
    name: INDEPENDENCE_PROMOTION_NAME,
    isActive: Boolean(settingValue.isActive),
    threshold: INDEPENDENCE_PROMOTION_THRESHOLD,
    eligibleCategorySlug: "shawarma",
    rewardProductSlug: "loaded-fries",
    rewardProductId: rewardProduct?.id ?? null,
    rewardProductName: rewardProduct?.name ?? "Loaded Fries",
    rewardUnitPrice: branchPrice ? Number(branchPrice.price) : null,
    appliesTo: ["INSHOP", "TAKEAWAY"],
    available,
    ...(available ? {} : { unavailableReason: !category?.isActive ? "Shawarma category is unavailable." : !rewardProduct?.isActive ? "Loaded Fries product is unavailable." : "Loaded Fries is unavailable for this branch." })
  };
}

export async function saveIndependencePromotion(client: PromotionClient, isActive: boolean) {
  const current = await client.setting.findUnique({ where: { key: INDEPENDENCE_PROMOTION_KEY } });
  const value = current?.value && typeof current.value === "object" && !Array.isArray(current.value)
    ? current.value as PromotionSettingValue
    : {};
  const periods = [...(value.activePeriods ?? [])];
  const openPeriod = periods.find((period) => !period.end);
  if (isActive && !openPeriod) periods.push({ start: new Date().toISOString() });
  if (!isActive && openPeriod) openPeriod.end = new Date().toISOString();
  const nextValue = { isActive, activePeriods: periods };
  await client.setting.upsert({
    where: { key: INDEPENDENCE_PROMOTION_KEY },
    update: { value: nextValue },
    create: { key: INDEPENDENCE_PROMOTION_KEY, value: nextValue }
  });
}

export async function readPromotionStats(client: PromotionStatsClient, branchId: string, range: PromotionStatsRange): Promise<PromotionStats> {
  const setting = await client.setting.findUnique({ where: { key: INDEPENDENCE_PROMOTION_KEY } });
  const settingValue = setting?.value && typeof setting.value === "object" && !Array.isArray(setting.value)
    ? setting.value as PromotionSettingValue
    : {};
  const orders = await client.order.findMany({
    where: {
      branchId,
      channel: "POS",
      status: { not: "CANCELLED" },
      ...(range.start && range.end ? { placedAt: { gte: range.start, lte: range.end } } : {})
    },
    select: {
      placedAt: true,
      subtotal: true,
      totalAmount: true,
      promotionName: true,
      promotionDiscountAmount: true,
      items: { select: { promotionFreeQuantity: true } }
    },
    orderBy: { placedAt: "asc" }
  });
  const promotionOrders = orders.filter((order) => order.promotionName === INDEPENDENCE_PROMOTION_NAME);
  let scopedOrders = orders;
  if (range.preset === "all") {
    let periods = (settingValue.activePeriods ?? [])
      .map((period) => ({ start: new Date(period.start), end: period.end ? new Date(period.end) : new Date() }))
      .filter((period) => !Number.isNaN(period.start.getTime()) && !Number.isNaN(period.end.getTime()));
    if (!periods.length && promotionOrders.length) {
      periods = [{ start: promotionOrders[0]!.placedAt, end: settingValue.isActive ? new Date() : promotionOrders[promotionOrders.length - 1]!.placedAt }];
    }
    scopedOrders = orders.filter((order) => periods.some((period) => order.placedAt >= period.start && order.placedAt <= period.end));
  }
  const scopedPromotionOrders = scopedOrders.filter((order) => order.promotionName === INDEPENDENCE_PROMOTION_NAME);
  const numberValue = (value: unknown) => Number(value ?? 0);
  const grossSales = scopedPromotionOrders.reduce((sum, order) => sum + numberValue(order.subtotal), 0);
  const netRevenue = scopedPromotionOrders.reduce((sum, order) => sum + numberValue(order.totalAmount), 0);
  const promotionDiscount = scopedPromotionOrders.reduce((sum, order) => sum + numberValue(order.promotionDiscountAmount), 0);
  const freeRewardUnits = scopedPromotionOrders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.promotionFreeQuantity, 0), 0);
  const trendMap = new Map<string, { orders: number; netRevenue: number; discount: number }>();
  for (const order of scopedPromotionOrders) {
    const date = getBusinessDateKey(order.placedAt);
    const current = trendMap.get(date) ?? { orders: 0, netRevenue: 0, discount: 0 };
    current.orders += 1;
    current.netRevenue += numberValue(order.totalAmount);
    current.discount += numberValue(order.promotionDiscountAmount);
    trendMap.set(date, current);
  }
  return {
    range,
    promotionOrders: scopedPromotionOrders.length,
    totalOrders: scopedOrders.length,
    participationRate: scopedOrders.length ? (scopedPromotionOrders.length / scopedOrders.length) * 100 : 0,
    netRevenue,
    grossSales,
    promotionDiscount,
    averageOrderValue: scopedPromotionOrders.length ? netRevenue / scopedPromotionOrders.length : 0,
    freeRewardUnits,
    averageDiscountPerOrder: scopedPromotionOrders.length ? promotionDiscount / scopedPromotionOrders.length : 0,
    discountRate: grossSales ? (promotionDiscount / grossSales) * 100 : 0,
    trend: [...trendMap.entries()].map(([date, values]) => ({ date, label: formatPakistanDate(new Date(`${date}T06:00:00+05:00`), { month: "short", day: "numeric" }), ...values }))
  };
}
