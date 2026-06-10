INSERT INTO "Role" ("id", "code", "label", "createdAt", "updatedAt")
VALUES ('role-pos-staff', 'POS_STAFF', 'POS Staff', NOW(), NOW())
ON CONFLICT ("code")
DO UPDATE SET
  "label" = EXCLUDED."label",
  "updatedAt" = NOW();

INSERT INTO "User" (
  "id",
  "roleId",
  "name",
  "email",
  "phone",
  "passwordHash",
  "isActive",
  "marketingOptIn",
  "createdAt",
  "updatedAt"
)
VALUES (
  'user-pos-staff-default',
  (SELECT "id" FROM "Role" WHERE "code" = 'POS_STAFF'),
  'Pocket Counter Staff',
  'counter@pocketshawarma.com',
  '+92-300-0000033',
  '$2a$12$mYFchwtlEA7idZvR8bRaNeLkghGWIw4CgeKrcZLKHOxDwguMXeqg2',
  TRUE,
  FALSE,
  NOW(),
  NOW()
)
ON CONFLICT ("email")
DO UPDATE SET
  "roleId" = (SELECT "id" FROM "Role" WHERE "code" = 'POS_STAFF'),
  "name" = EXCLUDED."name",
  "phone" = EXCLUDED."phone",
  "passwordHash" = EXCLUDED."passwordHash",
  "isActive" = TRUE,
  "updatedAt" = NOW();
