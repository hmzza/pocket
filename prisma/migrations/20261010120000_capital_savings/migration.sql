CREATE TYPE "SavingsMovementType" AS ENUM ('ADD', 'RELEASE');

CREATE TABLE "SavingsMovement" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "type" "SavingsMovementType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "source" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavingsMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SavingsMovement_branchId_businessDate_idx" ON "SavingsMovement"("branchId", "businessDate");
CREATE INDEX "SavingsMovement_branchId_source_idx" ON "SavingsMovement"("branchId", "source");

ALTER TABLE "SavingsMovement" ADD CONSTRAINT "SavingsMovement_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavingsMovement" ADD CONSTRAINT "SavingsMovement_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
