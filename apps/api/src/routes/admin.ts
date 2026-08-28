import { Router } from "express";
import { InventoryTransactionType, OrderStatus, PaymentMethod, Prisma, RoleCode, ServiceType } from "@prisma/client";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import * as XLSX from "xlsx";
import { hashPassword } from "../lib/auth.js";
import { buildUniqueUsername } from "../lib/username.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { INVENTORY_TRANSACTION_OPTIONS, prisma } from "../lib/prisma.js";
import { writeAuditLog } from "../lib/audit.js";
import { applyOrderInventory, recordInventoryChange } from "../lib/inventory.js";
import { CANONICAL_MEAL_PRODUCT_SLUG, MEAL_BASE_PRICE, MEAL_CATEGORY_SLUG, THELA_FRIES_SLUG, syncMealPairingOptions } from "../lib/meal-options.js";
import { getAccessibleBranchesForUser, readRequestedBranchId, resolveBranchContext } from "../lib/branch-context.js";
import { PERMISSION_DEFINITIONS, requireAdminRoutePermission } from "../lib/permissions.js";
import { readIndependencePromotion, readPromotionStats, saveIndependencePromotion } from "../lib/promotions.js";
import { dispatchDeliveryOrder } from "../lib/delivery.js";
import { publishDeliveryOrderEvent, subscribeToDeliveryOrderEvents } from "../lib/delivery-events.js";
import {
  REPORT_TIME_ZONE,
  businessDayRange,
  businessMonthRange,
  businessYearRange,
  getBusinessDateKey,
  getBusinessWeekdayIndex,
  getPakistanHour,
  formatPakistanDate
} from "../lib/business-day.js";

const router = Router();
const FOODPANDA_COMMISSION_RATE = 0.38;
const API_UPLOADS_IMAGES_DIR = fileURLToPath(new URL("../../public/uploads/images/", import.meta.url));
const API_UPLOADS_VENDOR_RATE_LISTS_DIR = fileURLToPath(new URL("../../public/uploads/vendor-rate-lists/", import.meta.url));
const VENDORS_WORKBOOK_PATH = fileURLToPath(new URL("../../../../data/vendors.xlsx", import.meta.url));

router.use(authenticate, authorize(RoleCode.SUPER_ADMIN, RoleCode.POS_STAFF), requireAdminRoutePermission());

const dashboardQueryBaseSchema = z.object({
  preset: z.enum(["today", "7d", "30d", "month", "year", "custom"]).default("today"),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  monthKey: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  segment: z.enum(["all", "inshop", "foodpanda", "delivery"]).default("all")
});

const dashboardQuerySchema = dashboardQueryBaseSchema.superRefine((value, context) => {
  if (value.preset === "custom" && (!value.start || !value.end)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Custom range requires start and end dates.",
      path: ["start"]
    });
  }
});

function startOfDay(date: Date) {
  return businessDayRange(getBusinessDateKey(date)).start;
}

function endOfDay(date: Date) {
  return businessDayRange(getBusinessDateKey(date)).end;
}

function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value;
}

function addMonths(date: Date, months: number) {
  const value = new Date(date);
  value.setUTCMonth(value.getUTCMonth() + months);
  return value;
}

function addYears(date: Date, years: number) {
  const value = new Date(date);
  value.setUTCFullYear(value.getUTCFullYear() + years);
  return value;
}

function getPakistanDateKey(date: Date) {
  return getBusinessDateKey(date);
}

function getPakistanWeekdayIndex(date: Date) {
  return getBusinessWeekdayIndex(date);
}

function startOfPakistanMonth(date: Date) {
  return businessMonthRange(getBusinessDateKey(date).slice(0, 7)).start;
}

function startOfPakistanWeek(date: Date) {
  const weekday = getPakistanWeekdayIndex(date);
  return startOfDay(addDays(date, -((weekday + 6) % 7)));
}

function buildFoodpandaSettlementRange(period: "week" | "month" | "year") {
  const now = new Date();
  const businessKey = getBusinessDateKey(now);
  const businessYear = Number(businessKey.slice(0, 4));
  const start = period === "week"
    ? startOfPakistanWeek(now)
    : period === "month"
      ? startOfPakistanMonth(now)
      : businessYearRange(businessYear).start;
  return { start, end: endOfDay(now), label: period === "week" ? "This week (6AM-6AM)" : period === "month" ? "This month (6AM-6AM)" : "This year (6AM-6AM)" };
}

function buildDashboardRange(query: z.infer<typeof dashboardQuerySchema>) {
  const now = new Date();

  if (query.preset === "custom" && query.start && query.end) {
    const start = new Date(query.start);
    const end = new Date(query.end);
    return {
      preset: query.preset,
      start,
      end,
      label: `${formatPakistanDate(businessDayRange(getBusinessDateKey(start)).start, { dateStyle: "medium" })} to ${formatPakistanDate(businessDayRange(getBusinessDateKey(end)).start, { dateStyle: "medium" })} (6AM-6AM)`
    };
  }

  switch (query.preset) {
    case "today": {
      const start = startOfDay(now);
      return {
        preset: query.preset,
        start,
        end: endOfDay(now),
        label: "Today (6AM-6AM)"
      };
    }
    case "30d": {
      return {
        preset: query.preset,
        start: startOfDay(addDays(now, -29)),
        end: endOfDay(now),
        label: "Last 30 business days"
      };
    }
    case "month": {
      const monthKey = query.monthKey ?? getBusinessDateKey(now).slice(0, 7);
      const monthRange = businessMonthRange(monthKey);
      return {
        preset: query.preset,
        start: monthRange.start,
        end: query.monthKey ? monthRange.end : endOfDay(now),
        label: query.monthKey
          ? `${formatPakistanDate(monthRange.start, { month: "long", year: "numeric" })} (6AM-6AM)`
          : "This month (6AM-6AM)"
      };
    }
    case "year": {
      const yearRange = businessYearRange(Number(getBusinessDateKey(now).slice(0, 4)));
      return {
        preset: query.preset,
        start: yearRange.start,
        end: endOfDay(now),
        label: "This year (6AM-6AM)"
      };
    }
    case "7d": {
      return {
        preset: query.preset,
        start: startOfDay(addDays(now, -6)),
        end: endOfDay(now),
        label: "Last 7 business days"
      };
    }
    default:
      return {
        preset: "today" as const,
        start: startOfDay(now),
        end: endOfDay(now),
        label: "Today (6AM-6AM)"
      };
  }
}

function getPreviousRange(start: Date, end: Date) {
  const durationMs = end.getTime() - start.getTime();
  const previousEnd = new Date(start.getTime());
  const previousStart = new Date(start.getTime() - durationMs);
  return { previousStart, previousEnd };
}

function percentageDelta(current: number, previous: number) {
  if (!previous) {
    return current ? 100 : 0;
  }

  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function normalizeSku(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildProductSlug(name: string) {
  const base = normalizeSlug(name).slice(0, 40) || "product";
  return `${base}-${Date.now().toString(36)}`;
}

async function buildUniqueBranchSlug(name: string, city: string) {
  const base = normalizeSlug(`${name}-${city}`).slice(0, 48) || `branch-${Date.now().toString(36)}`;
  let slug = base;
  let suffix = 2;

  while (await prisma.branch.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

const INVENTORY_ITEM_TYPES = ["RAW", "PREPARED", "PACKAGING", "RETAIL"] as const;
const DEFAULT_PACKAGING_SERVICE = "DEFAULT";
const PACKAGING_SERVICE_TYPES = [DEFAULT_PACKAGING_SERVICE, ...Object.values(ServiceType)] as const;
const MONEY_SOURCES = ["CASH", "EASYPAISA", "JAZZCASH"] as const;
const PACKAGING_QUANTITY_MODES = ["FIXED", "PER_ITEM_STEP"] as const;

function adminActionError({
  message,
  statusCode,
  code,
  details,
  entity,
  action
}: {
  message: string;
  statusCode: number;
  code: string;
  details?: unknown;
  entity?: string;
  action?: string;
}) {
  return Object.assign(new Error(message), {
    statusCode,
    code,
    details,
    entity,
    action
  });
}

function blockedDeleteError(entityLabel: string) {
  return adminActionError({
    message: `${entityLabel} cannot be deleted because it is linked to protected history.`,
    statusCode: 409,
    code: "DELETE_BLOCKED_BY_HISTORY",
    details: {
      reason: "This record is connected to history that must remain consistent.",
      nextStep: "Use Disable for temporary removal, or delete the protected history first if you really want a permanent cleanup."
    },
    entity: entityLabel,
    action: "delete"
  });
}

function rethrowDeleteError(error: unknown, entityLabel: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2003", "P2014"].includes(error.code)) {
    throw blockedDeleteError(entityLabel);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    throw adminActionError({
      message: `Could not delete ${entityLabel}.`,
      statusCode: error.code === "P2025" ? 404 : 500,
      code: error.code,
      details: error.message,
      entity: entityLabel,
      action: "delete"
    });
  }
  throw error;
}

async function ignoreMissingOptionalTable(task: () => Promise<unknown>) {
  try {
    await task();
  } catch (error) {
    if (isMissingTableError(error)) return;
    throw error;
  }
}

function skuPrefix(value: string, fallback: string) {
  const normalized = normalizeSku(value).replace(/-/g, "");
  return (normalized.slice(0, 5) || fallback).toUpperCase();
}

async function buildNextProductSku(client: Prisma.TransactionClient, categoryId: string) {
  const category = await client.category.findUnique({
    where: { id: categoryId },
    select: { slug: true, name: true }
  });
  const prefix = skuPrefix(category?.slug || category?.name || "PRODUCT", "PRD");
  const existing = await client.product.findMany({
    where: { sku: { startsWith: `${prefix}-` } },
    select: { sku: true }
  });
  const nextNumber =
    existing.reduce((max, product) => {
      const match = product.sku.match(new RegExp(`^${prefix}-(\\d+)$`));
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
  return `${prefix}-${String(nextNumber).padStart(3, "0")}`;
}

async function buildNextInventorySku(client: Prisma.TransactionClient, type: string, name: string) {
  const prefixByType: Record<string, string> = {
    RAW: "ING",
    PREPARED: "PREP",
    PACKAGING: "PACK",
    RETAIL: "RTL"
  };
  const prefix = prefixByType[type] ?? skuPrefix(name, "ITEM");
  const existing = await client.ingredient.findMany({
    where: { sku: { startsWith: `${prefix}-` } },
    select: { sku: true }
  });
  const nextNumber =
    existing.reduce((max, ingredient) => {
      const match = ingredient.sku.match(new RegExp(`^${prefix}-(\\d+)$`));
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
  return `${prefix}-${String(nextNumber).padStart(3, "0")}`;
}

function guessCaloriesPerUnit(name: string, type: string) {
  if (type === "PACKAGING") return 0;
  const value = name.toLowerCase();
  const guesses: Array<[string, number]> = [
    ["chicken", 1650],
    ["mayo", 6800],
    ["cream", 3450],
    ["cheese", 4020],
    ["fries", 3120],
    ["oil", 8840],
    ["sugar", 3870],
    ["bread", 180],
    ["milk", 620],
    ["icecream", 2100],
    ["sauce", 800],
    ["ketchup", 1120],
    ["mustard", 660],
    ["jalep", 290],
    ["olive", 1150],
    ["mushroom", 220],
    ["corn", 860],
    ["carrot", 410],
    ["lettuce", 150],
    ["cucumber", 160],
    ["capsicum", 310],
    ["sprite", 390],
    ["pepsi", 410],
    ["7up", 390],
    ["fanta", 480]
  ];
  return guesses.find(([token]) => value.includes(token))?.[1] ?? 0;
}

function normalizeBundleComponents(
  components: Array<{ componentProductId: string; quantity: number; sortOrder?: number }> | undefined
) {
  return (components ?? [])
    .filter((component) => component.componentProductId)
    .map((component, index) => ({
      componentProductId: component.componentProductId,
      quantity: Math.max(1, Math.floor(component.quantity)),
      sortOrder: typeof component.sortOrder === "number" ? component.sortOrder : index + 1
    }))
    .filter((component, index, list) => list.findIndex((entry) => entry.componentProductId === component.componentProductId) === index);
}

function validateCanonicalMealSetup(
  categorySlug: string,
  slug: string,
  components: Array<{ componentProductId: string; quantity: number }>,
  componentProducts: Array<{ id: string; slug?: string }>
) {
  if (categorySlug !== MEAL_CATEGORY_SLUG || slug !== CANONICAL_MEAL_PRODUCT_SLUG) return;

  const friesComponent = components.length === 1
    ? componentProducts.find((product) => product.id === components[0]?.componentProductId)
    : undefined;
  if (!friesComponent || friesComponent.slug !== THELA_FRIES_SLUG || components[0]?.quantity !== 1) {
    throw Object.assign(new Error("Make It A Meal must contain exactly one Thela Fries bundle component."), { statusCode: 400 });
  }
}

const vendorSchema = z.object({
  ingredientCategory: z.string().min(1).max(120),
  vendorName: z.string().min(1).max(120),
  contactNumber: z.string().max(40).optional().or(z.literal("")),
  type: z.string().max(40).optional().or(z.literal("")),
  provides: z.string().max(240).optional().or(z.literal("")),
  quotedPrice: z.string().max(120).optional().or(z.literal("")),
  rateListUrl: z.string().max(240).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal(""))
});

type VendorRecord = z.infer<typeof vendorSchema> & {
  id: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type VendorCategoryRecord = {
  name: string;
  createdAt: string;
  updatedAt: string;
};

type VendorWorkbookData = {
  vendors: VendorRecord[];
  categories: VendorCategoryRecord[];
};

async function readVendorWorkbook(): Promise<VendorWorkbookData> {
  return Promise.resolve().then(async () => {
    try {
      const buffer = await readFile(VENDORS_WORKBOOK_PATH);
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const vendorSheet = workbook.Sheets[workbook.SheetNames[0] ?? "Vendors"];
      const categorySheet = workbook.Sheets.Categories;

      const vendorRows = vendorSheet
        ? XLSX.utils.sheet_to_json<Record<string, unknown>>(vendorSheet, { defval: "" })
        : [];
      const vendors = vendorRows
        .map((row) => ({
          id: String(row.id ?? row.ID ?? randomUUID()),
          ingredientCategory: String(row.ingredientCategory ?? row["Ingredient / Category"] ?? "").trim(),
          vendorName: String(row.vendorName ?? row["Vendor Name"] ?? "").trim(),
          contactNumber: String(row.contactNumber ?? row["Contact Number"] ?? "").trim(),
          type: String(row.type ?? row["Type"] ?? "Vendor").trim() || "Vendor",
          provides: String(row.provides ?? row["Provides"] ?? "").trim(),
          quotedPrice: String(row.quotedPrice ?? row["Quoted Price"] ?? "").trim(),
          rateListUrl: String(row.rateListUrl ?? row["Rate List URL"] ?? "").trim(),
          notes: String(row.notes ?? row["Notes"] ?? "").trim(),
          isActive: String(row.isActive ?? row["Active"] ?? "true").toLowerCase() !== "false",
          createdAt: String(row.createdAt ?? new Date().toISOString()),
          updatedAt: String(row.updatedAt ?? new Date().toISOString())
        }))
        .filter((row) => row.ingredientCategory.length && row.vendorName.length);

      const categoryRows = categorySheet
        ? XLSX.utils.sheet_to_json<Record<string, unknown>>(categorySheet, { defval: "" })
        : [];
      const categoryMap = new Map<string, VendorCategoryRecord>();
      for (const row of categoryRows) {
        const name = String(row.name ?? row.category ?? "").trim();
        if (!name || categoryMap.has(name.toLowerCase())) continue;
        categoryMap.set(name.toLowerCase(), {
          name,
          createdAt: String(row.createdAt ?? new Date().toISOString()),
          updatedAt: String(row.updatedAt ?? new Date().toISOString())
        });
      }
      for (const vendor of vendors) {
        if (categoryMap.has(vendor.ingredientCategory.toLowerCase())) continue;
        categoryMap.set(vendor.ingredientCategory.toLowerCase(), {
          name: vendor.ingredientCategory,
          createdAt: vendor.createdAt,
          updatedAt: vendor.updatedAt
        });
      }

      return { vendors, categories: Array.from(categoryMap.values()) };
    } catch (readError) {
      if ((readError as NodeJS.ErrnoException).code === "ENOENT") {
        return { vendors: [], categories: [] };
      }
      throw readError;
    }
  });
}

async function writeVendorSheetRows(rows: VendorRecord[], categories: VendorCategoryRecord[]) {
  await mkdir(path.dirname(VENDORS_WORKBOOK_PATH), { recursive: true });
  const workbook = XLSX.utils.book_new();
  const vendorSheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      id: row.id,
      ingredientCategory: row.ingredientCategory,
      vendorName: row.vendorName,
      contactNumber: row.contactNumber,
      type: row.type,
      provides: row.provides,
      quotedPrice: row.quotedPrice,
      rateListUrl: row.rateListUrl,
      notes: row.notes,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }))
  );
  const categorySheet = XLSX.utils.json_to_sheet(
    categories.map((category) => ({
      name: category.name,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt
    }))
  );
  XLSX.utils.book_append_sheet(workbook, vendorSheet, "Vendors");
  XLSX.utils.book_append_sheet(workbook, categorySheet, "Categories");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
  await writeFile(VENDORS_WORKBOOK_PATH, buffer);
}

function addVendorCategory(categories: VendorCategoryRecord[], name: string) {
  const normalizedName = name.trim();
  if (categories.some((category) => category.name.toLowerCase() === normalizedName.toLowerCase())) {
    return categories;
  }

  const now = new Date().toISOString();
  return [...categories, { name: normalizedName, createdAt: now, updatedAt: now }];
}

const manageableUserRoleCodes = ["SUPER_ADMIN", "POS_STAFF"] as const;
type ManageableUserRoleCode = (typeof manageableUserRoleCodes)[number];

const userQuerySchema = z.object({
  search: z.string().trim().optional()
});

const userWriteSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  username: z.string().min(2).max(80).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(8).max(20).optional().or(z.literal("")),
  password: z.string().min(8),
  roleCode: z.enum(manageableUserRoleCodes),
  branchId: z.string().cuid().optional().or(z.literal("")),
  isActive: z.boolean().optional(),
  canAccessAdmin: z.boolean().optional(),
  canAccessPos: z.boolean().optional(),
  permissionKeys: z.array(z.string()).optional()
});

const userPatchSchema = userWriteSchema.partial().extend({
  password: z.string().min(8).optional()
});

const deliveryRiderWriteSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(8).max(24),
  isActive: z.boolean().optional()
});

const deliveryRiderPatchSchema = deliveryRiderWriteSchema.partial();

function normalizePakistanMobile(value: string) {
  const digits = value.replace(/\D/g, "");
  const normalized = digits.startsWith("0")
    ? `+92${digits.slice(1)}`
    : digits.startsWith("92")
      ? `+${digits}`
      : digits.startsWith("3")
        ? `+92${digits}`
        : "";

  if (!/^\+923\d{9}$/.test(normalized)) {
    throw Object.assign(new Error("Use a valid Pakistani mobile number, for example +92 341 1471884."), { statusCode: 400 });
  }

  return normalized;
}

function serializeDeliveryRider(rider: { id: string; name: string; phone: string; isActive: boolean; createdAt: Date; updatedAt: Date }) {
  return {
    id: rider.id,
    name: rider.name,
    phone: rider.phone,
    isActive: rider.isActive,
    createdAt: rider.createdAt.toISOString(),
    updatedAt: rider.updatedAt.toISOString()
  };
}

function serializeManagedUser(user: {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  canAccessAdmin: boolean;
  canAccessPos: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  role: {
    code: RoleCode;
    label: string;
  };
  branchAccesses?: Array<{
    branchId: string;
    isPrimary: boolean;
    branch: {
      id: string;
      name: string;
      slug: string;
    };
  }>;
  permissionGrants?: Array<{
    permission: {
      key: string;
      label: string;
    };
  }>;
}) {
  const branches = user.branchAccesses ?? [];
  const primaryBranch = branches.find((branch) => branch.isPrimary) ?? branches[0] ?? null;

  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    phone: user.phone ?? undefined,
    roleCode: user.role.code as ManageableUserRoleCode,
    roleLabel: user.role.label,
    isActive: user.isActive,
    canAccessAdmin: user.role.code === RoleCode.SUPER_ADMIN || (user.permissionGrants ?? []).some((grant) => grant.permission.key !== "POS"),
    canAccessPos: user.role.code === RoleCode.SUPER_ADMIN || (user.permissionGrants ?? []).some((grant) => grant.permission.key === "POS"),
    permissionKeys: user.role.code === RoleCode.SUPER_ADMIN ? PERMISSION_DEFINITIONS.map((permission) => permission.key) : (user.permissionGrants ?? []).map((grant) => grant.permission.key),
    permissions: user.role.code === RoleCode.SUPER_ADMIN ? PERMISSION_DEFINITIONS.map(({ key, label }) => ({ key, label })) : (user.permissionGrants ?? []).map((grant) => grant.permission),
    branchId: primaryBranch?.branchId ?? "",
    branchName: primaryBranch?.branch.name ?? "",
    branches: branches.map((branch) => ({
      id: branch.branch.id,
      name: branch.branch.name,
      slug: branch.branch.slug,
      isPrimary: branch.isPrimary
    })),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  };
}

function validatePermissionKeys(requestedKeys?: string[]) {
  const allowedKeys = new Set(PERMISSION_DEFINITIONS.map((permission) => permission.key));
  const permissionKeys = [...new Set(requestedKeys ?? [])];
  const invalidKey = permissionKeys.find((key) => !allowedKeys.has(key as typeof PERMISSION_DEFINITIONS[number]["key"]));
  if (invalidKey) {
    throw Object.assign(new Error(`Unknown permission: ${invalidKey}.`), { statusCode: 400, code: "UNKNOWN_PERMISSION" });
  }
  return permissionKeys;
}

async function replaceUserPermissions(userId: string, roleCode: RoleCode, requestedKeys?: string[]) {
  if (roleCode === RoleCode.SUPER_ADMIN) {
    await prisma.userPermission.deleteMany({ where: { userId } });
    return;
  }

  const permissionKeys = validatePermissionKeys(requestedKeys);

  const permissions = await prisma.permission.findMany({ where: { key: { in: permissionKeys }, isActive: true } });
  await prisma.$transaction([
    prisma.userPermission.deleteMany({ where: { userId } }),
    prisma.userPermission.createMany({ data: permissions.map((permission) => ({ userId, permissionId: permission.id })) })
  ]);
}

async function replaceUserPrimaryBranchAccess(userId: string, roleCode: RoleCode, branchId?: string | null) {
  if (roleCode === RoleCode.SUPER_ADMIN) {
    await prisma.userBranchAccess.deleteMany({ where: { userId } });
    return;
  }

  const activeBranch = branchId
    ? await prisma.branch.findFirst({ where: { id: branchId, isActive: true }, select: { id: true } })
    : await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true } });

  if (!activeBranch) {
    throw Object.assign(new Error("An active branch is required for this user."), {
      statusCode: 400,
      code: "USER_BRANCH_REQUIRED",
      entity: "User",
      action: "save",
      details: { nextStep: "Create or activate a branch first." }
    });
  }

  await prisma.$transaction([
    prisma.userBranchAccess.deleteMany({ where: { userId } }),
    prisma.userBranchAccess.create({
      data: {
        userId,
        branchId: activeBranch.id,
        isPrimary: true
      }
    })
  ]);
}

const branchWriteSchema = z.object({
  name: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  addressLine1: z.string().trim().min(2).max(180),
  phone: z.string().trim().min(5).max(30),
  email: z.string().trim().email().optional().or(z.literal("")),
  deliveryFee: z.number().nonnegative().max(100_000).default(0),
  isActive: z.boolean().default(true)
});

const branchPatchSchema = branchWriteSchema.partial();

function serializeAdminBranch(branch: {
  id: string;
  slug: string;
  name: string;
  city: string;
  addressLine1: string;
  phone: string;
  email: string | null;
  deliveryFee: Prisma.Decimal | number | string;
  isActive: boolean;
}) {
  return {
    id: branch.id,
    slug: branch.slug,
    name: branch.name,
    city: branch.city,
    addressLine1: branch.addressLine1,
    phone: branch.phone,
    email: branch.email ?? "",
    deliveryFee: parseDecimal(branch.deliveryFee),
    isActive: branch.isActive
  };
}

async function initializeBranchSetup(transaction: Prisma.TransactionClient, branchId: string) {
  const [products, ingredients] = await Promise.all([
    transaction.product.findMany({
      where: { isActive: true },
      select: { id: true, basePrice: true }
    }),
    transaction.ingredient.findMany({
      where: { isActive: true },
      select: { id: true }
    })
  ]);

  if (products.length) {
    await transaction.branchProduct.createMany({
      data: products.map((product) => ({
        branchId,
        productId: product.id,
        price: product.basePrice,
        isAvailable: true,
        stockStatus: "IN_STOCK"
      })),
      skipDuplicates: true
    });
  }

  if (ingredients.length) {
    await transaction.branchInventory.createMany({
      data: ingredients.map((ingredient) => ({
        branchId,
        ingredientId: ingredient.id,
        quantityOnHand: 0,
        lowStockAlert: false
      })),
      skipDuplicates: true
    });
  }
}

const imageUploadSchema = z.object({
  filename: z.string().min(1).optional(),
  dataUrl: z.string().min(32)
});

function sanitizeImageFilename(filename: string | undefined, extension: "png" | "jpg") {
  const base = filename ? normalizeSlug(filename.replace(/\.[^.]+$/, "")) : "image";
  const name = base.slice(0, 40) || "image";
  const suffix = randomUUID().slice(0, 8);
  return `${name}-${Date.now().toString(36)}-${suffix}.${extension}`;
}

async function saveUploadedImage(filename: string | undefined, dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/png|image\/jpeg);base64,(.+)$/);
  if (!match) {
    throw new Error("Only PNG and JPEG images are allowed.");
  }

  const mimeType = match[1];
  const base64 = match[2];
  if (!base64) {
    throw new Error("Invalid image data.");
  }
  const extension = mimeType === "image/png" ? "png" : "jpg";
  const buffer = Buffer.from(base64, "base64");

  if (!buffer.length) {
    throw new Error("Image file is empty.");
  }

  if (buffer.length > 8 * 1024 * 1024) {
    throw new Error("Image must be 8MB or smaller.");
  }

  await mkdir(API_UPLOADS_IMAGES_DIR, { recursive: true });

  const safeFilename = sanitizeImageFilename(filename, extension);
  await writeFile(path.join(API_UPLOADS_IMAGES_DIR, safeFilename), buffer);

  return {
    filename: safeFilename,
    url: `/uploads/images/${safeFilename}`
  };
}

function sanitizeUploadFilename(filename: string | undefined, fallback: string, extension: string) {
  const base = filename ? normalizeSlug(filename.replace(/\.[^.]+$/, "")) : fallback;
  const name = base.slice(0, 48) || fallback;
  const suffix = randomUUID().slice(0, 8);
  return `${name}-${Date.now().toString(36)}-${suffix}.${extension}`;
}

async function saveVendorRateList(filename: string | undefined, dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid attachment data.");
  }

  const mimeType = match[1];
  const base64 = match[2];
  const extensionByMime: Record<string, string> = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "text/csv": "csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xls"
  };
  const extension = extensionByMime[mimeType ?? ""];
  if (!extension || !base64) {
    throw new Error("Only PDF, image, CSV, and Excel rate lists are allowed.");
  }

  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) {
    throw new Error("Attachment file is empty.");
  }
  if (buffer.length > 8 * 1024 * 1024) {
    throw new Error("Attachment must be 8MB or smaller.");
  }

  await mkdir(API_UPLOADS_VENDOR_RATE_LISTS_DIR, { recursive: true });
  const safeFilename = sanitizeUploadFilename(filename, "rate-list", extension);
  await writeFile(path.join(API_UPLOADS_VENDOR_RATE_LISTS_DIR, safeFilename), buffer);

  return {
    filename: safeFilename,
    url: `/uploads/vendor-rate-lists/${safeFilename}`
  };
}

