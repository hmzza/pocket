-- Legacy meal records can carry an old zero price. Keep the customer meal
-- bundles aligned with their matching shawarma prices at every branch.

UPDATE "Product"
SET "basePrice" = CASE "sku"
  WHEN 'PKT-ML-001' THEN 450.00::DECIMAL(10, 2)
  WHEN 'PKT-ML-002' THEN 550.00::DECIMAL(10, 2)
  WHEN 'PKT-ML-003' THEN 750.00::DECIMAL(10, 2)
END,
"updatedAt" = CURRENT_TIMESTAMP
WHERE "sku" IN ('PKT-ML-001', 'PKT-ML-002', 'PKT-ML-003');

UPDATE "BranchProduct" AS branch_product
SET "price" = product."basePrice",
    "isAvailable" = true,
    "stockStatus" = 'IN_STOCK'
FROM "Product" AS product
WHERE branch_product."productId" = product."id"
  AND product."sku" IN ('PKT-ML-001', 'PKT-ML-002', 'PKT-ML-003');
