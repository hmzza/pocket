-- Add payment-source tracking and daily closing support.
-- Existing expense rows default to CASH; no existing data is deleted.

ALTER TABLE "Expense" ADD COLUMN "paymentSource" TEXT NOT NULL DEFAULT 'CASH';

CREATE TABLE "MoneyTransfer" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "fromSource" TEXT NOT NULL,
    "toSource" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "transferDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoneyTransfer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MoneyTransfer_branchId_transferDate_idx" ON "MoneyTransfer"("branchId", "transferDate");

ALTER TABLE "MoneyTransfer" ADD CONSTRAINT "MoneyTransfer_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MoneyTransfer" ADD CONSTRAINT "MoneyTransfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DailyClosing" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "closingDate" TIMESTAMP(3) NOT NULL,
    "cashExpected" DECIMAL(10,2) NOT NULL,
    "cashCounted" DECIMAL(10,2) NOT NULL,
    "easypaisaExpected" DECIMAL(10,2) NOT NULL,
    "easypaisaCounted" DECIMAL(10,2) NOT NULL,
    "jazzcashExpected" DECIMAL(10,2) NOT NULL,
    "jazzcashCounted" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyClosing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyClosing_branchId_closingDate_key" ON "DailyClosing"("branchId", "closingDate");

ALTER TABLE "DailyClosing" ADD CONSTRAINT "DailyClosing_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyClosing" ADD CONSTRAINT "DailyClosing_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