function parseDecimal(value: Prisma.Decimal | number | string | null | undefined) {
  if (value == null) return 0;
  return Number(value);
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function roundQuantity(value: number) {
  return Number(value.toFixed(3));
}

const ingredientCostInclude = {
  preparedComponents: {
    include: {
      componentIngredient: {
        include: {
          preparedComponents: {
            include: {
              componentIngredient: true
            }
          }
        }
      }
    }
  }
} as const;

function buildIngredientCostLines(
  ingredient: any,
  quantity: number,
  source: "product" | "prep" | "packaging-rule" = "product",
  seen = new Set<string>()
): Array<{
  ingredientId: string;
  ingredientName: string;
  ingredientType: string;
  unit: string;
  quantity: number;
  unitCost: number;
  cost: number;
  calories: number;
  source: "product" | "prep" | "packaging-rule";
}> {
  if (!ingredient) return [];
  if (ingredient.isActive === false) return [];
  const type = ingredient.type ?? "RAW";
  const components = ingredient.preparedComponents ?? [];

  if (type === "PREPARED" && components.length && !seen.has(ingredient.id)) {
    const nextSeen = new Set(seen);
    nextSeen.add(ingredient.id);
    return components.flatMap((component: any) =>
      buildIngredientCostLines(
        component.componentIngredient,
        quantity * parseDecimal(component.quantityNeeded),
        "prep",
        nextSeen
      )
    );
  }

  const unitCost = parseDecimal(ingredient.costPerUnit);
  const caloriesPerUnit = type === "PACKAGING" ? 0 : parseDecimal(ingredient.caloriesPerUnit);
  const cost = quantity * unitCost;
  return [
    {
      ingredientId: ingredient.id,
      ingredientName: ingredient.name ?? "Unknown ingredient",
      ingredientType: type,
      unit: ingredient.unit ?? "",
      quantity: roundQuantity(quantity),
      unitCost,
      cost: roundMoney(cost),
      calories: Math.round(quantity * caloriesPerUnit),
      source
    }
  ];
}

type IngredientCostLine = ReturnType<typeof buildIngredientCostLines>[number];
type PackagingRuleCostLine = IngredientCostLine & { serviceType: string };

function buildProductCostSummary(product: any) {
  const recipeItems: IngredientCostLine[] = (product.productIngredients ?? []).flatMap((entry: any) =>
    buildIngredientCostLines(entry.ingredient, parseDecimal(entry.quantityNeeded))
  );
  const packagingRuleItems: PackagingRuleCostLine[] = (product.packagingRules ?? []).flatMap((rule: any) => {
    const ingredient = rule.packagingIngredient;
    if (ingredient?.isActive === false) return [];
    const quantity = parseDecimal(rule.quantity);
    const unitCost = parseDecimal(ingredient?.costPerUnit);
    return [{
      ingredientId: rule.packagingIngredientId,
      ingredientName: ingredient?.name ?? "Unknown packaging",
      ingredientType: ingredient?.type ?? "PACKAGING",
      unit: ingredient?.unit ?? "",
      quantity,
      unitCost,
      cost: roundMoney(quantity * unitCost),
      calories: 0,
      source: "packaging-rule" as const,
      serviceType: rule.serviceType
    }];
  });

  const legacyPackagingCost = recipeItems
    .filter((entry) => entry.ingredientType === "PACKAGING")
    .reduce((sum, entry) => sum + entry.cost, 0);
  const packagingRuleCost = packagingRuleItems.reduce((sum, entry) => sum + entry.cost, 0);
  const recipeCost = recipeItems
    .filter((entry) => entry.ingredientType !== "PACKAGING")
    .reduce((sum, entry) => sum + entry.cost, 0);
  const packagingCost = legacyPackagingCost + packagingRuleCost;
  const totalCost = recipeCost + packagingCost;
  const calories = recipeItems.reduce((sum, entry) => sum + entry.calories, 0);
  const salePrice = parseDecimal(product.branchPricing?.[0]?.price ?? product.basePrice);
  const configuredFoodPackagingCost = product.foodPackagingCost == null ? totalCost : parseDecimal(product.foodPackagingCost);
  const profit = salePrice - configuredFoodPackagingCost;

  return {
    recipeCost: roundMoney(recipeCost),
    packagingCost: roundMoney(packagingCost),
    totalCost: roundMoney(configuredFoodPackagingCost),
    foodPackagingCost: roundMoney(configuredFoodPackagingCost),
    salePrice: roundMoney(salePrice),
    grossProfit: roundMoney(profit),
    marginPercent: salePrice ? Number(((profit / salePrice) * 100).toFixed(1)) : 0,
    calories,
    linkedIngredients: recipeItems.length + packagingRuleItems.length,
    items: recipeItems,
    packagingRules: packagingRuleItems
  };
}

async function recalculateInventoryBalances(branchInventoryId: string) {
  const inventory = await prisma.branchInventory.findUnique({
    where: { id: branchInventoryId },
    include: { ingredient: true }
  });

  if (!inventory) {
    throw new Error("Inventory item not found.");
  }

  const transactions = await prisma.inventoryTransaction.findMany({
    where: { branchInventoryId },
    orderBy: { createdAt: "asc" }
  });

  let balance = 0;
  for (const entry of transactions) {
    balance = roundQuantity(balance + parseDecimal(entry.quantity));
    await prisma.inventoryTransaction.update({
      where: { id: entry.id },
      data: { balanceAfter: balance }
    });
  }

  await prisma.branchInventory.update({
    where: { id: branchInventoryId },
    data: {
      quantityOnHand: balance,
      lowStockAlert: balance <= parseDecimal(inventory.ingredient.reorderLevel)
    }
  });
}

function buildAdminSegmentWhere(segment: "all" | "inshop" | "foodpanda" | "delivery"): Prisma.OrderWhereInput {
  if (segment === "foodpanda") {
    return { serviceType: ServiceType.FOODPANDA };
  }

  if (segment === "delivery") {
    return { serviceType: ServiceType.DELIVERY };
  }

  if (segment === "inshop") {
    return { serviceType: { in: [ServiceType.INSHOP, ServiceType.TAKEAWAY, ServiceType.DINE_IN] } };
  }

  return {};
}

function getServiceBreakdown(value: ServiceType | string) {
  if (value === ServiceType.INSHOP) {
    return { key: "INSHOP", label: "Inshop" };
  }

  if (value === ServiceType.TAKEAWAY) {
    return { key: "TAKEAWAY", label: "Takeaway" };
  }

  if (value === ServiceType.DINE_IN) {
    return { key: "DINE_IN", label: "Dine-in" };
  }

  if (value === ServiceType.FOODPANDA) {
    return { key: "FOODPANDA", label: "Foodpanda" };
  }

  if (value === ServiceType.DELIVERY) {
    return { key: "DELIVERY", label: "Delivery" };
  }

  return { key: String(value), label: String(value).replaceAll("_", " ") };
}

function serializeOrderForOperations(order: any) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    channel: order.channel,
    serviceType: order.serviceType,
    foodpandaOrderNumber: order.foodpandaOrderNumber ?? null,
    customerName: order.customerName ?? order.customer?.name ?? "Walk-in Customer",
    customerPhone: order.customerPhone ?? order.customer?.phone ?? undefined,
    status: order.status,
    branch: order.branch,
    totalAmount: order.totalAmount,
    subtotal: order.subtotal,
    discountAmount: order.discountAmount,
    taxRate: order.taxRate,
    taxAmount: order.taxAmount,
    cashReceivedAmount: order.cashReceivedAmount,
    changeDueAmount: order.changeDueAmount,
    manualDiscountType: order.manualDiscountType,
    manualDiscountValue: order.manualDiscountValue,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    cashierUsername: order.cashier?.username ?? null,
    cashierName: order.cashier?.name ?? null,
    placedAt: order.placedAt,
    deliveryInstructions: order.deliveryInstructions,
    deliverySector: order.deliverySector ?? null,
    deliverySubsector: order.deliverySubsector ?? null,
    riderName: order.riderName ?? null,
    riderPhone: order.riderPhone ?? null,
    riderAssignedAt: order.riderAssignedAt ?? null,
    acceptedByName: order.acceptedBy?.name ?? order.acceptedBy?.username ?? null,
    acceptedAt: order.acceptedAt ?? null,
    dispatchedByName: order.dispatchedBy?.name ?? order.dispatchedBy?.username ?? null,
    dispatchedAt: order.dispatchedAt ?? null,
    address: order.address
      ? {
          addressLine1: order.address.addressLine1,
          addressLine2: order.address.addressLine2,
          city: order.address.city,
          instructions: order.address.instructions
        }
      : null,
    items: order.items
  };
}

function isTerminalStatus(status: OrderStatus) {
  return status === OrderStatus.DELIVERED || status === OrderStatus.CANCELLED;
}

function buildSalesSeries(orders: Array<{ placedAt: Date; totalAmount: Prisma.Decimal | number }>, start: Date, end: Date) {
  const durationDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const buckets = new Map<string, { label: string; revenue: number; orders: number; sortKey: number }>();

  function ensureBucket(key: string, label: string, sortKey: number) {
    if (!buckets.has(key)) {
      buckets.set(key, { label, revenue: 0, orders: 0, sortKey });
    }

    return buckets.get(key)!;
  }

  if (durationDays <= 2) {
    for (let hour = 0; hour < 24; hour += 1) {
      ensureBucket(String(hour), `${hour.toString().padStart(2, "0")}:00`, hour);
    }

    for (const order of orders) {
      const hour = getPakistanHour(order.placedAt);
      const bucket = ensureBucket(String(hour), `${hour.toString().padStart(2, "0")}:00`, hour);
      bucket.revenue += Number(order.totalAmount);
      bucket.orders += 1;
    }
  } else if (durationDays <= 45) {
    for (let cursor = startOfDay(start); cursor <= end; cursor = addDays(cursor, 1)) {
      const key = getPakistanDateKey(cursor);
      ensureBucket(key, formatPakistanDate(cursor, { month: "short", day: "numeric" }), cursor.getTime());
    }

    for (const order of orders) {
      const key = getPakistanDateKey(order.placedAt);
      const sortKey = startOfDay(order.placedAt).getTime();
      const bucket = ensureBucket(key, formatPakistanDate(order.placedAt, { month: "short", day: "numeric" }), sortKey);
      bucket.revenue += Number(order.totalAmount);
      bucket.orders += 1;
    }
  } else if (durationDays <= 180) {
    for (let cursor = startOfDay(start); cursor <= end; cursor = addDays(cursor, 7)) {
      const key = getPakistanDateKey(cursor);
      ensureBucket(key, `Week of ${formatPakistanDate(cursor, { month: "short", day: "numeric" })}`, cursor.getTime());
    }

    for (const order of orders) {
      const diffDays = Math.floor((startOfDay(order.placedAt).getTime() - startOfDay(start).getTime()) / (1000 * 60 * 60 * 24));
      const bucketStart = addDays(startOfDay(start), Math.floor(diffDays / 7) * 7);
      const key = getPakistanDateKey(bucketStart);
      const bucket = ensureBucket(key, `Week of ${formatPakistanDate(bucketStart, { month: "short", day: "numeric" })}`, bucketStart.getTime());
      bucket.revenue += Number(order.totalAmount);
      bucket.orders += 1;
    }
  } else {
    for (let cursor = startOfPakistanMonth(start); cursor <= end; cursor = addMonths(cursor, 1)) {
      const key = getPakistanDateKey(cursor).slice(0, 7);
      ensureBucket(key, formatPakistanDate(cursor, { month: "short", year: "numeric" }), cursor.getTime());
    }

    for (const order of orders) {
      const key = getPakistanDateKey(order.placedAt).slice(0, 7);
      const sortKey = startOfPakistanMonth(order.placedAt).getTime();
      const bucket = ensureBucket(key, formatPakistanDate(new Date(sortKey), { month: "short", year: "numeric" }), sortKey);
      bucket.revenue += Number(order.totalAmount);
      bucket.orders += 1;
    }
  }

  return Array.from(buckets.values())
    .sort((left, right) => left.sortKey - right.sortKey)
    .map(({ label, revenue, orders }) => ({ label, revenue: Number(revenue.toFixed(2)), orders }));
}

router.get("/dashboard", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const query = dashboardQuerySchema.parse(req.query);
    const range = buildDashboardRange(query);
    const { previousStart, previousEnd } = getPreviousRange(range.start, range.end);
    const segmentWhere = buildAdminSegmentWhere(query.segment);

    const [periodOrders, previousOrders, totalCustomers, lowStock] = await Promise.all([
      prisma.order.findMany({
        where: {
          placedAt: {
            gte: range.start,
            lte: range.end
          },
          branchId: branchContext.branchId,
          ...segmentWhere
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true
            }
          },
          branch: true,
          items: true
        },
        orderBy: { placedAt: "asc" }
      }),
      prisma.order.findMany({
        where: {
          placedAt: {
            gte: previousStart,
            lt: previousEnd
          },
          branchId: branchContext.branchId,
          ...segmentWhere
        },
        select: {
          totalAmount: true,
          customerId: true
        }
      }),
      prisma.user.count({ where: { role: { is: { code: RoleCode.CUSTOMER } } } }),
      prisma.branchInventory.findMany({
        where: { branchId: branchContext.branchId, lowStockAlert: true },
        include: { branch: true, ingredient: true },
        take: 8
      })
    ]);

    const revenue = periodOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
    const previousRevenue = previousOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
    const orderCount = periodOrders.length;
    const previousOrderCount = previousOrders.length;
    const averageOrderValue = orderCount ? revenue / orderCount : 0;
    const previousAverageOrderValue = previousOrderCount ? previousRevenue / previousOrderCount : 0;

    const activeCustomerIds = new Map<string, number>();
    for (const order of periodOrders) {
      const key = order.customerId ?? `guest:${(order.customerName ?? "walk-in").toLowerCase()}:${order.customerPhone ?? ""}`;
      activeCustomerIds.set(key, (activeCustomerIds.get(key) ?? 0) + 1);
    }

    const repeatCustomers = Array.from(activeCustomerIds.values()).filter((count) => count > 1).length;

    const breakdownMaps = {
      channels: new Map<string, { label: string; count: number; revenue: number }>(),
      serviceTypes: new Map<string, { label: string; count: number; revenue: number }>(),
      payments: new Map<string, { label: string; count: number; revenue: number }>(),
      branches: new Map<string, { label: string; count: number; revenue: number }>(),
      branchFoodpandaRevenue: new Map<string, number>(),
      weekdays: new Map<string, { label: string; count: number; revenue: number; sort: number }>(),
      hours: new Map<string, { label: string; count: number; revenue: number; sort: number }>(),
      products: new Map<string, { productName: string; quantity: number; revenue: number }>()
    };

    const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    for (const order of periodOrders) {
      const orderRevenue = Number(order.totalAmount);
      const channelKey = order.channel;
      const serviceBreakdown = getServiceBreakdown(order.serviceType);
      const paymentKey = order.paymentMethod;
      const branchKey = order.branch?.name ?? "Unknown branch";
      const weekdayIndex = getPakistanWeekdayIndex(order.placedAt);
      const hour = getPakistanHour(order.placedAt);
      const weekdayKey = String(weekdayIndex);
      const hourKey = String(hour);

      if (serviceBreakdown.key === "FOODPANDA") {
        const branchFoodpandaRevenue = breakdownMaps.branchFoodpandaRevenue.get(branchKey) ?? 0;
        breakdownMaps.branchFoodpandaRevenue.set(branchKey, branchFoodpandaRevenue + orderRevenue);
      }

      for (const [map, key, label] of [
        [breakdownMaps.channels, channelKey, channelKey],
        [breakdownMaps.serviceTypes, serviceBreakdown.key, serviceBreakdown.label],
        [breakdownMaps.payments, paymentKey, paymentKey.replaceAll("_", " ")],
        [breakdownMaps.branches, branchKey, branchKey]
      ] as const) {
        const existing = map.get(key) ?? { label, count: 0, revenue: 0 };
        existing.count += 1;
        existing.revenue += orderRevenue;
        map.set(key, existing);
      }

      const weekdayEntry = breakdownMaps.weekdays.get(weekdayKey) ?? {
        label: weekdayLabels[weekdayIndex] ?? "Unknown",
        count: 0,
        revenue: 0,
        sort: weekdayIndex
      };
      weekdayEntry.count += 1;
      weekdayEntry.revenue += orderRevenue;
      breakdownMaps.weekdays.set(weekdayKey, weekdayEntry);

      const hourEntry = breakdownMaps.hours.get(hourKey) ?? {
        label: `${hour.toString().padStart(2, "0")}:00`,
        count: 0,
        revenue: 0,
        sort: hour
      };
      hourEntry.count += 1;
      hourEntry.revenue += orderRevenue;
      breakdownMaps.hours.set(hourKey, hourEntry);

      for (const item of order.items) {
        const existing = breakdownMaps.products.get(item.productName) ?? {
          productName: item.productName,
          quantity: 0,
          revenue: 0
        };
        existing.quantity += item.quantity;
        existing.revenue += Number(item.unitPrice) * item.quantity;
        breakdownMaps.products.set(item.productName, existing);
      }
    }

    return res.json({
      range: {
        preset: range.preset,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        label: range.label,
        segment: query.segment
      },
      summary: {
        revenue: Number(revenue.toFixed(2)),
        previousRevenue: Number(previousRevenue.toFixed(2)),
        orders: orderCount,
        previousOrders: previousOrderCount,
        averageOrderValue: Number(averageOrderValue.toFixed(2)),
        previousAverageOrderValue: Number(previousAverageOrderValue.toFixed(2)),
        activeCustomers: activeCustomerIds.size,
        repeatCustomers,
        totalCustomers,
        revenueDelta: percentageDelta(revenue, previousRevenue),
        ordersDelta: percentageDelta(orderCount, previousOrderCount),
        averageOrderValueDelta: percentageDelta(averageOrderValue, previousAverageOrderValue)
      },
      series: buildSalesSeries(periodOrders, range.start, range.end),
      topProducts: Array.from(breakdownMaps.products.values())
        .sort((left, right) => right.quantity - left.quantity)
        .slice(0, 8),
      recentOrders: [...periodOrders]
        .sort((left, right) => right.placedAt.getTime() - left.placedAt.getTime())
        .slice(0, 8)
        .map((order) => ({
          id: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customer?.name ?? order.customerName ?? "Walk-in Customer",
          totalAmount: Number(order.totalAmount),
          placedAt: order.placedAt,
          branch: order.branch?.name ?? "Unknown branch",
          channel: order.channel,
          serviceType: getServiceBreakdown(order.serviceType).label
        })),
      lowStock: lowStock.map((entry) => ({
        ingredient: entry.ingredient?.name ?? "Unknown ingredient",
        branch: entry.branch?.name ?? "Unknown branch",
        quantityOnHand: Number(entry.quantityOnHand)
      })),
      breakdowns: {
        channels: Array.from(breakdownMaps.channels.values()).sort((left, right) => right.revenue - left.revenue),
        serviceTypes: Array.from(breakdownMaps.serviceTypes.values()).sort((left, right) => right.revenue - left.revenue),
        payments: Array.from(breakdownMaps.payments.values()).sort((left, right) => right.revenue - left.revenue),
        branches: Array.from(breakdownMaps.branches.values())
          .sort((left, right) => right.revenue - left.revenue)
          .map((entry) => ({
            ...entry,
            foodpandaRevenue: Number((breakdownMaps.branchFoodpandaRevenue.get(entry.label) ?? 0).toFixed(2))
          })),
        weekdays: Array.from(breakdownMaps.weekdays.values())
          .sort((left, right) => left.sort - right.sort)
          .map(({ sort: _sort, ...entry }) => entry),
        hours: Array.from(breakdownMaps.hours.values())
          .sort((left, right) => left.sort - right.sort)
          .map(({ sort: _sort, ...entry }) => entry)
      }
    });
  } catch (error) {
    return next(error);
  }
});

async function buildFoodpandaSettlementSnapshot(period: "week" | "month" | "year") {
  const range = buildFoodpandaSettlementRange(period);
  const [orders, savedSettlements] = await Promise.all([
    prisma.order.findMany({
      where: {
        serviceType: ServiceType.FOODPANDA,
        status: { not: OrderStatus.CANCELLED },
        placedAt: { gte: range.start, lte: range.end }
      },
      select: { placedAt: true, totalAmount: true }
    }),
    prisma.foodpandaSettlement.findMany({
      where: { weekStart: { lte: range.end }, weekEnd: { gte: range.start } },
      orderBy: { weekStart: "asc" }
    })
  ]);

  const grouped = new Map<string, { weekStart: Date; weekEnd: Date; totalOrders: number; grossSales: number }>();
  for (const order of orders) {
    const weekStart = startOfPakistanWeek(order.placedAt);
    const key = weekStart.toISOString();
    const current = grouped.get(key) ?? { weekStart, weekEnd: endOfDay(addDays(weekStart, 6)), totalOrders: 0, grossSales: 0 };
    current.totalOrders += 1;
    current.grossSales += parseDecimal(order.totalAmount);
    grouped.set(key, current);
  }

  const savedMap = new Map(savedSettlements.map((settlement) => [`${settlement.weekStart.toISOString()}|${settlement.weekEnd.toISOString()}`, settlement]));
  for (const settlement of savedSettlements) {
    const key = `${settlement.weekStart.toISOString()}|${settlement.weekEnd.toISOString()}`;
    if (!grouped.has(settlement.weekStart.toISOString())) {
      grouped.set(settlement.weekStart.toISOString(), {
        weekStart: settlement.weekStart,
        weekEnd: settlement.weekEnd,
        totalOrders: settlement.totalOrders,
        grossSales: parseDecimal(settlement.grossSales)
      });
    }
    void key;
  }

  const cycles = Array.from(grouped.values())
    .sort((left, right) => right.weekStart.getTime() - left.weekStart.getTime())
    .map((cycle) => {
      const key = `${cycle.weekStart.toISOString()}|${cycle.weekEnd.toISOString()}`;
      const saved = savedMap.get(key);
      const grossSales = roundMoney(cycle.grossSales);
      const commission = roundMoney(grossSales * FOODPANDA_COMMISSION_RATE);
      const otherCharges = saved ? parseDecimal(saved.otherCharges) : 0;
      const expectedNet = roundMoney(grossSales - commission - otherCharges);
      return {
        id: saved?.id ?? null,
        weekStart: cycle.weekStart.toISOString(),
        weekEnd: cycle.weekEnd.toISOString(),
        totalOrders: cycle.totalOrders,
        grossSales,
        commission,
        otherCharges,
        expectedNet,
        status: saved?.status === "IGNORED" ? "IGNORED" : saved?.status === "RECEIVED" ? "RECEIVED" : "PENDING",
        amountReceived: saved?.amountReceived == null ? null : parseDecimal(saved.amountReceived),
        receivedSource: saved?.receivedSource ?? "CASH",
        receivedAt: saved?.receivedAt?.toISOString() ?? null,
        transferReference: saved?.transferReference ?? null,
        notes: saved?.notes ?? null
      };
    })
    .filter((cycle) => cycle.status !== "IGNORED");

  const currentWeekStart = startOfPakistanWeek(new Date()).toISOString();
  const pending = cycles.filter((cycle) => cycle.status !== "RECEIVED");
  const received = cycles.filter((cycle) => cycle.status === "RECEIVED");
  const pendingReceivables = roundMoney(pending.reduce((sum, cycle) => sum + cycle.expectedNet, 0));
  const expectedThisWeek = roundMoney(cycles.find((cycle) => cycle.weekStart === currentWeekStart)?.expectedNet ?? 0);
  const totalReceived = roundMoney(received.reduce((sum, cycle) => sum + (cycle.amountReceived ?? 0), 0));
  const outstandingAmount = roundMoney(pendingReceivables);

  return {
    range,
    summary: {
      pendingReceivables,
      expectedThisWeek,
      totalReceived,
      outstandingAmount,
      lastSettlementDate: received.find((cycle) => cycle.receivedAt)?.receivedAt ?? null
    },
    cycles,
    nextPending: pending.length ? pending[pending.length - 1] : null
  };
}

router.get("/foodpanda-settlements", async (req, res, next) => {
  try {
    const period = z.enum(["week", "month", "year"]).default("month").parse(req.query.period);
    const snapshot = await buildFoodpandaSettlementSnapshot(period);
    return res.json({
      period,
      range: { start: snapshot.range.start.toISOString(), end: snapshot.range.end.toISOString(), label: snapshot.range.label },
      summary: snapshot.summary,
      cycles: snapshot.cycles,
      nextPending: snapshot.nextPending
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/foodpanda-settlements/receive", async (req, res, next) => {
  try {
    const payload = z.object({
      period: z.enum(["week", "month", "year"]).default("month"),
      weekStart: z.string().datetime().optional(),
      amountReceived: z.number().nonnegative(),
      receivedSource: z.enum(MONEY_SOURCES).default("CASH"),
      transferReference: z.string().max(120).optional().or(z.literal("")),
      notes: z.string().max(500).optional().or(z.literal(""))
    }).parse(req.body);
    const snapshot = await buildFoodpandaSettlementSnapshot(payload.period);
    const selected = payload.weekStart
      ? snapshot.cycles.find((cycle) => cycle.weekStart === new Date(payload.weekStart!).toISOString())
      : snapshot.nextPending;
    if (!selected) {
      return res.status(400).json({ message: "There is no pending Foodpanda settlement to receive." });
    }
    if (payload.amountReceived <= 0) {
      return res.status(400).json({ message: "Enter the amount received." });
    }

    const settlement = await prisma.foodpandaSettlement.upsert({
      where: { weekStart_weekEnd: { weekStart: new Date(selected.weekStart), weekEnd: new Date(selected.weekEnd) } },
      update: {
        totalOrders: selected.totalOrders,
        grossSales: selected.grossSales,
        commission: selected.commission,
        otherCharges: selected.otherCharges,
        expectedNet: selected.expectedNet,
        amountReceived: payload.amountReceived,
        receivedSource: payload.receivedSource,
        status: "RECEIVED",
        receivedAt: new Date(),
        transferReference: payload.transferReference?.trim() || null,
        notes: payload.notes?.trim() || null,
        receivedById: req.user!.id
      },
      create: {
        weekStart: new Date(selected.weekStart),
        weekEnd: new Date(selected.weekEnd),
        totalOrders: selected.totalOrders,
        grossSales: selected.grossSales,
        commission: selected.commission,
        otherCharges: selected.otherCharges,
        expectedNet: selected.expectedNet,
        amountReceived: payload.amountReceived,
        receivedSource: payload.receivedSource,
        status: "RECEIVED",
        receivedAt: new Date(),
        transferReference: payload.transferReference?.trim() || null,
        notes: payload.notes?.trim() || null,
        receivedById: req.user!.id
      }
    });
    await writeAuditLog({ actorId: req.user!.id, action: "finance.foodpanda_settlement_receive", entityType: "foodpanda_settlement", entityId: settlement.id, payload });
    return res.status(201).json({ settlement });
  } catch (error) {
    return next(error);
  }
});

router.delete("/foodpanda-settlements/:weekStart", async (req, res, next) => {
  try {
    const weekStart = new Date(req.params.weekStart);
    if (Number.isNaN(weekStart.getTime())) {
      return res.status(400).json({ message: "Invalid payout week." });
    }
    const snapshot = await buildFoodpandaSettlementSnapshot("year");
    const cycle = snapshot.cycles.find((entry) => entry.weekStart === weekStart.toISOString());
    if (!cycle) {
      return res.status(404).json({ message: "Payout week was not found." });
    }
    const settlement = await prisma.foodpandaSettlement.upsert({
      where: { weekStart_weekEnd: { weekStart: new Date(cycle.weekStart), weekEnd: new Date(cycle.weekEnd) } },
      update: { status: "IGNORED", amountReceived: null, receivedAt: null, notes: "Removed from settlement tracker by admin." },
      create: {
        weekStart: new Date(cycle.weekStart),
        weekEnd: new Date(cycle.weekEnd),
        totalOrders: cycle.totalOrders,
        grossSales: cycle.grossSales,
        commission: cycle.commission,
        otherCharges: cycle.otherCharges,
        expectedNet: cycle.expectedNet,
        receivedSource: "CASH",
        status: "IGNORED",
        notes: "Removed from settlement tracker by admin."
      }
    });
    await writeAuditLog({ actorId: req.user!.id, action: "finance.foodpanda_settlement_ignore", entityType: "foodpanda_settlement", entityId: settlement.id, payload: { weekStart: cycle.weekStart } });
    return res.json({ ignored: true });
  } catch (error) {
    return next(error);
  }
});

router.get("/foodpanda", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const query = dashboardQuerySchema.parse(req.query);
    const range = buildDashboardRange(query);
    const orders = await prisma.order.findMany({
      where: {
        branchId: branchContext.branchId,
        serviceType: ServiceType.FOODPANDA,
        placedAt: {
          gte: range.start,
          lte: range.end
        }
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true
          }
        },
        branch: true,
        items: true
      },
      orderBy: { placedAt: "asc" }
    });

    const grossSales = orders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
    const orderCount = orders.length;
    const productMap = new Map<string, { productName: string; quantity: number; revenue: number }>();

    for (const order of orders) {
      for (const item of order.items) {
        const existing = productMap.get(item.productName) ?? {
          productName: item.productName,
          quantity: 0,
          revenue: 0
        };
        existing.quantity += item.quantity;
        existing.revenue += Number(item.unitPrice) * item.quantity;
        productMap.set(item.productName, existing);
      }
    }

    return res.json({
      range: {
        preset: range.preset,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        label: range.label
      },
      summary: {
        grossSales: Number(grossSales.toFixed(2)),
        orders: orderCount,
        averageOrderValue: orderCount ? Number((grossSales / orderCount).toFixed(2)) : 0
      },
      series: buildSalesSeries(orders, range.start, range.end),
      topProducts: Array.from(productMap.values())
        .sort((left, right) => right.quantity - left.quantity)
        .slice(0, 8),
      orders: [...orders]
        .sort((left, right) => right.placedAt.getTime() - left.placedAt.getTime())
        .map((order) => ({
          id: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customer?.name ?? order.customerName ?? "Walk-in Customer",
          customerPhone: order.customerPhone ?? undefined,
          status: order.status,
          totalAmount: Number(order.totalAmount),
          placedAt: order.placedAt,
          branch: order.branch?.name ?? "Unknown branch",
          paymentMethod: order.paymentMethod,
          items: order.items.map((item) => ({
            id: item.id,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice)
          }))
        }))
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/analytics/sales", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const query = dashboardQuerySchema.parse(req.query);
    const range = buildDashboardRange(query);
    const segmentWhere = buildAdminSegmentWhere(query.segment);
    const orders = await prisma.order.findMany({
      where: {
        branchId: branchContext.branchId,
        placedAt: {
          gte: range.start,
          lte: range.end
        },
        ...segmentWhere
      },
      select: {
        placedAt: true,
        totalAmount: true
      },
      orderBy: { placedAt: "asc" }
    });

    return res.json({
      sales: buildSalesSeries(orders, range.start, range.end)
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/products", async (_req, res, next) => {
  const includeBase = {
    category: true,
    images: { orderBy: { sortOrder: "asc" as const } },
    bundleComponents: {
      orderBy: { sortOrder: "asc" as const },
      include: {
        componentProduct: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      }
    },
    branchPricing: { include: { branch: true } },
    productIngredients: {
      where: { ingredient: { isActive: true } },
      include: { ingredient: { include: ingredientCostInclude } },
      orderBy: { ingredient: { name: "asc" as const } }
    }
  };

  try {
    const products = await prisma.product.findMany({
      include: {
        ...includeBase,
        packagingRules: {
          where: { packagingIngredient: { isActive: true } },
          include: { packagingIngredient: true },
          orderBy: [{ serviceType: "asc" }, { packagingIngredient: { name: "asc" } }]
        }
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }]
    });

    return res.json({
      products: products.map((product) => ({
        ...product,
        costSummary: buildProductCostSummary(product)
      }))
    });
  } catch (error) {
    if (!isMissingTableError(error)) {
      return next(error);
    }

    const products = await prisma.product.findMany({
      include: includeBase,
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }]
    });

    return res.json({
      products: products.map((product) => ({
        ...product,
        packagingRules: [],
        costSummary: buildProductCostSummary({ ...product, packagingRules: [] })
      }))
    });
  }
});

