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

const router = Router();
const API_UPLOADS_IMAGES_DIR = fileURLToPath(new URL("../../public/uploads/images/", import.meta.url));
const API_UPLOADS_VENDOR_RATE_LISTS_DIR = fileURLToPath(new URL("../../public/uploads/vendor-rate-lists/", import.meta.url));
const VENDORS_WORKBOOK_PATH = fileURLToPath(new URL("../../../../data/vendors.xlsx", import.meta.url));

router.use(authenticate, authorize(RoleCode.ADMIN, RoleCode.SUPER_ADMIN));

const dashboardQueryBaseSchema = z.object({
  preset: z.enum(["today", "7d", "30d", "month", "year", "custom"]).default("today"),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  monthKey: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  segment: z.enum(["all", "inshop", "foodpanda"]).default("all")
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
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function addMonths(date: Date, months: number) {
  const value = new Date(date);
  value.setMonth(value.getMonth() + months);
  return value;
}

function addYears(date: Date, years: number) {
  const value = new Date(date);
  value.setFullYear(value.getFullYear() + years);
  return value;
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
      label: `${start.toLocaleDateString("en-PK")} to ${end.toLocaleDateString("en-PK")}`
    };
  }

  switch (query.preset) {
    case "today": {
      const start = startOfDay(now);
      return {
        preset: query.preset,
        start,
        end: now,
        label: "Today"
      };
    }
    case "30d": {
      return {
        preset: query.preset,
        start: startOfDay(addDays(now, -29)),
        end: now,
        label: "Last 30 days"
      };
    }
    case "month": {
      const monthDate = query.monthKey ? new Date(`${query.monthKey}-01T00:00:00`) : now;
      const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const end = query.monthKey ? endOfDay(addDays(addMonths(start, 1), -1)) : now;
      return {
        preset: query.preset,
        start,
        end,
        label: query.monthKey
          ? new Intl.DateTimeFormat("en-PK", { month: "long", year: "numeric" }).format(start)
          : "This month"
      };
    }
    case "year": {
      const start = new Date(now.getFullYear(), 0, 1);
      return {
        preset: query.preset,
        start,
        end: now,
        label: "This year"
      };
    }
    case "7d": {
      return {
        preset: query.preset,
        start: startOfDay(addDays(now, -6)),
        end: now,
        label: "Last 7 days"
      };
    }
    default:
      return {
        preset: "today" as const,
        start: startOfDay(now),
        end: now,
        label: "Today"
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

const manageableUserRoleCodes = ["ADMIN", "SUPER_ADMIN", "POS_STAFF"] as const;
type ManageableUserRoleCode = (typeof manageableUserRoleCodes)[number];

const userQuerySchema = z.object({
  search: z.string().trim().optional()
});

const userWriteSchema = z.object({
  name: z.string().min(2).max(80),
  username: z.string().min(2).max(80).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(8).max(20).optional().or(z.literal("")),
  password: z.string().min(8),
  roleCode: z.enum(manageableUserRoleCodes),
  isActive: z.boolean().optional(),
  canAccessAdmin: z.boolean().optional(),
  canAccessPos: z.boolean().optional()
});

const userPatchSchema = userWriteSchema.partial().extend({
  password: z.string().min(8).optional()
});

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
}) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    phone: user.phone ?? undefined,
    roleCode: user.role.code as ManageableUserRoleCode,
    roleLabel: user.role.label,
    isActive: user.isActive,
    canAccessAdmin: user.canAccessAdmin,
    canAccessPos: user.canAccessPos,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  };
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
  const profit = salePrice - totalCost;

  return {
    recipeCost: roundMoney(recipeCost),
    packagingCost: roundMoney(packagingCost),
    totalCost: roundMoney(totalCost),
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

function buildAdminSegmentWhere(segment: "all" | "inshop" | "foodpanda"): Prisma.OrderWhereInput {
  if (segment === "foodpanda") {
    return { serviceType: ServiceType.FOODPANDA };
  }

  if (segment === "inshop") {
    return { serviceType: { in: [ServiceType.INSHOP, ServiceType.TAKEAWAY, ServiceType.DINE_IN] } };
  }

  return {};
}

function getServiceBreakdown(value: ServiceType | string) {
  if (value === ServiceType.INSHOP || value === ServiceType.TAKEAWAY || value === ServiceType.DINE_IN) {
    return { key: "INSHOP", label: "Dine-in" };
  }

  if (value === ServiceType.FOODPANDA) {
    return { key: "FOODPANDA", label: "Foodpanda" };
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
    placedAt: order.placedAt,
    deliveryInstructions: order.deliveryInstructions,
    address: order.address
      ? {
          addressLine1: order.address.addressLine1,
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
      const bucket = ensureBucket(String(order.placedAt.getHours()), `${order.placedAt.getHours().toString().padStart(2, "0")}:00`, order.placedAt.getHours());
      bucket.revenue += Number(order.totalAmount);
      bucket.orders += 1;
    }
  } else if (durationDays <= 45) {
    for (let cursor = startOfDay(start); cursor <= end; cursor = addDays(cursor, 1)) {
      const key = cursor.toISOString().slice(0, 10);
      ensureBucket(key, new Intl.DateTimeFormat("en-PK", { month: "short", day: "numeric" }).format(cursor), cursor.getTime());
    }

    for (const order of orders) {
      const key = order.placedAt.toISOString().slice(0, 10);
      const sortKey = startOfDay(order.placedAt).getTime();
      const bucket = ensureBucket(key, new Intl.DateTimeFormat("en-PK", { month: "short", day: "numeric" }).format(order.placedAt), sortKey);
      bucket.revenue += Number(order.totalAmount);
      bucket.orders += 1;
    }
  } else if (durationDays <= 180) {
    for (let cursor = startOfDay(start); cursor <= end; cursor = addDays(cursor, 7)) {
      const key = cursor.toISOString().slice(0, 10);
      ensureBucket(key, `Week of ${new Intl.DateTimeFormat("en-PK", { month: "short", day: "numeric" }).format(cursor)}`, cursor.getTime());
    }

    for (const order of orders) {
      const diffDays = Math.floor((startOfDay(order.placedAt).getTime() - startOfDay(start).getTime()) / (1000 * 60 * 60 * 24));
      const bucketStart = addDays(startOfDay(start), Math.floor(diffDays / 7) * 7);
      const key = bucketStart.toISOString().slice(0, 10);
      const bucket = ensureBucket(key, `Week of ${new Intl.DateTimeFormat("en-PK", { month: "short", day: "numeric" }).format(bucketStart)}`, bucketStart.getTime());
      bucket.revenue += Number(order.totalAmount);
      bucket.orders += 1;
    }
  } else {
    for (let cursor = new Date(start.getFullYear(), start.getMonth(), 1); cursor <= end; cursor = addMonths(cursor, 1)) {
      const key = `${cursor.getFullYear()}-${cursor.getMonth()}`;
      ensureBucket(key, new Intl.DateTimeFormat("en-PK", { month: "short", year: "numeric" }).format(cursor), cursor.getTime());
    }

    for (const order of orders) {
      const key = `${order.placedAt.getFullYear()}-${order.placedAt.getMonth()}`;
      const sortKey = new Date(order.placedAt.getFullYear(), order.placedAt.getMonth(), 1).getTime();
      const bucket = ensureBucket(key, new Intl.DateTimeFormat("en-PK", { month: "short", year: "numeric" }).format(order.placedAt), sortKey);
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
          ...segmentWhere
        },
        select: {
          totalAmount: true,
          customerId: true
        }
      }),
      prisma.user.count({ where: { role: { is: { code: RoleCode.CUSTOMER } } } }),
      prisma.branchInventory.findMany({
        where: { lowStockAlert: true },
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
      const weekdayKey = String(order.placedAt.getDay());
      const hourKey = String(order.placedAt.getHours());

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
        label: weekdayLabels[order.placedAt.getDay()] ?? "Unknown",
        count: 0,
        revenue: 0,
        sort: order.placedAt.getDay()
      };
      weekdayEntry.count += 1;
      weekdayEntry.revenue += orderRevenue;
      breakdownMaps.weekdays.set(weekdayKey, weekdayEntry);

      const hourEntry = breakdownMaps.hours.get(hourKey) ?? {
        label: `${order.placedAt.getHours().toString().padStart(2, "0")}:00`,
        count: 0,
        revenue: 0,
        sort: order.placedAt.getHours()
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
        branches: Array.from(breakdownMaps.branches.values()).sort((left, right) => right.revenue - left.revenue),
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

router.get("/foodpanda", async (req, res, next) => {
  try {
    const query = dashboardQuerySchema.parse(req.query);
    const range = buildDashboardRange(query);
    const orders = await prisma.order.findMany({
      where: {
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
    const query = dashboardQuerySchema.parse(req.query);
    const range = buildDashboardRange(query);
    const segmentWhere = buildAdminSegmentWhere(query.segment);
    const orders = await prisma.order.findMany({
      where: {
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

    const componentProducts = bundleComponents.length
      ? await prisma.product.findMany({
          where: {
            id: { in: bundleComponents.map((component) => component.componentProductId) },
            isActive: true
          },
          select: { id: true }
        })
      : [];

    if (componentProducts.length !== bundleComponents.length) {
      throw new Error("One or more bundle items are unavailable.");
    }

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
          basePrice: payload.basePrice,
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
            price: payload.basePrice,
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

    return res.status(201).json({ product });
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

    const bundleComponentProducts = normalizedBundleComponents?.length
      ? await prisma.product.findMany({
          where: {
            id: { in: normalizedBundleComponents.map((component) => component.componentProductId) },
            isActive: true
          },
          select: { id: true }
        })
      : [];

    if (normalizedBundleComponents && bundleComponentProducts.length !== normalizedBundleComponents.length) {
      throw new Error("One or more bundle items are unavailable.");
    }

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

      if (typeof payload.basePrice === "number" || typeof payload.isActive === "boolean" || typeof payload.stockStatus === "string") {
        await transaction.branchProduct.updateMany({
          where: { productId: updatedProduct.id },
          data: {
            ...(typeof payload.basePrice === "number" ? { price: payload.basePrice } : {}),
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

    return res.json({ product });
  } catch (error) {
    return next(error);
  }
});

router.delete("/products/:id", async (req, res, next) => {
  try {
    const productId = req.params.id;
    const orderItemCount = await prisma.orderItem.count({ where: { productId } });
    if (orderItemCount > 0) {
      throw blockedDeleteError("Product");
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.productBundleComponent.deleteMany({
        where: {
          OR: [{ productId }, { componentProductId: productId }]
        }
      });
      await transaction.branchProduct.deleteMany({ where: { productId } });
      await transaction.productIngredient.deleteMany({ where: { productId } });
      await transaction.packagingRule.deleteMany({ where: { productId } });
      await transaction.productImage.deleteMany({ where: { productId } });
      await transaction.product.delete({ where: { id: productId } });
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "product.delete",
      entityType: "product",
      entityId: productId,
      payload: { mode: "deleted" }
    });

    return res.json({
      mode: "deleted",
      message: "Product deleted."
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
    const ingredientStatusWhere: Prisma.IngredientWhereInput =
      query.status === "active"
        ? { isActive: true }
        : query.status === "inactive"
          ? { isActive: false }
          : {};

    const itemWhere: Prisma.BranchInventoryWhereInput = {
      ...(query.branchId ? { branchId: query.branchId } : {}),
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
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.status !== "all" ? { ingredient: ingredientStatusWhere } : {})
    };

    const [branches, items, summaryBase, recentTransactions] = await Promise.all([
      prisma.branch.findMany({
        where: { isActive: true },
        select: {
          id: true,
          slug: true,
          name: true,
          city: true,
          addressLine1: true,
          phone: true,
          deliveryFee: true
        },
        orderBy: { name: "asc" }
      }),
      prisma.branchInventory.findMany({
        where: itemWhere,
        include: {
          branch: true,
          ingredient: {
            include: {
              productUsage: {
                include: { product: { select: { id: true, name: true } } }
              }
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
        where: query.branchId ? { branchInventory: { branchId: query.branchId } } : undefined,
        include: {
          actor: true,
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
      branches: branches.map((branch) => ({
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
    const payload = inventoryItemSchema.parse(req.body);
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
    const payload = inventoryMovementSchema.parse(req.body);
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

async function buildClosingSnapshot(branchId: string, closingDate: Date) {
  const date = normalizeClosingDate(closingDate);
  const start = startOfDay(date);
  const end = endOfDay(date);
  const previousClosing = await prisma.dailyClosing.findFirst({
    where: {
      branchId,
      closingDate: { lt: start }
    },
    orderBy: { closingDate: "desc" }
  });

  const [orders, expenses, transfers, loanCashflow, recentClosings] = await Promise.all([
    prisma.order.findMany({
      where: {
        branchId,
        status: { not: OrderStatus.CANCELLED },
        placedAt: { gte: start, lte: end },
        paymentMethod: { in: [PaymentMethod.CASH, PaymentMethod.EASYPAISA, PaymentMethod.JAZZCASH] }
      },
      select: { paymentMethod: true, totalAmount: true }
    }),
    prisma.expense.findMany({
      where: {
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
      }
    }),
    readLoanCashflow(branchId, start, end),
    prisma.dailyClosing.findMany({
      where: { branchId },
      orderBy: { closingDate: "desc" },
      take: 8,
      include: { closedBy: true }
    })
  ]);

  const opening = {
    CASH: parseDecimal(previousClosing?.cashCounted),
    EASYPAISA: parseDecimal(previousClosing?.easypaisaCounted),
    JAZZCASH: parseDecimal(previousClosing?.jazzcashCounted)
  };
  const sales = emptyMoneyTotals();
  for (const order of orders) {
    sales[order.paymentMethod as keyof typeof sales] += parseDecimal(order.totalAmount);
  }
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
  const loanIn = emptyMoneyTotals();
  const loanOut = emptyMoneyTotals();
  for (const loan of loanCashflow.loans) {
    loanIn[loan.receivedSource as keyof typeof loanIn] += parseDecimal(loan.amount);
  }
  for (const repayment of loanCashflow.loanRepayments) {
    loanOut[repayment.paidFrom as keyof typeof loanOut] += parseDecimal(repayment.amount);
  }
  const expected = {
    CASH: roundMoney(opening.CASH + sales.CASH - expenseTotals.CASH - transferOut.CASH + transferIn.CASH + loanIn.CASH - loanOut.CASH),
    EASYPAISA: roundMoney(opening.EASYPAISA + sales.EASYPAISA - expenseTotals.EASYPAISA - transferOut.EASYPAISA + transferIn.EASYPAISA + loanIn.EASYPAISA - loanOut.EASYPAISA),
    JAZZCASH: roundMoney(opening.JAZZCASH + sales.JAZZCASH - expenseTotals.JAZZCASH - transferOut.JAZZCASH + transferIn.JAZZCASH + loanIn.JAZZCASH - loanOut.JAZZCASH)
  };

  return {
    branchId,
    closingDate: start.toISOString(),
    opening,
    sales,
    expenses: expenseTotals,
    transferIn,
    transferOut,
    loanIn,
    loanOut,
    expected,
    recentClosings: recentClosings.map((closing) => ({
      id: closing.id,
      closingDate: closing.closingDate.toISOString(),
      cashExpected: parseDecimal(closing.cashExpected),
      cashCounted: parseDecimal(closing.cashCounted),
      easypaisaExpected: parseDecimal(closing.easypaisaExpected),
      easypaisaCounted: parseDecimal(closing.easypaisaCounted),
      jazzcashExpected: parseDecimal(closing.jazzcashExpected),
      jazzcashCounted: parseDecimal(closing.jazzcashCounted),
      note: closing.note,
      closedByName: closing.closedBy?.name ?? null,
      createdAt: closing.createdAt.toISOString()
    }))
  };
}

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
    const query = z.object({ branchId: z.string().cuid().optional() }).parse(req.query);
    const [branches, transfers] = await Promise.all([
      prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
      prisma.moneyTransfer.findMany({
        where: query.branchId ? { branchId: query.branchId } : undefined,
        include: { branch: true, createdBy: true },
        orderBy: { transferDate: "desc" },
        take: 50
      })
    ]);
    return res.json({
      sources: MONEY_SOURCES,
      branches: branches.map((branch) => ({ id: branch.id, name: branch.name })),
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
    const payload = transferSchema.parse(req.body);
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

router.get("/inventory/closing", async (req, res, next) => {
  try {
    const query = closingQuerySchema.parse(req.query);
    const snapshot = await buildClosingSnapshot(query.branchId, query.date ? new Date(`${query.date}T12:00:00`) : new Date());
    return res.json(snapshot);
  } catch (error) {
    return next(error);
  }
});

router.post("/inventory/closing", async (req, res, next) => {
  try {
    const payload = closingSchema.parse(req.body);
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

router.get("/loans", async (req, res, next) => {
  try {
    const query = loanQuerySchema.parse(req.query);
    const range = buildDashboardRange(query);
    const where: Prisma.LoanWhereInput = {
      loanDate: { gte: range.start, lte: range.end },
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.search
        ? {
            lenderName: {
              contains: query.search,
              mode: "insensitive"
            }
          }
        : {})
    };
    const [branches, loans] = await Promise.all([
      prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
      prisma.loan.findMany({
        where,
        include: {
          branch: true,
          createdBy: true,
          repayments: { include: { createdBy: true } }
        },
        orderBy: [{ loanDate: "desc" }, { createdAt: "desc" }]
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

    return res.json({
      range: {
        preset: range.preset,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        label: range.label
      },
      branches: branches.map((branch) => ({
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
      loans: serializedLoans
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/loans", async (req, res, next) => {
  try {
    const payload = loanSchema.parse(req.body);
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
    const payload = loanSchema.partial().parse(req.body);
    const existing = await prisma.loan.findUnique({
      where: { id: req.params.id },
      include: { repayments: true }
    });
    if (!existing) {
      return res.status(404).json({ message: "Loan not found." });
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
    const payload = loanRepaymentSchema.parse(req.body);
    const loan = await prisma.loan.findUnique({
      where: { id: req.params.id },
      include: { repayments: true }
    });
    if (!loan) {
      return res.status(404).json({ message: "Loan not found." });
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

router.get("/inventory/forecast", async (_req, res, next) => {
  try {
    const branch = await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
    if (!branch) {
      return res.json({ horizons: [] });
    }

    const now = new Date();
    const start30 = startOfDay(addDays(now, -29));
    const [orders, productIngredients, packagingRules, products, inventories, wastageTransactions] = await Promise.all([
      prisma.order.findMany({
        where: {
          branchId: branch.id,
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
        where: { branchId: branch.id, ingredient: { isActive: true } },
        include: { ingredient: true }
      }),
      prisma.inventoryTransaction.findMany({
        where: {
          type: InventoryTransactionType.WASTAGE,
          createdAt: { gte: start30, lte: now },
          branchInventory: { branchId: branch.id }
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
      branchId: branch.id,
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
    const query = z
      .object({
        status: z.nativeEnum(OrderStatus).optional(),
        search: z.string().optional(),
        preset: z.enum(["today", "7d", "30d", "month", "year", "custom"]).default("today"),
        start: z.string().datetime().optional(),
        end: z.string().datetime().optional(),
        segment: z.enum(["all", "inshop", "foodpanda"]).default("all")
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

    const now = new Date();
    let rangeStart: Date;
    let rangeEnd: Date;

    switch (query.preset) {
      case "today":
        rangeStart = startOfDay(now);
        rangeEnd = now;
        break;
      case "7d":
        rangeStart = startOfDay(addDays(now, -6));
        rangeEnd = now;
        break;
      case "30d":
        rangeStart = startOfDay(addDays(now, -29));
        rangeEnd = now;
        break;
      case "month":
        rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
        rangeEnd = now;
        break;
      case "year":
        rangeStart = new Date(now.getFullYear(), 0, 1);
        rangeEnd = now;
        break;
      case "custom":
        rangeStart = new Date(query.start!);
        rangeEnd = new Date(query.end!);
        break;
      default:
        rangeStart = startOfDay(now);
        rangeEnd = now;
        break;
    }

    const orders = await prisma.order.findMany({
      where: {
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
    const deletedCount = await prisma.order.count();
    await prisma.$transaction(async (transaction) => {
      await transaction.order.deleteMany({});
      await transaction.inventoryTransaction.deleteMany({
        where: { referenceType: "ORDER" }
      });
    }, INVENTORY_TRANSACTION_OPTIONS);

    await writeAuditLog({
      actorId: req.user!.id,
      action: "order.bulk_delete",
      entityType: "order",
      entityId: "bulk",
      payload: { deletedCount }
    });

    return res.json({ deletedCount });
  } catch (error) {
    return next(error);
  }
});

router.delete("/orders/:id", async (req, res, next) => {
  try {
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
        data: { status: payload.status }
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
      action: "order.status_update",
      entityType: "order",
      entityId: order.id,
      payload
    });

    return res.json({ order });
  } catch (error) {
    return next(error);
  }
});

router.get("/customers", async (_req, res) => {
  const customers = await prisma.user.findMany({
    where: { role: { is: { code: RoleCode.CUSTOMER } } },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      createdAt: true,
      orders: {
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
  paymentSource: z.enum(MONEY_SOURCES).default("CASH"),
  expenseDate: z.string().datetime(),
  vendor: z.string().max(100).optional().or(z.literal("")),
  billReference: z.string().max(100).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal(""))
});

function buildExpenseWhere(query: z.infer<typeof expenseQuerySchema>, range: ReturnType<typeof buildDashboardRange>): Prisma.ExpenseWhereInput {
  return {
    expenseDate: {
      gte: range.start,
      lte: range.end
    },
    ...(query.branchId ? { branchId: query.branchId } : {}),
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

router.get("/expenses", async (req, res, next) => {
  try {
    const query = expenseQuerySchema.parse(req.query);
    const range = buildDashboardRange(query);
    const where = buildExpenseWhere(query, range);

    const [branches, expenses] = await Promise.all([
      prisma.branch.findMany({
        where: { isActive: true },
        select: {
          id: true,
          slug: true,
          name: true,
          city: true,
          addressLine1: true,
          phone: true,
          deliveryFee: true
        },
        orderBy: { name: "asc" }
      }),
      prisma.expense.findMany({
        where,
        include: {
          branch: true,
          createdBy: true
        },
        orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }]
      })
    ]);

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
      branches: branches.map((branch) => ({
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
    const range = buildDashboardRange(query);
    const expenses = await prisma.expense.findMany({
      where: buildExpenseWhere(query, range),
      include: {
        branch: true,
        createdBy: true
      },
      orderBy: [{ expenseDate: "asc" }, { createdAt: "asc" }]
    });

    const totalAmount = expenses.reduce((sum, expense) => sum + parseDecimal(expense.amount), 0);
    const summaryRows = [
      ["Period", range.label],
      ["Start", range.start.toISOString()],
      ["End", range.end.toISOString()],
      ["Branch", query.branchId ? expenses[0]?.branch.name ?? "Selected branch" : "All branches"],
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
      Amount: parseDecimal(expense.amount),
      PaymentSource: expense.paymentSource,
      Vendor: expense.vendor ?? "",
      BillReference: expense.billReference ?? "",
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
    const safeBranch = query.branchId ? (expenses[0]?.branch.slug ?? "branch") : "all-branches";

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=\"pocket-expenses-${fileMonth}-${safeBranch}.xlsx\"`);
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
});

router.post("/expenses", async (req, res, next) => {
  try {
    const payload = expenseSchema.parse(req.body);
    const expense = await prisma.expense.create({
      data: {
        branchId: payload.branchId,
        createdById: req.user!.id,
        title: payload.title.trim(),
        category: payload.category.trim(),
        amount: payload.amount,
        paymentSource: payload.paymentSource,
        expenseDate: new Date(payload.expenseDate),
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
    const payload = expenseSchema.partial().parse(req.body);
    const expense = await prisma.expense.update({
      where: { id: req.params.id },
      data: {
        ...(payload.branchId ? { branchId: payload.branchId } : {}),
        ...(payload.title ? { title: payload.title.trim() } : {}),
        ...(payload.category ? { category: payload.category.trim() } : {}),
        ...(typeof payload.amount === "number" ? { amount: payload.amount } : {}),
        ...(payload.paymentSource ? { paymentSource: payload.paymentSource } : {}),
        ...(payload.expenseDate ? { expenseDate: new Date(payload.expenseDate) } : {}),
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

router.delete("/expenses/:id", async (req, res, next) => {
  try {
    const expense = await prisma.expense.findUnique({
      where: { id: req.params.id }
    });

    if (!expense) {
      return res.status(404).json({ message: "Expense not found." });
    }

    await prisma.expense.delete({
      where: { id: expense.id }
    });

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
      include: { role: true },
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
    const username = (payload.username?.trim().toLowerCase() || buildUniqueUsername(payload.email || payload.name)).trim();
    const email = payload.email?.trim().toLowerCase() || `${username}@pocket.local`;
    const user = await prisma.user.create({
      data: {
        roleId: role.id,
        name: payload.name.trim(),
        username,
        email,
        phone: payload.phone?.trim() || null,
        passwordHash,
        isActive: payload.isActive ?? true,
        canAccessAdmin: payload.canAccessAdmin ?? true,
        canAccessPos: payload.canAccessPos ?? true
      },
      include: { role: true }
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
        roleCode: user.role.code
      }
    });

    return res.status(201).json({ user: serializeManagedUser(user) });
  } catch (error) {
    return next(error);
  }
});

router.patch("/users/:id", async (req, res, next) => {
  try {
    const payload = userPatchSchema.parse(req.body);
    const current = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { role: true }
    });

    if (!current) {
      return res.status(404).json({ message: "User not found." });
    }

    const role =
      payload.roleCode !== undefined ? await prisma.role.findUniqueOrThrow({ where: { code: payload.roleCode as RoleCode } }) : null;

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
        ...(payload.canAccessAdmin !== undefined ? { canAccessAdmin: payload.canAccessAdmin } : {}),
        ...(payload.canAccessPos !== undefined ? { canAccessPos: payload.canAccessPos } : {}),
        ...(payload.password !== undefined ? { passwordHash: await hashPassword(payload.password) } : {})
      },
      include: { role: true }
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "user.update",
      entityType: "user",
      entityId: user.id,
      payload
    });

    return res.json({ user: serializeManagedUser(user) });
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

router.get("/coupons", async (_req, res) => {
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
  return res.json({ coupons });
});

router.post("/coupons", async (req, res, next) => {
  try {
    const payload = couponSchema.parse(req.body);
    const coupon = await prisma.coupon.create({
      data: {
        ...payload,
        code: payload.code.toUpperCase(),
        expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : undefined
      }
    });
    return res.status(201).json({ coupon });
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

router.get("/notifications", async (_req, res) => {
  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: 20
  });
  return res.json({ notifications });
});

export default router;
