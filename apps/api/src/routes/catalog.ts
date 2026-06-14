import { Router } from "express";
import { DiscountType, OrderChannel, PaymentMethod, PaymentStatus, Prisma, RoleCode, ServiceType } from "@prisma/client";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { generateOrderNumber } from "../lib/order-number.js";
import { writeAuditLog } from "../lib/audit.js";

const router = Router();

const productInclude = {
  category: true,
  images: { orderBy: { sortOrder: "asc" as const } },
  addOnGroups: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      options: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" as const }
      }
    }
  },
  reviews: {
    where: { isApproved: true },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" as const }
  },
  branchPricing: {
    include: { branch: true }
  }
};

router.get("/content/home", async (_req, res) => {
  const [hero, whyPocket, testimonials, featured, bestSellers, categories, branch, contact] = await Promise.all([
    prisma.cmsContent.findUnique({ where: { key: "homepage.hero" } }),
    prisma.cmsContent.findUnique({ where: { key: "homepage.why-pocket" } }),
    prisma.cmsContent.findUnique({ where: { key: "homepage.testimonials" } }),
    prisma.product.findMany({
      where: { featured: true, isActive: true },
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
        branchPricing: true
      },
      take: 4
    }),
    prisma.product.findMany({
      where: { bestSeller: true, isActive: true },
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
        branchPricing: true
      },
      take: 4
    }),
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" }
    }),
    prisma.branch.findFirst({
      where: { isActive: true },
      include: { hours: { orderBy: { dayOfWeek: "asc" } } }
    }),
    prisma.setting.findUnique({ where: { key: "store.contact" } })
  ]);

  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=600");
  return res.json({
    hero,
    whyPocket,
    testimonials,
    featured,
    bestSellers,
    categories,
    branch,
    contact
  });
});

router.get("/categories", async (_req, res) => {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" }
  });
  return res.json({ categories });
});

router.get("/products", async (req, res, next) => {
  try {
    const querySchema = z.object({
      category: z.string().optional(),
      search: z.string().optional(),
      featured: z.coerce.boolean().optional(),
      bestSeller: z.coerce.boolean().optional(),
      branchSlug: z.string().optional()
    });

    const { category, search, featured, bestSeller, branchSlug } = querySchema.parse(req.query);
    const where: Prisma.ProductWhereInput = {
      isActive: true,
      ...(category ? { category: { is: { slug: category } } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } }
            ]
          }
        : {}),
      ...(featured === true ? { featured: true } : {}),
      ...(bestSeller === true ? { bestSeller: true } : {})
    };

    const products = await prisma.product.findMany({
      where,
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
        addOnGroups: {
          orderBy: { sortOrder: "asc" },
          include: {
            options: {
              where: { isActive: true },
              orderBy: { sortOrder: "asc" }
            }
          }
        },
        branchPricing: branchSlug
          ? {
              where: { branch: { is: { slug: branchSlug } } },
              include: { branch: true }
            }
          : true
      },
      orderBy: [
        { featured: "desc" },
        { bestSeller: "desc" },
        { createdAt: "desc" }
      ]
    });

    return res.json({ products });
  } catch (error) {
    return next(error);
  }
});

router.get("/products/:slug", async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { slug: req.params.slug },
    include: productInclude
  });

  if (!product) {
    return res.status(404).json({ message: "Product not found." });
  }

  const related = await prisma.product.findMany({
    where: {
      categoryId: product.categoryId,
      id: { not: product.id },
      isActive: true
    },
    include: {
      category: true,
      images: { orderBy: { sortOrder: "asc" } }
    },
    take: 4
  });

  return res.json({ product, related });
});

router.get("/search", async (req, res, next) => {
  try {
    const query = z.object({ q: z.string().min(1) }).parse(req.query);
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: query.q, mode: "insensitive" } },
          { description: { contains: query.q, mode: "insensitive" } },
          { category: { is: { name: { contains: query.q, mode: "insensitive" } } } }
        ]
      },
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" } }
      },
      take: 8
    });

    return res.json({ results: products });
  } catch (error) {
    return next(error);
  }
});

router.get("/branches", async (_req, res) => {
  const branches = await prisma.branch.findMany({
    where: { isActive: true },
    include: { hours: { orderBy: { dayOfWeek: "asc" } } }
  });
  return res.json({ branches });
});

router.get("/settings", async (_req, res) => {
  const settings = await prisma.setting.findMany();
  return res.json({
    settings: settings.reduce<Record<string, unknown>>((accumulator, item) => {
      accumulator[item.key] = item.value;
      return accumulator;
    }, {})
  });
});

