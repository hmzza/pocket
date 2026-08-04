-- CreateTable
CREATE TABLE "FoodpandaSettlement" (
    "id" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "totalOrders" INTEGER NOT NULL,
    "grossSales" DECIMAL(10,2) NOT NULL,
    "commission" DECIMAL(10,2) NOT NULL,
    "otherCharges" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "expectedNet" DECIMAL(10,2) NOT NULL,
    "amountReceived" DECIMAL(10,2),
    "receivedSource" TEXT NOT NULL DEFAULT 'CASH',
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "receivedAt" TIMESTAMP(3),
    "transferReference" TEXT,
    "notes" TEXT,
    "receivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FoodpandaSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FoodpandaSettlement_weekStart_weekEnd_key" ON "FoodpandaSettlement"("weekStart", "weekEnd");
CREATE INDEX "FoodpandaSettlement_status_weekStart_idx" ON "FoodpandaSettlement"("status", "weekStart");

-- AddForeignKey
ALTER TABLE "FoodpandaSettlement" ADD CONSTRAINT "FoodpandaSettlement_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
