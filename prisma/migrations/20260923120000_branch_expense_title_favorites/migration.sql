CREATE TABLE "ExpenseTitleFavorite" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExpenseTitleFavorite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExpenseTitleFavorite_branchId_title_key" ON "ExpenseTitleFavorite"("branchId", "title");
CREATE INDEX "ExpenseTitleFavorite_branchId_idx" ON "ExpenseTitleFavorite"("branchId");

ALTER TABLE "ExpenseTitleFavorite"
ADD CONSTRAINT "ExpenseTitleFavorite_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
