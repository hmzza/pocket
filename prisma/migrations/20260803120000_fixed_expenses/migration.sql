-- CreateTable
CREATE TABLE "FixedExpense" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdById" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "monthlyAmount" DECIMAL(10,2) NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "autoRepeat" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FixedExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedExpenseOccurrence" (
    "id" TEXT NOT NULL,
    "fixedExpenseId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FixedExpenseOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FixedExpense_branchId_isActive_idx" ON "FixedExpense"("branchId", "isActive");
CREATE UNIQUE INDEX "FixedExpenseOccurrence_expenseId_key" ON "FixedExpenseOccurrence"("expenseId");
CREATE UNIQUE INDEX "FixedExpenseOccurrence_fixedExpenseId_monthKey_key" ON "FixedExpenseOccurrence"("fixedExpenseId", "monthKey");
CREATE INDEX "FixedExpenseOccurrence_monthKey_status_idx" ON "FixedExpenseOccurrence"("monthKey", "status");

-- AddForeignKey
ALTER TABLE "FixedExpense" ADD CONSTRAINT "FixedExpense_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FixedExpense" ADD CONSTRAINT "FixedExpense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FixedExpenseOccurrence" ADD CONSTRAINT "FixedExpenseOccurrence_fixedExpenseId_fkey" FOREIGN KEY ("fixedExpenseId") REFERENCES "FixedExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FixedExpenseOccurrence" ADD CONSTRAINT "FixedExpenseOccurrence_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