const productAnalyticsExportQuerySchema = dashboardQueryBaseSchema.extend({
  category: z.string().trim().optional(),
  search: z.string().trim().optional(),
  sort: z.enum(["revenue", "profit", "units", "margin"]).default("revenue")
}).superRefine((value, context) => {
  if (value.preset === "custom" && (!value.start || !value.end)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Custom range requires start and end dates.",
      path: ["start"]
    });
  }
});

const productAnalyticsExportInclude = {
  category: true,
  branchPricing: true,
  productIngredients: {
    where: { ingredient: { isActive: true } },
    include: { ingredient: { include: ingredientCostInclude } }
  },
  packagingRules: {
    where: { packagingIngredient: { isActive: true } },
    include: { packagingIngredient: true }
  }
} as const;

router.get("/products/analytics/export", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const query = productAnalyticsExportQuerySchema.parse(req.query);
    const range = buildDashboardRange(query);
    const [products, orders] = await Promise.all([
      prisma.product.findMany({
        include: productAnalyticsExportInclude,
        orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }]
      }),
      prisma.order.findMany({
        where: {
          branchId: branchContext.branchId,
          placedAt: { gte: range.start, lte: range.end },
          ...buildAdminSegmentWhere(query.segment)
        },
        select: {
          status: true,
          items: {
            select: {
              productName: true,
              quantity: true,
              addOns: { select: { optionName: true } },
              bundleComponents: { select: { componentProductName: true, quantity: true } }
            }
          }
        }
      })
    ]);
    const unitsByProduct = new Map<string, number>();
    const mealProductUnits = new Map<string, number>();
    const mealComponentUnits = new Map<string, number>();
    const mealCombinationUnits = new Map<string, number>();
    const productByName = new Map(products.map((product) => [product.name.trim().toLowerCase(), product]));
    const resolveComponentName = (name: string) => {
      const normalized = name.trim().toLowerCase();
      const exact = products.find((product) => product.name.trim().toLowerCase() === normalized);
      if (exact) return exact.name;
      if (normalized === "fries") return products.find((product) => product.slug === "thela-fries")?.name ?? name;
      if (normalized.endsWith(" shake")) {
        const shakeName = normalized.replace(/ shake$/, "");
        return products.find((product) => product.name.trim().toLowerCase() === shakeName)?.name ?? name;
      }
      return name;
    };
    const addUnits = (name: string, quantity: number) => {
      const resolvedName = resolveComponentName(name);
      const key = resolvedName.trim().toLowerCase();
      unitsByProduct.set(key, (unitsByProduct.get(key) ?? 0) + quantity);
    };
    for (const order of orders) {
      if (["CANCELLED", "REFUNDED"].includes(order.status)) continue;
      for (const item of order.items) {
        const product = productByName.get(item.productName.trim().toLowerCase());
        const isMeal = product?.category.slug === "make-it-a-meal" || product?.slug.includes("make-it-a-meal");
        if (isMeal) {
          mealProductUnits.set(item.productName, (mealProductUnits.get(item.productName) ?? 0) + item.quantity);
          const combinationParts: string[] = [];
          if (item.bundleComponents.length) {
            for (const component of item.bundleComponents) {
              combinationParts.push(component.componentProductName);
              mealComponentUnits.set(component.componentProductName, (mealComponentUnits.get(component.componentProductName) ?? 0) + component.quantity);
              addUnits(component.componentProductName, component.quantity);
            }
          } else {
            for (const addOn of item.addOns) {
              for (const componentName of addOn.optionName.split(/\s*\+\s*/)) {
                const cleanName = componentName.trim();
                combinationParts.push(cleanName);
                mealComponentUnits.set(cleanName, (mealComponentUnits.get(cleanName) ?? 0) + item.quantity);
                addUnits(cleanName, item.quantity);
              }
            }
          }
          const combinationName = combinationParts.join(" + ") || "No component details recorded";
          mealCombinationUnits.set(combinationName, (mealCombinationUnits.get(combinationName) ?? 0) + item.quantity);
        } else {
          addUnits(item.productName, item.quantity);
        }
      }
    }

    const rows = products
      .filter((product) => product.category.slug !== "make-it-a-meal" && !product.slug.includes("make-it-a-meal") && (!query.category || product.category.name === query.category) && (!query.search || product.name.toLowerCase().includes(query.search.toLowerCase())))
      .map((product) => {
        const quantity = unitsByProduct.get(product.name.trim().toLowerCase()) ?? 0;
        const costSummary = buildProductCostSummary(product);
        const revenue = costSummary.salePrice * quantity;
        const totalFoodCost = costSummary.totalCost * quantity;
        const grossProfit = revenue - totalFoodCost;
        const grossMargin = revenue ? (grossProfit / revenue) * 100 : 0;
        return {
          "Product Name": product.name,
          Category: product.category.name,
          "Selling Price": costSummary.salePrice,
          "Food & Packaging Cost": costSummary.totalCost,
          "Quantity Sold": quantity,
          "Revenue Generated": Number(revenue.toFixed(2)),
          "Total Food Cost": Number(totalFoodCost.toFixed(2)),
          "Gross Profit": Number(grossProfit.toFixed(2)),
          "Gross Margin %": Number(grossMargin.toFixed(1)),
          _sort: query.sort === "units" ? quantity : query.sort === "profit" ? grossProfit : query.sort === "margin" ? grossMargin : revenue
        };
      })
      .sort((left, right) => right._sort - left._sort)
      .map(({ _sort: _ignored, ...row }) => row);

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, "Product Analytics");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(Array.from(mealProductUnits, ([name, units]) => ({ "Meal Product": name, "Meals Sold": units }))), "Meal Products");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(Array.from(mealComponentUnits, ([name, units]) => ({ Component: name, "Units Included": units }))), "Meal Components");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(Array.from(mealCombinationUnits, ([name, meals]) => ({ Combination: name, "Meals Sold": meals }))), "Meal Combinations");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="pocket-product-analytics-${query.preset}.xlsx"`);
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
});

const productSchema = z.object({
  categoryId: z.string().cuid(),
  slug: z.string().trim().min(1).optional(),
  name: z.string().min(3),
  description: z.string().trim().min(1).optional(),
  ingredients: z.array(z.string()).default([]),
  bundleComponents: z
    .array(
      z.object({
        componentProductId: z.string().cuid(),
        quantity: z.number().int().min(1).max(100),
        sortOrder: z.number().int().min(0).optional()
      })
    )
    .optional(),
  basePrice: z.number().nonnegative(),
  calories: z.number().int().nonnegative().optional(),
  featured: z.boolean().default(false),
  bestSeller: z.boolean().default(false),
  isActive: z.boolean().default(true),
  stockStatus: z.string().default("IN_STOCK"),
  imageUrl: z.string().trim().min(1).optional(),
  images: z
    .array(
      z.object({
        url: z.string().trim().min(1),
        alt: z.string().trim().optional(),
        sortOrder: z.number().int().min(0).optional()
      })
    )
    .optional()
});

const productCostSettingsSchema = z.object({
  foodPackagingCost: z.number().nonnegative().optional(),
  isActive: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, "At least one cost setting is required.");

function normalizeProductImages(
  images: Array<{ url: string; alt?: string; sortOrder?: number }> | undefined,
  fallbackUrl: string,
  fallbackAlt: string
) {
  const source = images?.length
    ? images
    : [
        {
          url: fallbackUrl,
          alt: fallbackAlt,
          sortOrder: 1
        }
      ];

  return source.map((image, index) => ({
    url: image.url.trim(),
    alt: image.alt?.trim() || fallbackAlt,
    sortOrder: image.sortOrder ?? index + 1
  }));
}

router.post("/products", async (req, res, next) => {
  try {
    const payload = productSchema.parse(req.body);
    const name = payload.name.trim();
    const slug = payload.slug ? normalizeSlug(payload.slug) : buildProductSlug(name);
    const description = payload.description?.trim() || name;
    const images = normalizeProductImages(payload.images, payload.imageUrl?.trim() || "/images/classic-shawarma.png", name);
    const bundleComponents = normalizeBundleComponents(payload.bundleComponents);
    const category = await prisma.category.findUnique({ where: { id: payload.categoryId }, select: { slug: true } });
    if (!category) {
      throw Object.assign(new Error("Selected category is unavailable."), { statusCode: 400 });
    }

    const componentProducts = bundleComponents.length
      ? await prisma.product.findMany({
          where: {
            id: { in: bundleComponents.map((component) => component.componentProductId) },
            isActive: true
          },
          select: { id: true, slug: true }
        })
      : [];

    if (componentProducts.length !== bundleComponents.length) {
      throw new Error("One or more bundle items are unavailable.");
    }
    validateCanonicalMealSetup(category.slug, slug, bundleComponents, componentProducts);
    const effectiveBasePrice = category.slug === MEAL_CATEGORY_SLUG && slug === CANONICAL_MEAL_PRODUCT_SLUG
      ? MEAL_BASE_PRICE
      : payload.basePrice;

    const product = await prisma.$transaction(async (transaction) => {
      const sku = await buildNextProductSku(transaction, payload.categoryId);
      const createdProduct = await transaction.product.create({
        data: {
          categoryId: payload.categoryId,
          slug,
          sku,
          name,
          description,
          ingredients: payload.ingredients,
          basePrice: effectiveBasePrice,
          calories: payload.calories,
          featured: payload.featured,
          bestSeller: payload.bestSeller,
          isActive: payload.isActive,
          stockStatus: payload.stockStatus,
          images: {
            create: images
          },
          bundleComponents: bundleComponents.length
            ? {
                create: bundleComponents.map((component) => ({
                  componentProductId: component.componentProductId,
                  quantity: component.quantity,
                  sortOrder: component.sortOrder ?? 0
                }))
              }
            : undefined
        },
        include: {
          category: true,
          images: true,
          bundleComponents: {
            orderBy: { sortOrder: "asc" },
            include: {
              componentProduct: {
                select: { id: true, name: true, slug: true }
              }
            }
          }
        }
      });

      const activeBranches = await transaction.branch.findMany({
        where: { isActive: true },
        select: { id: true }
      });

      if (activeBranches.length) {
        await transaction.branchProduct.createMany({
          data: activeBranches.map((branch) => ({
            branchId: branch.id,
            productId: createdProduct.id,
            price: effectiveBasePrice,
            isAvailable: payload.isActive,
            stockStatus: payload.stockStatus
          }))
        });
      }

      return createdProduct;
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "product.create",
      entityType: "product",
      entityId: product.id,
      payload
    });
    await syncMealPairingOptions(prisma).catch((syncError) => {
      console.error("Failed to sync Make It A Meal options after product create", syncError);
    });

    return res.status(201).json({ product });
  } catch (error) {
    return next(error);
  }
});

router.patch("/products/:id/cost-settings", async (req, res, next) => {
  try {
    const payload = productCostSettingsSchema.parse(req.body);
    const product = await prisma.$transaction(async (transaction) => {
      const updatedProduct = await transaction.product.update({
        where: { id: req.params.id },
        data: {
          ...(typeof payload.foodPackagingCost === "number" ? { foodPackagingCost: payload.foodPackagingCost } : {}),
          ...(typeof payload.isActive === "boolean" ? { isActive: payload.isActive } : {}),
          costSettingsUpdatedAt: new Date()
        },
        select: {
          id: true,
          name: true,
          basePrice: true,
          foodPackagingCost: true,
          isActive: true,
          costSettingsUpdatedAt: true
        }
      });

      if (typeof payload.isActive === "boolean") {
        await transaction.branchProduct.updateMany({
          where: { productId: updatedProduct.id },
          data: {
            ...(typeof payload.isActive === "boolean" ? { isAvailable: payload.isActive } : {})
          }
        });
      }

      return updatedProduct;
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "product.cost-settings.update",
      entityType: "product",
      entityId: product.id,
      payload
    });

    return res.json({
      product: {
        ...product,
        basePrice: parseDecimal(product.basePrice),
        foodPackagingCost: product.foodPackagingCost == null ? null : parseDecimal(product.foodPackagingCost),
        costSettingsUpdatedAt: product.costSettingsUpdatedAt?.toISOString() ?? null
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/products/:id", async (req, res, next) => {
  try {
    const payload = productSchema.partial().parse(req.body);
    const { imageUrl, images, slug, description, name, bundleComponents, ...productPayload } = payload;
    const normalizedBundleComponents = bundleComponents ? normalizeBundleComponents(bundleComponents) : null;
    if (normalizedBundleComponents?.some((component) => component.componentProductId === req.params.id)) {
      throw new Error("Bundle cannot include itself.");
    }

    const currentProduct = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: {
        slug: true,
        category: { select: { slug: true } },
        bundleComponents: {
          select: { componentProductId: true, quantity: true, componentProduct: { select: { id: true, slug: true } } }
        }
      }
    });
    if (!currentProduct) {
      throw Object.assign(new Error("Product not found."), { statusCode: 404 });
    }
    const nextCategorySlug = payload.categoryId
      ? (await prisma.category.findUnique({ where: { id: payload.categoryId }, select: { slug: true } }))?.slug
      : currentProduct.category.slug;
    if (!nextCategorySlug) {
      throw Object.assign(new Error("Selected category is unavailable."), { statusCode: 400 });
    }
    const nextSlug = slug ? normalizeSlug(slug) : currentProduct.slug;
    const nextBundleComponents = normalizedBundleComponents ?? currentProduct.bundleComponents.map((component) => ({
      componentProductId: component.componentProductId,
      quantity: Number(component.quantity)
    }));

    const bundleComponentProducts = normalizedBundleComponents?.length
      ? await prisma.product.findMany({
          where: {
            id: { in: normalizedBundleComponents.map((component) => component.componentProductId) },
            isActive: true
          },
          select: { id: true, slug: true }
        })
      : [];

    if (normalizedBundleComponents && bundleComponentProducts.length !== normalizedBundleComponents.length) {
      throw new Error("One or more bundle items are unavailable.");
    }
    const canonicalComponentProducts = normalizedBundleComponents
      ? bundleComponentProducts
      : currentProduct.bundleComponents.map((component) => component.componentProduct);
    validateCanonicalMealSetup(nextCategorySlug, nextSlug, nextBundleComponents, canonicalComponentProducts);
    const isCanonicalMeal = nextCategorySlug === MEAL_CATEGORY_SLUG && nextSlug === CANONICAL_MEAL_PRODUCT_SLUG;
    const effectiveBasePrice = isCanonicalMeal ? MEAL_BASE_PRICE : payload.basePrice;

    const product = await prisma.$transaction(async (transaction) => {
      const nextImages = payload.images
        ? normalizeProductImages(payload.images, payload.imageUrl?.trim() || "/images/classic-shawarma.png", payload.name?.trim() || "Product")
        : payload.imageUrl
          ? normalizeProductImages([{ url: payload.imageUrl, alt: payload.name?.trim(), sortOrder: 1 }], payload.imageUrl, payload.name?.trim() || "Product")
          : null;

      const updatedProduct = await transaction.product.update({
        where: { id: req.params.id },
        data: {
          ...productPayload,
          ...(isCanonicalMeal ? { basePrice: MEAL_BASE_PRICE } : {}),
          ...(name ? { name: name.trim() } : {}),
          ...(slug ? { slug: normalizeSlug(slug) } : {}),
          ...(description ? { description: description.trim() } : {})
        },
        include: {
          category: true,
          images: true,
          bundleComponents: {
            orderBy: { sortOrder: "asc" },
            include: {
              componentProduct: {
                select: { id: true, name: true, slug: true }
              }
            }
          }
        }
      });

      if (nextImages) {
        await transaction.productImage.deleteMany({ where: { productId: updatedProduct.id } });
        await transaction.productImage.createMany({
          data: nextImages.map((image) => ({
            productId: updatedProduct.id,
            ...image
          }))
        });
      }

      if (normalizedBundleComponents !== null) {
        await transaction.productBundleComponent.deleteMany({
          where: {
            productId: updatedProduct.id,
            componentProductId: {
              notIn: normalizedBundleComponents.map((component) => component.componentProductId)
            }
          }
        });
        for (const component of normalizedBundleComponents) {
          await transaction.productBundleComponent.upsert({
            where: {
              productId_componentProductId: {
                productId: updatedProduct.id,
                componentProductId: component.componentProductId
              }
            },
            update: {
              quantity: component.quantity,
              sortOrder: component.sortOrder ?? 0
            },
            create: {
              productId: updatedProduct.id,
              componentProductId: component.componentProductId,
              quantity: component.quantity,
              sortOrder: component.sortOrder ?? 0
            }
          });
        }
      }

      if (typeof payload.basePrice === "number" || isCanonicalMeal || typeof payload.isActive === "boolean" || typeof payload.stockStatus === "string") {
        await transaction.branchProduct.updateMany({
          where: { productId: updatedProduct.id },
          data: {
            ...(typeof payload.basePrice === "number" || isCanonicalMeal ? { price: effectiveBasePrice } : {}),
            ...(typeof payload.isActive === "boolean" ? { isAvailable: payload.isActive } : {}),
            ...(typeof payload.stockStatus === "string" ? { stockStatus: payload.stockStatus } : {})
          }
        });
      }

      return transaction.product.findUniqueOrThrow({
        where: { id: updatedProduct.id },
        include: {
          category: true,
          images: { orderBy: { sortOrder: "asc" } },
          bundleComponents: {
            orderBy: { sortOrder: "asc" },
            include: {
              componentProduct: {
                select: { id: true, name: true, slug: true }
              }
            }
          }
        }
      });
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "product.update",
      entityType: "product",
      entityId: product.id,
      payload: { ...productPayload, imageUrl: payload.imageUrl, images }
    });
    await syncMealPairingOptions(prisma).catch((syncError) => {
      console.error("Failed to sync Make It A Meal options after product update", syncError);
    });

    return res.json({ product });
  } catch (error) {
    return next(error);
  }
});

router.delete("/products/:id", async (req, res, next) => {
  try {
    const productId = req.params.id;
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true }
    });

    if (!product) {
      return res.json({
        mode: "deleted",
        alreadyDeleted: true,
        message: "Product already deleted."
      });
    }

    const cleanup = await prisma.$transaction(async (transaction) => {
      const addOnOptions = await transaction.addOnOption.findMany({
        where: { group: { productId } },
        select: { id: true }
      });
      const addOnOptionIds = addOnOptions.map((option) => option.id);
      const orderItemAddOns = addOnOptionIds.length
        ? await transaction.orderItemAddOn.deleteMany({ where: { optionId: { in: addOnOptionIds } } })
        : { count: 0 };
      const orderItems = await transaction.orderItem.updateMany({
        where: { productId },
        data: { productId: null }
      });
      const orderItemBundleComponents = await transaction.orderItemBundleComponent.updateMany({
        where: { productId },
        data: { productId: null }
      });
      const bundleComponents = await transaction.productBundleComponent.deleteMany({
        where: {
          OR: [{ productId }, { componentProductId: productId }]
        }
      });
      const branchPricing = await transaction.branchProduct.deleteMany({ where: { productId } });
      const productIngredients = await transaction.productIngredient.deleteMany({ where: { productId } });
      let packagingRules = { count: 0 };
      await ignoreMissingOptionalTable(async () => {
        packagingRules = await transaction.packagingRule.deleteMany({ where: { productId } });
      });
      const productImages = await transaction.productImage.deleteMany({ where: { productId } });
      const cartItems = await transaction.cartItem.deleteMany({ where: { productId } });
      const favorites = await transaction.favorite.deleteMany({ where: { productId } });
      const reviews = await transaction.review.deleteMany({ where: { productId } });
      await transaction.product.delete({ where: { id: productId } });

      return {
        orderItemsDetached: orderItems.count,
        orderItemBundleComponentsDetached: orderItemBundleComponents.count,
        orderItemAddOnsDeleted: orderItemAddOns.count,
        bundleComponentsDeleted: bundleComponents.count,
        branchPricingDeleted: branchPricing.count,
        productIngredientsDeleted: productIngredients.count,
        packagingRulesDeleted: packagingRules.count,
        productImagesDeleted: productImages.count,
        cartItemsDeleted: cartItems.count,
        favoritesDeleted: favorites.count,
        reviewsDeleted: reviews.count
      };
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "product.delete",
      entityType: "product",
      entityId: productId,
      payload: { mode: "deleted", productName: product.name, cleanup }
    });
    await syncMealPairingOptions(prisma).catch((syncError) => {
      console.error("Failed to sync Make It A Meal options after product delete", syncError);
    });

    return res.json({
      mode: "deleted",
      message: "Product deleted.",
      cleanup
    });
  } catch (error) {
    try {
      rethrowDeleteError(error, "Product");
    } catch (nextError) {
      return next(nextError);
    }
  }
});

const categorySchema = z.object({
  slug: z.string().min(2),
  name: z.string().min(2),
  description: z.string().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  imageUrl: z.string().optional()
});

router.get("/categories", async (_req, res) => {
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
  return res.json({ categories });
});

router.post("/categories", async (req, res, next) => {
  try {
    const payload = categorySchema.parse(req.body);
    const category = await prisma.category.create({ data: payload });
    return res.status(201).json({ category });
  } catch (error) {
    return next(error);
  }
});

router.patch("/categories/:id", async (req, res, next) => {
  try {
    const payload = categorySchema.partial().parse(req.body);
    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: payload
    });
    return res.json({ category });
  } catch (error) {
    return next(error);
  }
});

router.delete("/categories/:id", async (req, res, next) => {
  try {
    const productCount = await prisma.product.count({ where: { categoryId: req.params.id } });
    if (productCount > 0) {
      throw blockedDeleteError("Category");
    }
    await prisma.category.delete({ where: { id: req.params.id } });
    return res.status(204).send();
  } catch (error) {
    try {
      rethrowDeleteError(error, "Category");
    } catch (nextError) {
      return next(nextError);
    }
  }
});

const inventoryQuerySchema = z.object({
  branchId: z.string().cuid().optional(),
  search: z.string().trim().optional(),
  status: z.enum(["all", "active", "inactive"]).default("all"),
  lowStock: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => value === true || value === "true")
});

const inventoryItemSchema = z.object({
  branchId: z.string().cuid(),
  name: z.string().min(2).max(80),
  unit: z.string().min(1).max(20),
  type: z.enum(INVENTORY_ITEM_TYPES).default("RAW"),
  reorderLevel: z.number().nonnegative(),
  costPerUnit: z.number().nonnegative().default(0),
  caloriesPerUnit: z.number().nonnegative().default(0),
  openingStock: z.number().nonnegative().default(0)
});

const inventoryItemUpdateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  unit: z.string().min(1).max(20).optional(),
  type: z.enum(INVENTORY_ITEM_TYPES).optional(),
  reorderLevel: z.number().nonnegative().optional(),
  costPerUnit: z.number().nonnegative().optional(),
  caloriesPerUnit: z.number().nonnegative().optional()
});

const purchaseUnitSchema = z.object({
  id: z.string().cuid().optional(),
  name: z.string().trim().min(1).max(40),
  quantityInBaseUnits: z.number().positive(),
  isActive: z.boolean().default(true)
});

const purchaseUnitsSchema = z.object({
  units: z.array(purchaseUnitSchema).max(30)
});

const inventoryItemStatusSchema = z.object({
  isActive: z.boolean()
});

const inventoryMovementSchema = z
  .object({
    branchId: z.string().cuid(),
    ingredientId: z.string().cuid(),
    action: z.enum(["PURCHASE", "ADJUSTMENT", "WASTAGE", "RETURN", "CLOSING"]),
    quantity: z.number().optional(),
    countedQuantity: z.number().nonnegative().optional(),
    vendorName: z.string().trim().max(120).optional(),
    purchaseDate: z.string().datetime().optional(),
    purchaseCost: z.number().nonnegative().optional(),
    wastageReason: z.enum(["expired", "spilled", "over-prepped", "damaged", "staff meal", "wrong order", "other"]).optional(),
    note: z.string().max(240).optional()
  })
  .superRefine((value, context) => {
    if (value.action === "CLOSING") {
      if (typeof value.countedQuantity !== "number") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["countedQuantity"],
          message: "Daily closing requires the counted stock."
        });
      }
      return;
    }

    if (typeof value.quantity !== "number" || value.quantity === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["quantity"],
        message: "Enter a quantity for this stock movement."
      });
    }

    if (value.action !== "ADJUSTMENT" && typeof value.quantity === "number" && value.quantity < 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["quantity"],
        message: "Use a positive quantity for this stock movement."
      });
    }

    if (value.action === "WASTAGE" && !value.wastageReason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["wastageReason"],
        message: "Pick a wastage reason."
      });
    }
  });

router.get("/inventory", async (req, res, next) => {
  try {
    const query = inventoryQuerySchema.parse(req.query);
    const branchContext = await resolveBranchContext(req);
    const ingredientStatusWhere: Prisma.IngredientWhereInput =
      query.status === "active"
        ? { isActive: true }
        : query.status === "inactive"
          ? { isActive: false }
          : {};

    const itemWhere: Prisma.BranchInventoryWhereInput = {
      branchId: branchContext.branchId,
      ...(query.lowStock ? { lowStockAlert: true } : {}),
      ...(query.status !== "all" ? { ingredient: ingredientStatusWhere } : {}),
      ...(query.search
        ? {
            OR: [
              { ingredient: { name: { contains: query.search, mode: "insensitive" as const } } },
              { ingredient: { sku: { contains: query.search, mode: "insensitive" as const } } }
            ]
          }
        : {})
    };

    const summaryWhere: Prisma.BranchInventoryWhereInput = {
      branchId: branchContext.branchId,
      ...(query.status !== "all" ? { ingredient: ingredientStatusWhere } : {})
    };

    const [items, summaryBase, recentTransactions] = await Promise.all([
      prisma.branchInventory.findMany({
        where: itemWhere,
        include: {
          branch: true,
          ingredient: {
            include: {
              productUsage: {
                include: { product: { select: { id: true, name: true } } }
              },
              purchaseUnits: true
            }
          }
        },
        orderBy: [{ lowStockAlert: "desc" }, { ingredient: { name: "asc" } }]
      }),
      prisma.branchInventory.findMany({
        where: summaryWhere,
        include: { ingredient: true }
      }),
      prisma.inventoryTransaction.findMany({
        where: { branchInventory: { branchId: branchContext.branchId } },
        include: {
          actor: true,
          purchaseUnit: true,
          branchInventory: {
            include: {
              branch: true,
              ingredient: true
            }
          }
        },
        orderBy: { createdAt: "desc" },
        take: 18
      })
    ]);

    const totalStockValue = summaryBase.reduce(
      (sum, item) => sum + parseDecimal(item.quantityOnHand) * parseDecimal(item.ingredient.costPerUnit),
      0
    );
    const totalUnits = summaryBase.reduce((sum, item) => sum + parseDecimal(item.quantityOnHand), 0);

    return res.json({
      branches: branchContext.branches.map((branch) => ({
        ...branch,
        deliveryFee: parseDecimal(branch.deliveryFee)
      })),
      summary: {
        totalItems: summaryBase.length,
        lowStockItems: summaryBase.filter((item) => item.lowStockAlert).length,
        totalStockValue: Number(totalStockValue.toFixed(2)),
        totalUnits: Number(totalUnits.toFixed(2))
      },
      items: items.map((item) => ({
        id: item.id,
        branchId: item.branchId,
        branchName: item.branch.name,
        ingredientId: item.ingredientId,
        name: item.ingredient.name,
        sku: item.ingredient.sku,
        unit: item.ingredient.unit,
        reorderLevel: parseDecimal(item.ingredient.reorderLevel),
        costPerUnit: parseDecimal(item.ingredient.costPerUnit),
        type: item.ingredient.type,
        isActive: item.ingredient.isActive,
        caloriesPerUnit: parseDecimal(item.ingredient.caloriesPerUnit),
        linkedProducts: item.ingredient.productUsage.map((usage) => ({
          productId: usage.productId,
          productName: usage.product.name,
          quantityNeeded: parseDecimal(usage.quantityNeeded)
        })),
        quantityOnHand: parseDecimal(item.quantityOnHand),
        stockValue: Number((parseDecimal(item.quantityOnHand) * parseDecimal(item.ingredient.costPerUnit)).toFixed(2)),
        lowStockAlert: item.lowStockAlert,
        purchaseUnits: item.ingredient.purchaseUnits
          .filter((unit) => unit.isActive)
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((unit) => ({
            id: unit.id,
            name: unit.name,
            quantityInBaseUnits: parseDecimal(unit.quantityInBaseUnits),
            isActive: unit.isActive
          })),
        updatedAt: item.ingredient.updatedAt.toISOString()
      })),
      recentTransactions: recentTransactions.map((entry) => ({
        id: entry.id,
        branchId: entry.branchInventory.branchId,
        branchName: entry.branchInventory.branch.name,
        ingredientId: entry.branchInventory.ingredientId,
        ingredientName: entry.branchInventory.ingredient.name,
        type: entry.type,
        quantity: parseDecimal(entry.quantity),
        balanceAfter: parseDecimal(entry.balanceAfter),
        note: entry.note,
        referenceType: entry.referenceType,
        referenceId: entry.referenceId,
        vendorName: entry.vendorName,
        purchaseDate: entry.purchaseDate?.toISOString() ?? null,
        purchaseCost: parseDecimal(entry.purchaseCost),
        purchaseQuantity: parseDecimal(entry.purchaseQuantity),
        purchaseUnitId: entry.purchaseUnitId,
        purchaseUnitLabel: entry.purchaseUnitLabel ?? entry.purchaseUnit?.name ?? null,
        wastageReason: entry.wastageReason,
        editedAt: entry.editedAt?.toISOString() ?? null,
        actorName: entry.actor?.name ?? null,
        createdAt: entry.createdAt.toISOString()
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/inventory/items", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const parsedPayload = inventoryItemSchema.parse(req.body);
    const payload = { ...parsedPayload, branchId: branchContext.branchId };
    const ingredient = await prisma.$transaction(async (transaction) => {
      const trimmedName = payload.name.trim();
      const normalizedSku = await buildNextInventorySku(transaction, payload.type, trimmedName);
      const caloriesPerUnit = payload.type === "PACKAGING"
        ? 0
        : payload.caloriesPerUnit || guessCaloriesPerUnit(trimmedName, payload.type);
      const existingIngredient = await transaction.ingredient.findFirst({
        where: {
          name: { equals: trimmedName, mode: "insensitive" }
        }
      });

      const createdIngredient = existingIngredient
        ? await transaction.ingredient.update({
            where: { id: existingIngredient.id },
            data: {
              name: trimmedName,
              sku: existingIngredient.sku,
              unit: payload.unit.trim(),
              type: payload.type,
              isActive: true,
              reorderLevel: payload.reorderLevel,
              costPerUnit: payload.costPerUnit,
              caloriesPerUnit
            }
          })
        : await transaction.ingredient.create({
            data: {
              name: trimmedName,
              sku: normalizedSku,
              unit: payload.unit.trim(),
              type: payload.type,
              isActive: true,
              reorderLevel: payload.reorderLevel,
              costPerUnit: payload.costPerUnit,
              caloriesPerUnit
            }
          });

      const existingInventory = await transaction.branchInventory.findUnique({
        where: {
          branchId_ingredientId: {
            branchId: payload.branchId,
            ingredientId: createdIngredient.id
          }
        }
      });

      const inventory =
        existingInventory ??
        (await transaction.branchInventory.create({
          data: {
            branchId: payload.branchId,
            ingredientId: createdIngredient.id,
            quantityOnHand: payload.openingStock,
            lowStockAlert: payload.openingStock <= payload.reorderLevel
          }
        }));

      if (existingInventory) {
        await transaction.branchInventory.update({
          where: { id: existingInventory.id },
          data: {
            lowStockAlert: parseDecimal(existingInventory.quantityOnHand) <= payload.reorderLevel
          }
        });
      }

      if (!existingInventory && payload.openingStock > 0) {
        await transaction.inventoryTransaction.create({
          data: {
            branchInventoryId: inventory.id,
            actorId: req.user!.id,
            type: InventoryTransactionType.PURCHASE,
            quantity: payload.openingStock,
            balanceAfter: payload.openingStock,
            note: "Opening stock",
            referenceType: "OPENING"
          }
        });
      }

      return createdIngredient;
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "inventory.item_create",
      entityType: "ingredient",
      entityId: ingredient.id,
      payload
    });

    return res.status(201).json({ ingredient });
  } catch (error) {
    return next(error);
  }
});

router.patch("/inventory/items/:id", async (req, res, next) => {
  try {
    const payload = inventoryItemUpdateSchema.parse(req.body);
    const ingredient = await prisma.ingredient.update({
      where: { id: req.params.id },
      data: {
        ...(payload.name ? { name: payload.name.trim() } : {}),
        ...(payload.unit ? { unit: payload.unit.trim() } : {}),
        ...(payload.type ? { type: payload.type } : {}),
        ...(typeof payload.reorderLevel === "number" ? { reorderLevel: payload.reorderLevel } : {}),
        ...(typeof payload.costPerUnit === "number" ? { costPerUnit: payload.costPerUnit } : {}),
        ...(payload.type === "PACKAGING"
          ? { caloriesPerUnit: 0 }
          : typeof payload.caloriesPerUnit === "number"
            ? { caloriesPerUnit: payload.caloriesPerUnit }
            : {})
      }
    });

    if (typeof payload.reorderLevel === "number") {
      const reorderLevel = payload.reorderLevel;
      const branchInventories = await prisma.branchInventory.findMany({
        where: { ingredientId: ingredient.id },
        include: { ingredient: true }
      });

      await Promise.all(
        branchInventories.map((entry) =>
          prisma.branchInventory.update({
            where: { id: entry.id },
            data: {
              lowStockAlert: parseDecimal(entry.quantityOnHand) <= reorderLevel
            }
          })
        )
      );
    }

    await writeAuditLog({
      actorId: req.user!.id,
      action: "inventory.item_update",
      entityType: "ingredient",
      entityId: ingredient.id,
      payload
    });

    return res.json({ ingredient });
  } catch (error) {
    return next(error);
  }
});

router.patch("/inventory/items/:id/status", async (req, res, next) => {
  try {
    const payload = inventoryItemStatusSchema.parse(req.body);
    const ingredient = await prisma.ingredient.update({
      where: { id: req.params.id },
      data: { isActive: payload.isActive }
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: payload.isActive ? "inventory.item_enable" : "inventory.item_disable",
      entityType: "ingredient",
      entityId: ingredient.id,
      payload
    });

    return res.json({ ingredient });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return next(adminActionError({
        message: "Could not update inventory item status.",
        statusCode: error.code === "P2025" ? 404 : 500,
        code: error.code,
        details: error.message,
        entity: "ingredient",
        action: "status"
      }));
    }
    return next(error);
  }
});

router.put("/inventory/items/:id/purchase-units", async (req, res, next) => {
  try {
    const payload = purchaseUnitsSchema.parse(req.body);
    const names = payload.units.map((unit) => unit.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) {
      return next(adminActionError({
        message: "Purchase unit names must be unique.",
        statusCode: 400,
        code: "PURCHASE_UNIT_DUPLICATE",
        details: "Use each purchase unit name only once for an inventory item.",
        entity: "ingredient_purchase_unit",
        action: "update"
      }));
    }

    const ingredient = await prisma.ingredient.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!ingredient) {
      return res.status(404).json({ message: "Inventory item not found." });
    }

    const units = await prisma.$transaction(async (transaction) => {
      const retainedIds = new Set<string>();

      for (const unit of payload.units) {
        const data = {
          name: unit.name.trim(),
          quantityInBaseUnits: unit.quantityInBaseUnits,
          isActive: unit.isActive
        };
        if (unit.id) {
          const updated = await transaction.ingredientPurchaseUnit.updateMany({
            where: { id: unit.id, ingredientId: ingredient.id },
            data
          });
          if (updated.count) retainedIds.add(unit.id);
        } else {
          const created = await transaction.ingredientPurchaseUnit.create({ data: { ...data, ingredientId: ingredient.id } });
          retainedIds.add(created.id);
        }
      }

      await transaction.ingredientPurchaseUnit.updateMany({
        where: {
          ingredientId: ingredient.id,
          id: { notIn: Array.from(retainedIds) }
        },
        data: { isActive: false }
      });

      return transaction.ingredientPurchaseUnit.findMany({
        where: { ingredientId: ingredient.id, isActive: true },
        orderBy: { name: "asc" }
      });
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "inventory.purchase_units_update",
      entityType: "ingredient",
      entityId: ingredient.id,
      payload
    });

    return res.json({
      units: units.map((unit) => ({
        id: unit.id,
        name: unit.name,
        quantityInBaseUnits: parseDecimal(unit.quantityInBaseUnits),
        isActive: unit.isActive
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.delete("/inventory/items/:id", async (req, res, next) => {
  try {
    const ingredientId = req.params.id;
    const existing = await prisma.ingredient.findUnique({
      where: { id: ingredientId },
      select: { id: true }
    });

    if (!existing) {
      return res.json({ deleted: true, alreadyDeleted: true });
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.inventoryTransaction.deleteMany({
        where: {
          branchInventory: {
            ingredientId
          }
        }
      });
      await transaction.productIngredient.deleteMany({ where: { ingredientId } });
      await transaction.ingredientComponent.deleteMany({
        where: {
          OR: [{ parentIngredientId: ingredientId }, { componentIngredientId: ingredientId }]
        }
      });
      await ignoreMissingOptionalTable(() => transaction.packagingRule.deleteMany({ where: { packagingIngredientId: ingredientId } }));
      await transaction.branchInventory.deleteMany({ where: { ingredientId } });
      await transaction.ingredient.delete({ where: { id: ingredientId } });
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "inventory.item_delete",
      entityType: "ingredient",
      entityId: ingredientId,
      payload: { mode: "deleted" }
    });

    return res.json({ deleted: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return next(adminActionError({
        message: "Could not delete inventory item.",
        statusCode: error.code === "P2025" ? 404 : 500,
        code: error.code,
        details: error.message,
        entity: "ingredient",
        action: "delete"
      }));
    }
    return next(adminActionError({
      message: "Could not delete inventory item.",
      statusCode: 500,
      code: "INVENTORY_ITEM_DELETE_FAILED",
      details: error instanceof Error ? error.message : String(error),
      entity: "ingredient",
      action: "delete"
    }));
  }
});

router.post("/inventory/transactions", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const parsedPayload = inventoryMovementSchema.parse(req.body);
    const payload = { ...parsedPayload, branchId: branchContext.branchId };
    const inventory = await prisma.branchInventory.findUnique({
      where: {
        branchId_ingredientId: {
          branchId: payload.branchId,
          ingredientId: payload.ingredientId
        }
      },
      include: {
        branch: true,
        ingredient: true
      }
    });

    if (!inventory) {
      return res.status(404).json({ message: "Inventory item not found for the selected branch." });
    }
    if (!inventory.ingredient.isActive) {
      return next(adminActionError({
        message: "Inventory item is disabled.",
        statusCode: 400,
        code: "INVENTORY_ITEM_DISABLED",
        details: "Enable this item before recording stock additions, wastage, returns, or adjustments.",
        entity: "ingredient",
        action: "stock_movement"
      }));
    }

    let quantityDelta = 0;
    let type: InventoryTransactionType = InventoryTransactionType.ADJUSTMENT;
    let note = payload.note?.trim() || undefined;

    if (payload.action === "CLOSING") {
      quantityDelta = Number(((payload.countedQuantity ?? 0) - parseDecimal(inventory.quantityOnHand)).toFixed(3));
      type = InventoryTransactionType.ADJUSTMENT;
      note = note ? `Daily closing: ${note}` : "Daily closing count";
    } else if (payload.action === "PURCHASE") {
      quantityDelta = Math.abs(payload.quantity ?? 0);
      type = InventoryTransactionType.PURCHASE;
      if (payload.purchaseCost && quantityDelta > 0) {
        await prisma.ingredient.update({
          where: { id: payload.ingredientId },
          data: { costPerUnit: Number((payload.purchaseCost / quantityDelta).toFixed(2)) }
        });
      }
    } else if (payload.action === "WASTAGE") {
      quantityDelta = -Math.abs(payload.quantity ?? 0);
      type = InventoryTransactionType.WASTAGE;
    } else if (payload.action === "RETURN") {
      quantityDelta = Math.abs(payload.quantity ?? 0);
      type = InventoryTransactionType.RETURN;
    } else {
      quantityDelta = Number((payload.quantity ?? 0).toFixed(3));
      type = InventoryTransactionType.ADJUSTMENT;
    }

    const updatedInventory = await prisma.$transaction(async (transaction) =>
      recordInventoryChange({
        transaction,
        branchId: payload.branchId,
        ingredientId: payload.ingredientId,
        quantityDelta,
        type,
        actorId: req.user!.id,
        note,
        referenceType: payload.action === "CLOSING" ? "DAILY_CLOSING" : "MANUAL",
        vendorName: payload.action === "PURCHASE" ? payload.vendorName : undefined,
        purchaseDate: payload.action === "PURCHASE" && payload.purchaseDate ? new Date(payload.purchaseDate) : undefined,
        purchaseCost: payload.action === "PURCHASE" ? payload.purchaseCost : undefined,
        wastageReason: payload.action === "WASTAGE" ? payload.wastageReason : undefined
      })
    );

    await writeAuditLog({
      actorId: req.user!.id,
      action: "inventory.transaction_create",
      entityType: "branch_inventory",
      entityId: updatedInventory.id,
      payload: {
        ...payload,
        quantityDelta,
        transactionType: type
      }
    });

    return res.status(201).json({
      inventory: {
        id: updatedInventory.id,
        branchId: updatedInventory.branchId,
        ingredientId: updatedInventory.ingredientId,
        name: updatedInventory.ingredient.name,
        sku: updatedInventory.ingredient.sku,
        unit: updatedInventory.ingredient.unit,
        reorderLevel: parseDecimal(updatedInventory.ingredient.reorderLevel),
        costPerUnit: parseDecimal(updatedInventory.ingredient.costPerUnit),
        quantityOnHand: parseDecimal(updatedInventory.quantityOnHand),
        lowStockAlert: updatedInventory.lowStockAlert
      }
    });
  } catch (error) {
    return next(error);
  }
});

const recipeUpdateSchema = z.object({
  components: z.array(
    z.object({
      ingredientId: z.string().cuid(),
      quantityNeeded: z.number().nonnegative()
    })
  )
});

const packagingRulesUpdateSchema = z.object({
  rules: z.array(
    z.object({
      serviceType: z.string().refine((value) => PACKAGING_SERVICE_TYPES.includes(value as any), "Invalid service type.").default(DEFAULT_PACKAGING_SERVICE),
      ingredientId: z.string().cuid(),
      quantityNeeded: z.number().nonnegative()
    })
  )
});

const transactionUpdateSchema = z.object({
  quantity: z.number().optional(),
  note: z.string().max(240).optional(),
  vendorName: z.string().trim().max(120).optional(),
  purchaseDate: z.string().datetime().nullable().optional(),
  purchaseCost: z.number().nonnegative().nullable().optional(),
  wastageReason: z.enum(["expired", "spilled", "over-prepped", "damaged", "staff meal", "wrong order", "other"]).nullable().optional()
});

const packagingRuleSchema = z.object({
  id: z.string().cuid().optional(),
  productId: z.string().cuid().nullable().optional(),
  categoryId: z.string().cuid().nullable().optional(),
  serviceType: z.string().refine((value) => PACKAGING_SERVICE_TYPES.includes(value as any), "Invalid service type.").default(DEFAULT_PACKAGING_SERVICE),
  packagingIngredientId: z.string().cuid(),
  quantityMode: z.enum(PACKAGING_QUANTITY_MODES).default("FIXED"),
  quantity: z.number().nonnegative(),
  itemStep: z.number().int().positive().nullable().optional()
});

const transferSchema = z
  .object({
    branchId: z.string().cuid(),
    fromSource: z.enum(MONEY_SOURCES),
    toSource: z.enum(MONEY_SOURCES),
    amount: z.number().positive(),
    transferDate: z.string().datetime(),
    note: z.string().max(240).optional().or(z.literal(""))
  })
  .superRefine((value, context) => {
    if (value.fromSource === value.toSource) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toSource"],
        message: "Transfer destination must be different."
      });
    }
  });

const moneyAdditionSchema = z.object({
  branchId: z.string().cuid(),
  amount: z.number().positive(),
  toSource: z.enum(MONEY_SOURCES),
  reason: z.string().trim().min(1).max(240),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const closingQuerySchema = z.object({
  branchId: z.string().cuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const closingSchema = z.object({
  branchId: z.string().cuid(),
  closingDate: z.string().datetime(),
  cashCounted: z.number().nonnegative(),
  easypaisaCounted: z.number().nonnegative(),
  jazzcashCounted: z.number().nonnegative(),
  note: z.string().max(240).optional().or(z.literal(""))
});

const openingBalanceQuerySchema = z.object({
  branchId: z.string().cuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const openingBalanceSchema = z.object({
  branchId: z.string().cuid(),
  balanceDate: z.string().datetime(),
  cashBalance: z.number().nonnegative(),
  easypaisaBalance: z.number().nonnegative(),
  jazzcashBalance: z.number().nonnegative(),
  note: z.string().max(240).optional().or(z.literal(""))
});

function normalizeClosingDate(value: Date) {
  return startOfDay(value);
}

function emptyMoneyTotals() {
  return { CASH: 0, EASYPAISA: 0, JAZZCASH: 0 };
}

function isMissingTableError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && ["P2021", "P2022"].includes(error.code);
}

async function readLoanCashflow(branchId: string, start: Date, end: Date) {
  try {
    const [loans, loanRepayments] = await Promise.all([
      prisma.loan.findMany({
        where: {
          branchId,
          loanDate: { gte: start, lte: end },
          receivedSource: { in: [...MONEY_SOURCES] }
        },
        select: { receivedSource: true, amount: true }
      }),
      prisma.loanRepayment.findMany({
        where: {
          branchId,
          paymentDate: { gte: start, lte: end },
          paidFrom: { in: [...MONEY_SOURCES] }
        },
        select: { paidFrom: true, amount: true }
      })
    ]);
    return { loans, loanRepayments };
  } catch (error) {
    if (isMissingTableError(error)) {
      return { loans: [], loanRepayments: [] };
    }
    throw error;
  }
}

async function readInvestmentCashflow(branchId: string, start: Date, end: Date) {
  try {
    return await prisma.investmentPayment.findMany({
      where: {
        branchId,
        paymentDate: { gte: start, lte: end },
        receivedSource: { in: [...MONEY_SOURCES] }
      },
      select: { receivedSource: true, amount: true }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
      return [];
    }
    throw error;
  }
}

async function buildClosingSnapshot(branchId: string, closingDate: Date) {
  const date = normalizeClosingDate(closingDate);
  const start = startOfDay(date);
  const end = endOfDay(date);
  const [previousClosing, openingBalance] = await Promise.all([
    prisma.dailyClosing.findFirst({ where: { branchId, closingDate: { lt: start }, isLocked: true }, orderBy: { closingDate: "desc" } }),
    prisma.openingBalance.findFirst({ where: { branchId, balanceDate: { lte: start } }, orderBy: { balanceDate: "desc" } })
  ]);

  const [orders, foodpandaOrders, expenses, transfers, additions, loanCashflow, investmentCashflow, currentClosing, recentClosings] = await Promise.all([
    prisma.order.findMany({
      where: {
        branchId,
        status: { not: OrderStatus.CANCELLED },
        placedAt: { gte: start, lte: end },
        paymentMethod: { in: [PaymentMethod.CASH, PaymentMethod.EASYPAISA, PaymentMethod.JAZZCASH] }
      },
      select: { paymentMethod: true, totalAmount: true }
    }),
    prisma.order.findMany({
      where: {
        branchId,
        status: { not: OrderStatus.CANCELLED },
        serviceType: ServiceType.FOODPANDA,
        placedAt: { gte: start, lte: end }
      },
      select: { totalAmount: true }
    }),
    prisma.expense.findMany({
      where: {
        AND: [
          {
            OR: [
              { fixedExpenseOccurrence: { is: null } },
              { fixedExpenseOccurrence: { is: { status: "PAID" } } }
            ]
          }
        ],
        branchId,
        expenseDate: { gte: start, lte: end },
        paymentSource: { in: [...MONEY_SOURCES] }
      },
      select: { paymentSource: true, amount: true }
    }),
    prisma.moneyTransfer.findMany({
      where: {
        branchId,
        transferDate: { gte: start, lte: end }
      },
      include: { createdBy: true },
      orderBy: { transferDate: "desc" }
    }),
    prisma.moneyAddition.findMany({
      where: { branchId, additionDate: { gte: start, lte: end } },
      include: { createdBy: true },
      orderBy: { additionDate: "desc" }
    }),
    readLoanCashflow(branchId, start, end),
    readInvestmentCashflow(branchId, start, end),
    prisma.dailyClosing.findUnique({
      where: { branchId_closingDate: { branchId, closingDate: start } },
      include: { closedBy: true }
    }),
    prisma.dailyClosing.findMany({
      where: { branchId },
      orderBy: { closingDate: "desc" },
      take: 8,
      include: { closedBy: true }
    })
  ]);

  const openingSource = openingBalance && (!previousClosing || openingBalance.balanceDate > previousClosing.closingDate) ? openingBalance : null;
  const openingSourceType = openingSource ? "OPENING_BALANCE" : previousClosing ? "PREVIOUS_CLOSING" : "NONE";
  const opening = {
    CASH: openingSource ? parseDecimal(openingSource.cashBalance) : parseDecimal(previousClosing?.cashCounted),
    EASYPAISA: openingSource ? parseDecimal(openingSource.easypaisaBalance) : parseDecimal(previousClosing?.easypaisaCounted),
    JAZZCASH: openingSource ? parseDecimal(openingSource.jazzcashBalance) : parseDecimal(previousClosing?.jazzcashCounted)
  };
  const sales = emptyMoneyTotals();
  for (const order of orders) {
    sales[order.paymentMethod as keyof typeof sales] += parseDecimal(order.totalAmount);
  }
  const foodpandaSales = roundMoney(foodpandaOrders.reduce((sum, order) => sum + parseDecimal(order.totalAmount), 0));
  const expenseTotals = emptyMoneyTotals();
  for (const expense of expenses) {
    expenseTotals[expense.paymentSource as keyof typeof expenseTotals] += parseDecimal(expense.amount);
  }
  const transferIn = emptyMoneyTotals();
  const transferOut = emptyMoneyTotals();
  for (const transfer of transfers) {
    transferOut[transfer.fromSource as keyof typeof transferOut] += parseDecimal(transfer.amount);
    transferIn[transfer.toSource as keyof typeof transferIn] += parseDecimal(transfer.amount);
  }
  const additionIn = emptyMoneyTotals();
  for (const addition of additions) {
    additionIn[addition.toSource as keyof typeof additionIn] += parseDecimal(addition.amount);
  }
  const loanIn = emptyMoneyTotals();
  const loanOut = emptyMoneyTotals();
  for (const loan of loanCashflow.loans) {
    loanIn[loan.receivedSource as keyof typeof loanIn] += parseDecimal(loan.amount);
  }
  for (const repayment of loanCashflow.loanRepayments) {
    loanOut[repayment.paidFrom as keyof typeof loanOut] += parseDecimal(repayment.amount);
  }
  const investmentIn = emptyMoneyTotals();
  for (const payment of investmentCashflow) {
    investmentIn[payment.receivedSource as keyof typeof investmentIn] += parseDecimal(payment.amount);
  }
  const expected = {
    CASH: roundMoney(opening.CASH + sales.CASH - expenseTotals.CASH - transferOut.CASH + transferIn.CASH + additionIn.CASH + loanIn.CASH + investmentIn.CASH - loanOut.CASH),
    EASYPAISA: roundMoney(opening.EASYPAISA + sales.EASYPAISA - expenseTotals.EASYPAISA - transferOut.EASYPAISA + transferIn.EASYPAISA + additionIn.EASYPAISA + loanIn.EASYPAISA + investmentIn.EASYPAISA - loanOut.EASYPAISA),
    JAZZCASH: roundMoney(opening.JAZZCASH + sales.JAZZCASH - expenseTotals.JAZZCASH - transferOut.JAZZCASH + transferIn.JAZZCASH + additionIn.JAZZCASH + loanIn.JAZZCASH + investmentIn.JAZZCASH - loanOut.JAZZCASH)
  };

  return {
    branchId,
    closingDate: start.toISOString(),
    openingSource: openingSourceType,
    openingSourceDate: openingSource?.balanceDate.toISOString() ?? previousClosing?.closingDate.toISOString() ?? null,
    openingBalanceDate: openingSource?.balanceDate.toISOString() ?? previousClosing?.closingDate.toISOString() ?? null,
    opening,
    sales,
    foodpandaSales,
    expenses: expenseTotals,
    transferIn,
    transferOut,
    additionIn,
    loanIn,
    investmentIn,
    loanOut,
    additionsToday: additions.map((addition) => ({
      id: addition.id,
      branchId: addition.branchId,
      amount: parseDecimal(addition.amount),
      toSource: addition.toSource,
      reason: addition.reason,
      additionDate: addition.additionDate.toISOString(),
      createdByName: addition.createdBy?.name ?? null,
      createdAt: addition.createdAt.toISOString()
    })),
    expected,
    currentClosing: currentClosing ? {
      id: currentClosing.id,
      closingDate: currentClosing.closingDate.toISOString(),
      cashExpected: parseDecimal(currentClosing.cashExpected),
      cashCounted: parseDecimal(currentClosing.cashCounted),
      cashDifference: roundMoney(parseDecimal(currentClosing.cashCounted) - parseDecimal(currentClosing.cashExpected)),
      easypaisaExpected: parseDecimal(currentClosing.easypaisaExpected),
      easypaisaCounted: parseDecimal(currentClosing.easypaisaCounted),
      easypaisaDifference: roundMoney(parseDecimal(currentClosing.easypaisaCounted) - parseDecimal(currentClosing.easypaisaExpected)),
      jazzcashExpected: parseDecimal(currentClosing.jazzcashExpected),
      jazzcashCounted: parseDecimal(currentClosing.jazzcashCounted),
      jazzcashDifference: roundMoney(parseDecimal(currentClosing.jazzcashCounted) - parseDecimal(currentClosing.jazzcashExpected)),
      note: currentClosing.note,
      isLocked: currentClosing.isLocked,
      closedByName: currentClosing.closedBy?.name ?? null,
      createdAt: currentClosing.createdAt.toISOString()
    } : null,
    transfersToday: transfers.map((transfer) => ({
      id: transfer.id,
      branchId: transfer.branchId,
      fromSource: transfer.fromSource,
      toSource: transfer.toSource,
      amount: parseDecimal(transfer.amount),
      transferDate: transfer.transferDate.toISOString(),
      note: transfer.note,
      createdByName: transfer.createdBy?.name ?? null,
      createdAt: transfer.createdAt.toISOString()
    })),
    recentClosings: recentClosings.map((closing) => ({
      id: closing.id,
      closingDate: closing.closingDate.toISOString(),
      cashExpected: parseDecimal(closing.cashExpected),
      cashCounted: parseDecimal(closing.cashCounted),
      cashDifference: roundMoney(parseDecimal(closing.cashCounted) - parseDecimal(closing.cashExpected)),
      easypaisaExpected: parseDecimal(closing.easypaisaExpected),
      easypaisaCounted: parseDecimal(closing.easypaisaCounted),
      easypaisaDifference: roundMoney(parseDecimal(closing.easypaisaCounted) - parseDecimal(closing.easypaisaExpected)),
      jazzcashExpected: parseDecimal(closing.jazzcashExpected),
      jazzcashCounted: parseDecimal(closing.jazzcashCounted),
      jazzcashDifference: roundMoney(parseDecimal(closing.jazzcashCounted) - parseDecimal(closing.jazzcashExpected)),
      note: closing.note,
      isLocked: closing.isLocked,
      closedByName: closing.closedBy?.name ?? null,
      createdAt: closing.createdAt.toISOString()
    }))
  };
}

router.get("/finance/cash-position", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    const [pendingSettlements, receivedToday, fixedExpenses, loans] = await Promise.all([
      prisma.foodpandaSettlement.findMany({ where: { status: { not: "RECEIVED" } }, select: { expectedNet: true } }),
      prisma.foodpandaSettlement.findMany({ where: { status: "RECEIVED", receivedAt: { gte: todayStart, lte: todayEnd } }, select: { amountReceived: true, receivedSource: true } }),
      prisma.fixedExpense.findMany({ where: { branchId: branchContext.branchId, isActive: true }, select: { monthlyAmount: true } }),
      prisma.loan.findMany({ where: { branchId: branchContext.branchId }, select: { amount: true, repayments: { select: { amount: true } } } })
    ]);
    const snapshots = [await buildClosingSnapshot(branchContext.branchId, new Date())];
    const available = emptyMoneyTotals();
    for (const snapshot of snapshots) {
      for (const source of MONEY_SOURCES) available[source] += snapshot.expected[source];
    }
    for (const settlement of receivedToday) {
      if (settlement.amountReceived != null && settlement.receivedSource in available) {
        available[settlement.receivedSource as keyof typeof available] += parseDecimal(settlement.amountReceived);
      }
    }
    const totalAvailable = roundMoney(Object.values(available).reduce((sum, value) => sum + value, 0));
    const pendingFoodpanda = roundMoney(pendingSettlements.reduce((sum, settlement) => sum + parseDecimal(settlement.expectedNet), 0));
    const fixedObligations = roundMoney(fixedExpenses.reduce((sum, expense) => sum + parseDecimal(expense.monthlyAmount), 0));
    const loanObligations = roundMoney(loans.reduce((sum, loan) => sum + parseDecimal(loan.amount) - loan.repayments.reduce((repaymentSum, repayment) => repaymentSum + parseDecimal(repayment.amount), 0), 0));
    const totalUpcoming = roundMoney(fixedObligations + loanObligations);
    const projectedAfterPayments = roundMoney(totalAvailable + pendingFoodpanda - totalUpcoming);
    const health = projectedAfterPayments < 0 ? "risk" : projectedAfterPayments < totalUpcoming * 0.25 ? "watch" : "healthy";
    return res.json({
      available: { ...available, total: totalAvailable },
      pendingReceivables: { foodpanda: pendingFoodpanda, other: 0, total: pendingFoodpanda },
      upcomingObligations: { fixedExpenses: fixedObligations, loanInstallments: loanObligations, supplierPayables: 0, total: totalUpcoming },
      projectedAfterPayments,
      health
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/inventory/rules", async (_req, res, next) => {
  try {
    const [rules, products, categories, packagingItems] = await Promise.all([
      prisma.packagingRule.findMany({
        include: {
          product: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          packagingIngredient: true
        },
        orderBy: [{ serviceType: "asc" }, { id: "asc" }]
      }),
      prisma.product.findMany({ where: { isActive: true }, select: { id: true, name: true, categoryId: true }, orderBy: { name: "asc" } }),
      prisma.category.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.ingredient.findMany({ where: { type: "PACKAGING", isActive: true }, orderBy: { name: "asc" } })
    ]);
    return res.json({
      serviceTypes: PACKAGING_SERVICE_TYPES,
      quantityModes: PACKAGING_QUANTITY_MODES,
      products,
      categories,
      packagingItems: packagingItems.map((item) => ({
        id: item.id,
        name: item.name,
        unit: item.unit,
        costPerUnit: parseDecimal(item.costPerUnit)
      })),
      rules: rules.map((rule) => ({
        id: rule.id,
        productId: rule.productId,
        productName: rule.product?.name ?? null,
        categoryId: rule.categoryId,
        categoryName: rule.category?.name ?? null,
        serviceType: rule.serviceType,
        packagingIngredientId: rule.packagingIngredientId,
        packagingIngredientName: rule.packagingIngredient.name,
        quantityMode: rule.quantityMode,
        quantity: parseDecimal(rule.quantity),
        itemStep: rule.itemStep
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/inventory/rules", async (req, res, next) => {
  try {
    const payload = packagingRuleSchema.parse(req.body);
    const packagingItem = await prisma.ingredient.findFirst({
      where: { id: payload.packagingIngredientId, type: "PACKAGING", isActive: true },
      select: { id: true }
    });
    if (!packagingItem) {
      return next(adminActionError({
        message: "Select an active packaging item for this rule.",
        statusCode: 400,
        code: "PACKAGING_ITEM_UNAVAILABLE",
        details: "Disabled or deleted packaging items cannot be used in new packaging rules.",
        entity: "packaging_rule",
        action: payload.id ? "update" : "create"
      }));
    }
    const data = {
      productId: payload.productId || null,
      categoryId: payload.productId ? null : payload.categoryId || null,
      serviceType: payload.serviceType,
      packagingIngredientId: payload.packagingIngredientId,
      quantityMode: payload.quantityMode,
      quantity: payload.quantity,
      itemStep: payload.quantityMode === "PER_ITEM_STEP" ? payload.itemStep ?? 1 : null
    };
    const rule = payload.id
      ? await prisma.packagingRule.update({ where: { id: payload.id }, data })
      : await prisma.packagingRule.create({ data });
    await writeAuditLog({
      actorId: req.user!.id,
      action: payload.id ? "inventory.packaging_rule_update" : "inventory.packaging_rule_create",
      entityType: "packaging_rule",
      entityId: rule.id,
      payload
    });
    return res.status(payload.id ? 200 : 201).json({ rule });
  } catch (error) {
    return next(error);
  }
});

router.delete("/inventory/rules/:id", async (req, res, next) => {
  try {
    await prisma.packagingRule.delete({ where: { id: req.params.id } });
    await writeAuditLog({
      actorId: req.user!.id,
      action: "inventory.packaging_rule_delete",
      entityType: "packaging_rule",
      entityId: req.params.id,
      payload: { mode: "deleted" }
    });
    return res.json({ deleted: true });
  } catch (error) {
    try {
      rethrowDeleteError(error, "Packaging rule");
    } catch (nextError) {
      return next(nextError);
    }
  }
});

router.get("/inventory/transfers", async (req, res, next) => {
  try {
    z.object({ branchId: z.string().cuid().optional() }).parse(req.query);
    const branchContext = await resolveBranchContext(req);
    const transfers = await prisma.moneyTransfer.findMany({
      where: { branchId: branchContext.branchId },
      include: { branch: true, createdBy: true },
      orderBy: { transferDate: "desc" },
      take: 50
    });
    return res.json({
      sources: MONEY_SOURCES,
      branches: branchContext.branches.map((branch) => ({ id: branch.id, name: branch.name })),
      transfers: transfers.map((transfer) => ({
        id: transfer.id,
        branchId: transfer.branchId,
        branchName: transfer.branch.name,
        fromSource: transfer.fromSource,
        toSource: transfer.toSource,
        amount: parseDecimal(transfer.amount),
        transferDate: transfer.transferDate.toISOString(),
        note: transfer.note,
        createdByName: transfer.createdBy?.name ?? null,
        createdAt: transfer.createdAt.toISOString()
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/inventory/transfers", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const parsedPayload = transferSchema.parse(req.body);
    const payload = { ...parsedPayload, branchId: branchContext.branchId };
    const transfer = await prisma.moneyTransfer.create({
      data: {
        branchId: payload.branchId,
        fromSource: payload.fromSource,
        toSource: payload.toSource,
        amount: payload.amount,
        transferDate: new Date(payload.transferDate),
        note: payload.note?.trim() || undefined,
        createdById: req.user!.id
      }
    });
    await writeAuditLog({
      actorId: req.user!.id,
      action: "inventory.money_transfer_create",
      entityType: "money_transfer",
      entityId: transfer.id,
      payload
    });
    return res.status(201).json({ transfer });
  } catch (error) {
    return next(error);
  }
});

router.delete("/inventory/transfers/:id", async (req, res, next) => {
  try {
    await prisma.moneyTransfer.delete({ where: { id: req.params.id } });
    await writeAuditLog({
      actorId: req.user!.id,
      action: "inventory.money_transfer_delete",
      entityType: "money_transfer",
      entityId: req.params.id,
      payload: { mode: "deleted" }
    });
    return res.json({ deleted: true });
  } catch (error) {
    try {
      rethrowDeleteError(error, "Money transfer");
    } catch (nextError) {
      return next(nextError);
    }
  }
});

router.post("/inventory/closing/additions", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const parsed = moneyAdditionSchema.parse(req.body);
    const addition = await prisma.moneyAddition.create({
      data: {
        branchId: branchContext.branchId,
        amount: parsed.amount,
        toSource: parsed.toSource,
        reason: parsed.reason,
        additionDate: normalizeClosingDate(new Date(`${parsed.businessDate}T12:00:00+05:00`)),
        createdById: req.user!.id
      },
      include: { createdBy: true }
    });
    await writeAuditLog({ actorId: req.user!.id, action: "finance.money_addition_create", entityType: "money_addition", entityId: addition.id, payload: parsed });
    return res.status(201).json({ addition });
  } catch (error) {
    return next(error);
  }
});

router.delete("/inventory/closing/additions/:id", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const addition = await prisma.moneyAddition.findFirst({ where: { id: req.params.id, branchId: branchContext.branchId } });
    if (!addition) return res.status(404).json({ message: "Money addition not found." });
    await prisma.moneyAddition.delete({ where: { id: addition.id } });
    await writeAuditLog({ actorId: req.user!.id, action: "finance.money_addition_delete", entityType: "money_addition", entityId: addition.id, payload: { mode: "deleted" } });
    return res.json({ deleted: true });
  } catch (error) {
    return next(error);
  }
});

router.get("/inventory/closing", async (req, res, next) => {
  try {
    const query = closingQuerySchema.parse(req.query);
    const branchContext = await resolveBranchContext(req);
    const snapshot = await buildClosingSnapshot(branchContext.branchId, query.date ? new Date(`${query.date}T12:00:00`) : new Date());
    const balanceDate = normalizeClosingDate(query.date ? new Date(`${query.date}T12:00:00`) : new Date());
    const openingBalance = await prisma.openingBalance.findUnique({ where: { branchId_balanceDate: { branchId: branchContext.branchId, balanceDate } } });
    return res.json({
      ...snapshot,
      openingBalance: openingBalance ? {
        id: openingBalance.id,
        balanceDate: openingBalance.balanceDate.toISOString(),
        cashBalance: parseDecimal(openingBalance.cashBalance),
        easypaisaBalance: parseDecimal(openingBalance.easypaisaBalance),
        jazzcashBalance: parseDecimal(openingBalance.jazzcashBalance),
        note: openingBalance.note
      } : null
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/inventory/opening-balance", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const parsedPayload = openingBalanceSchema.parse(req.body);
    const payload = { ...parsedPayload, branchId: branchContext.branchId };
    const balanceDate = normalizeClosingDate(new Date(payload.balanceDate));
    const openingBalance = await prisma.openingBalance.upsert({
      where: { branchId_balanceDate: { branchId: payload.branchId, balanceDate } },
      update: {
        cashBalance: payload.cashBalance,
        easypaisaBalance: payload.easypaisaBalance,
        jazzcashBalance: payload.jazzcashBalance,
        note: payload.note?.trim() || null,
        createdById: req.user!.id
      },
      create: {
        branchId: payload.branchId,
        balanceDate,
        cashBalance: payload.cashBalance,
        easypaisaBalance: payload.easypaisaBalance,
        jazzcashBalance: payload.jazzcashBalance,
        note: payload.note?.trim() || undefined,
        createdById: req.user!.id
      }
    });
    await writeAuditLog({ actorId: req.user!.id, action: "finance.opening_balance_save", entityType: "opening_balance", entityId: openingBalance.id, payload });
    return res.status(201).json({ openingBalance });
  } catch (error) {
    return next(error);
  }
});

router.get("/finance/other-money-in", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const query = dashboardQuerySchema.parse(req.query);
    const range = buildDashboardRange(query);
    const additions = await prisma.moneyAddition.findMany({
      where: { branchId: branchContext.branchId, additionDate: { gte: range.start, lte: range.end } },
      select: { amount: true }
    });
    return res.json({ amount: roundMoney(additions.reduce((sum, addition) => sum + parseDecimal(addition.amount), 0)), range });
  } catch (error) {
    return next(error);
  }
});

router.post("/inventory/closing", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const parsedPayload = closingSchema.parse(req.body);
    const payload = { ...parsedPayload, branchId: branchContext.branchId };
    const snapshot = await buildClosingSnapshot(payload.branchId, new Date(payload.closingDate));
    const closingDate = normalizeClosingDate(new Date(payload.closingDate));
    const closing = await prisma.dailyClosing.upsert({
      where: {
        branchId_closingDate: {
          branchId: payload.branchId,
          closingDate
        }
      },
      update: {
        cashExpected: snapshot.expected.CASH,
        cashCounted: payload.cashCounted,
        easypaisaExpected: snapshot.expected.EASYPAISA,
        easypaisaCounted: payload.easypaisaCounted,
        jazzcashExpected: snapshot.expected.JAZZCASH,
        jazzcashCounted: payload.jazzcashCounted,
        note: payload.note?.trim() || null,
        isLocked: true,
        closedById: req.user!.id
      },
      create: {
        branchId: payload.branchId,
        closingDate,
        cashExpected: snapshot.expected.CASH,
        cashCounted: payload.cashCounted,
        easypaisaExpected: snapshot.expected.EASYPAISA,
        easypaisaCounted: payload.easypaisaCounted,
        jazzcashExpected: snapshot.expected.JAZZCASH,
        jazzcashCounted: payload.jazzcashCounted,
        note: payload.note?.trim() || undefined,
        isLocked: true,
        closedById: req.user!.id
      }
    });
    await writeAuditLog({
      actorId: req.user!.id,
      action: "inventory.daily_closing_save",
      entityType: "daily_closing",
      entityId: closing.id,
      payload
    });
    return res.status(201).json({ closing });
  } catch (error) {
    return next(error);
  }
});

router.post("/inventory/closing/:id/reset", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const closing = await prisma.dailyClosing.findUnique({ where: { id: req.params.id } });
    if (!closing) {
      return res.status(404).json({ message: "Daily closing not found." });
    }
    if (closing.branchId !== branchContext.branchId) {
      return res.status(403).json({ message: "This daily closing belongs to another branch." });
    }

    const reopened = await prisma.dailyClosing.update({
      where: { id: closing.id },
      data: { isLocked: false }
    });
    await writeAuditLog({
      actorId: req.user!.id,
      action: "inventory.daily_closing_reset",
      entityType: "daily_closing",
      entityId: reopened.id,
      payload: { closingDate: reopened.closingDate.toISOString(), isLocked: false }
    });
    return res.json({ closing: reopened });
  } catch (error) {
    return next(error);
  }
});

router.delete("/inventory/closing/:id", async (req, res, next) => {
  try {
    await prisma.dailyClosing.delete({ where: { id: req.params.id } });
    await writeAuditLog({
      actorId: req.user!.id,
      action: "inventory.daily_closing_delete",
      entityType: "daily_closing",
      entityId: req.params.id,
      payload: { mode: "deleted" }
    });
    return res.json({ deleted: true });
  } catch (error) {
    try {
      rethrowDeleteError(error, "Daily closing");
    } catch (nextError) {
      return next(nextError);
    }
  }
});

const loanQuerySchema = dashboardQueryBaseSchema
  .extend({
    branchId: z.string().cuid().optional(),
    status: z.enum(["all", "open", "paid"]).default("all"),
    search: z.string().trim().optional()
  })
  .superRefine((value, context) => {
    if (value.preset === "custom" && (!value.start || !value.end)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Custom range requires start and end dates.",
        path: ["start"]
      });
    }
  });

const loanSchema = z.object({
  branchId: z.string().cuid(),
  lenderName: z.string().trim().min(2).max(120),
  amount: z.number().positive(),
  receivedSource: z.enum(MONEY_SOURCES),
  loanDate: z.string().datetime(),
  note: z.string().max(500).optional().or(z.literal(""))
});

const loanRepaymentSchema = z.object({
  amount: z.number().positive(),
  paidFrom: z.enum(MONEY_SOURCES),
  paymentDate: z.string().datetime(),
  note: z.string().max(500).optional().or(z.literal(""))
});

const investmentPartnerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  note: z.string().max(500).optional().or(z.literal(""))
});

const investmentCommitmentSchema = z.object({
  partnerId: z.string().cuid(),
  amount: z.number().positive(),
  commitmentDate: z.string().datetime(),
  note: z.string().max(500).optional().or(z.literal(""))
});

const investmentPaymentSchema = z.object({
  commitmentId: z.string().cuid(),
  branchId: z.string().cuid(),
  amount: z.number().positive(),
  receivedSource: z.enum(MONEY_SOURCES),
  paymentDate: z.string().datetime(),
  note: z.string().max(500).optional().or(z.literal(""))
});

function serializeLoan(loan: Prisma.LoanGetPayload<{ include: { branch: true; createdBy: true; repayments: { include: { createdBy: true } } } }>) {
  const amount = parseDecimal(loan.amount);
  const repaidAmount = loan.repayments.reduce((sum, repayment) => sum + parseDecimal(repayment.amount), 0);
  const outstandingAmount = roundMoney(Math.max(0, amount - repaidAmount));
  const status = outstandingAmount <= 0 ? "PAID" : repaidAmount > 0 ? "PARTIALLY_PAID" : "OPEN";

  return {
    id: loan.id,
    branchId: loan.branchId,
    branchName: loan.branch.name,
    lenderName: loan.lenderName,
    amount,
    receivedSource: loan.receivedSource,
    loanDate: loan.loanDate.toISOString(),
    note: loan.note,
    createdByName: loan.createdBy?.name ?? null,
    createdAt: loan.createdAt.toISOString(),
    repaidAmount: roundMoney(repaidAmount),
    outstandingAmount,
    status,
    repayments: loan.repayments
      .slice()
      .sort((left, right) => right.paymentDate.getTime() - left.paymentDate.getTime())
      .map((repayment) => ({
        id: repayment.id,
        loanId: repayment.loanId,
        branchId: repayment.branchId,
        amount: parseDecimal(repayment.amount),
        paidFrom: repayment.paidFrom,
        paymentDate: repayment.paymentDate.toISOString(),
        note: repayment.note,
        createdByName: repayment.createdBy?.name ?? null,
        createdAt: repayment.createdAt.toISOString()
      }))
  };
}

type InvestmentPartnerWithRelations = Prisma.InvestmentPartnerGetPayload<{
  include: {
    createdBy: true;
    commitments: {
      include: {
        createdBy: true;
        payments: {
          include: {
            branch: true;
            createdBy: true;
          };
        };
      };
    };
  };
}>;

function serializeInvestmentData(partners: InvestmentPartnerWithRelations[]) {
  const partnerTotals = partners.map((partner) => {
    const committedAmount = partner.commitments.reduce((sum, commitment) => sum + parseDecimal(commitment.amount), 0);
    const paidAmount = partner.commitments.reduce((sum, commitment) => sum + commitment.payments.reduce((paymentSum, payment) => paymentSum + parseDecimal(payment.amount), 0), 0);
    return {
      partner,
      committedAmount: roundMoney(committedAmount),
      paidAmount: roundMoney(paidAmount),
      unpaidAmount: roundMoney(Math.max(0, committedAmount - paidAmount))
    };
  });
  const totalCommitted = roundMoney(partnerTotals.reduce((sum, item) => sum + item.committedAmount, 0));
  const totalPaid = roundMoney(partnerTotals.reduce((sum, item) => sum + item.paidAmount, 0));
  const totalUnpaid = roundMoney(Math.max(0, totalCommitted - totalPaid));

  return {
    summary: {
      totalCommitted,
      totalPaid,
      totalUnpaid,
      partnerCount: partners.length
    },
    partners: partnerTotals.map(({ partner, committedAmount, paidAmount, unpaidAmount }) => ({
      id: partner.id,
      name: partner.name,
      note: partner.note,
      createdByName: partner.createdBy?.name ?? null,
      createdAt: partner.createdAt.toISOString(),
      committedAmount,
      paidAmount,
      unpaidAmount,
      equityPercent: totalCommitted > 0 ? Number(((committedAmount / totalCommitted) * 100).toFixed(2)) : 0,
      commitments: partner.commitments
        .slice()
        .sort((left, right) => right.commitmentDate.getTime() - left.commitmentDate.getTime())
        .map((commitment) => {
          const commitmentAmount = parseDecimal(commitment.amount);
          const commitmentPaid = commitment.payments.reduce((sum, payment) => sum + parseDecimal(payment.amount), 0);
          return {
            id: commitment.id,
            partnerId: commitment.partnerId,
            amount: roundMoney(commitmentAmount),
            paidAmount: roundMoney(commitmentPaid),
            unpaidAmount: roundMoney(Math.max(0, commitmentAmount - commitmentPaid)),
            commitmentDate: commitment.commitmentDate.toISOString(),
            note: commitment.note,
            createdByName: commitment.createdBy?.name ?? null,
            createdAt: commitment.createdAt.toISOString(),
            payments: commitment.payments
              .slice()
              .sort((left, right) => right.paymentDate.getTime() - left.paymentDate.getTime())
              .map((payment) => ({
                id: payment.id,
                commitmentId: payment.commitmentId,
                branchId: payment.branchId,
                branchName: payment.branch.name,
                amount: parseDecimal(payment.amount),
                receivedSource: payment.receivedSource,
                paymentDate: payment.paymentDate.toISOString(),
                note: payment.note,
                createdByName: payment.createdBy?.name ?? null,
                createdAt: payment.createdAt.toISOString()
              }))
          };
        })
    }))
  };
}

async function getInvestmentPaymentCapacity(commitmentId: string, excludingPaymentId?: string) {
  const commitment = await prisma.investmentCommitment.findUnique({
    where: { id: commitmentId },
    include: { payments: true }
  });
  if (!commitment) {
    throw Object.assign(new Error("Investment commitment not found."), { statusCode: 404 });
  }
  const paidAmount = commitment.payments
    .filter((payment) => payment.id !== excludingPaymentId)
    .reduce((sum, payment) => sum + parseDecimal(payment.amount), 0);
  return roundMoney(parseDecimal(commitment.amount) - paidAmount);
}

router.get("/loans", async (req, res, next) => {
  try {
    const query = loanQuerySchema.parse(req.query);
    const branchContext = await resolveBranchContext(req);
    const range = buildDashboardRange(query);
    const where: Prisma.LoanWhereInput = {
      branchId: branchContext.branchId,
      ...(query.search
        ? {
            lenderName: {
              contains: query.search,
              mode: "insensitive"
            }
          }
        : {})
    };
    const periodLoanWhere: Prisma.LoanWhereInput = {
      branchId: branchContext.branchId,
      loanDate: { gte: range.start, lte: range.end },
      ...(query.search
        ? {
            lenderName: {
              contains: query.search,
              mode: "insensitive"
            }
          }
        : {})
    };
    const periodRepaymentWhere: Prisma.LoanRepaymentWhereInput = {
      branchId: branchContext.branchId,
      paymentDate: { gte: range.start, lte: range.end },
      ...(query.search
        ? {
            loan: {
              lenderName: {
                contains: query.search,
                mode: "insensitive"
              }
            }
          }
        : {})
    };
    const [loans, periodLoans, periodRepayments] = await Promise.all([
      prisma.loan.findMany({
        where,
        include: {
          branch: true,
          createdBy: true,
          repayments: { include: { createdBy: true } }
        },
        orderBy: [{ loanDate: "desc" }, { createdAt: "desc" }]
      }),
      prisma.loan.findMany({
        where: periodLoanWhere,
        select: { amount: true }
      }),
      prisma.loanRepayment.findMany({
        where: periodRepaymentWhere,
        select: { amount: true }
      })
    ]);

    const serializedLoans = loans.map(serializeLoan).filter((loan) => {
      if (query.status === "open") return loan.outstandingAmount > 0;
      if (query.status === "paid") return loan.outstandingAmount <= 0;
      return true;
    });
    const totalLoanTaken = serializedLoans.reduce((sum, loan) => sum + loan.amount, 0);
    const totalLoanRepaid = serializedLoans.reduce((sum, loan) => sum + loan.repaidAmount, 0);
    const outstandingLoanBalance = serializedLoans.reduce((sum, loan) => sum + loan.outstandingAmount, 0);
    const periodLoanTaken = periodLoans.reduce((sum, loan) => sum + parseDecimal(loan.amount), 0);
    const periodLoanRepaid = periodRepayments.reduce((sum, repayment) => sum + parseDecimal(repayment.amount), 0);

    return res.json({
      range: {
        preset: range.preset,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        label: range.label
      },
      branches: branchContext.branches.map((branch) => ({
        id: branch.id,
        slug: branch.slug,
        name: branch.name,
        city: branch.city,
        addressLine1: branch.addressLine1,
        phone: branch.phone,
        deliveryFee: parseDecimal(branch.deliveryFee)
      })),
      sources: MONEY_SOURCES,
      summary: {
        totalLoanTaken: roundMoney(totalLoanTaken),
        totalLoanRepaid: roundMoney(totalLoanRepaid),
        outstandingLoanBalance: roundMoney(outstandingLoanBalance),
        openLoanCount: serializedLoans.filter((loan) => loan.outstandingAmount > 0).length,
        paidLoanCount: serializedLoans.filter((loan) => loan.outstandingAmount <= 0).length
      },
      periodSummary: {
        totalLoanTaken: roundMoney(periodLoanTaken),
        totalLoanRepaid: roundMoney(periodLoanRepaid)
      },
      loans: serializedLoans
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/loans", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const parsedPayload = loanSchema.parse(req.body);
    const payload = { ...parsedPayload, branchId: branchContext.branchId };
    const loan = await prisma.loan.create({
      data: {
        branchId: payload.branchId,
        lenderName: payload.lenderName.trim(),
        amount: payload.amount,
        receivedSource: payload.receivedSource,
        loanDate: new Date(payload.loanDate),
        note: payload.note?.trim() || undefined,
        createdById: req.user!.id
      },
      include: {
        branch: true,
        createdBy: true,
        repayments: { include: { createdBy: true } }
      }
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "loan.create",
      entityType: "loan",
      entityId: loan.id,
      payload
    });

    return res.status(201).json({ loan: serializeLoan(loan) });
  } catch (error) {
    return next(error);
  }
});

router.patch("/loans/:id", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const payload = loanSchema.partial().parse(req.body);
    const existing = await prisma.loan.findUnique({
      where: { id: req.params.id },
      include: { repayments: true }
    });
    if (!existing) {
      return res.status(404).json({ message: "Loan not found." });
    }
    if (existing.branchId !== branchContext.branchId) {
      return res.status(403).json({ message: "This loan belongs to another branch." });
    }
    const repaidAmount = existing.repayments.reduce((sum, repayment) => sum + parseDecimal(repayment.amount), 0);
    if (typeof payload.amount === "number" && payload.amount < repaidAmount) {
      return res.status(400).json({ message: "Loan amount cannot be less than payments already recorded." });
    }

    const loan = await prisma.loan.update({
      where: { id: req.params.id },
      data: {
        ...(payload.branchId ? { branchId: payload.branchId } : {}),
        ...(payload.lenderName ? { lenderName: payload.lenderName.trim() } : {}),
        ...(typeof payload.amount === "number" ? { amount: payload.amount } : {}),
        ...(payload.receivedSource ? { receivedSource: payload.receivedSource } : {}),
        ...(payload.loanDate ? { loanDate: new Date(payload.loanDate) } : {}),
        ...(payload.note !== undefined ? { note: payload.note.trim() || null } : {})
      },
      include: {
        branch: true,
        createdBy: true,
        repayments: { include: { createdBy: true } }
      }
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "loan.update",
      entityType: "loan",
      entityId: loan.id,
      payload
    });

    return res.json({ loan: serializeLoan(loan) });
  } catch (error) {
    return next(error);
  }
});

router.delete("/loans/:id", async (req, res, next) => {
  try {
    await prisma.loan.delete({ where: { id: req.params.id } });
    await writeAuditLog({
      actorId: req.user!.id,
      action: "loan.delete",
      entityType: "loan",
      entityId: req.params.id,
      payload: { mode: "deleted" }
    });
    return res.json({ deleted: true });
  } catch (error) {
    try {
      rethrowDeleteError(error, "Loan");
    } catch (nextError) {
      return next(nextError);
    }
  }
});

router.post("/loans/:id/repayments", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const payload = loanRepaymentSchema.parse(req.body);
    const loan = await prisma.loan.findUnique({
      where: { id: req.params.id },
      include: { repayments: true }
    });
    if (!loan) {
      return res.status(404).json({ message: "Loan not found." });
    }
    if (loan.branchId !== branchContext.branchId) {
      return res.status(403).json({ message: "This loan belongs to another branch." });
    }
    const repaidAmount = loan.repayments.reduce((sum, repayment) => sum + parseDecimal(repayment.amount), 0);
    const remainingAmount = roundMoney(parseDecimal(loan.amount) - repaidAmount);
    if (payload.amount > remainingAmount) {
      return res.status(400).json({ message: `Payment cannot exceed remaining loan balance of Rs ${remainingAmount}.` });
    }

    const repayment = await prisma.loanRepayment.create({
      data: {
        loanId: loan.id,
        branchId: loan.branchId,
        amount: payload.amount,
        paidFrom: payload.paidFrom,
        paymentDate: new Date(payload.paymentDate),
        note: payload.note?.trim() || undefined,
        createdById: req.user!.id
      }
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "loan.repayment_create",
      entityType: "loan_repayment",
      entityId: repayment.id,
      payload
    });

    return res.status(201).json({ repayment });
  } catch (error) {
    return next(error);
  }
});

router.delete("/loans/:id/repayments/:repaymentId", async (req, res, next) => {
  try {
    const repayment = await prisma.loanRepayment.findFirst({
      where: {
        id: req.params.repaymentId,
        loanId: req.params.id
      }
    });
    if (!repayment) {
      return res.status(404).json({ message: "Loan payment not found." });
    }
    await prisma.loanRepayment.delete({ where: { id: repayment.id } });
    await writeAuditLog({
      actorId: req.user!.id,
      action: "loan.repayment_delete",
      entityType: "loan_repayment",
      entityId: repayment.id,
      payload: { loanId: req.params.id, mode: "deleted" }
    });
    return res.json({ deleted: true });
  } catch (error) {
    try {
      rethrowDeleteError(error, "Loan payment");
    } catch (nextError) {
      return next(nextError);
    }
  }
});

router.get("/investments", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const partners = await prisma.investmentPartner.findMany({
      include: {
        createdBy: true,
        commitments: {
          include: {
            createdBy: true,
            payments: {
              include: {
                branch: true,
                createdBy: true
              }
            }
          }
        }
      },
      orderBy: [{ createdAt: "asc" }, { name: "asc" }]
    });
    const investmentData = serializeInvestmentData(partners);
    return res.json({
      ...investmentData,
      branches: branchContext.branches.map((branch) => ({
        id: branch.id,
        slug: branch.slug,
        name: branch.name,
        city: branch.city,
        addressLine1: branch.addressLine1,
        phone: branch.phone,
        deliveryFee: parseDecimal(branch.deliveryFee)
      })),
      sources: MONEY_SOURCES
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/investments/partners", async (req, res, next) => {
  try {
    const payload = investmentPartnerSchema.parse(req.body);
    const partner = await prisma.investmentPartner.create({
      data: {
        name: payload.name.trim(),
        note: payload.note?.trim() || undefined,
        createdById: req.user!.id
      }
    });
    await writeAuditLog({ actorId: req.user!.id, action: "investment.partner_create", entityType: "investment_partner", entityId: partner.id, payload });
    return res.status(201).json({ partner });
  } catch (error) {
    return next(error);
  }
});

router.patch("/investments/partners/:id", async (req, res, next) => {
  try {
    const payload = investmentPartnerSchema.partial().parse(req.body);
    const partner = await prisma.investmentPartner.update({
      where: { id: req.params.id },
      data: {
        ...(payload.name ? { name: payload.name.trim() } : {}),
        ...(payload.note !== undefined ? { note: payload.note.trim() || null } : {})
      }
    });
    await writeAuditLog({ actorId: req.user!.id, action: "investment.partner_update", entityType: "investment_partner", entityId: partner.id, payload });
    return res.json({ partner });
  } catch (error) {
    return next(error);
  }
});

router.delete("/investments/partners/:id", async (req, res, next) => {
  try {
    await prisma.investmentPartner.delete({ where: { id: req.params.id } });
    await writeAuditLog({ actorId: req.user!.id, action: "investment.partner_delete", entityType: "investment_partner", entityId: req.params.id, payload: { mode: "deleted" } });
    return res.json({ deleted: true });
  } catch (error) {
    try {
      rethrowDeleteError(error, "Investment partner");
    } catch (nextError) {
      return next(nextError);
    }
  }
});

router.post("/investments/commitments", async (req, res, next) => {
  try {
    const payload = investmentCommitmentSchema.parse(req.body);
    const commitment = await prisma.investmentCommitment.create({
      data: {
        partnerId: payload.partnerId,
        amount: payload.amount,
        commitmentDate: new Date(payload.commitmentDate),
        note: payload.note?.trim() || undefined,
        createdById: req.user!.id
      }
    });
    await writeAuditLog({ actorId: req.user!.id, action: "investment.commitment_create", entityType: "investment_commitment", entityId: commitment.id, payload });
    return res.status(201).json({ commitment });
  } catch (error) {
    return next(error);
  }
});

router.patch("/investments/commitments/:id", async (req, res, next) => {
  try {
    const payload = investmentCommitmentSchema.partial().parse(req.body);
    if (typeof payload.amount === "number") {
      const existing = await prisma.investmentCommitment.findUnique({
        where: { id: req.params.id },
        include: { payments: true }
      });
      if (!existing) {
        return res.status(404).json({ message: "Investment commitment not found." });
      }
      const paidAmount = existing.payments.reduce((sum, payment) => sum + parseDecimal(payment.amount), 0);
      if (payload.amount < paidAmount) {
        return res.status(400).json({ message: "Commitment amount cannot be less than payments already recorded." });
      }
    }
    const commitment = await prisma.investmentCommitment.update({
      where: { id: req.params.id },
      data: {
        ...(payload.partnerId ? { partnerId: payload.partnerId } : {}),
        ...(typeof payload.amount === "number" ? { amount: payload.amount } : {}),
        ...(payload.commitmentDate ? { commitmentDate: new Date(payload.commitmentDate) } : {}),
        ...(payload.note !== undefined ? { note: payload.note.trim() || null } : {})
      }
    });
    await writeAuditLog({ actorId: req.user!.id, action: "investment.commitment_update", entityType: "investment_commitment", entityId: commitment.id, payload });
    return res.json({ commitment });
  } catch (error) {
    return next(error);
  }
});

router.delete("/investments/commitments/:id", async (req, res, next) => {
  try {
    await prisma.investmentCommitment.delete({ where: { id: req.params.id } });
    await writeAuditLog({ actorId: req.user!.id, action: "investment.commitment_delete", entityType: "investment_commitment", entityId: req.params.id, payload: { mode: "deleted" } });
    return res.json({ deleted: true });
  } catch (error) {
    try {
      rethrowDeleteError(error, "Investment commitment");
    } catch (nextError) {
      return next(nextError);
    }
  }
});

router.post("/investments/payments", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const parsedPayload = investmentPaymentSchema.parse(req.body);
    const payload = { ...parsedPayload, branchId: branchContext.branchId };
    const unpaidAmount = await getInvestmentPaymentCapacity(payload.commitmentId);
    if (payload.amount > unpaidAmount) {
      return res.status(400).json({ message: `Payment cannot exceed unpaid commitment balance of Rs ${unpaidAmount}.` });
    }
    const payment = await prisma.investmentPayment.create({
      data: {
        commitmentId: payload.commitmentId,
        branchId: payload.branchId,
        amount: payload.amount,
        receivedSource: payload.receivedSource,
        paymentDate: new Date(payload.paymentDate),
        note: payload.note?.trim() || undefined,
        createdById: req.user!.id
      }
    });
    await writeAuditLog({ actorId: req.user!.id, action: "investment.payment_create", entityType: "investment_payment", entityId: payment.id, payload });
    return res.status(201).json({ payment });
  } catch (error) {
    return next(error);
  }
});

router.patch("/investments/payments/:id", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const payload = investmentPaymentSchema.partial().parse(req.body);
    const existing = await prisma.investmentPayment.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ message: "Investment payment not found." });
    }
    if (existing.branchId !== branchContext.branchId) {
      return res.status(403).json({ message: "This investment payment belongs to another branch." });
    }
    const commitmentId = payload.commitmentId ?? existing.commitmentId;
    const amount = typeof payload.amount === "number" ? payload.amount : parseDecimal(existing.amount);
    const unpaidAmount = await getInvestmentPaymentCapacity(commitmentId, existing.id);
    if (amount > unpaidAmount) {
      return res.status(400).json({ message: `Payment cannot exceed unpaid commitment balance of Rs ${unpaidAmount}.` });
    }
    const payment = await prisma.investmentPayment.update({
      where: { id: existing.id },
      data: {
        ...(payload.commitmentId ? { commitmentId: payload.commitmentId } : {}),
        branchId: branchContext.branchId,
        ...(typeof payload.amount === "number" ? { amount: payload.amount } : {}),
        ...(payload.receivedSource ? { receivedSource: payload.receivedSource } : {}),
        ...(payload.paymentDate ? { paymentDate: new Date(payload.paymentDate) } : {}),
        ...(payload.note !== undefined ? { note: payload.note.trim() || null } : {})
      }
    });
    await writeAuditLog({ actorId: req.user!.id, action: "investment.payment_update", entityType: "investment_payment", entityId: payment.id, payload });
    return res.json({ payment });
  } catch (error) {
    return next(error);
  }
});

router.delete("/investments/payments/:id", async (req, res, next) => {
  try {
    await prisma.investmentPayment.delete({ where: { id: req.params.id } });
    await writeAuditLog({ actorId: req.user!.id, action: "investment.payment_delete", entityType: "investment_payment", entityId: req.params.id, payload: { mode: "deleted" } });
    return res.json({ deleted: true });
  } catch (error) {
    try {
      rethrowDeleteError(error, "Investment payment");
    } catch (nextError) {
      return next(nextError);
    }
  }
});

router.get("/inventory/recipes", async (_req, res, next) => {
  try {
    const [ingredients, preparedItems, products] = await Promise.all([
      prisma.ingredient.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
      prisma.ingredient.findMany({
        where: { type: "PREPARED", isActive: true },
        include: {
          preparedComponents: {
            where: { componentIngredient: { isActive: true } },
            include: { componentIngredient: true },
            orderBy: { componentIngredient: { name: "asc" } }
          }
        },
        orderBy: { name: "asc" }
      }),
      prisma.product.findMany({
        include: {
          category: true,
          branchPricing: true,
          productIngredients: {
            where: { ingredient: { isActive: true } },
            include: { ingredient: { include: ingredientCostInclude } },
            orderBy: { ingredient: { name: "asc" } }
          },
          packagingRules: {
            where: { packagingIngredient: { isActive: true } },
            include: { packagingIngredient: true },
            orderBy: [{ serviceType: "asc" }, { packagingIngredient: { name: "asc" } }]
          }
        },
        orderBy: { name: "asc" }
      })
    ]);

    return res.json({
      ingredients: ingredients.map((ingredient) => ({
        id: ingredient.id,
        name: ingredient.name,
        sku: ingredient.sku,
        unit: ingredient.unit,
        type: ingredient.type,
        costPerUnit: parseDecimal(ingredient.costPerUnit),
        caloriesPerUnit: parseDecimal(ingredient.caloriesPerUnit)
      })),
      preparedItems: preparedItems.map((ingredient) => {
        const components = ingredient.preparedComponents.map((component) => ({
          ingredientId: component.componentIngredientId,
          ingredientName: component.componentIngredient.name,
          unit: component.componentIngredient.unit,
          quantityNeeded: parseDecimal(component.quantityNeeded),
          cost: roundMoney(parseDecimal(component.quantityNeeded) * parseDecimal(component.componentIngredient.costPerUnit)),
          calories: Math.round(parseDecimal(component.quantityNeeded) * parseDecimal(component.componentIngredient.caloriesPerUnit))
        }));
        return {
          id: ingredient.id,
          name: ingredient.name,
          unit: ingredient.unit,
          costPerUnit: parseDecimal(ingredient.costPerUnit),
          caloriesPerUnit: parseDecimal(ingredient.caloriesPerUnit),
          totalCost: roundMoney(components.reduce((sum, component) => sum + component.cost, 0)),
          totalCalories: components.reduce((sum, component) => sum + component.calories, 0),
          components
        };
      }),
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        categoryName: product.category.name,
        basePrice: parseDecimal(product.basePrice),
        calories: product.calories,
        costSummary: buildProductCostSummary(product)
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/inventory/recipes/products/:id/packaging", async (req, res, next) => {
  try {
    const payload = packagingRulesUpdateSchema.parse(req.body);
    const ingredientIds = [...new Set(payload.rules.map((rule) => rule.ingredientId))];
    if (ingredientIds.length) {
      const activeCount = await prisma.ingredient.count({
        where: { id: { in: ingredientIds }, type: "PACKAGING", isActive: true }
      });
      if (activeCount !== ingredientIds.length) {
        return next(adminActionError({
          message: "Packaging recipe contains a disabled or deleted item.",
          statusCode: 400,
          code: "PACKAGING_ITEM_UNAVAILABLE",
          details: "Only active packaging items can be selected for new or edited packaging rules.",
          entity: "product",
          action: "recipe_packaging_update"
        }));
      }
    }
    await prisma.$transaction(async (transaction) => {
      for (const rule of payload.rules) {
        const existing = await transaction.packagingRule.findFirst({
          where: {
            productId: req.params.id,
            categoryId: null,
            serviceType: rule.serviceType,
            packagingIngredientId: rule.ingredientId
          },
          select: { id: true }
        });
        const data = {
          productId: req.params.id,
          categoryId: null,
          serviceType: rule.serviceType,
          packagingIngredientId: rule.ingredientId,
          quantityMode: "FIXED",
          quantity: rule.quantityNeeded,
          itemStep: null
        };
        if (existing) {
          await transaction.packagingRule.update({ where: { id: existing.id }, data });
        } else {
          await transaction.packagingRule.create({ data });
        }
      }
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "inventory.recipe_packaging_update",
      entityType: "product",
      entityId: req.params.id,
      payload
    });

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.patch("/inventory/recipes/products/:id", async (req, res, next) => {
  try {
    const payload = recipeUpdateSchema.parse(req.body);
    const ingredientIds = [...new Set(payload.components.map((component) => component.ingredientId))];
    if (ingredientIds.length) {
      const activeCount = await prisma.ingredient.count({
        where: { id: { in: ingredientIds }, isActive: true }
      });
      if (activeCount !== ingredientIds.length) {
        return next(adminActionError({
          message: "Recipe contains a disabled or deleted item.",
          statusCode: 400,
          code: "RECIPE_ITEM_UNAVAILABLE",
          details: "Only active ingredients and prep items can be selected for new or edited recipes.",
          entity: "product",
          action: "recipe_update"
        }));
      }
    }
    await prisma.$transaction(async (transaction) => {
      for (const component of payload.components) {
        await transaction.productIngredient.upsert({
          where: {
            productId_ingredientId: {
              productId: req.params.id,
              ingredientId: component.ingredientId
            }
          },
          update: {
            quantityNeeded: component.quantityNeeded
          },
          create: {
            productId: req.params.id,
            ingredientId: component.ingredientId,
            quantityNeeded: component.quantityNeeded
          }
        });
      }
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "inventory.recipe_product_update",
      entityType: "product",
      entityId: req.params.id,
      payload
    });

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.patch("/inventory/recipes/prepared/:id", async (req, res, next) => {
  try {
    const payload = recipeUpdateSchema.parse(req.body);
    const ingredientIds = [...new Set(payload.components.map((component) => component.ingredientId))];
    if (ingredientIds.length) {
      const activeCount = await prisma.ingredient.count({
        where: { id: { in: ingredientIds }, isActive: true }
      });
      if (activeCount !== ingredientIds.length) {
        return next(adminActionError({
          message: "Prep recipe contains a disabled or deleted item.",
          statusCode: 400,
          code: "RECIPE_ITEM_UNAVAILABLE",
          details: "Only active ingredients and prep items can be selected for new or edited prep recipes.",
          entity: "ingredient",
          action: "recipe_update"
        }));
      }
    }
    await prisma.$transaction(async (transaction) => {
      for (const component of payload.components) {
        await transaction.ingredientComponent.upsert({
          where: {
            parentIngredientId_componentIngredientId: {
              parentIngredientId: req.params.id,
              componentIngredientId: component.ingredientId
            }
          },
          update: {
            quantityNeeded: component.quantityNeeded
          },
          create: {
            parentIngredientId: req.params.id,
            componentIngredientId: component.ingredientId,
            quantityNeeded: component.quantityNeeded
          }
        });
      }
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "inventory.recipe_prepared_update",
      entityType: "ingredient",
      entityId: req.params.id,
      payload
    });

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.get("/inventory/forecast", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);

    const now = new Date();
    const start30 = startOfDay(addDays(now, -29));
    const [orders, productIngredients, packagingRules, products, inventories, wastageTransactions] = await Promise.all([
      prisma.order.findMany({
        where: {
          branchId: branchContext.branchId,
          status: { not: OrderStatus.CANCELLED },
          placedAt: { gte: start30, lte: now }
        },
        include: {
          items: {
            include: { bundleComponents: true }
          }
        }
      }),
      prisma.productIngredient.findMany({
        where: { ingredient: { isActive: true } },
        include: { ingredient: { include: ingredientCostInclude } }
      }),
      prisma.packagingRule.findMany({
        where: { packagingIngredient: { isActive: true } },
        include: { packagingIngredient: true }
      }),
      prisma.product.findMany({ select: { id: true, categoryId: true } }),
      prisma.branchInventory.findMany({
        where: { branchId: branchContext.branchId, ingredient: { isActive: true } },
        include: { ingredient: true }
      }),
      prisma.inventoryTransaction.findMany({
        where: {
          type: InventoryTransactionType.WASTAGE,
          createdAt: { gte: start30, lte: now },
          branchInventory: { branchId: branchContext.branchId }
        },
        include: { branchInventory: true }
      })
    ]);

    const recipeByProduct = new Map<string, typeof productIngredients>();
    for (const entry of productIngredients) {
      const existing = recipeByProduct.get(entry.productId) ?? [];
      existing.push(entry);
      recipeByProduct.set(entry.productId, existing);
    }

    const productCategoryById = new Map(products.map((product) => [product.id, product.categoryId]));

    const usage30ByIngredient = new Map<string, number>();

    function addForecastUsage(ingredient: any, quantity: number, seen = new Set<string>()) {
      if (!ingredient) return;
      if (ingredient.isActive === false) return;
      if (ingredient.type === "PREPARED" && ingredient.preparedComponents?.length && !seen.has(ingredient.id)) {
        const nextSeen = new Set(seen);
        nextSeen.add(ingredient.id);
        for (const component of ingredient.preparedComponents) {
          addForecastUsage(component.componentIngredient, quantity * parseDecimal(component.quantityNeeded), nextSeen);
        }
        return;
      }
      usage30ByIngredient.set(ingredient.id, roundQuantity((usage30ByIngredient.get(ingredient.id) ?? 0) + quantity));
    }

    function addForecastRuleUsage(rule: typeof packagingRules[number], itemCount: number) {
      if (itemCount <= 0) return;
      const quantity = parseDecimal(rule.quantity);
      const needed = rule.quantityMode === "PER_ITEM_STEP"
        ? quantity * Math.ceil(itemCount / Math.max(1, rule.itemStep ?? 1))
        : quantity * itemCount;
      addForecastUsage(rule.packagingIngredient, needed);
    }

    function addForecastPackagingUsage(productQuantities: Map<string, number>, categoryQuantities: Map<string, number>, orderQuantity: number, serviceType: ServiceType) {
      const matchingRules = packagingRules.filter((rule) => rule.serviceType === serviceType || rule.serviceType === DEFAULT_PACKAGING_SERVICE);
      for (const rule of matchingRules) {
        const hasSpecificForScope = packagingRules.some((candidate) =>
          candidate.serviceType === serviceType &&
          candidate.productId === rule.productId &&
          candidate.categoryId === rule.categoryId &&
          candidate.packagingIngredientId === rule.packagingIngredientId
        );
        if (rule.serviceType === DEFAULT_PACKAGING_SERVICE && hasSpecificForScope) continue;
        if (rule.productId) addForecastRuleUsage(rule, productQuantities.get(rule.productId) ?? 0);
        else if (rule.categoryId) addForecastRuleUsage(rule, categoryQuantities.get(rule.categoryId) ?? 0);
        else addForecastRuleUsage(rule, orderQuantity);
      }
    }

    function addForecastProductUsage(productId: string, quantity: number) {
      for (const recipe of recipeByProduct.get(productId) ?? []) {
        if (recipe.ingredient.type !== "PACKAGING") {
          addForecastUsage(recipe.ingredient, parseDecimal(recipe.quantityNeeded) * quantity);
        }
      }
    }

    for (const order of orders) {
      const productQuantities = new Map<string, number>();
      const categoryQuantities = new Map<string, number>();
      let orderQuantity = 0;
      function trackPackagingInput(productId: string, quantity: number) {
        productQuantities.set(productId, (productQuantities.get(productId) ?? 0) + quantity);
        const categoryId = productCategoryById.get(productId);
        if (categoryId) categoryQuantities.set(categoryId, (categoryQuantities.get(categoryId) ?? 0) + quantity);
        orderQuantity += quantity;
      }
      for (const item of order.items) {
        if (item.productId) {
          addForecastProductUsage(item.productId, item.quantity);
          trackPackagingInput(item.productId, item.quantity);
        }
        for (const component of item.bundleComponents) {
          if (!component.productId) continue;
          addForecastProductUsage(component.productId, component.quantity);
          trackPackagingInput(component.productId, component.quantity);
        }
      }
      addForecastPackagingUsage(productQuantities, categoryQuantities, orderQuantity, order.serviceType);
    }

    const wastage30ByIngredient = new Map<string, number>();
    for (const entry of wastageTransactions) {
      const ingredientId = entry.branchInventory.ingredientId;
      wastage30ByIngredient.set(ingredientId, (wastage30ByIngredient.get(ingredientId) ?? 0) + Math.abs(parseDecimal(entry.quantity)));
    }

    const buildHorizon = (label: string, days: number) => {
      const items = inventories
        .map((inventory) => {
          const usage30 = usage30ByIngredient.get(inventory.ingredientId) ?? 0;
          const wastage30 = wastage30ByIngredient.get(inventory.ingredientId) ?? 0;
          const expectedUsage = (usage30 / 30) * days;
          const expectedWastage = (wastage30 / 30) * days;
          const buffer = expectedUsage * 0.15;
          const currentStock = parseDecimal(inventory.quantityOnHand);
          const suggestedBuy = Math.max(0, expectedUsage + expectedWastage + buffer - currentStock);
          return {
            ingredientId: inventory.ingredientId,
            name: inventory.ingredient.name,
            unit: inventory.ingredient.unit,
            currentStock: roundQuantity(currentStock),
            expectedUsage: roundQuantity(expectedUsage),
            suggestedBuy: roundQuantity(suggestedBuy),
            estimatedCost: roundMoney(suggestedBuy * parseDecimal(inventory.ingredient.costPerUnit)),
            confidence: orders.length >= 30 ? "normal" : orders.length >= 10 ? "low" : "low"
          };
        })
        .filter((item) => item.expectedUsage > 0 || item.suggestedBuy > 0)
        .sort((left, right) => right.suggestedBuy - left.suggestedBuy);

      return {
        label,
        days,
        suggestedPurchaseCost: roundMoney(items.reduce((sum, item) => sum + item.estimatedCost, 0)),
        items
      };
    };

    return res.json({
      branchId: branchContext.branchId,
      generatedAt: now.toISOString(),
      horizons: [buildHorizon("Tomorrow", 1), buildHorizon("Next 7 days", 7), buildHorizon("Next 30 days", 30)]
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/inventory/transactions/:id", async (req, res, next) => {
  try {
    const payload = transactionUpdateSchema.parse(req.body);
    const current = await prisma.inventoryTransaction.findUnique({
      where: { id: req.params.id }
    });

    if (!current) {
      return res.status(404).json({ message: "Stock log not found." });
    }

    const history = Array.isArray(current.editHistory) ? current.editHistory : [];
    await prisma.inventoryTransaction.update({
      where: { id: current.id },
      data: {
        ...(typeof payload.quantity === "number" ? { quantity: payload.quantity } : {}),
        ...(typeof payload.note === "string" ? { note: payload.note.trim() || null } : {}),
        ...(typeof payload.vendorName === "string" ? { vendorName: payload.vendorName.trim() || null } : {}),
        ...(payload.purchaseDate !== undefined ? { purchaseDate: payload.purchaseDate ? new Date(payload.purchaseDate) : null } : {}),
        ...(payload.purchaseCost !== undefined ? { purchaseCost: payload.purchaseCost } : {}),
        ...(payload.wastageReason !== undefined ? { wastageReason: payload.wastageReason } : {}),
        editedAt: new Date(),
        editedById: req.user!.id,
        editHistory: [
          ...history,
          {
            editedAt: new Date().toISOString(),
            editedById: req.user!.id,
            previous: {
              quantity: parseDecimal(current.quantity),
              note: current.note,
              vendorName: current.vendorName,
              purchaseDate: current.purchaseDate?.toISOString() ?? null,
              purchaseCost: parseDecimal(current.purchaseCost),
              wastageReason: current.wastageReason
            },
            next: payload
          }
        ]
      }
    });

    await recalculateInventoryBalances(current.branchInventoryId);

    await writeAuditLog({
      actorId: req.user!.id,
      action: "inventory.transaction_update",
      entityType: "inventory_transaction",
      entityId: current.id,
      payload
    });

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.get("/orders", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const query = z
      .object({
        status: z.nativeEnum(OrderStatus).optional(),
        search: z.string().optional(),
        preset: z.enum(["today", "7d", "30d", "month", "year", "custom"]).default("today"),
        start: z.string().datetime().optional(),
        end: z.string().datetime().optional(),
        segment: z.enum(["all", "inshop", "foodpanda", "delivery"]).default("all")
      })
      .superRefine((value, context) => {
        if (value.preset === "custom" && (!value.start || !value.end)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Custom range requires start and end dates.",
            path: ["start"]
          });
        }
      })
      .parse(req.query);

    const reportRange = buildDashboardRange({
      ...query,
      // Delivery is an operations-only segment; it uses the same date presets as dashboard segments.
      segment: query.segment === "delivery" ? "all" : query.segment
    });
    const rangeStart = reportRange.start;
    const rangeEnd = reportRange.end;

    const orders = await prisma.order.findMany({
      where: {
        branchId: branchContext.branchId,
        placedAt: {
          gte: rangeStart,
          lte: rangeEnd
        },
        ...(query.status ? { status: query.status } : {}),
        ...buildAdminSegmentWhere(query.segment),
        ...(query.search
          ? {
              OR: [
                { orderNumber: { contains: query.search, mode: "insensitive" } },
                { customer: { is: { name: { contains: query.search, mode: "insensitive" } } } },
                { customerName: { contains: query.search, mode: "insensitive" } }
              ]
            }
          : {})
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        branch: true,
        cashier: { select: { username: true, name: true } },
        acceptedBy: { select: { username: true, name: true } },
        dispatchedBy: { select: { username: true, name: true } },
        address: true,
        items: {
          include: {
            addOns: true,
            bundleComponents: true
          }
        }
      },
      orderBy: { placedAt: "desc" }
    });

    return res.json({ orders: orders.map(serializeOrderForOperations) });
  } catch (error) {
    return next(error);
  }
});

router.delete("/orders", authorize(RoleCode.SUPER_ADMIN), async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const deletedCount = await prisma.order.count({ where: { branchId: branchContext.branchId } });
    await prisma.$transaction(async (transaction) => {
      await transaction.inventoryTransaction.deleteMany({
        where: { referenceType: "ORDER", branchInventory: { branchId: branchContext.branchId } }
      });
      await transaction.order.deleteMany({ where: { branchId: branchContext.branchId } });
    }, INVENTORY_TRANSACTION_OPTIONS);

    await writeAuditLog({
      actorId: req.user!.id,
      action: "order.bulk_delete",
      entityType: "order",
      entityId: "bulk",
      payload: { deletedCount, branchId: branchContext.branchId }
    });

    return res.json({ deletedCount });
  } catch (error) {
    return next(error);
  }
});

router.delete("/orders/:id", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const order = await prisma.$transaction(async (transaction) => {
      const currentOrder = await transaction.order.findUnique({
        where: { id: req.params.id },
        include: {
          items: {
            include: {
              addOns: true,
              bundleComponents: true
            }
          }
        }
      });

      if (!currentOrder) {
        throw new Error("Order not found.");
      }
      if (currentOrder.branchId !== branchContext.branchId) {
        throw Object.assign(new Error("This order belongs to another branch."), { statusCode: 403 });
      }

      if (currentOrder.status !== OrderStatus.CANCELLED) {
        await applyOrderInventory({
          transaction,
          branchId: currentOrder.branchId,
          orderId: currentOrder.id,
          actorId: req.user!.id,
          items: currentOrder.items,
          mode: "return",
          serviceType: currentOrder.serviceType
        });
      }

      await transaction.order.delete({
        where: { id: currentOrder.id }
      });

      return currentOrder;
    }, INVENTORY_TRANSACTION_OPTIONS);

    await writeAuditLog({
      actorId: req.user!.id,
      action: "order.delete",
      entityType: "order",
      entityId: order.id,
      payload: {
        orderNumber: order.orderNumber
      }
    });

    return res.json({ deleted: true });
  } catch (error) {
    return next(error);
  }
});

router.patch("/orders/:id/status", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const payload = z.object({ status: z.nativeEnum(OrderStatus) }).parse(req.body);
    const order = await prisma.$transaction(async (transaction) => {
      const currentOrder = await transaction.order.findUnique({
        where: { id: req.params.id },
        include: {
          items: {
            include: {
              addOns: true,
              bundleComponents: true
            }
          }
        }
      });

      if (!currentOrder) {
        throw Object.assign(new Error("Order not found."), { statusCode: 404 });
      }
      if (currentOrder.branchId !== branchContext.branchId) {
        throw Object.assign(new Error("This order belongs to another branch."), { statusCode: 403 });
      }

      if (isTerminalStatus(currentOrder.status) && currentOrder.status !== payload.status) {
        throw Object.assign(new Error("Terminal order statuses cannot be changed."), { statusCode: 409 });
      }

      if (currentOrder.status !== payload.status) {
        if (currentOrder.status !== OrderStatus.CANCELLED && payload.status === OrderStatus.CANCELLED) {
          await applyOrderInventory({
            transaction,
            branchId: currentOrder.branchId,
            orderId: currentOrder.id,
            actorId: req.user!.id,
            items: currentOrder.items,
            mode: "return",
            serviceType: currentOrder.serviceType
          });
        }

        if (currentOrder.status === OrderStatus.CANCELLED && payload.status !== OrderStatus.CANCELLED) {
          await applyOrderInventory({
            transaction,
            branchId: currentOrder.branchId,
            orderId: currentOrder.id,
            actorId: req.user!.id,
            items: currentOrder.items,
            mode: "consume",
            serviceType: currentOrder.serviceType
          });
        }
      }

      return transaction.order.update({
        where: { id: req.params.id },
        data: {
          status: payload.status,
          ...(currentOrder.serviceType === ServiceType.DELIVERY && currentOrder.status === OrderStatus.PENDING && payload.status === OrderStatus.CONFIRMED
            ? { acceptedById: req.user!.id, acceptedAt: new Date() }
            : {})
        }
      });
    }, INVENTORY_TRANSACTION_OPTIONS);

    await prisma.notification.create({
      data: {
        userId: order.customerId ?? undefined,
        type: "ORDER",
        title: "Order status updated",
        message: `${order.orderNumber} is now ${payload.status.replaceAll("_", " ")}.`,
        metadata: { orderNumber: order.orderNumber, status: payload.status }
      }
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action:
        order.serviceType === ServiceType.DELIVERY
          ? payload.status === OrderStatus.CONFIRMED
            ? "delivery.accepted"
            : payload.status === OrderStatus.DELIVERED
              ? "delivery.delivered"
              : payload.status === OrderStatus.CANCELLED
                ? "delivery.cancelled"
                : "delivery.status_updated"
          : "order.status_update",
      entityType: "order",
      entityId: order.id,
      payload: { ...payload, orderNumber: order.orderNumber, branchId: order.branchId }
    });

    if (order.serviceType === ServiceType.DELIVERY) {
      publishDeliveryOrderEvent({
        branchId: order.branchId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        channel: order.channel,
        kind: "UPDATED"
      });
    }

    return res.json({ order });
  } catch (error) {
    return next(error);
  }
});

router.patch("/orders/:id/dispatch", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const payload = z.object({ riderId: z.string().cuid() }).parse(req.body);
    const { order, whatsappUrl, resentToRider } = await dispatchDeliveryOrder({
      orderId: req.params.id,
      branchId: branchContext.branchId,
      actorId: req.user!.id,
      riderId: payload.riderId
    });

    if (order.customerId) {
      await prisma.notification.create({
        data: {
          userId: order.customerId,
          type: "ORDER",
          title: "Order is on the way",
          message: `${order.orderNumber} has been assigned to the delivery rider.`,
          metadata: { orderNumber: order.orderNumber, status: order.status, rider: order.riderName }
        }
      });
    }

    await writeAuditLog({
      actorId: req.user!.id,
      action: "delivery.whatsapp_opened",
      entityType: "order",
      entityId: order.id,
      payload: {
        orderNumber: order.orderNumber,
        branchId: order.branchId,
        riderName: order.riderName,
        riderPhone: order.riderPhone,
        message: resentToRider ? "WhatsApp delivery update opened for the selected rider." : "WhatsApp delivery message opened for the selected rider.",
        resentToRider
      }
    });

    publishDeliveryOrderEvent({
      branchId: order.branchId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      channel: order.channel,
      kind: "UPDATED"
    });

    return res.json({ order, whatsappUrl, resentToRider });
  } catch (error) {
    return next(error);
  }
});

router.get("/delivery-events", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);

    res.status(200);
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    res.flushHeaders();
    res.write(`event: ready\ndata: ${JSON.stringify({ branchId: branchContext.branchId })}\n\n`);

    const unsubscribe = subscribeToDeliveryOrderEvents((event) => {
      if (event.branchId !== branchContext.branchId) return;
      res.write(`event: delivery-order\ndata: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 25_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/delivery-riders", async (_req, res, next) => {
  try {
    const riders = await prisma.deliveryRider.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] });
    return res.json({ riders: riders.map(serializeDeliveryRider) });
  } catch (error) {
    return next(error);
  }
});

