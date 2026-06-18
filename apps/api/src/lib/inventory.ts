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

export async function applyOrderInventory({
  transaction,
  branchId,
  orderId,
  actorId,
  items,
  mode
}: ApplyOrderInventoryArgs) {
  const productIds = [...new Set(items.map((item) => item.productId).filter((value): value is string => Boolean(value)))];

  const [productIngredients, branchInventories] = await Promise.all([
    productIds.length
      ? transaction.productIngredient.findMany({
          where: { productId: { in: productIds } },
          include: {
            ingredient: true
          }
        })
      : Promise.resolve([]),
    transaction.branchInventory.findMany({
      where: { branchId },
      include: {
        ingredient: true
      }
    })
  ]);

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

  const quantityDirection = mode === "consume" ? -1 : 1;
  const transactionType = mode === "consume" ? InventoryTransactionType.CONSUMPTION : InventoryTransactionType.RETURN;
  const note = mode === "consume" ? "Order inventory deduction" : "Order cancellation return";

  for (const [ingredientId, quantity] of totals) {
    await recordInventoryChange({
      transaction,
      branchId,
      ingredientId,
      quantityDelta: roundQuantity(quantity * quantityDirection),
      type: transactionType,
      actorId,
      note,
      referenceType: "ORDER",
      referenceId: orderId
    });
  }
}
