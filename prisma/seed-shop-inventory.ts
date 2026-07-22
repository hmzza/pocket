import { InventoryTransactionType, PrismaClient } from "@prisma/client";
import { INVENTORY_ITEMS, PACKAGING_RULES, PREPARED_RECIPE_BY_SKU, PRODUCT_RECIPE_BY_SLUG } from "../apps/api/src/lib/inventory-config.js";

const prisma = new PrismaClient();

function roundQuantity(value: number) {
  return Number(value.toFixed(3));
}

async function main() {
  if (process.env.CONFIRM_REPLACE_INVENTORY !== "true") {
    throw new Error("Set CONFIRM_REPLACE_INVENTORY=true to replace inventory setup and delete old ingredients.");
  }

  const branch = await prisma.branch.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" }
  });

  if (!branch) {
    throw new Error("No active branch found. Run the main seed first.");
  }

  const actor = await prisma.user.findFirst({
    where: { canAccessAdmin: true },
    orderBy: { createdAt: "asc" }
  });

  const supplier = await prisma.supplier.upsert({
    where: { id: "shop-current-stock" },
    update: { name: "Current Shop Stock" },
    create: { id: "shop-current-stock", name: "Current Shop Stock" }
  });

  const targetSkus = INVENTORY_ITEMS.map((item) => item.sku);
  const targetSkuSet = new Set(targetSkus);

  await prisma.$transaction(async (transaction) => {
    const staleIngredients = await transaction.ingredient.findMany({
      where: { sku: { notIn: targetSkus } },
      select: { id: true }
    });
    const staleIngredientIds = staleIngredients.map((ingredient) => ingredient.id);

    if (staleIngredientIds.length) {
      await transaction.inventoryTransaction.deleteMany({
        where: { branchInventory: { ingredientId: { in: staleIngredientIds } } }
      });
      await transaction.productIngredient.deleteMany({
        where: { ingredientId: { in: staleIngredientIds } }
      });
      await transaction.ingredientComponent.deleteMany({
        where: {
          OR: [
            { parentIngredientId: { in: staleIngredientIds } },
            { componentIngredientId: { in: staleIngredientIds } }
          ]
        }
      });
      await transaction.packagingRule.deleteMany({
        where: { packagingIngredientId: { in: staleIngredientIds } }
      });
      await transaction.branchInventory.deleteMany({
        where: { ingredientId: { in: staleIngredientIds } }
      });
      await transaction.ingredient.deleteMany({
        where: { id: { in: staleIngredientIds } }
      });
    }

    await transaction.packagingRule.deleteMany();

    for (const item of INVENTORY_ITEMS) {
      await transaction.ingredient.upsert({
        where: { sku: item.sku },
        update: {
          name: item.name,
          unit: item.unit,
          type: item.type,
          isActive: true,
          reorderLevel: item.reorderLevel,
          costPerUnit: item.costPerUnit,
          caloriesPerUnit: item.caloriesPerUnit,
          supplierId: supplier.id
        },
        create: {
          sku: item.sku,
          name: item.name,
          unit: item.unit,
          type: item.type,
          isActive: true,
          reorderLevel: item.reorderLevel,
          costPerUnit: item.costPerUnit,
          caloriesPerUnit: item.caloriesPerUnit,
          supplierId: supplier.id
        }
      });
    }

    const ingredients = await transaction.ingredient.findMany({
      where: { sku: { in: targetSkus } }
    });
    const ingredientBySku = new Map(ingredients.map((ingredient) => [ingredient.sku, ingredient]));

    for (const item of INVENTORY_ITEMS) {
      const ingredient = ingredientBySku.get(item.sku);
      if (!ingredient) {
        throw new Error(`Missing seeded ingredient ${item.sku}.`);
      }

      const inventory = await transaction.branchInventory.upsert({
        where: {
          branchId_ingredientId: {
            branchId: branch.id,
            ingredientId: ingredient.id
          }
        },
        update: {
          quantityOnHand: item.openingStock,
          lowStockAlert: item.openingStock <= item.reorderLevel
        },
        create: {
          branchId: branch.id,
          ingredientId: ingredient.id,
          quantityOnHand: item.openingStock,
          lowStockAlert: item.openingStock <= item.reorderLevel
        }
      });

      await transaction.inventoryTransaction.deleteMany({
        where: {
          branchInventoryId: inventory.id,
          referenceType: "CURRENT_STOCK_SEED"
        }
      });

      await transaction.inventoryTransaction.create({
        data: {
          branchInventoryId: inventory.id,
          actorId: actor?.id ?? null,
          type: InventoryTransactionType.PURCHASE,
          quantity: roundQuantity(item.openingStock),
          balanceAfter: roundQuantity(item.openingStock),
          note: "Current shop stock seed",
          referenceType: "CURRENT_STOCK_SEED"
        }
      });
    }

    const products = await transaction.product.findMany({
      where: { slug: { in: Object.keys(PRODUCT_RECIPE_BY_SLUG) } },
      select: { id: true, slug: true }
    });
    const productBySlug = new Map(products.map((product) => [product.slug, product]));

    for (const [productSlug, recipe] of Object.entries(PRODUCT_RECIPE_BY_SLUG)) {
      const product = productBySlug.get(productSlug);
      if (!product) continue;

      await transaction.productIngredient.deleteMany({
        where: { productId: product.id }
      });

      const recipeRows = recipe
        .map((line) => {
          const ingredient = ingredientBySku.get(line.ingredientSku);
          if (!ingredient) return null;
          if (!targetSkuSet.has(ingredient.sku)) return null;
          return {
            productId: product.id,
            ingredientId: ingredient.id,
            quantityNeeded: line.quantity
          };
        })
        .filter((line): line is { productId: string; ingredientId: string; quantityNeeded: number } => Boolean(line));

      if (recipeRows.length) {
        await transaction.productIngredient.createMany({ data: recipeRows });
      }
    }

    for (const [preparedSku, recipe] of Object.entries(PREPARED_RECIPE_BY_SKU)) {
      const parent = ingredientBySku.get(preparedSku);
      if (!parent) continue;

      await transaction.ingredientComponent.deleteMany({
        where: { parentIngredientId: parent.id }
      });

      const componentRows = recipe
        .map((line) => {
          const ingredient = ingredientBySku.get(line.ingredientSku);
          if (!ingredient) return null;
          return {
            parentIngredientId: parent.id,
            componentIngredientId: ingredient.id,
            quantityNeeded: line.quantity
          };
        })
        .filter((line): line is { parentIngredientId: string; componentIngredientId: string; quantityNeeded: number } => Boolean(line));

      if (componentRows.length) {
        await transaction.ingredientComponent.createMany({ data: componentRows });
      }
    }

    const categories = await transaction.category.findMany({
      where: { slug: { in: PACKAGING_RULES.flatMap((rule) => rule.categorySlug ? [rule.categorySlug] : []) } },
      select: { id: true, slug: true }
    });
    const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));

    for (const rule of PACKAGING_RULES) {
      const packaging = ingredientBySku.get(rule.packagingSku);
      if (!packaging) continue;

      const product = rule.productSlug ? productBySlug.get(rule.productSlug) : null;
      const category = rule.categorySlug ? categoryBySlug.get(rule.categorySlug) : null;

      if (rule.productSlug && !product) continue;
      if (rule.categorySlug && !category) continue;

      await transaction.packagingRule.create({
        data: {
          productId: product?.id ?? null,
          categoryId: product ? null : category?.id ?? null,
          serviceType: rule.serviceType,
          packagingIngredientId: packaging.id,
          quantityMode: rule.quantityMode,
          quantity: rule.quantity,
          itemStep: rule.quantityMode === "PER_ITEM_STEP" ? rule.itemStep ?? 1 : null
        }
      });
    }
  });

  console.log(`Seeded current shop inventory for branch ${branch.name}.`);
  console.log(`Inventory items: ${INVENTORY_ITEMS.length}`);
  console.log(`Product recipes: ${Object.keys(PRODUCT_RECIPE_BY_SLUG).length}`);
  console.log(`Prep recipes: ${Object.keys(PREPARED_RECIPE_BY_SKU).length}`);
  console.log(`Packaging rules: ${PACKAGING_RULES.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