router.post("/delivery-riders", authorize(RoleCode.SUPER_ADMIN), async (req, res, next) => {
  try {
    const payload = deliveryRiderWriteSchema.parse(req.body);
    const rider = await prisma.deliveryRider.create({
      data: {
        name: payload.name,
        phone: normalizePakistanMobile(payload.phone),
        isActive: payload.isActive ?? true
      }
    });
    await writeAuditLog({
      actorId: req.user!.id,
      action: "delivery.rider_created",
      entityType: "delivery_rider",
      entityId: rider.id,
      payload: { name: rider.name, phone: rider.phone }
    });
    return res.status(201).json({ rider: serializeDeliveryRider(rider) });
  } catch (error) {
    return next(error);
  }
});

router.patch("/delivery-riders/:id", authorize(RoleCode.SUPER_ADMIN), async (req, res, next) => {
  try {
    const payload = deliveryRiderPatchSchema.parse(req.body);
    const riderId = z.string().cuid().parse(req.params.id);
    const rider = await prisma.deliveryRider.update({
      where: { id: riderId },
      data: {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.phone !== undefined ? { phone: normalizePakistanMobile(payload.phone) } : {}),
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {})
      }
    });
    await writeAuditLog({
      actorId: req.user!.id,
      action: rider.isActive ? "delivery.rider_updated" : "delivery.rider_deactivated",
      entityType: "delivery_rider",
      entityId: rider.id,
      payload: { name: rider.name, phone: rider.phone, isActive: rider.isActive }
    });
    return res.json({ rider: serializeDeliveryRider(rider) });
  } catch (error) {
    return next(error);
  }
});

