-- Store the exact delivery locality and staff accountability on every delivery order.
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "deliverySubsector" TEXT,
  ADD COLUMN IF NOT EXISTS "acceptedById" TEXT,
  ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dispatchedById" TEXT,
  ADD COLUMN IF NOT EXISTS "dispatchedAt" TIMESTAMP(3);

ALTER TABLE "Address"
  ALTER COLUMN "userId" DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_acceptedById_fkey') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_acceptedById_fkey"
      FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_dispatchedById_fkey') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_dispatchedById_fkey"
      FOREIGN KEY ("dispatchedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Order_branchId_deliverySector_placedAt_idx"
  ON "Order"("branchId", "deliverySector", "placedAt");
