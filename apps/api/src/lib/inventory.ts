import { InventoryTransactionType, Prisma, ServiceType, type PrismaClient } from "@prisma/client";
import { OPTION_RECIPE_BY_NAME } from "./inventory-config.js";
import { BEVERAGE_CATEGORY_SLUGS, MEAL_CATEGORY_SLUG, THELA_FRIES_SLUG, mealOptionNameFor } from "./meal-options.js";

type InventoryOrderItem = {
  productId?: string | null;
  quantity: number;
  addOns?: Array<{
    optionName: string;
    linkedProductId?: string | null;
  }>;
  bundleComponents?: Array<{
    productId?: string | null;
    quantity: number;
  }>;
};

type ApplyOrderInventoryArgs = {
  transaction: Prisma.TransactionClient;
  branchId: string;
  orderId: string;
  actorId?: string | null;
  items: InventoryOrderItem[];
  mode: "consume" | "return";
  serviceType?: ServiceType | string;
};

type RecordInventoryChangeArgs = {
  transaction: Prisma.TransactionClient;
  branchId: string;
  ingredientId: string;
  quantityDelta: number;
  type: InventoryTransactionType;
  actorId?: string | null;
  note?: string;
  referenceType?: string;
  referenceId?: string;
  vendorName?: string;
  purchaseDate?: Date;
  purchaseCost?: number;
  purchaseQuantity?: number;
  purchaseUnitId?: string;
  purchaseUnitLabel?: string;
  wastageReason?: string;
};

function roundQuantity(value: number) {
  return Number(value.toFixed(3));
}

function isMissingTableError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && ["P2021", "P2022"].includes(error.code);
}

export async function recordInventoryChange({
  transaction,
  branchId,
  ingredientId,
  quantityDelta,
  type,
  actorId,
  note,
  referenceType,
  referenceId,
  vendorName,
  purchaseDate,
  purchaseCost,
  purchaseQuantity,
  purchaseUnitId,
  purchaseUnitLabel,
  wastageReason
}: RecordInventoryChangeArgs) {
  const inventory = await transaction.branchInventory.findUnique({
    where: {
      branchId_ingredientId: {
        branchId,
        ingredientId
      }
    },
    include: {
      ingredient: true
    }
  });

  if (!inventory) {
    throw new Error("Inventory item is missing for the selected branch.");
  }

  const nextQuantity = roundQuantity(Number(inventory.quantityOnHand) + quantityDelta);
  const lowStockAlert = nextQuantity <= Number(inventory.ingredient.reorderLevel);

  const updated = await transaction.branchInventory.update({
    where: { id: inventory.id },
    data: {
      quantityOnHand: nextQuantity,
      lowStockAlert
    },
    include: {
      ingredient: true
    }
  });

  const inventoryTransaction = await transaction.inventoryTransaction.create({
    data: {
      branchInventoryId: updated.id,
      actorId: actorId ?? undefined,
      type,
      quantity: roundQuantity(quantityDelta),
      balanceAfter: nextQuantity,
      note,
      referenceType,
      referenceId,
      vendorName,
      purchaseDate,
      purchaseCost,
      purchaseQuantity,
      purchaseUnitId,
      purchaseUnitLabel,
      wastageReason
    }
  });

  return { ...updated, transactionId: inventoryTransaction.id };
}

export type InventoryChange = {
  branchInventoryId: string;
  quantityDelta: number;
  balanceAfter: number;
  lowStockAlert: boolean;
};

const inventoryIngredientInclude = {
  preparedComponents: {
    include: {
      componentIngredient: {
        include: {
          preparedComponents: {
            include: {
              componentIngredient: true
            }
          }
        }
      }
    }
  }
} as const;

/**
 * Reads the recipe + branch stock needed to compute an inventory adjustment.
 * Accepts any Prisma client (the shared client OR a transaction client) so the
 * reads can run OUTSIDE a transaction and in parallel with other queries.
 */