router.delete("/delivery-riders/:id", authorize(RoleCode.SUPER_ADMIN), async (req, res, next) => {
  try {
    const riderId = z.string().cuid().parse(req.params.id);
    const rider = await prisma.deliveryRider.update({ where: { id: riderId }, data: { isActive: false } });
    await writeAuditLog({
      actorId: req.user!.id,
      action: "delivery.rider_deactivated",
      entityType: "delivery_rider",
      entityId: rider.id,
      payload: { name: rider.name, phone: rider.phone }
    });
    return res.json({ deleted: true });
  } catch (error) {
    return next(error);
  }
});

router.get("/delivery-logs", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(req.query);
    const auditLogs = await prisma.auditLog.findMany({
      where: { entityType: "order", action: { startsWith: "delivery." } },
      include: { actor: { select: { name: true, username: true } } },
      orderBy: { createdAt: "desc" },
      take: Math.min(query.limit * 5, 500)
    });
    const orderIds = [...new Set(auditLogs.map((log) => log.entityId))];
    const orders = orderIds.length
      ? await prisma.order.findMany({ where: { id: { in: orderIds }, branchId: branchContext.branchId }, select: { id: true, orderNumber: true } })
      : [];
    const ordersById = new Map(orders.map((order) => [order.id, order]));

    return res.json({
      logs: auditLogs
        .filter((log) => ordersById.has(log.entityId))
        .slice(0, query.limit)
        .map((log) => {
          const payload = log.payload && typeof log.payload === "object" && !Array.isArray(log.payload) ? log.payload as Record<string, unknown> : {};
          return {
            id: log.id,
            action: log.action,
            orderNumber: typeof payload.orderNumber === "string" ? payload.orderNumber : ordersById.get(log.entityId)?.orderNumber ?? "Order",
            riderName: typeof payload.riderName === "string" ? payload.riderName : null,
            actorName: log.actor?.name ?? log.actor?.username ?? "Website customer",
            createdAt: log.createdAt.toISOString()
          };
        })
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/customers", async (req, res, next) => {
  const branchContext = await resolveBranchContext(req).catch((error) => {
    next(error);
    return null;
  });
  if (!branchContext) return;

  const customers = await prisma.user.findMany({
    where: { role: { is: { code: RoleCode.CUSTOMER } } },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      createdAt: true,
      orders: {
        where: { branchId: branchContext.branchId },
        orderBy: { placedAt: "desc" }
      },
      addresses: {
        select: {
          id: true,
          label: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          instructions: true,
          isDefault: true,
          createdAt: true,
          updatedAt: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return res.json({
    customers: customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      createdAt: customer.createdAt,
      addresses: customer.addresses,
      totalSpend: customer.orders.reduce((total, order) => total + Number(order.totalAmount), 0),
      lastOrderDate: customer.orders[0]?.placedAt ?? null,
      totalOrders: customer.orders.length
    }))
  });
});

router.get("/vendors", async (_req, res, next) => {
  try {
    const workbook = await readVendorWorkbook();
    const vendors = workbook.vendors.filter((vendor) => vendor.isActive !== false).sort((left, right) => {
      const categoryCompare = left.ingredientCategory.localeCompare(right.ingredientCategory);
      return categoryCompare !== 0 ? categoryCompare : left.vendorName.localeCompare(right.vendorName);
    });

    const categories = workbook.categories.map((category) => category.name).sort((left, right) => left.localeCompare(right));

    return res.json({ vendors, categories });
  } catch (error) {
    return next(error);
  }
});

const vendorCategorySchema = z.object({
  name: z.string().trim().min(1).max(120)
});

router.post("/vendors/categories", async (req, res, next) => {
  try {
    const payload = vendorCategorySchema.parse(req.body);
    const workbook = await readVendorWorkbook();
    const existing = workbook.categories.find((category) => category.name.toLowerCase() === payload.name.toLowerCase());
    if (existing) {
      return res.json({ category: existing.name });
    }

    const categories = addVendorCategory(workbook.categories, payload.name);
    await writeVendorSheetRows(workbook.vendors, categories);

    await writeAuditLog({
      actorId: req.user!.id,
      action: "vendor.category.create",
      entityType: "vendor_category",
      entityId: payload.name,
      payload: { name: payload.name }
    });

    return res.status(201).json({ category: payload.name });
  } catch (error) {
    return next(error);
  }
});

router.post("/vendors", async (req, res, next) => {
  try {
    const payload = vendorSchema.parse(req.body);
    const workbook = await readVendorWorkbook();
    const vendor: VendorRecord = {
      id: randomUUID(),
      ingredientCategory: payload.ingredientCategory.trim(),
      vendorName: payload.vendorName.trim(),
      contactNumber: payload.contactNumber?.trim() || "",
      type: payload.type?.trim() || "Vendor",
      provides: payload.provides?.trim() || "",
      quotedPrice: payload.quotedPrice?.trim() || "",
      rateListUrl: payload.rateListUrl?.trim() || "",
      notes: payload.notes?.trim() || "",
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const vendors = [...workbook.vendors, vendor];
    const categories = addVendorCategory(workbook.categories, vendor.ingredientCategory);
    await writeVendorSheetRows(vendors, categories);

    await writeAuditLog({
      actorId: req.user!.id,
      action: "vendor.create",
      entityType: "vendor",
      entityId: vendor.id,
      payload: vendor
    });

    return res.status(201).json({ vendor });
  } catch (error) {
    return next(error);
  }
});

router.patch("/vendors/:id", async (req, res, next) => {
  try {
    const payload = vendorSchema.partial().parse(req.body);
    const workbook = await readVendorWorkbook();
    const vendors = workbook.vendors;
    const index = vendors.findIndex((vendor) => vendor.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ message: "Vendor not found." });
    }

    const current = vendors[index] as VendorRecord;
    const nextVendor: VendorRecord = {
      id: current.id,
      ingredientCategory:
        payload.ingredientCategory !== undefined ? payload.ingredientCategory.trim() : current.ingredientCategory,
      vendorName: payload.vendorName !== undefined ? payload.vendorName.trim() : current.vendorName,
      contactNumber:
        payload.contactNumber !== undefined ? payload.contactNumber?.trim() || "" : current.contactNumber ?? "",
      type: payload.type !== undefined ? payload.type?.trim() || "Vendor" : current.type ?? "Vendor",
      provides: payload.provides !== undefined ? payload.provides?.trim() || "" : current.provides ?? "",
      quotedPrice:
        payload.quotedPrice !== undefined ? payload.quotedPrice?.trim() || "" : current.quotedPrice ?? "",
      rateListUrl: payload.rateListUrl !== undefined ? payload.rateListUrl?.trim() || "" : current.rateListUrl ?? "",
      notes: payload.notes !== undefined ? payload.notes?.trim() || "" : current.notes ?? "",
      isActive: current.isActive,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString()
    };

    vendors[index] = nextVendor;
    const categories = addVendorCategory(workbook.categories, nextVendor.ingredientCategory);
    await writeVendorSheetRows(vendors, categories);

    await writeAuditLog({
      actorId: req.user!.id,
      action: "vendor.update",
      entityType: "vendor",
      entityId: nextVendor.id,
      payload
    });

    return res.json({ vendor: nextVendor });
  } catch (error) {
    return next(error);
  }
});

router.delete("/vendors/:id", async (req, res, next) => {
  try {
    const workbook = await readVendorWorkbook();
    const vendors = workbook.vendors;
    const index = vendors.findIndex((vendor) => vendor.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ message: "Vendor not found." });
    }

    const current = vendors[index] as VendorRecord;
    const nextVendors = vendors.filter((vendor) => vendor.id !== req.params.id);

    await writeVendorSheetRows(nextVendors, workbook.categories);
    await writeAuditLog({
      actorId: req.user!.id,
      action: "vendor.delete",
      entityType: "vendor",
      entityId: req.params.id,
      payload: { mode: "deleted", vendorName: current.vendorName }
    });

    return res.json({ deleted: true });
  } catch (error) {
    return next(error);
  }
});

