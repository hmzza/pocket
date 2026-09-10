ALTER TYPE "RoleCode" ADD VALUE IF NOT EXISTS 'DELIVERY_RIDER';

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "riderId" TEXT;

CREATE INDEX IF NOT EXISTS "Order_riderId_idx" ON "Order"("riderId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_riderId_fkey') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_riderId_fkey"
      FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
