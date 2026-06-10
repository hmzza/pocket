CREATE TYPE "OrderChannel" AS ENUM ('ONLINE', 'POS');

CREATE TYPE "ServiceType" AS ENUM ('DELIVERY', 'TAKEAWAY', 'DINE_IN');

ALTER TABLE "Order"
ADD COLUMN "cashReceivedAmount" DECIMAL(10, 2),
ADD COLUMN "changeDueAmount" DECIMAL(10, 2),
ADD COLUMN "channel" "OrderChannel" NOT NULL DEFAULT 'ONLINE',
ADD COLUMN "customerName" TEXT,
ADD COLUMN "customerPhone" TEXT,
ADD COLUMN "manualDiscountType" "DiscountType",
ADD COLUMN "manualDiscountValue" DECIMAL(10, 2),
ADD COLUMN "serviceType" "ServiceType" NOT NULL DEFAULT 'DELIVERY';