router.post("/vendors/rate-list", async (req, res, next) => {
  try {
    const payload = imageUploadSchema.parse(req.body);
    const uploaded = await saveVendorRateList(payload.filename, payload.dataUrl);
    return res.status(201).json(uploaded);
  } catch (error) {
    return next(error);
  }
});

const expenseQuerySchema = dashboardQueryBaseSchema
  .extend({
    branchId: z.string().cuid().optional(),
    category: z.string().trim().optional(),
    search: z.string().trim().optional()
  })
  .superRefine((value, context) => {
    if (value.preset === "custom" && (!value.start || !value.end)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Custom range requires start and end dates.",
        path: ["start"]
      });
    }
  });

const expenseSchema = z.object({
  branchId: z.string().cuid(),
  title: z.string().min(2).max(120),
  category: z.string().min(2).max(60),
  amount: z.number().positive(),
  paymentSource: z.enum(MONEY_SOURCES),
  expenseDate: z.string().datetime(),
  vendor: z.string().max(100).optional().or(z.literal("")),
  billReference: z.string().max(100).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal(""))
});

const stockPurchaseSchema = z.object({
  branchId: z.string().cuid(),
  ingredientId: z.string().cuid(),
  purchaseUnitId: z.string().cuid().nullable().optional(),
  purchaseQuantity: z.number().positive(),
  amount: z.number().positive(),
  paymentSource: z.enum(MONEY_SOURCES),
  purchaseDate: z.string().datetime(),
  vendor: z.string().max(100).optional().or(z.literal("")),
  billReference: z.string().max(100).optional().or(z.literal("")),
  note: z.string().max(500).optional().or(z.literal(""))
});

