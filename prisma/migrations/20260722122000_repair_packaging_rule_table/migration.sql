-- Repair production databases where the migration history says PackagingRule
-- was applied but the table is missing. Safe on databases where the table
-- already exists.

CREATE TABLE IF NOT EXISTS "PackagingRule" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "categoryId" TEXT,
    "serviceType" TEXT NOT NULL DEFAULT 'DEFAULT',
    "packagingIngredientId" TEXT NOT NULL,
    "quantityMode" TEXT NOT NULL DEFAULT 'FIXED',
    "quantity" DECIMAL(10,3) NOT NULL,
    "itemStep" INTEGER,

    CONSTRAINT "PackagingRule_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PackagingRule" ALTER COLUMN "quantity" TYPE DECIMAL(10,3);

CREATE INDEX IF NOT EXISTS "PackagingRule_productId_idx" ON "PackagingRule"("productId");
CREATE INDEX IF NOT EXISTS "PackagingRule_categoryId_idx" ON "PackagingRule"("categoryId");
CREATE INDEX IF NOT EXISTS "PackagingRule_serviceType_idx" ON "PackagingRule"("serviceType");
CREATE INDEX IF NOT EXISTS "PackagingRule_packagingIngredientId_idx" ON "PackagingRule"("packagingIngredientId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PackagingRule_productId_fkey') THEN
    ALTER TABLE "PackagingRule"
    ADD CONSTRAINT "PackagingRule_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PackagingRule_categoryId_fkey') THEN
    ALTER TABLE "PackagingRule"
    ADD CONSTRAINT "PackagingRule_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PackagingRule_packagingIngredientId_fkey') THEN
    ALTER TABLE "PackagingRule"
    ADD CONSTRAINT "PackagingRule_packagingIngredientId_fkey"
    FOREIGN KEY ("packagingIngredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
