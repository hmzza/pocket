ALTER TABLE "Ingredient"
ADD COLUMN "type" TEXT NOT NULL DEFAULT 'RAW',
ADD COLUMN "caloriesPerUnit" DECIMAL(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE "InventoryTransaction"
ADD COLUMN "vendorName" TEXT,
ADD COLUMN "purchaseDate" TIMESTAMP(3),
ADD COLUMN "purchaseCost" DECIMAL(10, 2),
ADD COLUMN "wastageReason" TEXT,
ADD COLUMN "editedAt" TIMESTAMP(3),
ADD COLUMN "editedById" TEXT,
ADD COLUMN "editHistory" JSONB;

CREATE TABLE "IngredientComponent" (
  "parentIngredientId" TEXT NOT NULL,
  "componentIngredientId" TEXT NOT NULL,
  "quantityNeeded" DECIMAL(10, 2) NOT NULL,

  CONSTRAINT "IngredientComponent_pkey" PRIMARY KEY ("parentIngredientId", "componentIngredientId")
);

ALTER TABLE "IngredientComponent"
ADD CONSTRAINT "IngredientComponent_parentIngredientId_fkey"
FOREIGN KEY ("parentIngredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IngredientComponent"
ADD CONSTRAINT "IngredientComponent_componentIngredientId_fkey"
FOREIGN KEY ("componentIngredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
