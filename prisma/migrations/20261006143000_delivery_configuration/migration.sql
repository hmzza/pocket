CREATE TABLE "DeliveryConfiguration" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "openTime" TEXT,
    "closeTime" TEXT,
    "manualEnabled" BOOLEAN NOT NULL DEFAULT true,
    "manualOverrideWindowKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeliverySector" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deliveryFee" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliverySector_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeliveryConfiguration_branchId_key" ON "DeliveryConfiguration"("branchId");
CREATE INDEX "DeliveryConfiguration_branchId_manualEnabled_idx" ON "DeliveryConfiguration"("branchId", "manualEnabled");
CREATE UNIQUE INDEX "DeliverySector_branchId_name_key" ON "DeliverySector"("branchId", "name");
CREATE INDEX "DeliverySector_branchId_isActive_sortOrder_idx" ON "DeliverySector"("branchId", "isActive", "sortOrder");

ALTER TABLE "DeliveryConfiguration" ADD CONSTRAINT "DeliveryConfiguration_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliverySector" ADD CONSTRAINT "DeliverySector_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
