import { Router } from "express";
import { InventoryTransactionType, OrderStatus, Prisma, RoleCode } from "@prisma/client";
import { z } from "zod";
import * as XLSX from "xlsx";
import { authenticate, authorize } from "../middleware/auth.js";
import { INVENTORY_TRANSACTION_OPTIONS, prisma } from "../lib/prisma.js";
import { writeAuditLog } from "../lib/audit.js";
import { applyOrderInventory, recordInventoryChange } from "../lib/inventory.js";

const router = Router();

router.use(authenticate, authorize(RoleCode.ADMIN, RoleCode.SUPER_ADMIN));

const dashboardQueryBaseSchema = z.object({
  preset: z.enum(["today", "7d", "30d", "month", "year", "custom"]).default("7d"),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  monthKey: z.string().regex(/^\d{4}-\d{2}$/).optional()
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
    case "7d":
    default:
      return {
        preset: "7d" as const,
        start: startOfDay(addDays(now, -6)),
        end: now,
        label: "Last 7 days"
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

function buildIngredientSku(name: string) {
  const base = normalizeSku(name).slice(0, 18) || "ITEM";
  return `ING-${base}-${Date.now().toString(36).toUpperCase()}`;
}

function parseDecimal(value: Prisma.Decimal | number | string | null | undefined) {
  if (value == null) return 0;
  return Number(value);
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

    const [periodOrders, previousOrders, totalCustomers, lowStock] = await Promise.all([
      prisma.order.findMany({
        where: {
          placedAt: {
            gte: range.start,
            lte: range.end
          }
        },
        include: {
          customer: true,
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
          }
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
    const deliveredOrders = periodOrders.filter((order) => order.status === OrderStatus.DELIVERED).length;
    const cancelledOrders = periodOrders.filter((order) => order.status === OrderStatus.CANCELLED).length;

    const breakdownMaps = {
      statuses: new Map<string, { label: string; count: number; revenue: number }>(),
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
      const statusKey = order.status;
      const channelKey = order.channel;
      const serviceKey = order.serviceType;
      const paymentKey = order.paymentMethod;
      const branchKey = order.branch?.name ?? "Unknown branch";
      const weekdayKey = String(order.placedAt.getDay());
      const hourKey = String(order.placedAt.getHours());

      for (const [map, key, label] of [
        [breakdownMaps.statuses, statusKey, statusKey.replaceAll("_", " ")],
        [breakdownMaps.channels, channelKey, channelKey],
        [breakdownMaps.serviceTypes, serviceKey, serviceKey.replaceAll("_", " ")],
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
        label: range.label
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
        fulfilledRate: orderCount ? Number(((deliveredOrders / orderCount) * 100).toFixed(1)) : 0,
        cancellationRate: orderCount ? Number(((cancelledOrders / orderCount) * 100).toFixed(1)) : 0,
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
          status: order.status,
          totalAmount: Number(order.totalAmount),
          placedAt: order.placedAt,
          branch: order.branch?.name ?? "Unknown branch",
          channel: order.channel
        })),
      lowStock: lowStock.map((entry) => ({
        ingredient: entry.ingredient?.name ?? "Unknown ingredient",
        branch: entry.branch?.name ?? "Unknown branch",
        quantityOnHand: Number(entry.quantityOnHand)
      })),
      breakdowns: {
        statuses: Array.from(breakdownMaps.statuses.values()).sort((left, right) => right.count - left.count),
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

router.get("/analytics/sales", async (req, res, next) => {
  try {
    const query = dashboardQuerySchema.parse(req.query);
    const range = buildDashboardRange(query);
    const orders = await prisma.order.findMany({
      where: {
        placedAt: {
          gte: range.start,
          lte: range.end
        }
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
      branchPricing: { include: { branch: true } }
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }]
  });

  return res.json({ products });
});

const productSchema = z.object({
  categoryId: z.string().cuid(),
  slug: z.string().min(3),
  sku: z.string().min(3),
  name: z.string().min(3),
  description: z.string().min(10),
  ingredients: z.array(z.string()).default([]),
  basePrice: z.number().nonnegative(),
  calories: z.number().int().nonnegative().optional(),
  featured: z.boolean().default(false),
  bestSeller: z.boolean().default(false),
  isActive: z.boolean().default(true),
  stockStatus: z.string().default("IN_STOCK"),
  imageUrl: z.string().default("/images/shawarma-pocket.svg")
});

router.post("/products", async (req, res, next) => {
  try {
    const payload = productSchema.parse(req.body);
    const product = await prisma.$transaction(async (transaction) => {
      const createdProduct = await transaction.product.create({
        data: {
          categoryId: payload.categoryId,
          slug: payload.slug,
          sku: payload.sku,
          name: payload.name,
          description: payload.description,
          ingredients: payload.ingredients,
          basePrice: payload.basePrice,
          calories: payload.calories,
          featured: payload.featured,
          bestSeller: payload.bestSeller,
          isActive: payload.isActive,
          stockStatus: payload.stockStatus,
          images: {
            create: [
              {
                url: payload.imageUrl,
                alt: payload.name,
                sortOrder: 1
              }
            ]
          }
        },
        include: {
          category: true,
          images: true
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
    const { imageUrl, ...productPayload } = payload;
    const product = await prisma.$transaction(async (transaction) => {
      const updatedProduct = await transaction.product.update({
        where: { id: req.params.id },
        data: productPayload,
        include: { category: true, images: true }
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

    if (imageUrl) {
      const currentImage = await prisma.productImage.findFirst({
        where: { productId: product.id },
        orderBy: { sortOrder: "asc" }
      });

      if (currentImage) {
        await prisma.productImage.update({
          where: { id: currentImage.id },
          data: { url: imageUrl, alt: product.name }
        });
      } else {
        await prisma.productImage.create({
          data: {
            productId: product.id,
            url: imageUrl,
            alt: product.name,
            sortOrder: 1
          }
        });
      }
    }

    await writeAuditLog({
      actorId: req.user!.id,
      action: "product.update",
      entityType: "product",
      entityId: product.id,
      payload: { ...productPayload, imageUrl }
    });

    return res.json({ product });
  } catch (error) {
    return next(error);
  }
});

router.delete("/products/:id", async (req, res) => {
  await prisma.product.update({
    where: { id: req.params.id },
    data: { isActive: false }
  });

  await writeAuditLog({
    actorId: req.user!.id,
    action: "product.disable",
    entityType: "product",
    entityId: req.params.id
  });

  return res.status(204).send();
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
        search: z.string().optional()
      })
      .parse(req.query);

    const orders = await prisma.order.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
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
        customer: true,
        branch: true,
        address: true,
        items: {
          include: {
            addOns: true
          }
        }
      },
      orderBy: { placedAt: "desc" }
    });

    return res.json({ orders });
  } catch (error) {
    return next(error);
  }
});

router.delete("/orders", async (req, res, next) => {
  try {
    const deletedCount = await prisma.$transaction(async (transaction) => {
      const orders = await transaction.order.findMany({
        include: {
          items: {
            include: {
              addOns: true
            }
          }
        },
        orderBy: { placedAt: "asc" }
      });

      for (const order of orders) {
        if (order.status !== OrderStatus.CANCELLED) {
          await applyOrderInventory({
            transaction,
            branchId: order.branchId,
            orderId: order.id,
            actorId: req.user!.id,
            items: order.items,
            mode: "return"
          });
        }
      }

      const result = await transaction.order.deleteMany({});
      return result.count;
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
              addOns: true
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
              addOns: true
            }
          }
        }
      });

      if (!currentOrder) {
        throw new Error("Order not found.");
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
    include: {
      orders: {
        orderBy: { placedAt: "desc" }
      },
      addresses: true
    },
    orderBy: { createdAt: "desc" }
  });

  return res.json({
    customers: customers.map((customer) => ({
      ...customer,
      totalSpend: customer.orders.reduce((total, order) => total + Number(order.totalAmount), 0),
      lastOrderDate: customer.orders[0]?.placedAt ?? null,
      totalOrders: customer.orders.length
    }))
  });
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
