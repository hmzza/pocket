CREATE TABLE "ShareTransfer" (
  "id" TEXT NOT NULL,
  "fromPartnerId" TEXT NOT NULL,
  "toPartnerId" TEXT NOT NULL,
  "percentage" DECIMAL(7,4) NOT NULL,
  "referenceAmount" DECIMAL(12,2) NOT NULL,
  "transferDate" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShareTransfer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShareTransfer_fromPartnerId_transferDate_idx" ON "ShareTransfer"("fromPartnerId", "transferDate");
CREATE INDEX "ShareTransfer_toPartnerId_transferDate_idx" ON "ShareTransfer"("toPartnerId", "transferDate");
CREATE INDEX "ShareTransfer_transferDate_idx" ON "ShareTransfer"("transferDate");

ALTER TABLE "ShareTransfer" ADD CONSTRAINT "ShareTransfer_fromPartnerId_fkey" FOREIGN KEY ("fromPartnerId") REFERENCES "InvestmentPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShareTransfer" ADD CONSTRAINT "ShareTransfer_toPartnerId_fkey" FOREIGN KEY ("toPartnerId") REFERENCES "InvestmentPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShareTransfer" ADD CONSTRAINT "ShareTransfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
