CREATE TABLE "UserBranchAccess" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserBranchAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserBranchAccess_userId_branchId_key" ON "UserBranchAccess"("userId", "branchId");
CREATE INDEX "UserBranchAccess_branchId_idx" ON "UserBranchAccess"("branchId");
CREATE INDEX "UserBranchAccess_userId_isPrimary_idx" ON "UserBranchAccess"("userId", "isPrimary");

ALTER TABLE "UserBranchAccess" ADD CONSTRAINT "UserBranchAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBranchAccess" ADD CONSTRAINT "UserBranchAccess_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "UserBranchAccess" ("id", "userId", "branchId", "isPrimary", "createdAt")
SELECT
  'uba_' || substr(md5(u."id" || primary_branch."id"), 1, 20),
  u."id",
  primary_branch."id",
  true,
  CURRENT_TIMESTAMP
FROM "User" u
JOIN "Role" r ON r."id" = u."roleId"
CROSS JOIN LATERAL (
  SELECT b."id"
  FROM "Branch" b
  WHERE b."isActive" = true
  ORDER BY CASE WHEN lower(b."name") LIKE '%g-11%' THEN 0 ELSE 1 END, b."createdAt" ASC
  LIMIT 1
) primary_branch
WHERE r."code" IN ('ADMIN', 'SUPER_ADMIN', 'POS_STAFF')
ON CONFLICT ("userId", "branchId") DO NOTHING;