export async function readInventoryData(
  client: Prisma.TransactionClient | PrismaClient,
  branchId: string,
  productIds: string[]
) {
  const dynamicMealProducts = await client.product.findMany({
    where: {
      isActive: true,
      OR: [
        { slug: THELA_FRIES_SLUG },
        { category: { slug: { in: [...BEVERAGE_CATEGORY_SLUGS] } } }
      ]
    },
    select: {
      id: true,
      name: true,
      slug: true,
      categoryId: true,
      category: {
        select: {
          slug: true
        }
      }
    }
  });
  const recipeProductIds = [...new Set([...productIds, ...dynamicMealProducts.map((product) => product.id)])];

  const [productIngredients, products] = await Promise.all([
    recipeProductIds.length
      ? client.productIngredient.findMany({
          where: { productId: { in: recipeProductIds }, ingredient: { isActive: true } },
          include: {
            ingredient: { include: inventoryIngredientInclude }
          }
        })
      : Promise.resolve([]),
    recipeProductIds.length
      ? client.product.findMany({
          where: { id: { in: recipeProductIds } },
          select: {
            id: true,
            name: true,
            slug: true,
            categoryId: true,
            category: {
              select: {
                slug: true
              }
            }
          }
        })
      : Promise.resolve([])
  ]);

  const neededIngredientIds = new Set<string>();
  function collectIngredientIds(ingredient: any, seen = new Set<string>()) {
    if (!ingredient || seen.has(ingredient.id)) return;
    if (ingredient.isActive === false) return;
    seen.add(ingredient.id);
    neededIngredientIds.add(ingredient.id);
    for (const component of ingredient.preparedComponents ?? []) {
      collectIngredientIds(component.componentIngredient, seen);
    }
  }

  for (const recipe of productIngredients) {
    collectIngredientIds(recipe.ingredient);
  }
  if (neededIngredientIds.size) {
    await client.branchInventory.createMany({
      data: Array.from(neededIngredientIds).map((ingredientId) => ({
        branchId,
        ingredientId,
        quantityOnHand: 0,
        lowStockAlert: true
      })),
      skipDuplicates: true
    });
  }

  const branchInventories = await client.branchInventory.findMany({
    where: { branchId, ingredient: { isActive: true } },
    include: {
      ingredient: true
    }
  });

  return { productIngredients, products, branchInventories };
}

type InventoryData = Awaited<ReturnType<typeof readInventoryData>>;

/**
 * Pure, in-memory calculation of the per-ingredient stock changes for an order.
 * No database access — safe to run before opening a transaction.
 */
export function computeInventoryChanges({
  productIngredients,
  products,
  branchInventories,
  items,
  mode,
}: {
  productIngredients: InventoryData["productIngredients"];
  products: InventoryData["products"];
  branchInventories: InventoryData["branchInventories"];
  items: InventoryOrderItem[];
  mode: "consume" | "return";
}): InventoryChange[] {
  const totals = new Map<string, number>();

  function addIngredientUsage(ingredient: any, quantity: number, seen = new Set<string>()) {
    if (!ingredient) return;
    if (ingredient.isActive === false) return;
    if (ingredient.type === "PACKAGING") return;
    if (ingredient.type === "PREPARED" && ingredient.preparedComponents?.length && !seen.has(ingredient.id)) {
      const nextSeen = new Set(seen);
      nextSeen.add(ingredient.id);
      for (const component of ingredient.preparedComponents) {
        addIngredientUsage(component.componentIngredient, quantity * Number(component.quantityNeeded), nextSeen);
      }
      return;
    }
    totals.set(ingredient.id, roundQuantity((totals.get(ingredient.id) ?? 0) + quantity));
  }

  const recipeByProduct = new Map<string, Array<{ ingredientId: string; quantityNeeded: number }>>();
  for (const recipe of productIngredients) {
    const existing = recipeByProduct.get(recipe.productId) ?? [];
    existing.push({
      ingredientId: recipe.ingredientId,
      quantityNeeded: Number(recipe.quantityNeeded)
    });
    recipeByProduct.set(recipe.productId, existing);
  }

  const ingredientById = new Map(productIngredients.map((entry) => [entry.ingredientId, entry.ingredient]));
  const productById = new Map(products.map((product) => [product.id, product]));
  const thelaFriesProduct = products.find((product) => product.slug === THELA_FRIES_SLUG);
  const mealAddOnProductByName = new Map(
    products
      .filter((product) => product.category && BEVERAGE_CATEGORY_SLUGS.includes(product.category.slug as typeof BEVERAGE_CATEGORY_SLUGS[number]))
      .map((product) => [mealOptionNameFor(product.name, product.category!.slug), product])
  );
  const mealAddOnProductById = new Map(
    products
      .filter((product) => product.category && BEVERAGE_CATEGORY_SLUGS.includes(product.category.slug as typeof BEVERAGE_CATEGORY_SLUGS[number]))
      .map((product) => [product.id, product])
  );
  function addProductRecipeUsage(productId: string, quantity: number) {
    const product = productById.get(productId);
    const isMealProduct = product?.category?.slug === MEAL_CATEGORY_SLUG;
    const recipeProductId = isMealProduct
      ? thelaFriesProduct?.id
      : productId;
    if (!recipeProductId) {
      return;
    }

    for (const recipe of recipeByProduct.get(recipeProductId) ?? []) {
      const ingredient = ingredientById.get(recipe.ingredientId);
      if (ingredient?.type !== "PACKAGING") {
        addIngredientUsage(ingredient, recipe.quantityNeeded * quantity);
      }
    }
  }

  const inventoryBySku = new Map(branchInventories.map((entry) => [entry.ingredient.sku, entry]));

  for (const item of items) {
    const bundledProductIds = new Set(
      (item.bundleComponents ?? []).flatMap((component) => component.productId ? [component.productId] : [])
    );

    if (item.productId && !(item.bundleComponents?.length ?? 0)) {
      addProductRecipeUsage(item.productId, item.quantity);
    }

    for (const component of item.bundleComponents ?? []) {
      if (!component.productId) {
        continue;
      }

      addProductRecipeUsage(component.productId, component.quantity);
    }

    for (const addOn of item.addOns ?? []) {
      if (addOn.linkedProductId && bundledProductIds.has(addOn.linkedProductId)) {
        continue;
      }
      const dynamicMealAddOnProduct = (addOn.linkedProductId ? mealAddOnProductById.get(addOn.linkedProductId) : undefined)
        ?? mealAddOnProductByName.get(addOn.optionName);
      if (dynamicMealAddOnProduct) {
        addProductRecipeUsage(dynamicMealAddOnProduct.id, item.quantity);
        continue;
      }

      const optionRecipe = OPTION_RECIPE_BY_NAME[addOn.optionName];
      if (!optionRecipe) continue;

      const components = addOn.optionName.startsWith("Fries + ")
        ? optionRecipe.filter((component) => !["ING-FRIES", "ING-FRIES-MASALA"].includes(component.ingredientSku))
        : optionRecipe;

      for (const component of components) {
        const inventory = inventoryBySku.get(component.ingredientSku);
        if (!inventory || inventory.ingredient.type === "PACKAGING") continue;
        totals.set(
          inventory.ingredientId,
          roundQuantity((totals.get(inventory.ingredientId) ?? 0) + component.quantity * item.quantity)
        );
      }
    }
  }

  if (!totals.size) {
    return [];
  }

  const quantityDirection = mode === "consume" ? -1 : 1;
  const inventoryByIngredientId = new Map(branchInventories.map((entry) => [entry.ingredientId, entry]));

  return Array.from(totals.entries()).map(([ingredientId, quantity]) => {
    const inventory = inventoryByIngredientId.get(ingredientId);
    if (!inventory) {
      throw new Error("Inventory item is missing for the selected branch.");
    }

    const quantityDelta = roundQuantity(quantity * quantityDirection);
    const balanceAfter = roundQuantity(Number(inventory.quantityOnHand) + quantityDelta);

    return {
      branchInventoryId: inventory.id,
      quantityDelta,
      balanceAfter,
      lowStockAlert: balanceAfter <= Number(inventory.ingredient.reorderLevel)
    };
  });
}

