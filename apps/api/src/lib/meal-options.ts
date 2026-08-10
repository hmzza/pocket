import { Prisma, type PrismaClient } from "@prisma/client";

type MealOptionClient = PrismaClient | Prisma.TransactionClient;

export const MEAL_CATEGORY_SLUG = "make-it-a-meal";
export const THELA_FRIES_SLUG = "thela-fries";
export const BEVERAGE_CATEGORY_SLUGS = ["soft-drinks", "ice-cream-shakes", "chillers"] as const;
export const MEAL_PAIRING_GROUP_NAME = "Choose your meal pairing";

const BEVERAGE_CATEGORY_ORDER = new Map<string, number>(
  BEVERAGE_CATEGORY_SLUGS.map((slug, index) => [slug, index])
);

export function mealOptionNameFor(productName: string, categorySlug: string) {
  const displayName = categorySlug === "ice-cream-shakes" && !/shake/i.test(productName)
    ? `${productName} Shake`
    : productName;
  return `Fries + ${displayName}`;
}

function priceForCategory(categorySlug: string) {
  if (categorySlug === "soft-drinks") return 250;
  if (categorySlug === "ice-cream-shakes") return 450;
  if (categorySlug === "chillers") return 550;
  return 0;
}

export async function syncMealPairingOptions(client: MealOptionClient) {
  const [beverages, mealProducts] = await Promise.all([
    client.product.findMany({
      where: {
        isActive: true,
        category: { slug: { in: [...BEVERAGE_CATEGORY_SLUGS] } }
      },
      select: {
        id: true,
        name: true,
        category: { select: { slug: true, sortOrder: true } },
        sortOrder: true
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }]
    }),
    client.product.findMany({
      where: {
        isActive: true,
        category: { slug: MEAL_CATEGORY_SLUG }
      },
      select: { id: true, slug: true }
    })
  ]);

  if (!mealProducts.length) {
    return;
  }

  const sortedBeverages = beverages.slice().sort((left, right) => {
    const leftCategoryOrder = BEVERAGE_CATEGORY_ORDER.get(left.category.slug) ?? BEVERAGE_CATEGORY_SLUGS.length;
    const rightCategoryOrder = BEVERAGE_CATEGORY_ORDER.get(right.category.slug) ?? BEVERAGE_CATEGORY_SLUGS.length;
    if (leftCategoryOrder !== rightCategoryOrder) return leftCategoryOrder - rightCategoryOrder;
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    return left.name.localeCompare(right.name);
  });

  const targetOptions = sortedBeverages.map((beverage, index) => ({
    name: mealOptionNameFor(beverage.name, beverage.category.slug),
    priceDelta: priceForCategory(beverage.category.slug),
    sortOrder: index + 1
  }));

  for (const mealProduct of mealProducts) {
    const existingGroup = await client.addOnGroup.findFirst({
      where: { productId: mealProduct.id, name: MEAL_PAIRING_GROUP_NAME },
      include: { options: true }
    });

    const group = existingGroup
      ? existingGroup.minSelect === 1 && existingGroup.maxSelect === 1 && existingGroup.isRequired
        ? existingGroup
        : await client.addOnGroup.update({
            where: { id: existingGroup.id },
            data: {
              minSelect: 1,
              maxSelect: 1,
              isRequired: true
            },
            include: { options: true }
          })
      : await client.addOnGroup.create({
          data: {
            productId: mealProduct.id,
            name: MEAL_PAIRING_GROUP_NAME,
            minSelect: 1,
            maxSelect: 1,
            isRequired: true,
            sortOrder: mealProduct.slug === "pocket-mai-rocket-make-it-a-meal" ? 2 : 1
          },
          include: { options: true }
        });

    const optionsByName = new Map(group.options.map((option) => [option.name, option]));
    const activeOptionIds: string[] = [];

    for (const option of targetOptions) {
      const existingOption = optionsByName.get(option.name);
      if (existingOption) {
        if (
          Number(existingOption.priceDelta) !== option.priceDelta ||
          existingOption.sortOrder !== option.sortOrder ||
          !existingOption.isActive
        ) {
          const updated = await client.addOnOption.update({
            where: { id: existingOption.id },
            data: {
              priceDelta: option.priceDelta,
              sortOrder: option.sortOrder,
              isActive: true
            },
            select: { id: true }
          });
          activeOptionIds.push(updated.id);
        } else {
          activeOptionIds.push(existingOption.id);
        }
        continue;
      }

      const created = await client.addOnOption.create({
        data: {
          groupId: group.id,
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
}
