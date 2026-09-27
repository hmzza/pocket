import { InventoryTransactionType, Prisma, ServiceType, type PrismaClient } from "@prisma/client";
import { BEVERAGE_CATEGORY_SLUGS, MEAL_CATEGORY_SLUG, THELA_FRIES_SLUG } from "./meal-options.js";

type InventoryOrderItem = {
  productId?: string | null;
  quantity: number;
  addOns?: Array<{
    optionId?: string | null;
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
  inventoryApplicationId?: string;
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
  purchaseQuantity,
  purchaseUnitId,
  purchaseUnitLabel,
  wastageReason,
  inventoryApplicationId
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
      wastageReason,
      inventoryApplicationId
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
  const [dynamicMealProducts, addOnOptions] = await Promise.all([
    client.product.findMany({
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
    }),
    client.addOnOption.findMany({
      where: { isActive: true },
      select: { id: true, linkedProductId: true }
    })
  ]);
  const recipeProductIds = [...new Set([
    ...productIds,
    ...dynamicMealProducts.map((product) => product.id),
    ...addOnOptions.flatMap((option) => option.linkedProductId ? [option.linkedProductId] : [])
  ])];

  const [productIngredients, products, ingredientComponents, optionIngredients] = await Promise.all([
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
    }),
    client.addOnOptionIngredient.findMany({
      where: {
        option: { isActive: true },
        ingredient: { isActive: true }
      },
      include: { ingredient: { include: inventoryIngredientInclude } }
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
  for (const usage of optionIngredients) {
    collectIngredientIds(usage.ingredient);
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

  return { productIngredients, products, ingredientComponents, optionIngredients, addOnOptions, branchInventories };
}

type InventoryData = Awaited<ReturnType<typeof readInventoryData>>;

/**
 * Pure, in-memory calculation of the per-ingredient stock changes for an order.
 * No database access — safe to run before opening a transaction.
 */
export function computeInventoryChanges({
  productIngredients,
  products,
  optionIngredients,
  addOnOptions,
  branchInventories,
  items,
  mode,
}: {
  productIngredients: InventoryData["productIngredients"];
  products: InventoryData["products"];
  optionIngredients: InventoryData["optionIngredients"];
  addOnOptions: InventoryData["addOnOptions"];
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
  for (const usage of optionIngredients) ingredientById.set(usage.ingredientId, usage.ingredient);
  const optionUsageById = new Map<string, typeof optionIngredients>();
  for (const usage of optionIngredients) {
    const entries = optionUsageById.get(usage.optionId) ?? [];
    entries.push(usage);
    optionUsageById.set(usage.optionId, entries);
  }
  const optionById = new Map(addOnOptions.map((option) => [option.id, option]));
  const productById = new Map(products.map((product) => [product.id, product]));
  const thelaFriesProduct = products.find((product) => product.slug === THELA_FRIES_SLUG);
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

      addProductRecipeUsage(component.productId, component.quantity * item.quantity);
    }

    for (const addOn of item.addOns ?? []) {
      const linkedProductId = addOn.linkedProductId ?? (addOn.optionId ? optionById.get(addOn.optionId)?.linkedProductId : null);
      if (linkedProductId && bundledProductIds.has(linkedProductId)) {
        continue;
      }
      const linkedAddOnProduct = linkedProductId ? productById.get(linkedProductId) : undefined;
      if (linkedAddOnProduct) {
        addProductRecipeUsage(linkedAddOnProduct.id, item.quantity);
        continue;
      }

      if (!addOn.optionId) continue;
      for (const usage of optionUsageById.get(addOn.optionId) ?? []) {
        if (usage.ingredient.type === "PACKAGING") continue;
        addIngredientUsage(usage.ingredient, Number(usage.quantityNeeded) * item.quantity);
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
  mode,
  inventoryApplicationId
}: {
  transaction: Prisma.TransactionClient;
  changes: InventoryChange[];
  orderId: string;
  actorId?: string | null;
  mode: "consume" | "return";
  inventoryApplicationId?: string;
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
      referenceId: orderId,
      inventoryApplicationId: inventoryApplicationId ?? null
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

async function produceRequiredPrepBatches({
  transaction,
  branchId,
  orderId,
  actorId,
  requiredByIngredientId,
  ingredientComponents,
  branchInventories,
  inventoryApplicationId
}: {
  transaction: Prisma.TransactionClient;
  branchId: string;
  orderId: string;
  actorId?: string | null;
  requiredByIngredientId: Map<string, number>;
  ingredientComponents: PrepComponent[];
  branchInventories: Array<{ id: string; ingredientId: string; quantityOnHand: Prisma.Decimal; ingredient: { id: string; name: string; unit: string; type: string; isActive: boolean } }>;
  inventoryApplicationId: string;
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
      referenceId: orderId,
      inventoryApplicationId
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

type StoredInventoryEffect = { ingredientId: string; quantity: number };

function parseStoredEffects(value: Prisma.JsonValue): StoredInventoryEffect[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const ingredientId = "ingredientId" in entry ? entry.ingredientId : undefined;
    const quantity = "quantity" in entry ? entry.quantity : undefined;
    return typeof ingredientId === "string" && typeof quantity === "number" && Number.isFinite(quantity)
      ? [{ ingredientId, quantity }]
      : [];
  });
}

/**
 * The single gateway for order-originated stock changes. A missing branch
 * control is intentionally treated as disabled, so deploys cannot start
 * deducting stock before an administrator explicitly enables the branch.
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
  void serviceType;
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orderId}))`;

  const [control, order] = await Promise.all([
    transaction.branchInventoryControl.findUnique({ where: { branchId } }),
    transaction.order.findUnique({
      where: { id: orderId },
      select: { id: true, branchId: true, orderNumber: true, inventoryStatus: true }
    })
  ]);

  if (!order) return;
  if (order.branchId !== branchId) throw new Error("Order and inventory branch do not match.");

  if (!control?.orderDeductionEnabled) {
    if (order.inventoryStatus !== "SKIPPED") {
      await transaction.order.update({ where: { id: orderId }, data: { inventoryStatus: "SKIPPED" } });
    }
    return;
  }

  const activeApplication = await transaction.orderInventoryApplication.findFirst({
    where: {
      orderId,
      branchId,
      generation: control.generation,
      status: "APPLIED"
    },
    orderBy: { appliedAt: "desc" }
  });

  if (mode === "return") {
    if (!activeApplication) return;
    const storedEffects = parseStoredEffects(activeApplication.effects);
    const existingIngredients = await transaction.ingredient.findMany({
      where: { id: { in: storedEffects.map((effect) => effect.ingredientId) } },
      select: { id: true }
    });
    const existingIngredientIds = new Set(existingIngredients.map((ingredient) => ingredient.id));

    for (const effect of storedEffects) {
      // A deliberately deleted stock item has no balance left to restore.
      if (!existingIngredientIds.has(effect.ingredientId)) continue;
      const inverseQuantity = roundQuantity(-effect.quantity);
      if (!inverseQuantity) continue;
      await recordInventoryChange({
        transaction,
        branchId,
        ingredientId: effect.ingredientId,
        quantityDelta: inverseQuantity,
        type: inverseQuantity >= 0 ? InventoryTransactionType.RETURN : InventoryTransactionType.CONSUMPTION,
        actorId,
        note: "Exact order inventory reversal",
        referenceType: "ORDER_INVENTORY_REVERSAL",
        referenceId: orderId,
        inventoryApplicationId: activeApplication.id
      });
    }
    await transaction.orderInventoryApplication.update({
      where: { id: activeApplication.id },
      data: { status: "REVERSED", reversedAt: new Date() }
    });
    await transaction.order.update({ where: { id: orderId }, data: { inventoryStatus: "REVERSED" } });
    return;
  }

  if (activeApplication || order.inventoryStatus === "SKIPPED") return;
  if (order.inventoryStatus === "APPLIED") return;
  if (order.inventoryStatus === "REVERSED") {
    const latestApplication = await transaction.orderInventoryApplication.findFirst({
      where: { orderId, branchId },
      orderBy: { appliedAt: "desc" },
      select: { generation: true }
    });
    if (!latestApplication || latestApplication.generation !== control.generation) return;
  }

  const application = await transaction.orderInventoryApplication.create({
    data: {
      branchId,
      orderId,
      orderNumber: order.orderNumber,
      generation: control.generation,
      effects: []
    }
  });
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
    branchInventories: inventoryData.branchInventories,
    inventoryApplicationId: application.id
  });

  const refreshedData = await readInventoryData(transaction, branchId, productIds);
  const refreshedChanges = computeInventoryChanges({ ...refreshedData, items, mode });
  await applyInventoryChanges({
    transaction,
    changes: refreshedChanges,
    orderId,
    actorId,
    mode,
    inventoryApplicationId: application.id
  });

  const applicationTransactions = await transaction.inventoryTransaction.findMany({
    where: { inventoryApplicationId: application.id },
    select: {
      quantity: true,
      branchInventory: { select: { ingredientId: true } }
    }
  });
  const effectTotals = new Map<string, number>();
  for (const entry of applicationTransactions) {
    const ingredientId = entry.branchInventory.ingredientId;
    effectTotals.set(ingredientId, roundQuantity((effectTotals.get(ingredientId) ?? 0) + Number(entry.quantity)));
  }
  const effects = Array.from(effectTotals.entries()).map(([ingredientId, quantity]) => ({ ingredientId, quantity }));
  await transaction.orderInventoryApplication.update({
    where: { id: application.id },
    data: { effects: effects as Prisma.InputJsonValue }
  });
  await transaction.order.update({ where: { id: orderId }, data: { inventoryStatus: "APPLIED" } });
}
