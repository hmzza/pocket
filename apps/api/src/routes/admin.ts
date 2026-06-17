import { Router } from "express";
import { OrderStatus, Prisma, RoleCode } from "@prisma/client";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { writeAuditLog } from "../lib/audit.js";

const router = Router();

router.use(authenticate, authorize(RoleCode.ADMIN, RoleCode.SUPER_ADMIN));

const dashboardQuerySchema = z
  .object({
    preset: z.enum(["today", "7d", "30d", "month", "year", "custom"]).default("7d"),
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional()
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

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
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
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        preset: query.preset,
        start,
        end: now,
        label: "This month"
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

router.patch("/orders/:id/status", async (req, res, next) => {
  try {
    const payload = z.object({ status: z.nativeEnum(OrderStatus) }).parse(req.body);
    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: { status: payload.status }
    });

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
