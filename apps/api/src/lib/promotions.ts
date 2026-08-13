import type { PrismaClient } from "@prisma/client";

export const INDEPENDENCE_PROMOTION_KEY = "promotion.independence-day";
export const INDEPENDENCE_PROMOTION_NAME = "Independence Day Offer";
export const INDEPENDENCE_PROMOTION_THRESHOLD = 3;

type PromotionClient = Pick<PrismaClient, "setting" | "category" | "product" | "branchProduct">;

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

export async function readIndependencePromotion(client: PromotionClient, branchId: string): Promise<IndependencePromotion> {
  const setting = await client.setting.findUnique({ where: { key: INDEPENDENCE_PROMOTION_KEY } });
  const settingValue = setting?.value && typeof setting.value === "object" && !Array.isArray(setting.value)
    ? setting.value as { isActive?: boolean }
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
  await client.setting.upsert({
    where: { key: INDEPENDENCE_PROMOTION_KEY },
    update: { value: { isActive } },
    create: { key: INDEPENDENCE_PROMOTION_KEY, value: { isActive } }
  });
}
