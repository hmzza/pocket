-- Direct delivery workflow: sector snapshot and dispatch assignment on each order.
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "deliverySector" TEXT,
  ADD COLUMN IF NOT EXISTS "riderName" TEXT,
  ADD COLUMN IF NOT EXISTS "riderPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "riderAssignedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Order_branchId_serviceType_status_placedAt_idx"
  ON "Order"("branchId", "serviceType", "status", "placedAt");
