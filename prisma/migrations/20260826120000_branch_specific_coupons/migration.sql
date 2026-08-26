-- Preserve every existing coupon and assign legacy rows to the current branch.
ALTER TABLE "Coupon" ADD COLUMN "branchId" TEXT;

DO $$
DECLARE
  current_branch_id TEXT;
BEGIN
  SELECT "id" INTO current_branch_id
  FROM "Branch"
  WHERE "slug" = 'islamabad-g11'
  LIMIT 1;

  IF current_branch_id IS NULL THEN
    RAISE EXCEPTION 'Cannot assign legacy coupons: branch islamabad-g11 does not exist';
  END IF;

  UPDATE "Coupon"
  SET "branchId" = current_branch_id
  WHERE "branchId" IS NULL;
END $$;

ALTER TABLE "Coupon" ALTER COLUMN "branchId" SET NOT NULL;
DROP INDEX IF EXISTS "Coupon_code_key";
CREATE UNIQUE INDEX "Coupon_branchId_code_key" ON "Coupon"("branchId", "code");
CREATE INDEX "Coupon_branchId_isActive_idx" ON "Coupon"("branchId", "isActive");

ALTER TABLE "Coupon"
  ADD CONSTRAINT "Coupon_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
