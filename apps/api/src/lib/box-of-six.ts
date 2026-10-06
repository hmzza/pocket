import { Prisma, type PrismaClient } from "@prisma/client";

type BoxOptionClient = PrismaClient | Prisma.TransactionClient;

export const BOX_OF_SIX_SIZE = 6;
export const BOX_OF_SIX_DISPLAY_NAME = "Box of 6";
export const BOX_OF_SIX_GROUP_NAME = "Choose your box items";

function normalized(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function isBoxOfSixProduct(product: { name?: string | null; slug?: string | null }) {
  const name = normalized(product.name);
  const slug = normalized(product.slug);
  return (
    /\bbox of 6\b/.test(name) ||
    /\bbox 6\b/.test(name) ||
    /\bbox of 6\b/.test(slug) ||
    /\bbox 6\b/.test(slug) ||
    slug === "box-of-6" ||
    slug === "box-6"
  );
}

export function isBoxOfSixTreat(product: { name?: string | null; slug?: string | null }) {
  if (isBoxOfSixProduct(product)) return false;
  const value = `${normalized(product.name)} ${normalized(product.slug)}`;
  return value.includes("cookie") || value.includes("brownie");
}

type BoxProduct = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  category?: { isActive?: boolean } | null;
  addOnGroups?: Array<{
    id: string;
    name: string;
    minSelect: number;
    maxSelect: number;
    isRequired: boolean;
    isActive: boolean;
    sortOrder: number;
    options: Array<{ id: string; linkedProductId: string | null; name: string; priceDelta: unknown; isActive: boolean; sortOrder: number }>;
  }>;
};

export type BoxOfSixConfig = {
  canonicalProductId: string | null;
  groupId: string | null;
  optionProductIds: string[];
};

let activeBoxSync: Promise<BoxOfSixConfig> | null = null;

function chooseCanonicalProduct(products: BoxProduct[]) {
  return products.slice().sort((left, right) => {
    const leftSlug = normalized(left.slug);
    const rightSlug = normalized(right.slug);
    const leftPreferred = leftSlug === "box-of-6" || leftSlug === "box-6" ? 0 : normalized(left.name) === "box of 6" ? 1 : 2;
    const rightPreferred = rightSlug === "box-of-6" || rightSlug === "box-6" ? 0 : normalized(right.name) === "box of 6" ? 1 : 2;
    return leftPreferred - rightPreferred || left.sortOrder - right.sortOrder || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
  })[0];
}

export function syncBoxOfSixOptions(client: BoxOptionClient): Promise<BoxOfSixConfig> {
  if (activeBoxSync) return activeBoxSync;

  activeBoxSync = syncBoxOfSixOptionsInternal(client).finally(() => {
    activeBoxSync = null;
  });
  return activeBoxSync;
}

async function syncBoxOfSixOptionsInternal(client: BoxOptionClient): Promise<BoxOfSixConfig> {
  const products = await client.product.findMany({
    where: {
      isActive: true,
      category: { is: { isActive: true } }
    },
    select: {
      id: true,
      name: true,
      slug: true,
      sortOrder: true,
      category: { select: { isActive: true } },
      addOnGroups: {
        orderBy: { sortOrder: "asc" },
        include: { options: { orderBy: { sortOrder: "asc" } } }
      }
    }
  });

  const boxProducts = products.filter(isBoxOfSixProduct);
  const treatCandidates = products.filter(isBoxOfSixTreat).sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  const namedTreats = treatCandidates.filter((product) => {
    const name = normalized(product.name);
    return (name.includes("chocolate chip") && name.includes("cookie")) || (name.includes("chocolate fudge") && name.includes("brownie"));
  });
  const treats = (namedTreats.length ? [...namedTreats, ...treatCandidates.filter((product) => !namedTreats.some((named) => named.id === product.id))] : treatCandidates).slice(0, 2);
  const canonical = chooseCanonicalProduct(boxProducts);
  if (!canonical || treats.length === 0) {
    return { canonicalProductId: canonical?.id ?? null, groupId: null, optionProductIds: treats.map((product) => product.id) };
  }

  const existingGroup = canonical.addOnGroups?.find((group) => {
    const groupName = normalized(group.name);
    return groupName === normalized(BOX_OF_SIX_GROUP_NAME) || groupName.includes("box") || groupName.includes("cookie") || groupName.includes("brownie");
  });

  const group = existingGroup
    ? await client.addOnGroup.update({
        where: { id: existingGroup.id },
        data: { name: BOX_OF_SIX_GROUP_NAME, minSelect: 1, maxSelect: 2, isRequired: true, isActive: true },
        include: { options: true }
      })
    : await client.addOnGroup.create({
        data: {
          productId: canonical.id,
          name: BOX_OF_SIX_GROUP_NAME,
          minSelect: 1,
          maxSelect: 2,
          isRequired: true,
          isActive: true,
          sortOrder: 1
        },
        include: { options: true }
      });

  const activeOptionIds: string[] = [];
  for (const [index, treat] of treats.entries()) {
    const existingOption = group.options.find((option) => option.linkedProductId === treat.id);
    const option = existingOption
      ? await client.addOnOption.update({
          where: { id: existingOption.id },
          data: { name: treat.name, priceDelta: 0, isActive: true, sortOrder: index + 1 },
          select: { id: true }
        })
      : await client.addOnOption.create({
          data: { groupId: group.id, linkedProductId: treat.id, name: treat.name, priceDelta: 0, isActive: true, sortOrder: index + 1 },
          select: { id: true }
        });
    activeOptionIds.push(option.id);
  }

  await client.addOnOption.updateMany({
    where: { groupId: group.id, id: { notIn: activeOptionIds } },
    data: { isActive: false }
  });

  return { canonicalProductId: canonical.id, groupId: group.id, optionProductIds: treats.map((product) => product.id) };
}

export function filterBoxOfSixProducts<T extends {
  id: string;
  name?: string | null;
  slug?: string | null;
  addOnGroups?: Array<{ name: string; options: Array<{ linkedProductId?: string | null }> }>;
}>(products: T[], config: BoxOfSixConfig, availableProductIds?: Set<string>) {
  return products
    .filter((product) => !isBoxOfSixProduct(product) || (product.id === config.canonicalProductId && Boolean(config.groupId)))
    .map((product) => {
      if (!isBoxOfSixProduct(product)) return product;
      return {
        ...product,
        name: BOX_OF_SIX_DISPLAY_NAME,
        addOnGroups: (product.addOnGroups ?? [])
          .filter((group) => normalized(group.name) === normalized(BOX_OF_SIX_GROUP_NAME))
          .map((group) => ({
            ...group,
            options: group.options.filter((option) => !option.linkedProductId || !availableProductIds || availableProductIds.has(option.linkedProductId))
          }))
      };
    })
    .filter((product) => !isBoxOfSixProduct(product) || (product.addOnGroups ?? []).some((group) => group.options.length > 0));
}

export function getBoxOfSixGroup<T extends { name: string; options: Array<unknown> }>(product: { addOnGroups?: T[] }) {
  return (product.addOnGroups ?? []).find((group) => normalized(group.name) === normalized(BOX_OF_SIX_GROUP_NAME));
}
