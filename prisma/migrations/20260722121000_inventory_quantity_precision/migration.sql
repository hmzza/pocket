ALTER TABLE "Ingredient" ALTER COLUMN "reorderLevel" TYPE DECIMAL(10, 3);
ALTER TABLE "BranchInventory" ALTER COLUMN "quantityOnHand" TYPE DECIMAL(10, 3);
ALTER TABLE "InventoryTransaction" ALTER COLUMN "quantity" TYPE DECIMAL(10, 3);
ALTER TABLE "InventoryTransaction" ALTER COLUMN "balanceAfter" TYPE DECIMAL(10, 3);
ALTER TABLE "ProductIngredient" ALTER COLUMN "quantityNeeded" TYPE DECIMAL(10, 3);
ALTER TABLE "PackagingRule" ALTER COLUMN "quantity" TYPE DECIMAL(10, 3);
ALTER TABLE "IngredientComponent" ALTER COLUMN "quantityNeeded" TYPE DECIMAL(10, 3);
