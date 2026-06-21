import { InventoryTransactionType, Prisma } from "@prisma/client";
import { OPTION_RECIPE_BY_NAME } from "./inventory-config.js";

type InventoryOrderItem = {
  productId?: string | null;
  quantity: number;
  addOns?: Array<{
    optionName: string;
  }>;
};

type ApplyOrderInventoryArgs = {
  transaction: Prisma.TransactionClient;
  branchId: string;
  orderId: string;
  actorId?: string | null;
  items: InventoryOrderItem[];
  mode: "consume" | "return";
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
  referenceId
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
      referenceId
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
  const [productIngredients, branchInventories] = await Promise.all([
    productIds.length
      ? client.productIngredient.findMany({
          where: { productId: { in: productIds } },
          include: {
            ingredient: true
          }
        })
      : Promise.resolve([]),
    client.branchInventory.findMany({
      where: { branchId },
      include: {
        ingredient: true
      }
    })
  ]);

  return { productIngredients, branchInventories };
}

type InventoryData = Awaited<ReturnType<typeof readInventoryData>>;

/**
 * Pure, in-memory calculation of the per-ingredient stock changes for an order.
 * No database access — safe to run before opening a transaction.
 */
export function computeInventoryChanges({
  productIngredients,
  branchInventories,
  items,
  mode
}: {
  productIngredients: InventoryData["productIngredients"];
  branchInventories: InventoryData["branchInventories"];
  items: InventoryOrderItem[];
  mode: "consume" | "return";
}): InventoryChange[] {
  const recipeByProduct = new Map<string, Array<{ ingredientId: string; quantityNeeded: number }>>();
  for (const recipe of productIngredients) {
    const existing = recipeByProduct.get(recipe.productId) ?? [];
    existing.push({
      ingredientId: recipe.ingredientId,
      quantityNeeded: Number(recipe.quantityNeeded)
    });
    recipeByProduct.set(recipe.productId, existing);
  }

  const inventoryBySku = new Map(branchInventories.map((entry) => [entry.ingredient.sku, entry]));
  const totals = new Map<string, number>();

  for (const item of items) {
    if (item.productId) {
      for (const recipe of recipeByProduct.get(item.productId) ?? []) {
        totals.set(recipe.ingredientId, roundQuantity((totals.get(recipe.ingredientId) ?? 0) + recipe.quantityNeeded * item.quantity));
      }
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
  mode
}: ApplyOrderInventoryArgs) {
  const productIds = [...new Set(items.map((item) => item.productId).filter((value): value is string => Boolean(value)))];
  const { productIngredients, branchInventories } = await readInventoryData(transaction, branchId, productIds);
  const changes = computeInventoryChanges({ productIngredients, branchInventories, items, mode });
  await applyInventoryChanges({ transaction, changes, orderId, actorId, mode });
}