const stockPurchaseUpdateSchema = z.object({
  purchaseUnitId: z.string().cuid().nullable().optional(),
  purchaseQuantity: z.number().positive().optional(),
  amount: z.number().positive().optional(),
  paymentSource: z.enum(MONEY_SOURCES).optional(),
  purchaseDate: z.string().datetime().optional(),
  vendor: z.string().max(100).optional().or(z.literal("")),
  billReference: z.string().max(100).optional().or(z.literal("")),
  note: z.string().max(500).optional().or(z.literal(""))
});

const fixedExpenseSchema = z.object({
  branchId: z.string().cuid(),
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(60),
  monthlyAmount: z.number().positive(),
  paymentSource: z.enum(MONEY_SOURCES).default("CASH"),
  dueDay: z.number().int().min(1).max(31),
  autoRepeat: z.boolean().default(true),
  isActive: z.boolean().default(true)
});

const fixedExpenseMonthSchema = z.object({
  monthKey: z.string().regex(/^\d{4}-\d{2}$/).optional()
});

const fixedExpenseOccurrenceSchema = z.object({
  status: z.enum(["PAID", "UNPAID"])
});

function getPakistanMonthKey(date = new Date()) {
  return getBusinessDateKey(date).slice(0, 7);
}

function fixedExpenseDueDate(monthKey: string, dueDay: number) {
  const [yearPart, monthPart] = monthKey.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(dueDay, daysInMonth);
  return businessDayRange(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`).start;
}

function fixedExpenseMonthLabel(monthKey: string) {
  const [yearPart, monthPart] = monthKey.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  return new Intl.DateTimeFormat("en-PK", { month: "long", year: "numeric", timeZone: REPORT_TIME_ZONE }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function buildExpenseWhere(query: z.infer<typeof expenseQuerySchema>, range: ReturnType<typeof buildDashboardRange>, branchId: string): Prisma.ExpenseWhereInput {
  return {
    AND: [
      {
        OR: [
          { fixedExpenseOccurrence: { is: null } },
          { fixedExpenseOccurrence: { is: { status: "PAID" } } }
        ]
      }
    ],
    expenseDate: {
      gte: range.start,
      lte: range.end
    },
    branchId,
    ...(query.category ? { category: { equals: query.category, mode: "insensitive" as const } } : {}),
    ...(query.search
      ? {
          OR: [
            { title: { contains: query.search, mode: "insensitive" as const } },
            { vendor: { contains: query.search, mode: "insensitive" as const } },
            { billReference: { contains: query.search, mode: "insensitive" as const } },
            { notes: { contains: query.search, mode: "insensitive" as const } }
          ]
        }
      : {})
  };
}

router.get("/fixed-expenses", async (req, res, next) => {
  try {
    const query = fixedExpenseMonthSchema.parse(req.query);
    const branchContext = await resolveBranchContext(req);
    const monthKey = query.monthKey ?? getPakistanMonthKey();
    const fixedExpenses = await prisma.fixedExpense.findMany({
        where: { branchId: branchContext.branchId },
        include: {
          branch: true,
          occurrences: {
            where: { monthKey },
            include: { expense: true },
            take: 1
          }
        },
        orderBy: { name: "asc" }
      });

    const activeExpenses = fixedExpenses.filter((fixedExpense) => fixedExpense.isActive);
    const totalFixedExpenses = activeExpenses.reduce((sum, fixedExpense) => sum + parseDecimal(fixedExpense.monthlyAmount), 0);
    const paid = activeExpenses.reduce((sum, fixedExpense) => sum + (fixedExpense.occurrences[0]?.status === "PAID" ? parseDecimal(fixedExpense.monthlyAmount) : 0), 0);
    const today = startOfDay(new Date());
    const upcomingDue = activeExpenses.reduce((sum, fixedExpense) => {
      const occurrence = fixedExpense.occurrences[0];
      const dueDate = fixedExpenseDueDate(monthKey, fixedExpense.dueDay);
      return !occurrence || (occurrence.status !== "PAID" && dueDate >= today) ? sum + parseDecimal(fixedExpense.monthlyAmount) : sum;
    }, 0);

    return res.json({
      monthKey,
      monthLabel: fixedExpenseMonthLabel(monthKey),
      branches: branchContext.branches.map((branch) => ({ ...branch, deliveryFee: parseDecimal(branch.deliveryFee) })),
      summary: {
        totalFixedExpenses: Number(totalFixedExpenses.toFixed(2)),
        paid: Number(paid.toFixed(2)),
        remaining: Number((totalFixedExpenses - paid).toFixed(2)),
        upcomingDue: Number(upcomingDue.toFixed(2))
      },
      fixedExpenses: fixedExpenses.map((fixedExpense) => {
        const occurrence = fixedExpense.occurrences[0];
        return {
          id: fixedExpense.id,
          branchId: fixedExpense.branchId,
          branchName: fixedExpense.branch.name,
          name: fixedExpense.name,
          category: fixedExpense.category,
          monthlyAmount: parseDecimal(fixedExpense.monthlyAmount),
          paymentSource: fixedExpense.paymentSource,
          dueDay: fixedExpense.dueDay,
          autoRepeat: fixedExpense.autoRepeat,
          isActive: fixedExpense.isActive,
          currentMonth: occurrence
            ? {
                id: occurrence.id,
                expenseId: occurrence.expenseId,
                status: occurrence.status,
                paidAt: occurrence.paidAt?.toISOString() ?? null,
                expenseDate: occurrence.expense.expenseDate.toISOString()
              }
            : null
        };
      })
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/fixed-expenses/generate", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const query = fixedExpenseMonthSchema.parse(req.body ?? {});
    const monthKey = query.monthKey ?? getPakistanMonthKey();
    const fixedExpenses = await prisma.fixedExpense.findMany({ where: { branchId: branchContext.branchId, isActive: true, autoRepeat: true } });
    let generated = 0;

    await prisma.$transaction(async (transaction) => {
      for (const fixedExpense of fixedExpenses) {
        const existing = await transaction.fixedExpenseOccurrence.findUnique({
          where: { fixedExpenseId_monthKey: { fixedExpenseId: fixedExpense.id, monthKey } }
        });
        if (existing) continue;

        const expense = await transaction.expense.create({
          data: {
            branchId: fixedExpense.branchId,
            createdById: req.user!.id,
            title: fixedExpense.name,
            category: fixedExpense.category,
            amount: fixedExpense.monthlyAmount,
            paymentSource: fixedExpense.paymentSource,
            expenseDate: fixedExpenseDueDate(monthKey, fixedExpense.dueDay),
            notes: `Generated from fixed expense for ${monthKey}.`
          }
        });
        await transaction.fixedExpenseOccurrence.create({
          data: { fixedExpenseId: fixedExpense.id, expenseId: expense.id, monthKey }
        });
        generated += 1;
      }
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "fixed-expense.generate",
      entityType: "fixed-expense",
      entityId: monthKey,
      payload: { monthKey, generated }
    });

    return res.json({ monthKey, generated });
  } catch (error) {
    return next(error);
  }
});

router.post("/fixed-expenses", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const parsedPayload = fixedExpenseSchema.parse(req.body);
    const payload = { ...parsedPayload, branchId: branchContext.branchId };
    const fixedExpense = await prisma.fixedExpense.create({
      data: { ...payload, createdById: req.user!.id }
    });
    return res.status(201).json({ fixedExpense });
  } catch (error) {
    return next(error);
  }
});

router.patch("/fixed-expenses/occurrences/:id", async (req, res, next) => {
  try {
    const payload = fixedExpenseOccurrenceSchema.parse(req.body);
    const occurrence = await prisma.fixedExpenseOccurrence.update({
      where: { id: req.params.id },
      data: { status: payload.status, paidAt: payload.status === "PAID" ? new Date() : null }
    });
    return res.json({ occurrence });
  } catch (error) {
    return next(error);
  }
});

router.patch("/fixed-expenses/:id", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const payload = fixedExpenseSchema.partial().parse(req.body);
    const existing = await prisma.fixedExpense.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ message: "Fixed expense not found." });
    }
    if (existing.branchId !== branchContext.branchId) {
      return res.status(403).json({ message: "This fixed expense belongs to another branch." });
    }
    const fixedExpense = await prisma.fixedExpense.update({
      where: { id: req.params.id },
      data: { ...payload, branchId: branchContext.branchId, ...(payload.name ? { name: payload.name.trim() } : {}), ...(payload.category ? { category: payload.category.trim() } : {}) }
    });
    return res.json({ fixedExpense });
  } catch (error) {
    return next(error);
  }
});

router.delete("/fixed-expenses/:id", async (req, res, next) => {
  try {
    const fixedExpense = await prisma.fixedExpense.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });
    await writeAuditLog({
      actorId: req.user!.id,
      action: "fixed-expense.remove",
      entityType: "fixed-expense",
      entityId: fixedExpense.id,
      payload: { name: fixedExpense.name }
    });
    return res.json({ deleted: true });
  } catch (error) {
    return next(error);
  }
});

router.get("/expenses", async (req, res, next) => {
  try {
    const query = expenseQuerySchema.parse(req.query);
    const branchContext = await resolveBranchContext(req);
    const range = buildDashboardRange(query);
    const where = buildExpenseWhere(query, range, branchContext.branchId);

    const expenses = await prisma.expense.findMany({
        where,
        include: {
          branch: true,
          createdBy: true,
          stockTransaction: {
            include: {
              purchaseUnit: true,
              branchInventory: { include: { ingredient: true } }
            }
          }
        },
        orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }]
      });

    const totalAmount = expenses.reduce((sum, item) => sum + parseDecimal(item.amount), 0);
    const categoryTotals = new Map<string, { label: string; amount: number; count: number }>();

    for (const expense of expenses) {
      const categoryKey = expense.category;
      const existing = categoryTotals.get(categoryKey) ?? { label: categoryKey, amount: 0, count: 0 };
      existing.amount += parseDecimal(expense.amount);
      existing.count += 1;
      categoryTotals.set(categoryKey, existing);
    }

    const series = buildSalesSeries(
      expenses.map((expense) => ({
        placedAt: expense.expenseDate,
        totalAmount: expense.amount
      })),
      range.start,
      range.end
    );

    return res.json({
      range: {
        preset: range.preset,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        label: range.label
      },
      branches: branchContext.branches.map((branch) => ({
        ...branch,
        deliveryFee: parseDecimal(branch.deliveryFee)
      })),
      summary: {
        totalAmount: Number(totalAmount.toFixed(2)),
        totalCount: expenses.length,
        averageAmount: expenses.length ? Number((totalAmount / expenses.length).toFixed(2)) : 0
      },
      series,
      categories: Array.from(categoryTotals.values())
        .sort((left, right) => right.amount - left.amount)
        .map((entry) => ({
          label: entry.label,
          amount: Number(entry.amount.toFixed(2)),
          count: entry.count
        })),
      expenses: expenses.map((expense) => ({
        id: expense.id,
        branchId: expense.branchId,
        branchName: expense.branch.name,
        title: expense.title,
        category: expense.category,
        amount: parseDecimal(expense.amount),
        paymentSource: expense.paymentSource,
        expenseDate: expense.expenseDate.toISOString(),
        vendor: expense.vendor,
        billReference: expense.billReference,
        notes: expense.notes,
        stockTransactionId: expense.stockTransactionId,
        stockPurchase: expense.stockTransaction
          ? {
              ingredientId: expense.stockTransaction.branchInventory.ingredientId,
              ingredientName: expense.stockTransaction.branchInventory.ingredient.name,
              purchaseUnitId: expense.stockTransaction.purchaseUnitId,
              purchaseQuantity: parseDecimal(expense.stockTransaction.purchaseQuantity),
              purchaseUnitLabel: expense.stockTransaction.purchaseUnitLabel ?? expense.stockTransaction.purchaseUnit?.name ?? expense.stockTransaction.branchInventory.ingredient.unit,
              baseQuantity: parseDecimal(expense.stockTransaction.quantity),
              purchaseDate: expense.stockTransaction.purchaseDate?.toISOString() ?? expense.expenseDate.toISOString()
            }
          : null,
        createdByName: expense.createdBy?.name ?? null,
        createdAt: expense.createdAt.toISOString()
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/expenses/export", async (req, res, next) => {
  try {
    const query = expenseQuerySchema.parse(req.query);
    const branchContext = await resolveBranchContext(req);
    const range = buildDashboardRange(query);
    const expenses = await prisma.expense.findMany({
      where: buildExpenseWhere(query, range, branchContext.branchId),
      include: {
        branch: true,
        createdBy: true,
        stockTransaction: {
          include: {
            purchaseUnit: true,
            branchInventory: { include: { ingredient: true } }
          }
        }
      },
      orderBy: [{ expenseDate: "asc" }, { createdAt: "asc" }]
    });

    const totalAmount = expenses.reduce((sum, expense) => sum + parseDecimal(expense.amount), 0);
    const summaryRows = [
      ["Period", range.label],
      ["Start", range.start.toISOString()],
      ["End", range.end.toISOString()],
      ["Branch", branchContext.branch.name],
      ["Category filter", query.category ?? "All categories"],
      ["Search filter", query.search ?? "None"],
      ["Entries", expenses.length],
      ["Total amount", Number(totalAmount.toFixed(2))]
    ];

    const detailRows = expenses.map((expense) => ({
      Date: new Intl.DateTimeFormat("en-PK", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(expense.expenseDate),
      Branch: expense.branch.name,
      Title: expense.title,
      Category: expense.category,
      EntryType: expense.stockTransaction ? "Stock purchase" : "Other expense",
      Amount: parseDecimal(expense.amount),
      PaymentSource: expense.paymentSource,
      Vendor: expense.vendor ?? "",
      BillReference: expense.billReference ?? "",
      StockItem: expense.stockTransaction?.branchInventory.ingredient.name ?? "",
      PurchaseQuantity: expense.stockTransaction?.purchaseQuantity == null
        ? ""
        : parseDecimal(expense.stockTransaction.purchaseQuantity),
      PurchaseUnit: expense.stockTransaction?.purchaseUnitLabel ?? expense.stockTransaction?.purchaseUnit?.name ?? "",
      BaseQuantity: expense.stockTransaction ? parseDecimal(expense.stockTransaction.quantity) : "",
      Notes: expense.notes ?? "",
      CreatedBy: expense.createdBy?.name ?? "",
      LoggedAt: expense.createdAt.toISOString()
    }));

    const workbook = XLSX.utils.book_new();
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    const detailSheet = XLSX.utils.json_to_sheet(detailRows);
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
    XLSX.utils.book_append_sheet(workbook, detailSheet, "Expenses");

    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
    const fileMonth = query.monthKey ?? range.start.toISOString().slice(0, 7);
    const safeBranch = branchContext.branch.slug;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=\"pocket-expenses-${fileMonth}-${safeBranch}.xlsx\"`);
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
});

