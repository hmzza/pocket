-- The rider is notified when the food is ready, not when they are assigned,
-- so the delivery has to remember whether that message has gone out yet.
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "riderNotifiedAt" TIMESTAMP(3);
