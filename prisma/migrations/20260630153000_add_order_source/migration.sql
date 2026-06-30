DO $$
BEGIN
  CREATE TYPE "OrderSource" AS ENUM ('ONLINE', 'POS', 'FOODPANDA');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "orderSource" "OrderSource" NOT NULL DEFAULT 'POS';

UPDATE "Order"
SET "orderSource" = CASE
  WHEN "channel" = 'ONLINE' THEN 'ONLINE'
  ELSE 'POS'
END
WHERE "orderSource" = 'POS';
