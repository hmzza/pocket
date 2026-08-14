-- Add rare non-revenue wallet inflows used by Daily Closing reconciliation.
CREATE TABLE "MoneyAddition" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "toSource" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "additionDate" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoneyAddition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MoneyAddition_branchId_additionDate_idx" ON "MoneyAddition"("branchId", "additionDate");
CREATE INDEX "MoneyAddition_toSource_idx" ON "MoneyAddition"("toSource");

ALTER TABLE "MoneyAddition" ADD CONSTRAINT "MoneyAddition_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MoneyAddition" ADD CONSTRAINT "MoneyAddition_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
