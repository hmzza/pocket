-- Delivery & Takeaway module.
--
-- Also reconciles two pre-existing schema drifts. The 20260727120000_delivery_tracking
-- migration was applied to environments but never reflected in schema.prisma, as was
-- OrderSource from 20260630153000_add_order_source. Both are now declared in the schema;
-- neither needs DDL here. This migration adopts the Delivery tables and extends them.
--
-- Every statement is idempotent so the migration is safe to run against an environment
-- where delivery_tracking was applied and one where it was not.

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "RiderAvailability" AS ENUM ('AVAILABLE', 'ON_DELIVERY', 'OFF_DUTY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "WhatsAppMessageKind" AS ENUM ('RIDER_ASSIGNED', 'RIDER_REVOKED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "WhatsAppMessageStatus" AS ENUM ('QUEUED', 'MANUAL_PENDING', 'SENT', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Guard for environments that somehow never received delivery_tracking.
DO $$
BEGIN
  CREATE TYPE "DeliveryStatus" AS ENUM ('ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'ON_THE_WAY', 'DELIVERED', 'REJECTED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterEnum: failed deliveries and reassignment need their own terminal states.
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'REASSIGNED';

-- RoleCode.RIDER already exists in environments that ran delivery_tracking; reserved
-- for the future rider app and intentionally unassigned today.
ALTER TYPE "RoleCode" ADD VALUE IF NOT EXISTS 'RIDER';

-- CreateTable
CREATE TABLE IF NOT EXISTS "Rider" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT,
    "createdById" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "altPhone" TEXT,
    "cnic" TEXT,
    "licenceNumber" TEXT,
    "vehicleType" TEXT NOT NULL DEFAULT 'MOTORCYCLE',
    "vehiclePlate" TEXT,
    "availability" "RiderAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rider_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "kind" "WhatsAppMessageKind" NOT NULL,
    "status" "WhatsAppMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "riderId" TEXT,
    "deliveryId" TEXT,
    "orderId" TEXT,
    "sentById" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'deeplink',
    "toPhone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deepLinkUrl" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- AlterTable: dispatch bookkeeping on the adopted Delivery table.
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "assignedById" TEXT;
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "assignmentCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "codAmount" DECIMAL(10,2);
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "failureReason" TEXT;

-- AlterTable: which rider an event refers to, so reassignment history survives a rider swap.
ALTER TABLE "DeliveryEvent" ADD COLUMN IF NOT EXISTS "riderId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Rider_userId_key" ON "Rider"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "Rider_branchId_phone_key" ON "Rider"("branchId", "phone");
CREATE INDEX IF NOT EXISTS "Rider_branchId_isActive_idx" ON "Rider"("branchId", "isActive");
CREATE INDEX IF NOT EXISTS "Rider_branchId_availability_idx" ON "Rider"("branchId", "availability");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_status_queuedAt_idx" ON "WhatsAppMessage"("status", "queuedAt");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_deliveryId_idx" ON "WhatsAppMessage"("deliveryId");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_riderId_queuedAt_idx" ON "WhatsAppMessage"("riderId", "queuedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Order_clientRequestId_key" ON "Order"("clientRequestId");

-- AddForeignKey
-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, so each is dropped first to stay idempotent.
ALTER TABLE "Rider" DROP CONSTRAINT IF EXISTS "Rider_branchId_fkey";
ALTER TABLE "Rider" ADD CONSTRAINT "Rider_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Rider" DROP CONSTRAINT IF EXISTS "Rider_userId_fkey";
ALTER TABLE "Rider" ADD CONSTRAINT "Rider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Rider" DROP CONSTRAINT IF EXISTS "Rider_createdById_fkey";
ALTER TABLE "Rider" ADD CONSTRAINT "Rider_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Re-point Delivery.riderId from User to the dedicated Rider table. All three delivery
-- tables were verified empty before this change, so no data migration is required.
ALTER TABLE "Delivery" DROP CONSTRAINT IF EXISTS "Delivery_riderId_fkey";
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Delivery" DROP CONSTRAINT IF EXISTS "Delivery_assignedById_fkey";
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DeliveryEvent" DROP CONSTRAINT IF EXISTS "DeliveryEvent_riderId_fkey";
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsAppMessage" DROP CONSTRAINT IF EXISTS "WhatsAppMessage_riderId_fkey";
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsAppMessage" DROP CONSTRAINT IF EXISTS "WhatsAppMessage_deliveryId_fkey";
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WhatsAppMessage" DROP CONSTRAINT IF EXISTS "WhatsAppMessage_orderId_fkey";
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WhatsAppMessage" DROP CONSTRAINT IF EXISTS "WhatsAppMessage_sentById_fkey";
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Order.cashier has been declared in schema.prisma and used by the API since
-- 20260614223500_add_order_cashier_id, but that migration only added the column and never
-- the constraint. Added NOT VALID so any environment carrying dangling cashierId values is
-- not blocked; the constraint is still enforced for every new and updated row.
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_cashierId_fkey";
ALTER TABLE "Order" ADD CONSTRAINT "Order_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
