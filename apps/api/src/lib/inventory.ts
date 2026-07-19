import { InventoryTransactionType, Prisma, ServiceType } from "@prisma/client";
import { OPTION_RECIPE_BY_NAME } from "./inventory-config.js";

type InventoryOrderItem = {
  productId?: string | null;
  quantity: number;
  addOns?: Array<{
    optionName: string;
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
  wastageReason?: string;
};

function roundQuantity(value: number) {
  return Number(value.toFixed(3));
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

  await transaction.inventoryTransaction.create({
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
      wastageReason
    }
  });

  return updated;
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
  client: Prisma.TransactionClient,
  branchId: string,
  productIds: string[]
) {
  const [productIngredients, packagingRules, products, branchInventories] = await Promise.all([
    productIds.length
      ? client.productIngredient.findMany({
          where: { productId: { in: productIds } },
          include: {
            ingredient: { include: inventoryIngredientInclude }
          }
        })
      : Promise.resolve([]),
    client.packagingRule.findMany({
      include: {
        packagingIngredient: true
      }
    }),
    productIds.length
      ? client.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, categoryId: true }
        })
      : Promise.resolve([]),
    client.branchInventory.findMany({
      where: { branchId },
      include: {
        ingredient: true
      }
    })
  ]);

  return { productIngredients, packagingRules, products, branchInventories };
}

type InventoryData = Awaited<ReturnType<typeof readInventoryData>>;

/**
 * Pure, in-memory calculation of the per-ingredient stock changes for an order.
 * No database access — safe to run before opening a transaction.
 */
export function computeInventoryChanges({
  productIngredients,
  packagingRules,
  products,
  branchInventories,
  items,
  mode,
  serviceType = ServiceType.DELIVERY
}: {
  productIngredients: InventoryData["productIngredients"];
  packagingRules: InventoryData["packagingRules"];
  products: InventoryData["products"];
  branchInventories: InventoryData["branchInventories"];
  items: InventoryOrderItem[];
  mode: "consume" | "return";
  serviceType?: ServiceType | string;
}): InventoryChange[] {
  const totals = new Map<string, number>();

  function addIngredientUsage(ingredient: any, quantity: number, seen = new Set<string>()) {
    if (!ingredient) return;
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
  const productCategoryById = new Map(products.map((product) => [product.id, product.categoryId]));
  const productQuantities = new Map<string, number>();
  const categoryQuantities = new Map<string, number>();
  let orderQuantity = 0;

  function addPackagingRuleUsage(rule: InventoryData["packagingRules"][number], itemCount: number) {
    if (itemCount <= 0) return;
    const quantity = Number(rule.quantity);
    const needed = rule.quantityMode === "PER_ITEM_STEP"
      ? quantity * Math.ceil(itemCount / Math.max(1, rule.itemStep ?? 1))
      : quantity * itemCount;
    if (needed <= 0) return;
    totals.set(
      rule.packagingIngredientId,
      roundQuantity((totals.get(rule.packagingIngredientId) ?? 0) + needed)
    );
  }

  function addProductPackagingInput(productId: string, quantity: number) {
    productQuantities.set(productId, (productQuantities.get(productId) ?? 0) + quantity);
    const categoryId = productCategoryById.get(productId);
    if (categoryId) {
      categoryQuantities.set(categoryId, (categoryQuantities.get(categoryId) ?? 0) + quantity);
    }
    orderQuantity += quantity;
  }

  function addPackagingUsage() {
    const matchingRules = packagingRules.filter((rule) => rule.serviceType === serviceType || rule.serviceType === "DEFAULT");
    for (const rule of matchingRules) {
      const hasSpecificForScope = packagingRules.some((candidate) =>
        candidate.serviceType === serviceType &&
        candidate.productId === rule.productId &&
        candidate.categoryId === rule.categoryId &&
        candidate.packagingIngredientId === rule.packagingIngredientId
      );
      if (rule.serviceType === "DEFAULT" && hasSpecificForScope) continue;
      if (rule.productId) {
        addPackagingRuleUsage(rule, productQuantities.get(rule.productId) ?? 0);
      } else if (rule.categoryId) {
        addPackagingRuleUsage(rule, categoryQuantities.get(rule.categoryId) ?? 0);
      } else {
        addPackagingRuleUsage(rule, orderQuantity);
      }
    }
  }

  function addLegacyPackagingUsage(productId: string, multiplier: number) {
    for (const recipe of recipeByProduct.get(productId) ?? []) {
      const ingredient = ingredientById.get(recipe.ingredientId);
      if (ingredient?.type !== "PACKAGING") continue;
      totals.set(
        recipe.ingredientId,
        roundQuantity((totals.get(recipe.ingredientId) ?? 0) + recipe.quantityNeeded * multiplier)
      );
    }
  }

  const inventoryBySku = new Map(branchInventories.map((entry) => [entry.ingredient.sku, entry]));

  for (const item of items) {
    if (item.productId && !(item.bundleComponents?.length ?? 0)) {
      for (const recipe of recipeByProduct.get(item.productId) ?? []) {
        const ingredient = ingredientById.get(recipe.ingredientId);
        if (ingredient?.type !== "PACKAGING") {
          addIngredientUsage(ingredient, recipe.quantityNeeded * item.quantity);
        }
      }
      addLegacyPackagingUsage(item.productId, item.quantity);
      addProductPackagingInput(item.productId, item.quantity);
    }

    for (const component of item.bundleComponents ?? []) {
      if (!component.productId) {
        continue;
      }

      for (const recipe of recipeByProduct.get(component.productId) ?? []) {
        const ingredient = ingredientById.get(recipe.ingredientId);
        if (ingredient?.type !== "PACKAGING") {
          addIngredientUsage(ingredient, recipe.quantityNeeded * component.quantity);
        }
      }
      addLegacyPackagingUsage(component.productId, component.quantity);
      addProductPackagingInput(component.productId, component.quantity);
    }

    for (const addOn of item.addOns ?? []) {
      const optionRecipe = OPTION_RECIPE_BY_NAME[addOn.optionName];
      if (!optionRecipe) continue;

      for (const component of optionRecipe) {
        const inventory = inventoryBySku.get(component.ingredientSku);
        if (!inventory) continue;
        totals.set(
          inventory.ingredientId,
          roundQuantity((totals.get(inventory.ingredientId) ?? 0) + component.quantity * item.quantity)
        );
      }
    }
  }

  addPackagingUsage();

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
  const { productIngredients, packagingRules, products, branchInventories } = await readInventoryData(transaction, branchId, productIds);
  const changes = computeInventoryChanges({ productIngredients, packagingRules, products, branchInventories, items, mode, serviceType });
  await applyInventoryChanges({ transaction, changes, orderId, actorId, mode });
}
