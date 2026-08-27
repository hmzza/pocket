-- Restore the meal bundles that the customer menu expects.  These rows were
-- present in the original seed data but were not created in the production DB.
-- All inserts are idempotent so existing admin-managed products are preserved.

INSERT INTO "Category" (
  "id", "slug", "name", "description", "sortOrder", "isActive", "imageUrl", "createdAt", "updatedAt"
)
VALUES (
  'meal-category-20260827',
  'make-it-a-meal',
  'Make It A Meal',
  'Pocket wraps bundled with fries and your drink pick',
  4,
  true,
  '/images/pocket-mai-rocket-shawarma.png',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "sortOrder" = EXCLUDED."sortOrder",
  "isActive" = true,
  "imageUrl" = EXCLUDED."imageUrl",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Product" (
  "id", "categoryId", "slug", "sku", "name", "description", "ingredients", "basePrice",
  "calories", "featured", "bestSeller", "isActive", "sortOrder", "stockStatus", "createdAt", "updatedAt"
)
SELECT
  meal."id",
  category."id",
  meal."slug",
  meal."sku",
  meal."name",
  meal."description",
  meal."ingredients",
  meal."basePrice",
  meal."calories",
  true,
  false,
  true,
  meal."sortOrder",
  'IN_STOCK',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  VALUES
    (
      'meal-classic-pocket-20260827',
      'classic-pocket-make-it-a-meal',
      'PKT-ML-001',
      'Classic Pocket - Make It A Meal',
      'Classic Pocket bundled with fries and your drink pick.',
      ARRAY['Chicken', 'Classic shawarma sauce', 'Iceberg', 'Carrot', 'Cucumber', 'Cheese', 'Fries', 'Drink']::TEXT[],
      450.00::DECIMAL(10, 2),
      560,
      1
    ),
    (
      'meal-spicy-pocket-20260827',
      'spicy-pocket-make-it-a-meal',
      'PKT-ML-002',
      'Spicy Pocket - Make It A Meal',
      'Spicy Pocket bundled with fries and your drink pick.',
      ARRAY['Chicken', 'Spicy jalapeno sauce', 'Iceberg', 'Carrot', 'Cucumber', 'Cheese', 'Fries', 'Drink']::TEXT[],
      550.00::DECIMAL(10, 2),
      590,
      2
    ),
    (
      'meal-pocket-mai-rocket-20260827',
      'pocket-mai-rocket-make-it-a-meal',
      'PKT-ML-003',
      'Pocket Mai Rocket - Make It A Meal',
      'Pocket Mai Rocket bundled with fries and your drink pick.',
      ARRAY['Chicken', 'Black olives', 'Jalapeno', 'Corn', 'Mushrooms', 'Cheese', 'Fries', 'Drink']::TEXT[],
      750.00::DECIMAL(10, 2),
      760,
      3
    )
) AS meal("id", "slug", "sku", "name", "description", "ingredients", "basePrice", "calories", "sortOrder")
CROSS JOIN (SELECT "id" FROM "Category" WHERE "slug" = 'make-it-a-meal') AS category
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "ProductImage" ("id", "productId", "url", "alt", "sortOrder", "createdAt")
SELECT
  'meal-image-' || product."id",
  product."id",
  CASE product."slug"
    WHEN 'classic-pocket-make-it-a-meal' THEN '/images/classic-shawarma.png'
    WHEN 'spicy-pocket-make-it-a-meal' THEN '/images/spicy-shawarma.png'
    ELSE '/images/pocket-mai-rocket-shawarma.png'
  END,
  product."name" || ' meal',
  1,
  CURRENT_TIMESTAMP
FROM "Product" AS product
WHERE product."slug" IN (
  'classic-pocket-make-it-a-meal',
  'spicy-pocket-make-it-a-meal',
  'pocket-mai-rocket-make-it-a-meal'
)
  AND NOT EXISTS (
    SELECT 1 FROM "ProductImage" AS image WHERE image."productId" = product."id"
  );

INSERT INTO "BranchProduct" ("id", "branchId", "productId", "price", "isAvailable", "stockStatus")
SELECT
  'meal-branch-price-' || branch."id" || '-' || product."id",
  branch."id",
  product."id",
  product."basePrice",
  true,
  'IN_STOCK'
FROM "Branch" AS branch
CROSS JOIN "Product" AS product
WHERE product."slug" IN (
  'classic-pocket-make-it-a-meal',
  'spicy-pocket-make-it-a-meal',
  'pocket-mai-rocket-make-it-a-meal'
)
ON CONFLICT ("branchId", "productId") DO UPDATE SET
  "isAvailable" = true,
  "stockStatus" = 'IN_STOCK';

