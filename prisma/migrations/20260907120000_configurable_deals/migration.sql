-- Create configurable deal products. Choice groups and their options are kept
-- synchronized by the API so active pockets, wraps, and 345ml drinks remain current.

INSERT INTO "Category" (
  "id", "slug", "name", "description", "sortOrder", "isActive", "imageUrl", "createdAt", "updatedAt"
)
VALUES (
  'cdealcategory09072026xxxx',
  'deals',
  'Deals',
  'Pocket bundles for families and groups',
  5,
  true,
  '/images/pocket-mai-rocket-shawarma.png',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Product" (
  "id", "categoryId", "slug", "sku", "name", "description", "ingredients", "basePrice",
  "featured", "bestSeller", "isActive", "sortOrder", "stockStatus", "createdAt", "updatedAt"
)
SELECT
  deal."id",
  category."id",
  deal."slug",
  deal."sku",
  deal."name",
  deal."description",
  deal."ingredients",
  deal."price",
  false,
  false,
  true,
  deal."sortOrder",
  'IN_STOCK',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Category" AS category
CROSS JOIN (
  VALUES
    (
      'cdealpocketfamily09072026',
      'pocket-family',
      'PKT-DL-001',
      'Pocket Family',
      '2 Pocket Mai Rockets with individual sauce choices, 2 Classic or Spicy Pockets, 4 drinks, and 2 Thela Fries.',
      ARRAY['2 Pocket Mai Rockets', '2 Pocket choices', '4 drinks', '2 Thela Fries']::TEXT[],
      3100.00::DECIMAL(10, 2),
      1
    ),
    (
      'cdealwrapbundle09072026xx',
      'the-wrap-pack',
      'PKT-DL-002',
      'The Wrap Pack',
      'Choose any 3 wraps and any 3 drinks, served with 1 Thela Fries.',
      ARRAY['3 wrap choices', '3 drinks', '1 Thela Fries']::TEXT[],
      2900.00::DECIMAL(10, 2),
      2
    ),
    (
      'cdealogtrio09072026xxxxxx',
      'og-trio',
      'PKT-DL-003',
      'OG-Trio',
      'Choose 3 Classic or Spicy Pockets and any 3 drinks.',
      ARRAY['3 Pocket choices', '3 drinks']::TEXT[],
      1650.00::DECIMAL(10, 2),
      3
    )
) AS deal("id", "slug", "sku", "name", "description", "ingredients", "price", "sortOrder")
WHERE category."slug" = 'deals'
ON CONFLICT ("slug") DO UPDATE SET
  "categoryId" = EXCLUDED."categoryId",
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "ingredients" = EXCLUDED."ingredients",
  "basePrice" = EXCLUDED."basePrice",
  "isActive" = true,
  "sortOrder" = EXCLUDED."sortOrder",
  "stockStatus" = 'IN_STOCK',
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "ProductImage" ("id", "productId", "url", "alt", "sortOrder", "createdAt")
SELECT
  'deal-image-' || SUBSTRING(MD5(deal."id") FROM 1 FOR 20),
  deal."id",
  COALESCE(source_image."url", '/images/pocket-mai-rocket-shawarma.png'),
  deal."name",
  1,
  CURRENT_TIMESTAMP
FROM "Product" AS deal
LEFT JOIN LATERAL (
  SELECT image."url"
  FROM "Product" AS source
  JOIN "ProductImage" AS image ON image."productId" = source."id"
  WHERE source."slug" = CASE deal."slug"
    WHEN 'the-wrap-pack' THEN 'classic-wrap'
    WHEN 'og-trio' THEN 'classic-pocket'
    ELSE 'pocket-mai-rocket'
  END
  ORDER BY image."sortOrder" ASC
  LIMIT 1
) AS source_image ON true
WHERE deal."slug" IN ('pocket-family', 'the-wrap-pack', 'og-trio')
  AND NOT EXISTS (
    SELECT 1 FROM "ProductImage" AS existing WHERE existing."productId" = deal."id"
  );

INSERT INTO "BranchProduct" ("id", "branchId", "productId", "price", "isAvailable", "stockStatus")
SELECT
  'deal-bp-' || SUBSTRING(MD5(branch."id" || deal."id") FROM 1 FOR 20),
  branch."id",
  deal."id",
  deal."basePrice",
  true,
  'IN_STOCK'
FROM "Branch" AS branch
CROSS JOIN "Product" AS deal
WHERE branch."isActive" = true
  AND deal."slug" IN ('pocket-family', 'the-wrap-pack', 'og-trio')
ON CONFLICT ("branchId", "productId") DO UPDATE SET
  "price" = EXCLUDED."price",
  "isAvailable" = true,
  "stockStatus" = 'IN_STOCK';

INSERT INTO "ProductBundleComponent" (
  "id", "productId", "componentProductId", "quantity", "sortOrder"
)
SELECT
  'deal-component-' || SUBSTRING(MD5(deal."id" || component."id") FROM 1 FOR 16),
  deal."id",
  component."id",
  setup."quantity",
  setup."sortOrder"
FROM (
  VALUES
    ('pocket-family', 'pocket-mai-rocket', 2, 1),
    ('pocket-family', 'thela-fries', 2, 2),
    ('the-wrap-pack', 'thela-fries', 1, 1)
) AS setup("dealSlug", "componentSlug", "quantity", "sortOrder")
JOIN "Product" AS deal ON deal."slug" = setup."dealSlug"
JOIN "Product" AS component ON component."slug" = setup."componentSlug"
ON CONFLICT ("productId", "componentProductId") DO UPDATE SET
  "quantity" = EXCLUDED."quantity",
  "sortOrder" = EXCLUDED."sortOrder";