router.post("/coupons/validate", async (req, res, next) => {
  try {
    const payload = z.object({ code: z.string().min(3), subtotal: z.coerce.number().nonnegative() }).parse(req.body);
    const coupon = await prisma.coupon.findUnique({ where: { code: payload.code.toUpperCase() } });

    if (!coupon || !coupon.isActive || (coupon.expiresAt && coupon.expiresAt < new Date())) {
      return res.status(404).json({ message: "Coupon is invalid or expired." });
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res.status(409).json({ message: "Coupon usage limit reached." });
    }

    if (coupon.minOrderValue && payload.subtotal < Number(coupon.minOrderValue)) {
      return res.status(409).json({ message: "Minimum order value not met." });
    }

    const discount =
      coupon.type === DiscountType.PERCENTAGE
        ? (payload.subtotal * Number(coupon.value)) / 100
        : Number(coupon.value);

    return res.json({
      coupon,
      discount
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/track/:orderNumber", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { orderNumber: req.params.orderNumber },
    include: {
      items: {
        include: {
          addOns: true
        }
      },
      branch: true,
      address: true
    }
  });

  if (!order) {
    return res.status(404).json({ message: "Order not found." });
  }

  return res.json({ order });
});

router.post("/checkout", async (req, res, next) => {
  try {
    const payload = z
      .object({
        name: z.string().min(2).max(80),
        phone: z.string().min(8).max(20),
        email: z.string().email(),
        branchSlug: z.string(),
        paymentMethod: z.nativeEnum(PaymentMethod),
        couponCode: z.string().optional(),
        deliveryInstructions: z.string().max(240).optional(),
        address: z.object({
          label: z.string().optional(),
          addressLine1: z.string().min(5),
          addressLine2: z.string().optional(),
          city: z.string().min(2),
          instructions: z.string().optional()
        }),
        items: z
          .array(
            z.object({
              productId: z.string().cuid(),
              quantity: z.number().int().min(1).max(20)
            })
          )
          .min(1)
      })
      .parse(req.body);

    const branch = await prisma.branch.findUniqueOrThrow({ where: { slug: payload.branchSlug } });
    const products = await prisma.product.findMany({
      where: {
        id: { in: payload.items.map((item) => item.productId) },
        isActive: true
      },
      include: {
        branchPricing: {
          where: { branchId: branch.id }
        }
      }
    });

    if (products.length !== payload.items.length) {
      return res.status(400).json({ message: "One or more items are unavailable." });
    }

    const productMap = new Map(products.map((product) => [product.id, product]));
    const subtotal = payload.items.reduce((sum, item) => {
      const product = productMap.get(item.productId);
      const price = Number(product?.branchPricing[0]?.price ?? product?.basePrice ?? 0);
      return sum + price * item.quantity;
    }, 0);

    let couponId: string | undefined;
    let discountAmount = 0;
    if (payload.couponCode) {
      const coupon = await prisma.coupon.findUnique({ where: { code: payload.couponCode.toUpperCase() } });
      if (coupon && coupon.isActive && (!coupon.expiresAt || coupon.expiresAt > new Date())) {
        if (!coupon.minOrderValue || subtotal >= Number(coupon.minOrderValue)) {
          couponId = coupon.id;
          discountAmount =
            coupon.type === DiscountType.PERCENTAGE
              ? (subtotal * Number(coupon.value)) / 100
              : Number(coupon.value);
        }
      }
    }

    const taxAmount = Number((subtotal * 0.12).toFixed(2));
    const deliveryFee = Number(branch.deliveryFee);
    const totalAmount = Math.max(0, subtotal + taxAmount + deliveryFee - discountAmount);

    const role = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.CUSTOMER } });
    const existingCustomer = await prisma.user.findFirst({
      where: {
        OR: [{ email: payload.email }, { phone: payload.phone }]
      },
      include: { role: true }
    });

    let customerId = existingCustomer?.id;
    if (existingCustomer) {
      if (existingCustomer.role.code !== RoleCode.CUSTOMER) {
        return res.status(409).json({ message: "Email or phone is already used by a staff account." });
      }

      await prisma.user.update({
        where: { id: existingCustomer.id },
        data: {
          name: payload.name,
          phone: payload.phone
        }
      });
    } else {
      const guestPasswordHash = await bcrypt.hash(`guest-${Date.now()}-${Math.random().toString(36).slice(2)}`, 12);
      const customer = await prisma.user.create({
        data: {
          roleId: role.id,
          name: payload.name,
          email: payload.email,
          phone: payload.phone,
          passwordHash: guestPasswordHash
        }
      });
      customerId = customer.id;
    }

    if (!customerId) {
      return res.status(500).json({ message: "Unable to create customer session." });
    }

    const address = await prisma.address.create({
      data: {
        userId: customerId,
        label: payload.address.label,
        addressLine1: payload.address.addressLine1,
        addressLine2: payload.address.addressLine2,
        city: payload.address.city,
        instructions: payload.address.instructions
      }
    });

    const orderNumber = await generateOrderNumber();
    const order = await prisma.$transaction(async (transaction) => {
      const createdOrder = await transaction.order.create({
        data: {
          orderNumber,
          customerId,
          branchId: branch.id,
          addressId: address.id,
          couponId,
          channel: OrderChannel.ONLINE,
          serviceType: ServiceType.DELIVERY,
          customerName: payload.name,
          customerPhone: payload.phone,
          paymentMethod: payload.paymentMethod,
          paymentStatus: payload.paymentMethod === PaymentMethod.CASH_ON_DELIVERY ? PaymentStatus.PENDING : PaymentStatus.PAID,
          subtotal,
          taxRate: 12,
          taxAmount,
          deliveryFee,
          discountAmount,
          totalAmount,
          expectedDeliveryAt: new Date(Date.now() + 35 * 60 * 1000),
          deliveryInstructions: payload.deliveryInstructions,
          items: {
            create: payload.items.map((item) => {
              const product = productMap.get(item.productId)!;
              const unitPrice = Number(product.branchPricing[0]?.price ?? product.basePrice);

              return {
                productId: product.id,
                productName: product.name,
                quantity: item.quantity,
                unitPrice
              };
            })
          }
        },
        include: {
          items: {
            include: {
              addOns: true
            }
          },
          branch: true,
          address: true,
          customer: true
        }
      });

      await transaction.notification.create({
        data: {
          type: "ORDER",
          title: "New order placed",
          message: `${orderNumber} requires confirmation.`,
          metadata: { orderNumber, branch: branch.slug }
        }
      });

      return createdOrder;
    });

    await writeAuditLog({
      actorId: customerId,
      action: "order.checkout.guest",
      entityType: "order",
      entityId: order.id,
      payload: { orderNumber, guest: true }
    });

    return res.status(201).json({ order });
  } catch (error) {
    return next(error);
  }
});

export default router;
