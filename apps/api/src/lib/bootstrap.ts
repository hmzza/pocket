import { RoleCode } from "@prisma/client";
import { prisma } from "./prisma.js";
import { hashPassword } from "./auth.js";
import { env } from "../config.js";
import { ensurePermissionCatalog } from "./permissions.js";
import { buildUniqueUsername } from "./username.js";
import { randomUUID } from "node:crypto";

const ADMIN_USERNAME = "superadmin_pocket";
const ADMIN_EMAIL = "admin@pocketshawarma.com";
const ADMIN_PHONE = "+92-300-0000001";
const ADMIN_BOOTSTRAP_MARKER = "system.admin.bootstrap.version";
const ADMIN_BOOTSTRAP_VERSION = 1;

async function ensureLegacyRiderUsers(riderRoleId: string) {
  const branch = await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true } });
  if (!branch) return;

  const legacyRiders = await prisma.deliveryRider.findMany({ where: { isActive: true } });
  for (const legacyRider of legacyRiders) {
    const existingByPhone = await prisma.user.findUnique({ where: { phone: legacyRider.phone } });
    if (existingByPhone) {
      if (existingByPhone.roleId === riderRoleId) {
        await prisma.userBranchAccess.upsert({
          where: { userId_branchId: { userId: existingByPhone.id, branchId: branch.id } },
          update: { isPrimary: true },
          create: { userId: existingByPhone.id, branchId: branch.id, isPrimary: true }
        });
      }
      continue;
    }

    const username = buildUniqueUsername(legacyRider.name);
    const user = await prisma.user.create({
      data: {
        roleId: riderRoleId,
        name: legacyRider.name,
        username,
        email: `${username}@rider.pocket.local`,
        phone: legacyRider.phone,
        passwordHash: await hashPassword(`Rider-${randomUUID()}`),
        isActive: true,
        canAccessAdmin: false,
        canAccessPos: false,
        branchAccesses: { create: { branchId: branch.id, isPrimary: true } }
      }
    });
    console.log(`Legacy delivery rider converted to user: ${user.username}`);
  }
}

/**
 * Reconciles the bootstrap admin after migrations. This is intentionally
 * narrower than the full seed so deploys do not overwrite catalog data.
 */
export async function ensureBootstrapAdmin() {
  await ensurePermissionCatalog();
  const role = await prisma.role.upsert({
    where: { code: RoleCode.SUPER_ADMIN },
    update: { label: "Super Admin" },
    create: { code: RoleCode.SUPER_ADMIN, label: "Super Admin" }
  });
  const riderRole = await prisma.role.upsert({
    where: { code: RoleCode.DELIVERY_RIDER },
    update: { label: "Rider" },
    create: { code: RoleCode.DELIVERY_RIDER, label: "Rider" }
  });

  const configuredEmail = env.INITIAL_ADMIN_EMAIL || ADMIN_EMAIL;
  const configuredPassword = env.INITIAL_ADMIN_PASSWORD || "PocketAdmin123!";
  const [bootstrapMarker, byEmail, byUsername] = await Promise.all([
    prisma.setting.findUnique({ where: { key: ADMIN_BOOTSTRAP_MARKER } }),
    prisma.user.findUnique({ where: { email: configuredEmail } }),
    prisma.user.findUnique({ where: { username: ADMIN_USERNAME } })
  ]);

  if (byEmail && byUsername && byEmail.id !== byUsername.id) {
    throw new Error(`Bootstrap admin username is already used by another account: ${ADMIN_USERNAME}`);
  }

  const existing = byEmail ?? byUsername;
  const credentialsNeedRepair = !bootstrapMarker || existing?.username !== ADMIN_USERNAME;
  const data = {
    name: "Pocket Admin",
    username: ADMIN_USERNAME,
    email: configuredEmail,
    phone: ADMIN_PHONE,
    roleId: role.id,
    isActive: true,
    canAccessAdmin: true,
    canAccessPos: true
  };

  if (!existing) {
    await prisma.user.create({
      data: {
        ...data,
        passwordHash: await hashPassword(configuredPassword)
      }
    });
    await prisma.setting.upsert({
      where: { key: ADMIN_BOOTSTRAP_MARKER },
      update: {
        value: {
          version: ADMIN_BOOTSTRAP_VERSION,
          completedAt: new Date().toISOString()
        }
      },
      create: {
        key: ADMIN_BOOTSTRAP_MARKER,
        value: {
          version: ADMIN_BOOTSTRAP_VERSION,
          completedAt: new Date().toISOString()
        }
      }
    });
    console.log(`Bootstrap admin created: ${ADMIN_USERNAME}`);
    await ensureLegacyRiderUsers(riderRole.id);
    return;
  }

  // Reset the password only while migrating a legacy account. Once the
  // canonical username is in place, user-managed password changes persist.
  await prisma.user.update({
    where: { id: existing.id },
    data: {
      ...data,
      ...(credentialsNeedRepair ? { passwordHash: await hashPassword(configuredPassword) } : {})
    }
  });

  await prisma.setting.upsert({
    where: { key: ADMIN_BOOTSTRAP_MARKER },
    update: {
      value: {
        version: ADMIN_BOOTSTRAP_VERSION,
        completedAt: new Date().toISOString()
      }
    },
    create: {
      key: ADMIN_BOOTSTRAP_MARKER,
      value: {
        version: ADMIN_BOOTSTRAP_VERSION,
        completedAt: new Date().toISOString()
      }
    }
  });

  if (existing.username !== ADMIN_USERNAME || credentialsNeedRepair) {
    console.log(`Bootstrap admin migrated to username: ${ADMIN_USERNAME}`);
  }
  await ensureLegacyRiderUsers(riderRole.id);
}