router.post("/expenses", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const parsedPayload = expenseSchema.parse(req.body);
    const payload = { ...parsedPayload, branchId: branchContext.branchId };
    const expense = await prisma.expense.create({
      data: {
        branchId: payload.branchId,
        createdById: req.user!.id,
        title: payload.title.trim(),
        category: payload.category.trim(),
        amount: payload.amount,
        paymentSource: payload.paymentSource,
        // Store expenses at the canonical 6AM business-day boundary. This
        // keeps reporting stable even when clients send a calendar timestamp.
        expenseDate: businessDayRange(getBusinessDateKey(new Date(payload.expenseDate))).start,
        vendor: payload.vendor?.trim() || undefined,
        billReference: payload.billReference?.trim() || undefined,
        notes: payload.notes?.trim() || undefined
      },
      include: {
        branch: true,
        createdBy: true
      }
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "expense.create",
      entityType: "expense",
      entityId: expense.id,
      payload
    });

    return res.status(201).json({ expense });
  } catch (error) {
    return next(error);
  }
});

router.patch("/expenses/:id", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const payload = expenseSchema.partial().parse(req.body);
    const existing = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ message: "Expense not found." });
    }
    if (existing.branchId !== branchContext.branchId) {
      return res.status(403).json({ message: "This expense belongs to another branch." });
    }
    if (existing.stockTransactionId) {
      return next(adminActionError({
        message: "Stock purchases must be edited from the stock purchase form.",
        statusCode: 400,
        code: "STOCK_PURCHASE_EDIT_REQUIRED",
        details: "This expense is linked to inventory and cannot be edited as a general expense.",
        entity: "expense",
        action: "update"
      }));
    }
    const expense = await prisma.expense.update({
      where: { id: req.params.id },
      data: {
        branchId: branchContext.branchId,
        ...(payload.title ? { title: payload.title.trim() } : {}),
        ...(payload.category ? { category: payload.category.trim() } : {}),
        ...(typeof payload.amount === "number" ? { amount: payload.amount } : {}),
        ...(payload.paymentSource ? { paymentSource: payload.paymentSource } : {}),
        ...(payload.expenseDate
          ? { expenseDate: businessDayRange(getBusinessDateKey(new Date(payload.expenseDate))).start }
          : {}),
        ...(payload.vendor !== undefined ? { vendor: payload.vendor?.trim() || null } : {}),
        ...(payload.billReference !== undefined ? { billReference: payload.billReference?.trim() || null } : {}),
        ...(payload.notes !== undefined ? { notes: payload.notes?.trim() || null } : {}),
        createdById: req.user!.id
      },
      include: {
        branch: true,
        createdBy: true
      }
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "expense.update",
      entityType: "expense",
      entityId: expense.id,
      payload
    });

    return res.json({ expense });
  } catch (error) {
    return next(error);
  }
});

router.patch("/expenses/stock-purchases/:id", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const payload = stockPurchaseUpdateSchema.parse(req.body);
    const existing = await prisma.expense.findUnique({
      where: { id: req.params.id },
      include: {
        stockTransaction: {
          include: {
            purchaseUnit: true,
            branchInventory: { include: { ingredient: true } }
          }
        },
        branch: true,
        createdBy: true
      }
    });
    if (!existing) return res.status(404).json({ message: "Stock purchase not found." });
    if (existing.branchId !== branchContext.branchId) return res.status(403).json({ message: "This stock purchase belongs to another branch." });
    if (!existing.stockTransaction) return res.status(400).json({ message: "This expense is not a stock purchase." });

    const stockTransaction = existing.stockTransaction;
    const ingredient = stockTransaction.branchInventory.ingredient;
    const purchaseUnitId = payload.purchaseUnitId !== undefined ? payload.purchaseUnitId : stockTransaction.purchaseUnitId;
    const purchaseUnit = purchaseUnitId
      ? await prisma.ingredientPurchaseUnit.findFirst({
          where: {
            id: purchaseUnitId,
            ingredientId: ingredient.id,
            OR: [{ isActive: true }, { id: stockTransaction.purchaseUnitId ?? "" }]
          }
        })
      : null;
    if (purchaseUnitId && !purchaseUnit) return res.status(400).json({ message: "Purchase unit is unavailable." });

    const purchaseQuantity = payload.purchaseQuantity ?? (parseDecimal(stockTransaction.purchaseQuantity) || parseDecimal(stockTransaction.quantity));
    const amount = payload.amount ?? parseDecimal(existing.amount);
    const purchaseDate = payload.purchaseDate ? new Date(payload.purchaseDate) : stockTransaction.purchaseDate ?? existing.expenseDate;
    const baseQuantity = roundQuantity(purchaseQuantity * (purchaseUnit ? parseDecimal(purchaseUnit.quantityInBaseUnits) : 1));
    const unitLabel = purchaseUnit?.name ?? stockTransaction.purchaseUnitLabel ?? ingredient.unit;
    const expenseDate = businessDayRange(getBusinessDateKey(purchaseDate)).start;

    const expense = await prisma.$transaction(async (transaction) => {
      await transaction.inventoryTransaction.update({
        where: { id: stockTransaction.id },
        data: {
          quantity: baseQuantity,
          balanceAfter: baseQuantity,
          purchaseQuantity,
          purchaseUnitId,
          purchaseUnitLabel: unitLabel,
          purchaseCost: amount,
          purchaseDate,
          vendorName: payload.vendor !== undefined ? payload.vendor.trim() || null : stockTransaction.vendorName,
          note: payload.note !== undefined ? payload.note.trim() || null : stockTransaction.note
        }
      });
      await transaction.ingredient.update({
        where: { id: ingredient.id },
        data: { costPerUnit: Number((amount / baseQuantity).toFixed(2)) }
      });
      return transaction.expense.update({
        where: { id: existing.id },
        data: {
          amount,
          paymentSource: payload.paymentSource ?? existing.paymentSource,
          expenseDate,
          vendor: payload.vendor !== undefined ? payload.vendor.trim() || null : existing.vendor,
          billReference: payload.billReference !== undefined ? payload.billReference.trim() || null : existing.billReference,
          notes: payload.note !== undefined ? payload.note.trim() || null : existing.notes,
          createdById: req.user!.id
        },
        include: { branch: true, createdBy: true }
      });
    });

    await recalculateInventoryBalances(stockTransaction.branchInventoryId);
    await writeAuditLog({
      actorId: req.user!.id,
      action: "expense.stock_purchase_update",
      entityType: "expense",
      entityId: expense.id,
      payload: { ...payload, baseQuantity, purchaseUnitLabel: unitLabel }
    });
    return res.json({ expense });
  } catch (error) {
    return next(error);
  }
});

router.delete("/expenses/:id", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const expense = await prisma.expense.findUnique({
      where: { id: req.params.id },
      include: { stockTransaction: true }
    });

    if (!expense) {
      return res.status(404).json({ message: "Expense not found." });
    }

    if (expense.branchId !== branchContext.branchId) {
      return res.status(403).json({ message: "This expense belongs to another branch." });
    }

    await prisma.$transaction(async (transaction) => {
      if (expense.stockTransactionId) {
        await transaction.inventoryTransaction.delete({ where: { id: expense.stockTransactionId } });
      } else {
        await transaction.expense.delete({ where: { id: expense.id } });
      }
    });

    if (expense.stockTransaction) {
      await recalculateInventoryBalances(expense.stockTransaction.branchInventoryId);
    }

    await writeAuditLog({
      actorId: req.user!.id,
      action: "expense.delete",
      entityType: "expense",
      entityId: expense.id,
      payload: {
        branchId: expense.branchId,
        title: expense.title,
        category: expense.category,
        amount: parseDecimal(expense.amount),
        expenseDate: expense.expenseDate.toISOString()
      }
    });

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.get("/branches", async (req, res, next) => {
  try {
    const access = await getAccessibleBranchesForUser(req.user!);
    const requestedBranchId = readRequestedBranchId(req);
    const selectedBranch =
      (requestedBranchId ? access.branches.find((branch) => branch.id === requestedBranchId) : undefined) ??
      access.branches.find((branch) => branch.id === access.primaryBranchId) ??
      access.branches[0] ??
      null;
    return res.json({
      branches: access.branches.map((branch) => ({
        ...branch,
        deliveryFee: parseDecimal(branch.deliveryFee)
      })),
      selectedBranchId: selectedBranch?.id ?? "",
      primaryBranchId: access.primaryBranchId,
      canSwitchBranches: access.canSwitchBranches
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/expenses/stock-purchases", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const parsedPayload = stockPurchaseSchema.parse(req.body);
    const payload = { ...parsedPayload, branchId: branchContext.branchId };
    const inventory = await prisma.branchInventory.findUnique({
      where: {
        branchId_ingredientId: {
          branchId: payload.branchId,
          ingredientId: payload.ingredientId
        }
      },
      include: { ingredient: true }
    });

    if (!inventory) {
      return res.status(404).json({ message: "Inventory item not found for the selected branch." });
    }
    if (!inventory.ingredient.isActive) {
      return next(adminActionError({
        message: "Inventory item is disabled.",
        statusCode: 400,
        code: "INVENTORY_ITEM_DISABLED",
        details: "Enable this item before recording a stock purchase.",
        entity: "ingredient",
        action: "stock_purchase"
      }));
    }
    if (inventory.ingredient.type === "PREPARED") {
      return next(adminActionError({
        message: "Prep items are made internally, not purchased as stock.",
        statusCode: 400,
        code: "PREP_ITEM_NOT_PURCHASABLE",
        details: "Record the raw purchase and use the prep recipe to produce this item.",
        entity: "ingredient",
        action: "stock_purchase"
      }));
    }

    const purchaseUnit = payload.purchaseUnitId
      ? await prisma.ingredientPurchaseUnit.findFirst({
          where: { id: payload.purchaseUnitId, ingredientId: payload.ingredientId, isActive: true }
        })
      : null;
    if (payload.purchaseUnitId && !purchaseUnit) {
      return next(adminActionError({
        message: "Purchase unit is unavailable.",
        statusCode: 400,
        code: "PURCHASE_UNIT_UNAVAILABLE",
        details: "Choose an active purchase unit configured for this inventory item.",
        entity: "ingredient_purchase_unit",
        action: "stock_purchase"
      }));
    }

    const conversion = purchaseUnit ? parseDecimal(purchaseUnit.quantityInBaseUnits) : 1;
    const baseQuantity = roundQuantity(payload.purchaseQuantity * conversion);
    const purchaseDate = new Date(payload.purchaseDate);
    const expenseDate = businessDayRange(getBusinessDateKey(purchaseDate)).start;
    const unitLabel = purchaseUnit?.name ?? inventory.ingredient.unit;

    const result = await prisma.$transaction(async (transaction) => {
      const stock = await recordInventoryChange({
        transaction,
        branchId: payload.branchId,
        ingredientId: payload.ingredientId,
        quantityDelta: baseQuantity,
        type: InventoryTransactionType.PURCHASE,
        actorId: req.user!.id,
        referenceType: "STOCK_PURCHASE",
        vendorName: payload.vendor?.trim() || undefined,
        purchaseDate,
        purchaseCost: payload.amount,
        purchaseQuantity: payload.purchaseQuantity,
        purchaseUnitId: purchaseUnit?.id,
        purchaseUnitLabel: unitLabel,
        note: payload.note?.trim() || undefined
      });

      await transaction.ingredient.update({
        where: { id: payload.ingredientId },
        data: { costPerUnit: Number((payload.amount / baseQuantity).toFixed(2)) }
      });

      const expense = await transaction.expense.create({
        data: {
          branchId: payload.branchId,
          createdById: req.user!.id,
          title: `Stock purchase: ${inventory.ingredient.name}`,
          category: "Inventory",
          amount: payload.amount,
          paymentSource: payload.paymentSource,
          expenseDate,
          vendor: payload.vendor?.trim() || undefined,
          billReference: payload.billReference?.trim() || undefined,
          notes: payload.note?.trim() || undefined,
          stockTransactionId: stock.transactionId
        },
        include: { branch: true, createdBy: true }
      });

      await transaction.inventoryTransaction.update({
        where: { id: stock.transactionId },
        data: { referenceId: expense.id }
      });

      return { expense, stock, baseQuantity, unitLabel };
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "expense.stock_purchase_create",
      entityType: "expense",
      entityId: result.expense.id,
      payload: { ...payload, baseQuantity: result.baseQuantity, purchaseUnitLabel: result.unitLabel }
    });

    return res.status(201).json({
      expense: result.expense,
      stock: {
        transactionId: result.stock.transactionId,
        ingredientId: payload.ingredientId,
        purchaseQuantity: payload.purchaseQuantity,
        purchaseUnitLabel: result.unitLabel,
        baseQuantity: result.baseQuantity
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/branches", async (req, res, next) => {
  try {
    if (req.user!.role !== RoleCode.SUPER_ADMIN) {
      return res.status(403).json({ message: "Only Super Admin can add branches." });
    }

    const payload = branchWriteSchema.parse(req.body);
    const slug = await buildUniqueBranchSlug(payload.name, payload.city);
    const branch = await prisma.$transaction(async (transaction) => {
      const created = await transaction.branch.create({
        data: {
          slug,
          name: payload.name,
          city: payload.city,
          addressLine1: payload.addressLine1,
          phone: payload.phone,
          email: payload.email?.trim() || null,
          deliveryFee: payload.deliveryFee,
          isActive: payload.isActive
        }
      });

      await initializeBranchSetup(transaction, created.id);
      return created;
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "branch.create",
      entityType: "branch",
      entityId: branch.id,
      payload: serializeAdminBranch(branch)
    });

    return res.status(201).json({ branch: serializeAdminBranch(branch) });
  } catch (error) {
    return next(error);
  }
});

router.patch("/branches/:id", async (req, res, next) => {
  try {
    if (req.user!.role !== RoleCode.SUPER_ADMIN) {
      return res.status(403).json({ message: "Only Super Admin can update branches." });
    }

    const payload = branchPatchSchema.parse(req.body);
    const branch = await prisma.branch.update({
      where: { id: req.params.id },
      data: {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.city !== undefined ? { city: payload.city } : {}),
        ...(payload.addressLine1 !== undefined ? { addressLine1: payload.addressLine1 } : {}),
        ...(payload.phone !== undefined ? { phone: payload.phone } : {}),
        ...(payload.email !== undefined ? { email: payload.email?.trim() || null } : {}),
        ...(payload.deliveryFee !== undefined ? { deliveryFee: payload.deliveryFee } : {}),
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {})
      }
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "branch.update",
      entityType: "branch",
      entityId: branch.id,
      payload
    });

    return res.json({ branch: serializeAdminBranch(branch) });
  } catch (error) {
    return next(error);
  }
});

router.get("/permissions", async (_req, res) => {
  return res.json({ permissions: PERMISSION_DEFINITIONS });
});

router.get("/users", async (req, res, next) => {
  try {
    const query = userQuerySchema.parse(req.query);
    const users = await prisma.user.findMany({
      where: {
        role: {
          is: {
            code: { in: manageableUserRoleCodes as unknown as RoleCode[] }
          }
        },
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: "insensitive" } },
                { username: { contains: query.search, mode: "insensitive" } },
                { email: { contains: query.search, mode: "insensitive" } },
                { phone: { contains: query.search, mode: "insensitive" } }
              ]
            }
          : {})
      },
      include: { role: true, branchAccesses: { include: { branch: true } }, permissionGrants: { include: { permission: true } } },
      orderBy: [{ createdAt: "desc" }]
    });

    return res.json({ users: users.map(serializeManagedUser) });
  } catch (error) {
    return next(error);
  }
});

router.post("/users", async (req, res, next) => {
  try {
    const payload = userWriteSchema.parse(req.body);
    const role = await prisma.role.findUniqueOrThrow({ where: { code: payload.roleCode as RoleCode } });
    const passwordHash = await hashPassword(payload.password);
    const username = (payload.username?.trim().toLowerCase() || buildUniqueUsername(payload.email || payload.name || "staff")).trim();
    const email = payload.email?.trim().toLowerCase() || `${username}@pocket.local`;
    const permissionKeys = payload.roleCode === "SUPER_ADMIN" ? PERMISSION_DEFINITIONS.map((permission) => permission.key) : (payload.permissionKeys ?? []);
    validatePermissionKeys(permissionKeys);
    const user = await prisma.user.create({
      data: {
        roleId: role.id,
        name: payload.name?.trim() || username,
        username,
        email,
        phone: payload.phone?.trim() || null,
        passwordHash,
        isActive: payload.isActive ?? true,
        canAccessAdmin: role.code === RoleCode.SUPER_ADMIN || permissionKeys.some((key) => key !== "POS"),
        canAccessPos: role.code === RoleCode.SUPER_ADMIN || permissionKeys.includes("POS")
      },
      include: { role: true }
    });
    await replaceUserPrimaryBranchAccess(user.id, role.code, payload.branchId || null);
    await replaceUserPermissions(user.id, role.code, permissionKeys);
    const savedUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { role: true, branchAccesses: { include: { branch: true } }, permissionGrants: { include: { permission: true } } }
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "user.create",
      entityType: "user",
      entityId: user.id,
      payload: {
        name: user.name,
        username: user.username,
        email: user.email,
        roleCode: user.role.code,
        branchId: payload.branchId || null
      }
    });

    return res.status(201).json({ user: serializeManagedUser(savedUser) });
  } catch (error) {
    return next(error);
  }
});

router.patch("/users/:id", async (req, res, next) => {
  try {
    const payload = userPatchSchema.parse(req.body);
    const current = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { role: true, branchAccesses: { include: { branch: true } } }
    });

    if (!current) {
      return res.status(404).json({ message: "User not found." });
    }

    const role =
      payload.roleCode !== undefined ? await prisma.role.findUniqueOrThrow({ where: { code: payload.roleCode as RoleCode } }) : null;

    const nextPermissionKeys = role?.code === RoleCode.SUPER_ADMIN
      ? PERMISSION_DEFINITIONS.map((permission) => permission.key)
      : payload.permissionKeys;
    if (nextPermissionKeys !== undefined) validatePermissionKeys(nextPermissionKeys);
    const user = await prisma.user.update({
      where: { id: current.id },
      data: {
        ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
        ...(payload.username !== undefined ? { username: payload.username.trim().toLowerCase() } : {}),
        ...(payload.email !== undefined
          ? {
              email:
                payload.email.trim().toLowerCase() ||
                `${(payload.username ?? current.username).trim().toLowerCase()}@pocket.local`
            }
          : {}),
        ...(payload.phone !== undefined ? { phone: payload.phone?.trim() || null } : {}),
        ...(role ? { roleId: role.id } : {}),
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
        ...(nextPermissionKeys !== undefined ? { canAccessAdmin: nextPermissionKeys.some((key) => key !== "POS"), canAccessPos: nextPermissionKeys.includes("POS") } : {}),
        ...(payload.password !== undefined ? { passwordHash: await hashPassword(payload.password) } : {})
      },
      include: { role: true }
    });
    if (payload.branchId !== undefined || role) {
      const nextBranchId = payload.branchId || current.branchAccesses.find((access) => access.isPrimary)?.branchId || current.branchAccesses[0]?.branchId;
      await replaceUserPrimaryBranchAccess(user.id, user.role.code, nextBranchId);
    }
    if (nextPermissionKeys !== undefined || role) {
      await replaceUserPermissions(user.id, user.role.code, nextPermissionKeys ?? []);
    }
    const savedUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { role: true, branchAccesses: { include: { branch: true } }, permissionGrants: { include: { permission: true } } }
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "user.update",
      entityType: "user",
      entityId: user.id,
      payload
    });

    return res.json({ user: serializeManagedUser(savedUser) });
  } catch (error) {
    return next(error);
  }
});

router.delete("/users/:id", async (req, res, next) => {
  try {
    const current = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { role: true }
    });

    if (!current) {
      return res.status(404).json({ message: "User not found." });
    }

    const user = await prisma.user.update({
      where: { id: current.id },
      data: { isActive: false },
      include: { role: true }
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "user.delete",
      entityType: "user",
      entityId: user.id,
      payload: { username: user.username, email: user.email, roleCode: user.role.code }
    });

    return res.json({ deleted: true });
  } catch (error) {
    return next(error);
  }
});

const couponSchema = z.object({
  code: z.string().min(3),
  title: z.string().min(3),
  description: z.string().optional(),
  type: z.enum(["FIXED", "PERCENTAGE"]),
  value: z.number().positive(),
  minOrderValue: z.number().nonnegative().optional(),
  usageLimit: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional(),
  isActive: z.boolean().default(true)
});

router.get("/coupons", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const coupons = await prisma.coupon.findMany({ where: { branchId: branchContext.branchId }, orderBy: { createdAt: "desc" } });
    return res.json({ coupons });
  } catch (error) {
    return next(error);
  }
});

router.post("/coupons", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const payload = couponSchema.parse(req.body);
    const coupon = await prisma.coupon.create({
      data: {
        ...payload,
        branchId: branchContext.branchId,
        code: payload.code.toUpperCase(),
        expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : undefined
      }
    });
    return res.status(201).json({ coupon });
  } catch (error) {
    return next(error);
  }
});

router.patch("/coupons/:id", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const payload = z.object({ isActive: z.boolean() }).parse(req.body);
    const current = await prisma.coupon.findFirst({ where: { id: req.params.id, branchId: branchContext.branchId } });
    if (!current) return res.status(404).json({ message: "Coupon not found for the selected branch." });
    const coupon = await prisma.coupon.update({ where: { id: current.id }, data: payload });
    await writeAuditLog({ actorId: req.user!.id, action: "coupon.status_update", entityType: "coupon", entityId: coupon.id, payload });
    return res.json({ coupon });
  } catch (error) {
    return next(error);
  }
});

router.post("/uploads/images", async (req, res, next) => {
  try {
    const payload = imageUploadSchema.parse(req.body);
    const image = await saveUploadedImage(payload.filename, payload.dataUrl);
    return res.status(201).json(image);
  } catch (error) {
    return next(error);
  }
});

router.get("/promotions/independence-day", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const promotion = await readIndependencePromotion(prisma, branchContext.branchId);
    const query = z.object({
      preset: z.enum(["all", "today", "custom"]).default("all"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    }).superRefine((value, context) => {
      if (value.preset === "custom" && !value.date) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Custom statistics require one business day.", path: ["date"] });
      }
    }).parse(req.query);
    const periodRange = query.preset === "all"
      ? { preset: "all", label: "All time" }
      : query.preset === "custom"
        ? { ...businessDayRange(query.date!), preset: "custom", label: `${formatPakistanDate(businessDayRange(query.date!).start, { dateStyle: "medium" })} business day` }
        : buildDashboardRange({ preset: "today", segment: "all" });
    const allTime = await readPromotionStats(prisma, branchContext.branchId, { preset: "all", label: "All time" });
    const period = query.preset === "all" ? allTime : await readPromotionStats(prisma, branchContext.branchId, periodRange);
    return res.json({ promotion, stats: { allTime, period } });
  } catch (error) {
    return next(error);
  }
});

router.patch("/promotions/independence-day", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const payload = z.object({ isActive: z.boolean() }).parse(req.body);
    const currentPromotion = await readIndependencePromotion(prisma, branchContext.branchId);
    if (payload.isActive && !currentPromotion.available) {
      return res.status(400).json({ message: currentPromotion.unavailableReason ?? "Promotion products are unavailable for this branch." });
    }
    await saveIndependencePromotion(prisma, payload.isActive);
    const promotion = await readIndependencePromotion(prisma, branchContext.branchId);
    await writeAuditLog({ actorId: req.user!.id, action: "promotion.independence_day_update", entityType: "setting", entityId: promotion.key, payload });
    return res.json({ promotion });
  } catch (error) {
    return next(error);
  }
});

router.get("/settings", async (_req, res) => {
  const settings = await prisma.setting.findMany({ orderBy: { key: "asc" } });
  return res.json({ settings });
});

router.put("/settings/:key", async (req, res, next) => {
  try {
    const payload = z.object({ value: z.any() }).parse(req.body);
    const setting = await prisma.setting.upsert({
      where: { key: req.params.key },
      update: { value: payload.value as Prisma.InputJsonValue },
      create: {
        key: req.params.key,
        value: payload.value as Prisma.InputJsonValue
      }
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "setting.update",
      entityType: "setting",
      entityId: setting.id,
      payload
    });

    return res.json({ setting });
  } catch (error) {
    return next(error);
  }
});

router.get("/customer-reviews", async (_req, res, next) => {
  try {
    const reviews = await prisma.customerReview.findMany({
      orderBy: [{ isApproved: "asc" }, { createdAt: "desc" }],
      take: 100
    });
    return res.json({
      reviews: reviews.map((review) => ({
        id: review.id,
        authorName: review.authorName,
        rating: review.rating,
        body: review.body,
        isApproved: review.isApproved,
        createdAt: review.createdAt.toISOString()
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/customer-reviews/:id", async (req, res, next) => {
  try {
    const reviewId = z.string().cuid().parse(req.params.id);
    const payload = z.object({ isApproved: z.boolean() }).parse(req.body);
    const review = await prisma.customerReview.update({
      where: { id: reviewId },
      data: { isApproved: payload.isApproved }
    });
    await writeAuditLog({
      actorId: req.user!.id,
      action: payload.isApproved ? "customer_review.approved" : "customer_review.hidden",
      entityType: "customer_review",
      entityId: review.id,
      payload: { authorName: review.authorName, rating: review.rating }
    });
    return res.json({
      review: {
        id: review.id,
        authorName: review.authorName,
        rating: review.rating,
        body: review.body,
        isApproved: review.isApproved,
        createdAt: review.createdAt.toISOString()
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.delete("/customer-reviews/:id", async (req, res, next) => {
  try {
    const reviewId = z.string().cuid().parse(req.params.id);
    const review = await prisma.customerReview.delete({ where: { id: reviewId } });
    await writeAuditLog({
      actorId: req.user!.id,
      action: "customer_review.deleted",
      entityType: "customer_review",
      entityId: review.id,
      payload: { authorName: review.authorName, rating: review.rating }
    });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.get("/notifications", async (_req, res) => {
  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: 20
  });
  return res.json({ notifications });
});

export default router;
