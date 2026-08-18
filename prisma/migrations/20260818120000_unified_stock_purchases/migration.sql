CREATE TABLE "IngredientPurchaseUnit" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantityInBaseUnits" DECIMAL(12,6) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IngredientPurchaseUnit_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "InventoryTransaction"
    ADD COLUMN "purchaseQuantity" DECIMAL(12,6),
    ADD COLUMN "purchaseUnitId" TEXT,
    ADD COLUMN "purchaseUnitLabel" TEXT;

ALTER TABLE "Expense" ADD COLUMN "stockTransactionId" TEXT;

CREATE UNIQUE INDEX "IngredientPurchaseUnit_ingredientId_name_key" ON "IngredientPurchaseUnit"("ingredientId", "name");
CREATE INDEX "IngredientPurchaseUnit_ingredientId_isActive_idx" ON "IngredientPurchaseUnit"("ingredientId", "isActive");
CREATE UNIQUE INDEX "Expense_stockTransactionId_key" ON "Expense"("stockTransactionId");
CREATE INDEX "InventoryTransaction_purchaseUnitId_idx" ON "InventoryTransaction"("purchaseUnitId");

ALTER TABLE "IngredientPurchaseUnit"
    ADD CONSTRAINT "IngredientPurchaseUnit_ingredientId_fkey"
    FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryTransaction"
    ADD CONSTRAINT "InventoryTransaction_purchaseUnitId_fkey"
    FOREIGN KEY ("purchaseUnitId") REFERENCES "IngredientPurchaseUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Expense"
    ADD CONSTRAINT "Expense_stockTransactionId_fkey"
    FOREIGN KEY ("stockTransactionId") REFERENCES "InventoryTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
