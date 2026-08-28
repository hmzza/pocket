import { Prisma, type PrismaClient } from "@prisma/client";

type MealOptionClient = PrismaClient | Prisma.TransactionClient;

export const MEAL_CATEGORY_SLUG = "make-it-a-meal";
export const CANONICAL_MEAL_PRODUCT_SLUG = "make-it-a-meal";
export const THELA_FRIES_SLUG = "thela-fries";
export const BEVERAGE_CATEGORY_SLUGS = ["soft-drinks", "ice-cream-shakes", "chillers"] as const;
export const MEAL_PAIRING_GROUP_NAME = "Choose your meal pairing";
export const MEAL_BASE_PRICE = 250;

const BEVERAGE_CATEGORY_ORDER = new Map<string, number>(
  BEVERAGE_CATEGORY_SLUGS.map((slug, index) => [slug, index])
);

export function isCanonicalMealProduct(product: { slug?: string | null; category?: { slug?: string | null } | null }) {
  return product.slug === CANONICAL_MEAL_PRODUCT_SLUG && product.category?.slug === MEAL_CATEGORY_SLUG;
}

export function isLegacyMealProduct(product: { slug?: string | null; category?: { slug?: string | null } | null }) {
  return product.category?.slug === MEAL_CATEGORY_SLUG && product.slug !== CANONICAL_MEAL_PRODUCT_SLUG;
}

export function mealOptionNameFor(productName: string, categorySlug: string) {
  const displayName = categorySlug === "ice-cream-shakes" && !/shake/i.test(productName)
    ? `${productName} Shake`
    : productName;
  return `Fries + ${displayName}`;
}

export function mealPriceForCategory(categorySlug: string) {
  if (categorySlug === "soft-drinks") return MEAL_BASE_PRICE;
  if (categorySlug === "ice-cream-shakes") return 450;
  if (categorySlug === "chillers") return 550;
  return 0;
}

export function mealPriceDeltaForCategory(categorySlug: string) {
  return Math.max(0, mealPriceForCategory(categorySlug) - MEAL_BASE_PRICE);
}

export async function getAvailableMealBeverageIds(client: MealOptionClient, branchId: string) {
  const branchProducts = await client.branchProduct.findMany({
    where: {
      branchId,
      isAvailable: true,
      product: {
        isActive: true,
        category: {
          isActive: true,
          slug: { in: [...BEVERAGE_CATEGORY_SLUGS] }
        }
      }
    },
    select: { productId: true }
  });

  return new Set(branchProducts.map((entry) => entry.productId));
}

export function filterMealProductOptions<T extends {
  slug?: string | null;
  category?: { slug?: string | null } | null;
  addOnGroups?: Array<{
    name: string;
    options: Array<{ linkedProductId?: string | null }>;
  }>;
}>(products: T[], availableBeverageIds: Set<string>) {
  return products
    .filter((product) => !isLegacyMealProduct(product))
    .map((product) => {
      if (!isCanonicalMealProduct(product)) return product;

      return {
        ...product,
        addOnGroups: (product.addOnGroups ?? []).map((group) =>
          group.name === MEAL_PAIRING_GROUP_NAME
            ? {
                ...group,
                options: group.options.filter((option) => option.linkedProductId && availableBeverageIds.has(option.linkedProductId))
              }
            : group
        )
      };
    });
}

let activeMealSync: Promise<void> | null = null;

export function syncMealPairingOptions(client: MealOptionClient) {
  if (activeMealSync) return activeMealSync;

  activeMealSync = syncMealPairingOptionsInternal(client).finally(() => {
    activeMealSync = null;
  });
  return activeMealSync;
}

async function syncMealPairingOptionsInternal(client: MealOptionClient) {
  const [beverages, mealProduct] = await Promise.all([
    client.product.findMany({
      where: {
        isActive: true,
        category: {
          isActive: true,
          slug: { in: [...BEVERAGE_CATEGORY_SLUGS] }
        }
      },
      select: {
        id: true,
        name: true,
        category: { select: { slug: true, sortOrder: true } },
        sortOrder: true
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }]
    }),
    client.product.findFirst({
      where: {
        isActive: true,
        slug: CANONICAL_MEAL_PRODUCT_SLUG,
        category: { slug: MEAL_CATEGORY_SLUG }
      },
      select: { id: true }
    })
  ]);

  if (!mealProduct) return;

  const sortedBeverages = beverages.slice().sort((left, right) => {
    const leftCategoryOrder = BEVERAGE_CATEGORY_ORDER.get(left.category.slug) ?? BEVERAGE_CATEGORY_SLUGS.length;
    const rightCategoryOrder = BEVERAGE_CATEGORY_ORDER.get(right.category.slug) ?? BEVERAGE_CATEGORY_SLUGS.length;
    if (leftCategoryOrder !== rightCategoryOrder) return leftCategoryOrder - rightCategoryOrder;
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    return left.name.localeCompare(right.name);
  });

  const targetOptions = sortedBeverages.map((beverage, index) => ({
    linkedProductId: beverage.id,
    name: mealOptionNameFor(beverage.name, beverage.category.slug),
    priceDelta: mealPriceDeltaForCategory(beverage.category.slug),
    sortOrder: index + 1
  }));

  const existingGroup = await client.addOnGroup.findFirst({
    where: { productId: mealProduct.id, name: MEAL_PAIRING_GROUP_NAME },
    include: { options: true }
  });

  const group = existingGroup
    ? existingGroup.minSelect === 1 && existingGroup.maxSelect === 1 && existingGroup.isRequired
      ? existingGroup
      : await client.addOnGroup.update({
          where: { id: existingGroup.id },
          data: { minSelect: 1, maxSelect: 1, isRequired: true },
          include: { options: true }
        })
    : await client.addOnGroup.create({
        data: {
          productId: mealProduct.id,
          name: MEAL_PAIRING_GROUP_NAME,
          minSelect: 1,
          maxSelect: 1,
          isRequired: true,
          sortOrder: 1
        },
        include: { options: true }
      });

  const optionsByProductId = new Map(group.options.filter((option) => option.linkedProductId).map((option) => [option.linkedProductId!, option]));
  const optionsByName = new Map(group.options.map((option) => [option.name, option]));
  const activeOptionIds: string[] = [];

  for (const option of targetOptions) {
    const existingOption = optionsByProductId.get(option.linkedProductId) ?? optionsByName.get(option.name);
    if (existingOption) {
      const updated = await client.addOnOption.update({
        where: { id: existingOption.id },
        data: {
          linkedProductId: option.linkedProductId,
          name: option.name,
          priceDelta: option.priceDelta,
          sortOrder: option.sortOrder,
          isActive: true
        },
        select: { id: true }
      });
      activeOptionIds.push(updated.id);
      continue;
    }

    const created = await client.addOnOption.create({
      data: {
        groupId: group.id,
        linkedProductId: option.linkedProductId,
        name: option.name,
        priceDelta: option.priceDelta,
        sortOrder: option.sortOrder,
        isActive: true
      },
      select: { id: true }
    });
    activeOptionIds.push(created.id);
  }

  await client.addOnOption.updateMany({
    where: {
      groupId: group.id,
      id: { notIn: activeOptionIds }
    },
    data: { isActive: false }
  });
}
