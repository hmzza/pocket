-- Add channel-specific packaging rules for product costing and stock deduction.
-- This is additive only and does not delete or rewrite existing inventory data.

CREATE TABLE "ProductPackagingRule" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL DEFAULT 'DEFAULT',
    "packagingIngredientId" TEXT NOT NULL,
    "quantityNeeded" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductPackagingRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductPackagingRule_productId_serviceType_packagingIngredientId_key" ON "ProductPackagingRule"("productId", "serviceType", "packagingIngredientId");
CREATE INDEX "ProductPackagingRule_packagingIngredientId_idx" ON "ProductPackagingRule"("packagingIngredientId");

ALTER TABLE "ProductPackagingRule" ADD CONSTRAINT "ProductPackagingRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductPackagingRule" ADD CONSTRAINT "ProductPackagingRule_packagingIngredientId_fkey" FOREIGN KEY ("packagingIngredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
