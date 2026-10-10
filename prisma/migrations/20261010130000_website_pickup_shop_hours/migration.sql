ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'PAY_AT_COUNTER';

CREATE TYPE "CouponChannel" AS ENUM ('DELIVERY', 'PICKUP', 'BOTH');

ALTER TABLE "Coupon"
  ADD COLUMN "appliesTo" "CouponChannel" NOT NULL DEFAULT 'BOTH';

ALTER TABLE "Order"
  ADD COLUMN "expectedPickupAt" TIMESTAMP(3);

CREATE TABLE "StorefrontConfiguration" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "openTime" TEXT,
  "closeTime" TEXT,
  "manualEnabled" BOOLEAN NOT NULL DEFAULT true,
  "manualOverrideWindowKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StorefrontConfiguration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StorefrontConfiguration_branchId_key" UNIQUE ("branchId"),
  CONSTRAINT "StorefrontConfiguration_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "StorefrontConfiguration_branchId_manualEnabled_idx"
  ON "StorefrontConfiguration"("branchId", "manualEnabled");

CREATE INDEX "Order_branchId_expectedPickupAt_idx"
  ON "Order"("branchId", "expectedPickupAt");
