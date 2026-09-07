import { Prisma, type PrismaClient } from "@prisma/client";

type DealOptionClient = PrismaClient | Prisma.TransactionClient;

export const DEAL_CATEGORY_SLUG = "deals";

const POCKET_SLUGS = ["classic-pocket", "spicy-pocket"];
const WRAP_SLUGS = ["classic-wrap", "chipotle-wrap", "honey-mustard-wrap"];
const SAUCE_OPTIONS = ["Classic shawarma sauce", "Spicy jalapeno sauce"];

type DealGroupDefinition = {
  name: string;
  kind: "pocket" | "wrap" | "drink" | "sauce";
};

const DEAL_GROUPS: Record<string, DealGroupDefinition[]> = {
  "pocket-family": [
    { name: "Rocket 1 sauce", kind: "sauce" },
    { name: "Rocket 2 sauce", kind: "sauce" },
    { name: "Pocket 1", kind: "pocket" },
    { name: "Pocket 2", kind: "pocket" },
    { name: "Drink 1", kind: "drink" },
    { name: "Drink 2", kind: "drink" },
    { name: "Drink 3", kind: "drink" },
    { name: "Drink 4", kind: "drink" }
  ],
  "the-wrap-pack": [
    { name: "Wrap 1", kind: "wrap" },
    { name: "Wrap 2", kind: "wrap" },
    { name: "Wrap 3", kind: "wrap" },
    { name: "Drink 1", kind: "drink" },
    { name: "Drink 2", kind: "drink" },
    { name: "Drink 3", kind: "drink" }
  ],
  "og-trio": [
    { name: "Pocket 1", kind: "pocket" },
    { name: "Pocket 2", kind: "pocket" },
    { name: "Pocket 3", kind: "pocket" },
    { name: "Drink 1", kind: "drink" },
    { name: "Drink 2", kind: "drink" },
    { name: "Drink 3", kind: "drink" }
  ]
};

export function isDealProduct(product: { category?: { slug?: string | null } | null }) {
  return product.category?.slug === DEAL_CATEGORY_SLUG;
}

export function isDealComponentGroup(groupName: string) {
  return /^(Pocket|Wrap|Drink) \d+$/.test(groupName);
}

export async function getAvailableDealChoiceProductIds(client: DealOptionClient, branchId: string) {
  const products = await client.branchProduct.findMany({
    where: {
      branchId,
      isAvailable: true,
      product: { isActive: true, category: { isActive: true } }
    },
    select: { productId: true }
  });

  return new Set(products.map((entry) => entry.productId));
}

export function filterDealProductOptions<T extends {
  category?: { slug?: string | null } | null;
  addOnGroups?: Array<{
    options: Array<{ linkedProductId?: string | null }>;
  }>;
}>(products: T[], availableProductIds: Set<string>) {
  return products.map((product) => {
    if (!isDealProduct(product)) return product;

    return {
      ...product,
      addOnGroups: (product.addOnGroups ?? []).map((group) => ({
        ...group,
        options: group.options.filter((option) => !option.linkedProductId || availableProductIds.has(option.linkedProductId))
      }))
    };
  });
}

let activeDealSync: Promise<void> | null = null;

export function syncDealOptions(client: DealOptionClient) {
  if (activeDealSync) return activeDealSync;

  activeDealSync = syncDealOptionsInternal(client).finally(() => {
    activeDealSync = null;
  });
  return activeDealSync;
}

async function syncDealOptionsInternal(client: DealOptionClient) {
  const dealSlugs = Object.keys(DEAL_GROUPS);
  const [deals, pockets, wraps, drinks] = await Promise.all([
    client.product.findMany({
      where: { slug: { in: dealSlugs }, isActive: true, category: { slug: DEAL_CATEGORY_SLUG, isActive: true } },
      select: { id: true, slug: true }
    }),
    client.product.findMany({
      where: { slug: { in: POCKET_SLUGS }, isActive: true },
      select: { id: true, name: true, sortOrder: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    }),
    client.product.findMany({
      where: { slug: { in: WRAP_SLUGS }, isActive: true },
      select: { id: true, name: true, sortOrder: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    }),
    client.product.findMany({
      where: {
        isActive: true,
        category: { slug: "soft-drinks", isActive: true },
        NOT: [{ name: { contains: "water", mode: "insensitive" } }]
      },
      select: { id: true, name: true, sortOrder: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    })
  ]);

  const productsByKind = { pocket: pockets, wrap: wraps, drink: drinks };

  for (const deal of deals) {
    const definitions = DEAL_GROUPS[deal.slug] ?? [];
    for (const [groupIndex, definition] of definitions.entries()) {
      const existingGroup = await client.addOnGroup.findFirst({
        where: { productId: deal.id, name: definition.name },
        include: { options: true }
      });
      const group = existingGroup
        ? await client.addOnGroup.update({
            where: { id: existingGroup.id },
            data: { minSelect: 1, maxSelect: 1, isRequired: true, sortOrder: groupIndex + 1 },
            include: { options: true }
          })
        : await client.addOnGroup.create({
            data: {
              productId: deal.id,
              name: definition.name,
              minSelect: 1,
              maxSelect: 1,
              isRequired: true,
              sortOrder: groupIndex + 1
            },
            include: { options: true }
          });

      const targetOptions = definition.kind === "sauce"
        ? SAUCE_OPTIONS.map((name, index) => ({
            linkedProductId: null,
            name: `${definition.name}: ${name}`,
            sortOrder: index + 1
          }))
        : productsByKind[definition.kind].map((product, index) => ({
            linkedProductId: product.id,
            name: `${definition.name}: ${product.name}`,
            sortOrder: index + 1
          }));
      const activeOptionIds: string[] = [];

      for (const option of targetOptions) {
        const existingOption = group.options.find((entry) =>
          option.linkedProductId ? entry.linkedProductId === option.linkedProductId : !entry.linkedProductId && entry.name === option.name
        );
        const saved = existingOption
          ? await client.addOnOption.update({
              where: { id: existingOption.id },
              data: { ...option, priceDelta: 0, isActive: true },
              select: { id: true }
            })
          : await client.addOnOption.create({
              data: { groupId: group.id, ...option, priceDelta: 0, isActive: true },
              select: { id: true }
            });
        activeOptionIds.push(saved.id);
      }

      await client.addOnOption.updateMany({
        where: { groupId: group.id, id: { notIn: activeOptionIds } },
        data: { isActive: false }
      });
    }
  }
}
