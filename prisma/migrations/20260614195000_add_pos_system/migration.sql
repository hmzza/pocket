ALTER TYPE "RoleCode" ADD VALUE IF NOT EXISTS 'POS_STAFF';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CASH';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderChannel') THEN
        CREATE TYPE "OrderChannel" AS ENUM ('ONLINE', 'POS');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ServiceType') THEN
        CREATE TYPE "ServiceType" AS ENUM ('DELIVERY', 'TAKEAWAY', 'DINE_IN');
    END IF;
END $$;

ALTER TABLE "Order"
    ALTER COLUMN "customerId" DROP NOT NULL,
    ADD COLUMN "channel" "OrderChannel" NOT NULL DEFAULT 'ONLINE',
    ADD COLUMN "serviceType" "ServiceType" NOT NULL DEFAULT 'DELIVERY',
    ADD COLUMN "customerName" TEXT,
    ADD COLUMN "customerPhone" TEXT,
    ADD COLUMN "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 12,
    ADD COLUMN "manualDiscountType" "DiscountType",
    ADD COLUMN "manualDiscountValue" DECIMAL(10,2),
    ADD COLUMN "cashReceivedAmount" DECIMAL(10,2),
    ADD COLUMN "changeDueAmount" DECIMAL(10,2);

ALTER TABLE "OrderItem"
    ALTER COLUMN "productId" DROP NOT NULL,
    ADD COLUMN "customDescription" TEXT;

ALTER TABLE "Order" DROP CONSTRAINT "Order_customerId_fkey";
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productId_fkey";
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
