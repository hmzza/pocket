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

  const [productIngredients, products, ingredientComponents] = await Promise.all([
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
      : Promise.resolve([]),
    client.ingredientComponent.findMany({
      where: {
        parentIngredient: { isActive: true },
        componentIngredient: { isActive: true }
      },
      include: { componentIngredient: true },
      orderBy: { componentIngredient: { name: "asc" } }
    })
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
  const componentsByParent = new Map<string, typeof ingredientComponents>();
  for (const component of ingredientComponents) {
    const entries = componentsByParent.get(component.parentIngredientId) ?? [];
    entries.push(component);
    componentsByParent.set(component.parentIngredientId, entries);
  }
  const pendingIngredientIds = [...neededIngredientIds];
  for (let index = 0; index < pendingIngredientIds.length; index += 1) {
    const parentId = pendingIngredientIds[index]!;
    for (const component of componentsByParent.get(parentId) ?? []) {
      if (!neededIngredientIds.has(component.componentIngredientId)) {
        neededIngredientIds.add(component.componentIngredientId);
        pendingIngredientIds.push(component.componentIngredientId);
      }
    }
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

  return { productIngredients, products, ingredientComponents, branchInventories };
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

  function addIngredientUsage(ingredient: any, quantity: number) {
    if (!ingredient) return;
    if (ingredient.isActive === false) return;
    if (ingredient.type === "PACKAGING") return;
    // A prep item is a finished-stock ingredient at order time. Its raw
    // components are produced only when the finished prep stock is short.
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

      const canonicalOptionName = addOn.optionName.includes(":")
        ? addOn.optionName.slice(addOn.optionName.lastIndexOf(":") + 1).trim()
        : addOn.optionName;
      const optionRecipe = OPTION_RECIPE_BY_NAME[addOn.optionName] ?? OPTION_RECIPE_BY_NAME[canonicalOptionName];
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

type PrepComponent = {
  parentIngredientId: string;
  componentIngredientId: string;
  quantityNeeded: Prisma.Decimal | number;
  componentIngredient: { id: string; name: string; unit: string; type: string; isActive: boolean };
};

type UnitSpec = { family: "mass" | "volume" | "count" | "unknown"; factor: number };

function getUnitSpec(unit: string): UnitSpec {
  const normalized = unit.trim().toLowerCase();
  if (normalized === "kg") return { family: "mass", factor: 1000 };
  if (normalized === "g" || normalized === "gram" || normalized === "grams") return { family: "mass", factor: 1 };
  if (normalized === "litre" || normalized === "liter" || normalized === "l") return { family: "volume", factor: 1000 };
  if (normalized === "ml" || normalized === "millilitre" || normalized === "milliliter") return { family: "volume", factor: 1 };
  if (["pieces", "piece", "bottles", "bottle", "slices", "slice", "loafs", "loaf", "biscuit", "biscuits", "packets", "packet", "glass", "scoop"].includes(normalized)) {
    return { family: "count", factor: 1 };
  }
  return { family: "unknown", factor: 1 };
}

export function calculateCompatibleBatchOutputQuantity(
  prepUnit: string,
  components: Array<{ quantityNeeded: number; unit: string }>
) {
  const outputUnit = getUnitSpec(prepUnit);
  if (outputUnit.family === "unknown") return 0;
  return roundQuantity(components
    .filter((component) => getUnitSpec(component.unit).family === outputUnit.family)
    .reduce((total, component) => {
      const componentUnit = getUnitSpec(component.unit);
      return total + component.quantityNeeded * componentUnit.factor / outputUnit.factor;
    }, 0));
}

function calculatePrepBatchOutput(
  prep: { id: string; name: string; unit: string },
  components: PrepComponent[],
  ingredientById: Map<string, { unit: string }>
) {
  const outputUnit = getUnitSpec(prep.unit);
  const compatibleComponents = components.filter((component) => {
    const ingredient = ingredientById.get(component.componentIngredientId) ?? component.componentIngredient;
    const componentUnit = getUnitSpec(ingredient.unit);
    return outputUnit.family !== "unknown" && componentUnit.family === outputUnit.family;
  });

  if (!compatibleComponents.length) {
    throw new Error(`Cannot calculate a complete batch for ${prep.name}. Add at least one recipe component using a compatible ${prep.unit} unit.`);
  }
  return calculateCompatibleBatchOutputQuantity(prep.unit, compatibleComponents.map((component) => ({
    quantityNeeded: Number(component.quantityNeeded),
    unit: (ingredientById.get(component.componentIngredientId) ?? component.componentIngredient).unit
  })));
}

async function reverseAutomaticPrepProduction({
  transaction,
  branchId,
  orderId,
  actorId
}: {
  transaction: Prisma.TransactionClient;
  branchId: string;
  orderId: string;
  actorId?: string | null;
}) {
  const productionTransactions = await transaction.inventoryTransaction.findMany({
    where: {
      referenceType: "PREP_AUTO_BATCH",
      referenceId: orderId,
      branchInventory: { branchId }
    },
    orderBy: { createdAt: "desc" }
  });

  for (const productionTransaction of productionTransactions) {
    await recordInventoryChange({
      transaction,
      branchId,
      ingredientId: (await transaction.branchInventory.findUniqueOrThrow({ where: { id: productionTransaction.branchInventoryId } })).ingredientId,
      quantityDelta: roundQuantity(-Number(productionTransaction.quantity)),
      type: InventoryTransactionType.RETURN,
      actorId,
      note: "Reverse automatic full prep batch for order",
      referenceType: "PREP_AUTO_BATCH_REVERSAL",
      referenceId: orderId
    });
  }

  if (productionTransactions.length) {
    await transaction.inventoryTransaction.updateMany({
      where: { id: { in: productionTransactions.map((entry) => entry.id) } },
      data: { referenceType: "PREP_AUTO_BATCH_REVERSED" }
    });
  }
}

async function produceRequiredPrepBatches({
  transaction,
  branchId,
  orderId,
  actorId,
  requiredByIngredientId,
  ingredientComponents,
  branchInventories
}: {
  transaction: Prisma.TransactionClient;
  branchId: string;
  orderId: string;
  actorId?: string | null;
  requiredByIngredientId: Map<string, number>;
  ingredientComponents: PrepComponent[];
  branchInventories: Array<{ id: string; ingredientId: string; quantityOnHand: Prisma.Decimal; ingredient: { id: string; name: string; unit: string; type: string; isActive: boolean } }>;
}) {
  const stock = new Map(branchInventories.map((entry) => [entry.ingredientId, Number(entry.quantityOnHand)]));
  const inventoryByIngredientId = new Map(branchInventories.map((entry) => [entry.ingredientId, entry]));
  const ingredientById = new Map(branchInventories.map((entry) => [entry.ingredientId, entry.ingredient]));
  const recipeByPrepId = new Map<string, PrepComponent[]>();
  for (const component of ingredientComponents) {
    const recipe = recipeByPrepId.get(component.parentIngredientId) ?? [];
    recipe.push(component);
    recipeByPrepId.set(component.parentIngredientId, recipe);
  }
  const building = new Set<string>();

  async function moveStock(ingredientId: string, quantityDelta: number, note: string) {
    const inventory = inventoryByIngredientId.get(ingredientId);
    if (!inventory) throw new Error("Inventory item is missing for an automatic prep batch.");
    const updated = await recordInventoryChange({
      transaction,
      branchId,
      ingredientId,
      quantityDelta,
      type: quantityDelta >= 0 ? InventoryTransactionType.ADJUSTMENT : InventoryTransactionType.CONSUMPTION,
      actorId,
      note,
      referenceType: "PREP_AUTO_BATCH",
      referenceId: orderId
    });
    stock.set(ingredientId, roundQuantity((stock.get(ingredientId) ?? 0) + quantityDelta));
    inventoryByIngredientId.set(ingredientId, { ...inventory, quantityOnHand: updated.quantityOnHand });
  }

  async function ensurePrepStock(prepId: string, requiredQuantity: number) {
    const prep = ingredientById.get(prepId);
    const recipe = recipeByPrepId.get(prepId) ?? [];
    if (!prep || prep.type !== "PREPARED" || !recipe.length || requiredQuantity <= 0) return;
    if ((stock.get(prepId) ?? 0) >= requiredQuantity) return;
    if (building.has(prepId)) throw new Error(`Circular prep recipe detected for ${prep.name}.`);

    const batchOutput = calculatePrepBatchOutput(prep, recipe, ingredientById);
    const deficit = Math.max(0, requiredQuantity - (stock.get(prepId) ?? 0));
    const batchCount = Math.max(1, Math.ceil(deficit / batchOutput));
    building.add(prepId);
    try {
      for (const component of recipe) {
        const componentQuantity = roundQuantity(Number(component.quantityNeeded) * batchCount);
        const componentIngredient = ingredientById.get(component.componentIngredientId);
        if (!componentIngredient || componentIngredient.isActive === false || componentIngredient.type === "PACKAGING") continue;
        if (componentIngredient.type === "PREPARED") {
          await ensurePrepStock(componentIngredient.id, componentQuantity);
        }
        await moveStock(componentIngredient.id, -componentQuantity, `Automatic full ${prep.name} batch for order`);
      }
      await moveStock(prepId, roundQuantity(batchOutput * batchCount), `Automatic full ${prep.name} batch for order`);
    } finally {
      building.delete(prepId);
    }
  }

  for (const [ingredientId, requiredQuantity] of requiredByIngredientId) {
    const ingredient = ingredientById.get(ingredientId);
    if (ingredient?.type === "PREPARED") await ensurePrepStock(ingredientId, requiredQuantity);
  }
}

/**
 * Backwards-compatible helper: reads, computes, and applies an order's
 * inventory adjustment within a single transaction. All order channels use
 * this path so automatic prep production and its reversal stay consistent.
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
  const inventoryData = await readInventoryData(transaction, branchId, productIds);
  const changes = computeInventoryChanges({ ...inventoryData, items, mode });

  if (mode === "return") {
    await applyInventoryChanges({ transaction, changes, orderId, actorId, mode });
    await reverseAutomaticPrepProduction({ transaction, branchId, orderId, actorId });
    return;
  }

  const requiredByIngredientId = new Map<string, number>();
  for (const change of changes) {
    const inventory = inventoryData.branchInventories.find((entry) => entry.id === change.branchInventoryId);
    if (inventory) requiredByIngredientId.set(inventory.ingredientId, Math.abs(change.quantityDelta));
  }
  await produceRequiredPrepBatches({
    transaction,
    branchId,
    orderId,
    actorId,
    requiredByIngredientId,
    ingredientComponents: inventoryData.ingredientComponents as PrepComponent[],
    branchInventories: inventoryData.branchInventories
  });

  const refreshedData = await readInventoryData(transaction, branchId, productIds);
  const refreshedChanges = computeInventoryChanges({ ...refreshedData, items, mode });
  await applyInventoryChanges({ transaction, changes: refreshedChanges, orderId, actorId, mode });
}
