CREATE TYPE "OrderInventoryStatus" AS ENUM ('PENDING', 'SKIPPED', 'APPLIED', 'REVERSED');
CREATE TYPE "InventoryApplicationStatus" AS ENUM ('APPLIED', 'REVERSED');

-- Existing orders are deliberately excluded from forward inventory processing.
ALTER TABLE "Order"
ADD COLUMN "inventoryStatus" "OrderInventoryStatus" NOT NULL DEFAULT 'SKIPPED';
ALTER TABLE "Order"
ALTER COLUMN "inventoryStatus" SET DEFAULT 'PENDING';

CREATE TABLE "BranchInventoryControl" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "orderDeductionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "enabledAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BranchInventoryControl_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BranchInventoryControl_branchId_key"
ON "BranchInventoryControl"("branchId");

CREATE TABLE "OrderInventoryApplication" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "orderId" TEXT,
    "orderNumber" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "status" "InventoryApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "effects" JSONB NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    CONSTRAINT "OrderInventoryApplication_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderInventoryApplication_branchId_generation_status_idx"
ON "OrderInventoryApplication"("branchId", "generation", "status");
CREATE INDEX "OrderInventoryApplication_orderId_status_idx"
ON "OrderInventoryApplication"("orderId", "status");

ALTER TABLE "InventoryTransaction"
ADD COLUMN "inventoryApplicationId" TEXT;
CREATE INDEX "InventoryTransaction_inventoryApplicationId_idx"
ON "InventoryTransaction"("inventoryApplicationId");

CREATE TABLE "AddOnOptionIngredient" (
    "optionId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantityNeeded" DECIMAL(10,3) NOT NULL,
    CONSTRAINT "AddOnOptionIngredient_pkey" PRIMARY KEY ("optionId", "ingredientId")
);
CREATE INDEX "AddOnOptionIngredient_ingredientId_idx"
ON "AddOnOptionIngredient"("ingredientId");

ALTER TABLE "BranchInventoryControl"
ADD CONSTRAINT "BranchInventoryControl_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchInventoryControl"
ADD CONSTRAINT "BranchInventoryControl_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderInventoryApplication"
ADD CONSTRAINT "OrderInventoryApplication_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderInventoryApplication"
ADD CONSTRAINT "OrderInventoryApplication_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryTransaction"
ADD CONSTRAINT "InventoryTransaction_inventoryApplicationId_fkey"
FOREIGN KEY ("inventoryApplicationId") REFERENCES "OrderInventoryApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AddOnOptionIngredient"
ADD CONSTRAINT "AddOnOptionIngredient_optionId_fkey"
FOREIGN KEY ("optionId") REFERENCES "AddOnOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AddOnOptionIngredient"
ADD CONSTRAINT "AddOnOptionIngredient_ingredientId_fkey"
FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