/**
 * Applies precomputed inventory changes inside a transaction (writes only).
 */
export async function applyInventoryChanges({
  transaction,
  changes,
  orderId,
  actorId,
  mode
}: {
  transaction: Prisma.TransactionClient;
  changes: InventoryChange[];
  orderId: string;
  actorId?: string | null;
  mode: "consume" | "return";
}) {
  if (!changes.length) {
    return;
  }

  const transactionType = mode === "consume" ? InventoryTransactionType.CONSUMPTION : InventoryTransactionType.RETURN;
  const note = mode === "consume" ? "Order inventory deduction" : "Order cancellation return";

  const updatedCount = await transaction.$executeRaw`
    UPDATE "BranchInventory" AS inventory
    SET
      "quantityOnHand" = updates."quantityOnHand"::numeric,
      "lowStockAlert" = updates."lowStockAlert"::boolean
    FROM (
      VALUES ${Prisma.join(
        changes.map((change) => Prisma.sql`(${change.branchInventoryId}, ${change.balanceAfter}, ${change.lowStockAlert})`)
      )}
    ) AS updates("id", "quantityOnHand", "lowStockAlert")
    WHERE inventory."id" = updates."id"
  `;

  if (updatedCount !== changes.length) {
    throw new Error("Inventory update failed for one or more order ingredients.");
  }

  await transaction.inventoryTransaction.createMany({
    data: changes.map((change) => ({
      branchInventoryId: change.branchInventoryId,
      actorId: actorId ?? null,
      type: transactionType,
      quantity: change.quantityDelta,
      balanceAfter: change.balanceAfter,
      note,
      referenceType: "ORDER",
      referenceId: orderId
    }))
  });
}

/**
 * Backwards-compatible helper: reads, computes, and applies an order's
 * inventory adjustment within a single transaction. Used by non-POS callers
 * (catalog/customer checkout, admin cancellations) where the extra in-txn
 * reads are acceptable. The POS hot path splits these steps to keep reads
 * out of the transaction — see routes/pos.ts.
 */
export async function applyOrderInventory({
  transaction,
  branchId,
  orderId,
  actorId,
  items,
  mode,
  serviceType
}: ApplyOrderInventoryArgs) {
  const productIds = [
    ...new Set(
      items.flatMap((item) => [
        item.productId,
        ...(item.bundleComponents ?? []).map((component) => component.productId)
      ]).filter((value): value is string => Boolean(value))
    )
  ];
  const { productIngredients, products, branchInventories } = await readInventoryData(transaction, branchId, productIds);
  const changes = computeInventoryChanges({ productIngredients, products, branchInventories, items, mode });
  await applyInventoryChanges({ transaction, changes, orderId, actorId, mode });
}
