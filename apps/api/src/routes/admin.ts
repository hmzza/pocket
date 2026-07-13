import { Router } from "express";
import { InventoryTransactionType, OrderStatus, Prisma, RoleCode, ServiceType } from "@prisma/client";
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

function buildIngredientSku(name: string) {
  const base = normalizeSku(name).slice(0, 18) || "ITEM";
  return `ING-${base}-${Date.now().toString(36).toUpperCase()}`;
}

function buildProductSlug(name: string) {
  const base = normalizeSlug(name).slice(0, 40) || "product";
  return `${base}-${Date.now().toString(36)}`;
}

function buildProductSku(name: string) {
  const base = normalizeSku(name).slice(0, 18) || "ITEM";
  return `PRD-${base}-${Date.now().toString(36).toUpperCase()}`;
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
  quotedPrice: z.string().max(120).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal(""))
});

type VendorRecord = z.infer<typeof vendorSchema> & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

function readVendorSheetRows(): Promise<VendorRecord[]> {
  return Promise.resolve().then(async () => {
    try {
      const buffer = await readFile(VENDORS_WORKBOOK_PATH);
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0] ?? "Vendors"];
      if (!sheet) {
        return [] as VendorRecord[];
      }

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      return rows
        .map((row) => ({
          id: String(row.id ?? row.ID ?? randomUUID()),
          ingredientCategory: String(row.ingredientCategory ?? row["Ingredient / Category"] ?? "").trim(),
          vendorName: String(row.vendorName ?? row["Vendor Name"] ?? "").trim(),
          contactNumber: String(row.contactNumber ?? row["Contact Number"] ?? "").trim(),
          type: String(row.type ?? row["Type"] ?? "Vendor").trim() || "Vendor",
          quotedPrice: String(row.quotedPrice ?? row["Quoted Price"] ?? "").trim(),
          notes: String(row.notes ?? row["Notes"] ?? "").trim(),
          createdAt: String(row.createdAt ?? new Date().toISOString()),
          updatedAt: String(row.updatedAt ?? new Date().toISOString())
        }))
        .filter((row) => row.ingredientCategory.length && row.vendorName.length);
    } catch (readError) {
      if ((readError as NodeJS.ErrnoException).code === "ENOENT") {
        return [] as VendorRecord[];
      }
      throw readError;
    }
  });
}

async function writeVendorSheetRows(rows: VendorRecord[]) {
  await mkdir(path.dirname(VENDORS_WORKBOOK_PATH), { recursive: true });
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      id: row.id,
      ingredientCategory: row.ingredientCategory,
      vendorName: row.vendorName,
      contactNumber: row.contactNumber,
      type: row.type,
      quotedPrice: row.quotedPrice,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }))
  );
  XLSX.utils.book_append_sheet(workbook, sheet, "Vendors");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
  await writeFile(VENDORS_WORKBOOK_PATH, buffer);
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

function parseDecimal(value: Prisma.Decimal | number | string | null | undefined) {
  if (value == null) return 0;
  return Number(value);
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
    return { key: "INSHOP", label: "Inshop" };
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

router.get("/products", async (_req, res) => {
  const products = await prisma.product.findMany({
    include: {
      category: true,
      images: { orderBy: { sortOrder: "asc" } },
      bundleComponents: {
        orderBy: { sortOrder: "asc" },
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
      branchPricing: { include: { branch: true } }
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }]
  });

  return res.json({ products });
});

const productSchema = z.object({
  categoryId: z.string().cuid(),
  slug: z.string().trim().min(1).optional(),
  sku: z.string().trim().min(1).optional(),
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
    const sku = payload.sku ? normalizeSku(payload.sku) : buildProductSku(name);
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
    const { imageUrl, images, slug, sku, description, name, bundleComponents, ...productPayload } = payload;
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
          ...(sku ? { sku: normalizeSku(sku) } : {}),
          ...(description ? { description: description.trim() } : {}),
          ...(normalizedBundleComponents !== null
            ? {
                bundleComponents: {
                  deleteMany: {},
                  create: normalizedBundleComponents.map((component) => ({
                    componentProductId: component.componentProductId,
                    quantity: component.quantity,
                    sortOrder: component.sortOrder ?? 0
                  }))
                }
              }
            : {}),
          ...(nextImages
            ? {
                images: {
                  deleteMany: {},
                  create: nextImages
                }
              }
            : {})
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

      return updatedProduct;
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
    const orderItemCount = await prisma.orderItem.count({
      where: { productId }
    });

    if (orderItemCount === 0) {
      await prisma.product.delete({
        where: { id: productId }
      });

      await writeAuditLog({
        actorId: req.user!.id,
        action: "product.delete",
        entityType: "product",
        entityId: productId,
        payload: { mode: "deleted" }
      });

      return res.json({ mode: "deleted", message: "Product deleted." });
    }

    await prisma.product.update({
      where: { id: productId },
      data: { isActive: false }
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "product.disable",
      entityType: "product",
      entityId: productId,
      payload: { mode: "disabled", reason: "product is referenced in existing orders" }
    });

    return res.json({
      mode: "disabled",
      message: "Product is used in orders, so it was disabled instead of deleted."
    });
  } catch (error) {
    return next(error);
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

router.delete("/categories/:id", async (req, res) => {
  await prisma.category.update({
    where: { id: req.params.id },
    data: { isActive: false }
  });
  return res.status(204).send();
});

const inventoryQuerySchema = z.object({
  branchId: z.string().cuid().optional(),
  search: z.string().trim().optional(),
  lowStock: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => value === true || value === "true")
});

const inventoryItemSchema = z.object({
  branchId: z.string().cuid(),
  name: z.string().min(2).max(80),
  sku: z.string().min(3).max(40).optional(),
  unit: z.string().min(1).max(20),
  reorderLevel: z.number().nonnegative(),
  costPerUnit: z.number().nonnegative().default(0),
  openingStock: z.number().nonnegative().default(0)
});

const inventoryItemUpdateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  sku: z.string().min(3).max(40).optional(),
  unit: z.string().min(1).max(20).optional(),
  reorderLevel: z.number().nonnegative().optional(),
  costPerUnit: z.number().nonnegative().optional()
});

