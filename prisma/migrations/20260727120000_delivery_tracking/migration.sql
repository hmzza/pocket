-- Delivery assignments, rider location history, and customer-safe tracking.
ALTER TYPE "RoleCode" ADD VALUE IF NOT EXISTS 'RIDER';

CREATE TYPE "DeliveryStatus" AS ENUM ('ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'ON_THE_WAY', 'DELIVERED', 'REJECTED', 'CANCELLED');

CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "riderId" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'ASSIGNED',
    "trackingToken" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "lastLatitude" DOUBLE PRECISION,
    "lastLongitude" DOUBLE PRECISION,
    "lastAccuracy" DOUBLE PRECISION,
    "lastSpeed" DOUBLE PRECISION,
    "lastHeading" DOUBLE PRECISION,
    "lastLocationAt" TIMESTAMP(3),
    "etaMinutes" INTEGER,
    "deliveryNotes" TEXT,
    "proofOfDelivery" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeliveryLocation" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeliveryEvent" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Delivery_orderId_key" ON "Delivery"("orderId");
CREATE UNIQUE INDEX "Delivery_trackingToken_key" ON "Delivery"("trackingToken");
CREATE INDEX "Delivery_branchId_status_idx" ON "Delivery"("branchId", "status");
CREATE INDEX "Delivery_riderId_status_idx" ON "Delivery"("riderId", "status");
CREATE INDEX "Delivery_status_lastLocationAt_idx" ON "Delivery"("status", "lastLocationAt");
CREATE INDEX "DeliveryLocation_deliveryId_recordedAt_idx" ON "DeliveryLocation"("deliveryId", "recordedAt");
CREATE INDEX "DeliveryEvent_deliveryId_createdAt_idx" ON "DeliveryEvent"("deliveryId", "createdAt");

ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeliveryLocation" ADD CONSTRAINT "DeliveryLocation_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
