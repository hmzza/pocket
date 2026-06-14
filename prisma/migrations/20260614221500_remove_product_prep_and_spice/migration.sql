-- Remove obsolete product metadata fields.
ALTER TABLE "Product" DROP COLUMN IF EXISTS "prepTimeMinutes";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "spiceLevel";
