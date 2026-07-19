-- Add channel-specific packaging rules for product costing and stock deduction.
-- This is additive only and does not delete or rewrite existing inventory data.

CREATE TABLE "PackagingRule" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "categoryId" TEXT,
    "serviceType" TEXT NOT NULL DEFAULT 'DEFAULT',
    "packagingIngredientId" TEXT NOT NULL,
    "quantityMode" TEXT NOT NULL DEFAULT 'FIXED',
    "quantity" DECIMAL(10,2) NOT NULL,
    "itemStep" INTEGER,

    CONSTRAINT "PackagingRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PackagingRule_productId_idx" ON "PackagingRule"("productId");
CREATE INDEX "PackagingRule_categoryId_idx" ON "PackagingRule"("categoryId");
CREATE INDEX "PackagingRule_serviceType_idx" ON "PackagingRule"("serviceType");
CREATE INDEX "PackagingRule_packagingIngredientId_idx" ON "PackagingRule"("packagingIngredientId");

ALTER TABLE "PackagingRule" ADD CONSTRAINT "PackagingRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PackagingRule" ADD CONSTRAINT "PackagingRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PackagingRule" ADD CONSTRAINT "PackagingRule_packagingIngredientId_fkey" FOREIGN KEY ("packagingIngredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
