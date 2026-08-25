CREATE TABLE "DeliveryRider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryRider_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeliveryRider_phone_key" ON "DeliveryRider"("phone");
CREATE INDEX "DeliveryRider_isActive_name_idx" ON "DeliveryRider"("isActive", "name");

-- Seed the existing rider so all new dispatches use the requested number.
INSERT INTO "DeliveryRider" ("id", "name", "phone", "isActive", "createdAt", "updatedAt")
VALUES ('cmezzriderzeeshan00000001', 'Zeeshan', '+923411471884', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("phone") DO UPDATE
SET "name" = EXCLUDED."name", "isActive" = true, "updatedAt" = CURRENT_TIMESTAMP;
