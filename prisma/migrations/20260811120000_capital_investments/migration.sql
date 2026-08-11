CREATE TABLE "InvestmentPartner" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "note" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InvestmentPartner_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvestmentCommitment" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "commitmentDate" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InvestmentCommitment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvestmentPayment" (
  "id" TEXT NOT NULL,
  "commitmentId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "receivedSource" TEXT NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InvestmentPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvestmentPartner_name_idx" ON "InvestmentPartner"("name");
CREATE INDEX "InvestmentCommitment_partnerId_idx" ON "InvestmentCommitment"("partnerId");
CREATE INDEX "InvestmentCommitment_commitmentDate_idx" ON "InvestmentCommitment"("commitmentDate");
CREATE INDEX "InvestmentPayment_commitmentId_idx" ON "InvestmentPayment"("commitmentId");
CREATE INDEX "InvestmentPayment_branchId_paymentDate_idx" ON "InvestmentPayment"("branchId", "paymentDate");
CREATE INDEX "InvestmentPayment_receivedSource_idx" ON "InvestmentPayment"("receivedSource");

ALTER TABLE "InvestmentPartner" ADD CONSTRAINT "InvestmentPartner_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvestmentCommitment" ADD CONSTRAINT "InvestmentCommitment_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "InvestmentPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvestmentCommitment" ADD CONSTRAINT "InvestmentCommitment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvestmentPayment" ADD CONSTRAINT "InvestmentPayment_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "InvestmentCommitment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvestmentPayment" ADD CONSTRAINT "InvestmentPayment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvestmentPayment" ADD CONSTRAINT "InvestmentPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