INSERT INTO "AddOnGroup" ("id", "productId", "name", "minSelect", "maxSelect", "isRequired", "sortOrder")
SELECT
  'meal-pairing-' || product."id",
  product."id",
  'Choose your meal pairing',
  1,
  1,
  true,
  CASE WHEN product."slug" = 'pocket-mai-rocket-make-it-a-meal' THEN 2 ELSE 1 END
FROM "Product" AS product
WHERE product."slug" IN (
  'classic-pocket-make-it-a-meal',
  'spicy-pocket-make-it-a-meal',
  'pocket-mai-rocket-make-it-a-meal'
)
  AND NOT EXISTS (
    SELECT 1
    FROM "AddOnGroup" AS group
    WHERE group."productId" = product."id" AND group."name" = 'Choose your meal pairing'
  );

INSERT INTO "AddOnGroup" ("id", "productId", "name", "minSelect", "maxSelect", "isRequired", "sortOrder")
SELECT
  'meal-sauce-' || product."id",
  product."id",
  'Choose Sauce',
  1,
  1,
  true,
  1
FROM "Product" AS product
WHERE product."slug" = 'pocket-mai-rocket-make-it-a-meal'
  AND NOT EXISTS (
    SELECT 1
    FROM "AddOnGroup" AS group
    WHERE group."productId" = product."id" AND group."name" = 'Choose Sauce'
  );

INSERT INTO "AddOnOption" ("id", "groupId", "name", "priceDelta", "isActive", "sortOrder")
SELECT
  'meal-sauce-option-' || sauce_group."id" || '-' || option."sortOrder",
  sauce_group."id",
  option."name",
  0.00::DECIMAL(10, 2),
  true,
  option."sortOrder"
FROM "AddOnGroup" AS sauce_group
JOIN "Product" AS meal_product ON meal_product."id" = sauce_group."productId"
CROSS JOIN (
  VALUES
    ('Classic shawarma sauce', 1),
    ('Spicy jalapeno sauce', 2)
) AS option("name", "sortOrder")
WHERE sauce_group."name" = 'Choose Sauce'
  AND meal_product."slug" = 'pocket-mai-rocket-make-it-a-meal'
  AND NOT EXISTS (
    SELECT 1
    FROM "AddOnOption" AS existing_option
    WHERE existing_option."groupId" = sauce_group."id" AND existing_option."name" = option."name"
  );

INSERT INTO "AddOnOption" ("id", "groupId", "name", "priceDelta", "isActive", "sortOrder")
SELECT
  'meal-option-' || pairing_group."id" || '-' || beverage."id",
  pairing_group."id",
  'Fries + ' || CASE
    WHEN category."slug" = 'ice-cream-shakes' AND beverage."name" NOT ILIKE '%shake%' THEN beverage."name" || ' Shake'
    ELSE beverage."name"
  END,
  CASE category."slug"
    WHEN 'soft-drinks' THEN 250.00::DECIMAL(10, 2)
    WHEN 'ice-cream-shakes' THEN 450.00::DECIMAL(10, 2)
    WHEN 'chillers' THEN 550.00::DECIMAL(10, 2)
  END,
  true,
  ROW_NUMBER() OVER (
    PARTITION BY pairing_group."id"
    ORDER BY
      CASE category."slug"
        WHEN 'soft-drinks' THEN 1
        WHEN 'ice-cream-shakes' THEN 2
        WHEN 'chillers' THEN 3
      END,
      category."sortOrder",
      beverage."sortOrder",
      beverage."name"
  )
FROM "AddOnGroup" AS pairing_group
JOIN "Product" AS meal_product ON meal_product."id" = pairing_group."productId"
CROSS JOIN "Product" AS beverage
JOIN "Category" AS category ON category."id" = beverage."categoryId"
WHERE pairing_group."name" = 'Choose your meal pairing'
  AND meal_product."slug" IN (
    'classic-pocket-make-it-a-meal',
    'spicy-pocket-make-it-a-meal',
    'pocket-mai-rocket-make-it-a-meal'
  )
  AND beverage."isActive" = true
  AND category."slug" IN ('soft-drinks', 'ice-cream-shakes', 'chillers')
  AND NOT EXISTS (
    SELECT 1
    FROM "AddOnOption" AS option
    WHERE option."groupId" = pairing_group."id"
      AND option."name" = 'Fries + ' || CASE
        WHEN category."slug" = 'ice-cream-shakes' AND beverage."name" NOT ILIKE '%shake%' THEN beverage."name" || ' Shake'
        ELSE beverage."name"
      END
  );