const inventoryMovementSchema = z
  .object({
    branchId: z.string().cuid(),
    ingredientId: z.string().cuid(),
    action: z.enum(["PURCHASE", "ADJUSTMENT", "WASTAGE", "RETURN", "CLOSING"]),
    quantity: z.number().optional(),
    countedQuantity: z.number().nonnegative().optional(),
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
  });

router.get("/inventory", async (req, res, next) => {
  try {
    const query = inventoryQuerySchema.parse(req.query);

    const itemWhere = {
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.lowStock ? { lowStockAlert: true } : {}),
      ...(query.search
        ? {
            OR: [
              { ingredient: { name: { contains: query.search, mode: "insensitive" as const } } },
              { ingredient: { sku: { contains: query.search, mode: "insensitive" as const } } }
            ]
          }
        : {})
    };

    const summaryWhere = query.branchId ? { branchId: query.branchId } : {};

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
          ingredient: true
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
      const normalizedSku = normalizeSku(payload.sku ?? buildIngredientSku(payload.name));
      const trimmedName = payload.name.trim();
      const existingIngredient = await transaction.ingredient.findFirst({
        where: {
          OR: [{ sku: normalizedSku }, { name: { equals: trimmedName, mode: "insensitive" } }]
        }
      });

      const createdIngredient = existingIngredient
        ? await transaction.ingredient.update({
            where: { id: existingIngredient.id },
            data: {
              name: trimmedName,
              sku: existingIngredient.sku,
              unit: payload.unit.trim(),
              reorderLevel: payload.reorderLevel,
              costPerUnit: payload.costPerUnit
            }
          })
        : await transaction.ingredient.create({
            data: {
              name: trimmedName,
              sku: normalizedSku,
              unit: payload.unit.trim(),
              reorderLevel: payload.reorderLevel,
              costPerUnit: payload.costPerUnit
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
        ...(payload.sku ? { sku: normalizeSku(payload.sku) } : {}),
        ...(payload.unit ? { unit: payload.unit.trim() } : {}),
        ...(typeof payload.reorderLevel === "number" ? { reorderLevel: payload.reorderLevel } : {}),
        ...(typeof payload.costPerUnit === "number" ? { costPerUnit: payload.costPerUnit } : {})
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
        referenceType: payload.action === "CLOSING" ? "DAILY_CLOSING" : "MANUAL"
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
          mode: "return"
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
            mode: "return"
          });
        }

        if (currentOrder.status === OrderStatus.CANCELLED && payload.status !== OrderStatus.CANCELLED) {
          await applyOrderInventory({
            transaction,
            branchId: currentOrder.branchId,
            orderId: currentOrder.id,
            actorId: req.user!.id,
            items: currentOrder.items,
            mode: "consume"
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
    const vendors = (await readVendorSheetRows()).sort((left, right) => {
      const categoryCompare = left.ingredientCategory.localeCompare(right.ingredientCategory);
      return categoryCompare !== 0 ? categoryCompare : left.vendorName.localeCompare(right.vendorName);
    });

    const categories = [...new Set(vendors.map((vendor) => vendor.ingredientCategory))].sort((left, right) =>
      left.localeCompare(right)
    );

    return res.json({ vendors, categories });
  } catch (error) {
    return next(error);
  }
});

router.post("/vendors", async (req, res, next) => {
  try {
    const payload = vendorSchema.parse(req.body);
    const vendors = await readVendorSheetRows();
    const vendor: VendorRecord = {
      id: randomUUID(),
      ingredientCategory: payload.ingredientCategory.trim(),
      vendorName: payload.vendorName.trim(),
      contactNumber: payload.contactNumber?.trim() || "",
      type: payload.type?.trim() || "Vendor",
      quotedPrice: payload.quotedPrice?.trim() || "",
      notes: payload.notes?.trim() || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    vendors.push(vendor);
    await writeVendorSheetRows(vendors);

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
    const vendors = await readVendorSheetRows();
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
      quotedPrice:
        payload.quotedPrice !== undefined ? payload.quotedPrice?.trim() || "" : current.quotedPrice ?? "",
      notes: payload.notes !== undefined ? payload.notes?.trim() || "" : current.notes ?? "",
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString()
    };

    vendors[index] = nextVendor;
    await writeVendorSheetRows(vendors);

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
    const vendors = await readVendorSheetRows();
    const nextVendors = vendors.filter((vendor) => vendor.id !== req.params.id);
    if (nextVendors.length === vendors.length) {
      return res.status(404).json({ message: "Vendor not found." });
    }

    await writeVendorSheetRows(nextVendors);
    await writeAuditLog({
      actorId: req.user!.id,
      action: "vendor.delete",
      entityType: "vendor",
      entityId: req.params.id,
      payload: { deleted: true }
    });

    return res.json({ deleted: true });
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
