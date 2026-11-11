ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "requiredServiceType" "ServiceType";

INSERT INTO "Category" ("id", "slug", "name", "description", "sortOrder", "isActive", "imageUrl", "createdAt", "updatedAt")
VALUES ('cgolootlocategory20261108', 'golootlo-deals', 'Golootlo Deals', 'Exclusive Golootlo bundles', 6, true, '/images/golootlo-logo.png', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "Product" ("id", "categoryId", "slug", "sku", "name", "description", "ingredients", "basePrice", "featured", "bestSeller", "isActive", "sortOrder", "stockStatus", "requiredServiceType", "createdAt", "updatedAt")
SELECT deal."id", category."id", deal."slug", deal."sku", deal."name", deal."description", ARRAY[]::TEXT[], deal."price", false, false, true, deal."sortOrder", 'IN_STOCK', 'GOLOOTLO'::"ServiceType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Category" AS category
CROSS JOIN (VALUES
 ('cgolootlodeal120261108xxx', 'golootlo-deal-1', 'PKT-GOL-001', 'Golootlo Deal 1', 'Buy one Classic or Spicy Shawarma and get one Classic or Spicy Shawarma free.', 550.00::DECIMAL(10,2), 1),
 ('cgolootlodeal220261108xxx', 'golootlo-deal-2', 'PKT-GOL-002', 'Golootlo Deal 2', 'Buy two wraps, any flavour, and get one wrap, any flavour, free.', 1700.00::DECIMAL(10,2), 2),
 ('cgolootlodeal320261108xxx', 'golootlo-deal-3', 'PKT-GOL-003', 'Golootlo Deal 3', 'Choose one wrap and one chiller, any available flavour.', 1000.00::DECIMAL(10,2), 3)
) AS deal("id", "slug", "sku", "name", "description", "price", "sortOrder")
WHERE category."slug" = 'golootlo-deals'
ON CONFLICT ("slug") DO NOTHING;

-- Restriction is persistent product metadata, independent of category/name edits.
UPDATE "Product" SET "requiredServiceType" = 'GOLOOTLO'::"ServiceType"
WHERE "slug" IN ('golootlo-deal-1', 'golootlo-deal-2', 'golootlo-deal-3');

INSERT INTO "ProductImage" ("id", "productId", "url", "alt", "sortOrder")
SELECT 'c' || SUBSTRING(MD5('golootlo-image-' || product."id") FROM 1 FOR 24), product."id", '/images/golootlo-logo.png', product."name", 1
FROM "Product" product
WHERE product."slug" IN ('golootlo-deal-1', 'golootlo-deal-2', 'golootlo-deal-3')
AND NOT EXISTS (SELECT 1 FROM "ProductImage" image WHERE image."productId" = product."id");

INSERT INTO "BranchProduct" ("id", "branchId", "productId", "price", "isAvailable", "stockStatus")
SELECT 'c' || SUBSTRING(MD5('golootlo-branch-' || branch."id" || product."id") FROM 1 FOR 24), branch."id", product."id", product."basePrice", true, 'IN_STOCK'
FROM "Branch" branch CROSS JOIN "Product" product
WHERE branch."isActive" = true AND product."slug" IN ('golootlo-deal-1', 'golootlo-deal-2', 'golootlo-deal-3')
ON CONFLICT ("branchId", "productId") DO NOTHING;
