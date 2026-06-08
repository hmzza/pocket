import { Router } from "express";
import { OrderStatus, Prisma, RoleCode } from "@prisma/client";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { writeAuditLog } from "../lib/audit.js";

const router = Router();

router.use(authenticate, authorize(RoleCode.ADMIN, RoleCode.SUPER_ADMIN));

router.get("/dashboard", async (_req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [todayOrders, revenueAgg, totalCustomers, topProducts, recentOrders, lowStock, ordersByStatus] = await Promise.all([
    prisma.order.count({ where: { placedAt: { gte: today } } }),
    prisma.order.aggregate({
      _sum: { totalAmount: true },
      _avg: { totalAmount: true }
    }),
    prisma.user.count({ where: { role: { is: { code: RoleCode.CUSTOMER } } } }),
    prisma.orderItem.groupBy({
      by: ["productName"],
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5
    }),
    prisma.order.findMany({
      include: { customer: true, branch: true },
      orderBy: { placedAt: "desc" },
      take: 5
    }),
    prisma.branchInventory.findMany({
      where: { lowStockAlert: true },
      include: { branch: true, ingredient: true },
      take: 5
    }),
    prisma.order.groupBy({
      by: ["status"],
      _count: { _all: true }
    })
  ]);

  return res.json({
    kpis: {
      todayOrders,
      revenue: Number(revenueAgg._sum.totalAmount ?? 0),
      totalCustomers,
      averageOrderValue: Number(revenueAgg._avg.totalAmount ?? 0)
    },
    topProducts,
    recentOrders,
    lowStock,
    ordersByStatus
  });
});

router.get("/analytics/sales", async (_req, res) => {
  const orders = await prisma.order.findMany({
    select: {
      placedAt: true,
      totalAmount: true
    },
    orderBy: { placedAt: "asc" }
  });

  return res.json({
    sales: orders.map((order) => ({
      date: order.placedAt,
      revenue: Number(order.totalAmount)
    }))
  });
});

router.get("/products", async (_req, res) => {
  const products = await prisma.product.findMany({
    include: {
      category: true,
      images: { orderBy: { sortOrder: "asc" } },
      branchPricing: { include: { branch: true } }
    },
    orderBy: { createdAt: "desc" }
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
  prepTimeMinutes: z.number().int().min(1).max(120).default(20),
  spiceLevel: z.number().int().min(0).max(5).default(2),
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
          prepTimeMinutes: payload.prepTimeMinutes,
          spiceLevel: payload.spiceLevel,
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
                { customer: { is: { name: { contains: query.search, mode: "insensitive" } } } }
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
        userId: order.customerId,
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

router.get("/cms", async (_req, res) => {
  const blocks = await prisma.cmsContent.findMany({ orderBy: { key: "asc" } });
  return res.json({ blocks });
});

router.put("/cms/:key", async (req, res, next) => {
  try {
    const payload = z.object({
      title: z.string().min(2),
      content: z.any()
    }).parse(req.body);

    const cmsPayload = {
      title: payload.title,
      content: payload.content as Prisma.InputJsonValue
    };

    const block = await prisma.cmsContent.upsert({
      where: { key: req.params.key },
      update: cmsPayload,
      create: {
        key: req.params.key,
        ...cmsPayload
      }
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "cms.update",
      entityType: "cms_content",
      entityId: block.id,
      payload: cmsPayload
    });

    return res.json({ block });
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
