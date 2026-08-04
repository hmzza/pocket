-- CreateTable
CREATE TABLE "OpeningBalance" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "balanceDate" TIMESTAMP(3) NOT NULL,
    "cashBalance" DECIMAL(10,2) NOT NULL,
    "easypaisaBalance" DECIMAL(10,2) NOT NULL,
    "jazzcashBalance" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OpeningBalance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpeningBalance_branchId_balanceDate_key" ON "OpeningBalance"("branchId", "balanceDate");
CREATE INDEX "OpeningBalance_branchId_balanceDate_idx" ON "OpeningBalance"("branchId", "balanceDate");

-- AddForeignKey
ALTER TABLE "OpeningBalance" ADD CONSTRAINT "OpeningBalance_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpeningBalance" ADD CONSTRAINT "OpeningBalance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
