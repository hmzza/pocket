ALTER TABLE "ExpenseTitleFavorite"
ADD COLUMN "category" TEXT NOT NULL DEFAULT '';

UPDATE "ExpenseTitleFavorite" AS favorite
SET "category" = COALESCE((
    SELECT expense."category"
    FROM "Expense" AS expense
    WHERE expense."branchId" = favorite."branchId"
      AND expense."title" = favorite."title"
    ORDER BY expense."expenseDate" DESC, expense."createdAt" DESC
    LIMIT 1
), '');
