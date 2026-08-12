ALTER TABLE "Order" ADD COLUMN "promotionName" TEXT;
ALTER TABLE "Order" ADD COLUMN "promotionDiscountAmount" DECIMAL(10,2);
ALTER TABLE "OrderItem" ADD COLUMN "promotionFreeQuantity" INTEGER NOT NULL DEFAULT 0;
