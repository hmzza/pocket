-- Add login and access control fields for staff/admin accounts.
ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "canAccessAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "canAccessPos" BOOLEAN NOT NULL DEFAULT false;

-- Backfill usernames for existing records so the new unique constraint can be applied.
UPDATE "User"
SET "username" = lower(
  regexp_replace(
    coalesce(nullif(split_part("email", '@', 1), ''), "name"),
    '[^a-zA-Z0-9]+',
    '_',
    'g'
  )
) || '_' || substring("id" from 1 for 6);

-- Let existing non-customer staff keep their current access paths.
UPDATE "User" AS u
SET
  "canAccessAdmin" = true,
  "canAccessPos" = true
FROM "Role" AS r
WHERE u."roleId" = r.id
  AND r.code IN ('ADMIN', 'SUPER_ADMIN', 'POS_STAFF');

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
