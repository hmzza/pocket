ALTER TABLE "BranchProduct"
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Keep unavailable catalog records orderable without exposing them publicly.
INSERT INTO "BranchProduct" (
  "id",
  "branchId",
  "productId",
  "price",
  "isAvailable",
  "stockStatus",
  "sortOrder"
)
SELECT
  'bpo_' || md5(branch."id" || ':' || product."id"),
  branch."id",
  product."id",
  product."basePrice",
  false,
  product."stockStatus",
  0
FROM "Branch" AS branch
CROSS JOIN "Product" AS product
ON CONFLICT ("branchId", "productId") DO NOTHING;

-- Preserve the catalog sequence visible before this migration for every branch.
WITH ranked AS (
  SELECT
    branch_product."id",
    (ROW_NUMBER() OVER (
      PARTITION BY branch_product."branchId"
      ORDER BY category."sortOrder", product."sortOrder", product."name", product."id"
    ) - 1)::INTEGER AS position
  FROM "BranchProduct" AS branch_product
  INNER JOIN "Product" AS product ON product."id" = branch_product."productId"
  INNER JOIN "Category" AS category ON category."id" = product."categoryId"
)
UPDATE "BranchProduct" AS branch_product
SET "sortOrder" = ranked.position
FROM ranked
WHERE ranked."id" = branch_product."id";

CREATE INDEX "BranchProduct_branchId_sortOrder_idx"
ON "BranchProduct"("branchId", "sortOrder");
