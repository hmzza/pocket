import { RoleCode } from "@prisma/client";
import { prisma } from "./prisma.js";
import { hashPassword } from "./auth.js";
import { env } from "../config.js";

const ADMIN_USERNAME = "superadmin_pocket";
const ADMIN_EMAIL = "admin@pocketshawarma.com";
const ADMIN_PHONE = "+92-300-0000001";
const ADMIN_BOOTSTRAP_MARKER = "system.admin.bootstrap.version";
const ADMIN_BOOTSTRAP_VERSION = 1;

/**
 * Reconciles the bootstrap admin after migrations. This is intentionally
 * narrower than the full seed so deploys do not overwrite catalog data.
 */
export async function ensureBootstrapAdmin() {
  const role = await prisma.role.upsert({
    where: { code: RoleCode.SUPER_ADMIN },
    update: { label: "Super Admin" },
    create: { code: RoleCode.SUPER_ADMIN, label: "Super Admin" }
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
}
