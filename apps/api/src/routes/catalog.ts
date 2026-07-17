import { Router } from "express";
import { DiscountType, OrderChannel, PaymentMethod, PaymentStatus, Prisma, RoleCode, ServiceType } from "@prisma/client";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { INVENTORY_TRANSACTION_OPTIONS, prisma } from "../lib/prisma.js";
import { buildUniqueUsername } from "../lib/username.js";
import { withGeneratedOrderNumber } from "../lib/order-number.js";
import { writeAuditLog } from "../lib/audit.js";
import { applyOrderInventory } from "../lib/inventory.js";
import { formatOrderForReceipt } from "../lib/pos-receipt.js";
import { verifyReceiptToken } from "../lib/receipt-token.js";

const router = Router();
const PUBLIC_HIDDEN_CATEGORY_SLUGS = ["add-ons"];
const PUBLIC_SETTING_KEYS = new Set(["store.contact"]);

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
  const [hero, whyPocket, testimonials, slider, featured, bestSellers, categories, branch, contact] = await Promise.all([
    prisma.cmsContent.findUnique({ where: { key: "homepage.hero" } }),
    prisma.cmsContent.findUnique({ where: { key: "homepage.why-pocket" } }),
    prisma.cmsContent.findUnique({ where: { key: "homepage.testimonials" } }),
    prisma.setting.findUnique({ where: { key: "homepage.slider" } }),
    prisma.product.findMany({
      where: { featured: true, isActive: true, category: { is: { slug: { notIn: PUBLIC_HIDDEN_CATEGORY_SLUGS } } } },
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
        branchPricing: true
      },
      take: 4
    }),
    prisma.product.findMany({
      where: { bestSeller: true, isActive: true, category: { is: { slug: { notIn: PUBLIC_HIDDEN_CATEGORY_SLUGS } } } },
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
        branchPricing: true
      },
      take: 4
    }),
    prisma.category.findMany({
      where: { isActive: true, slug: { notIn: PUBLIC_HIDDEN_CATEGORY_SLUGS } },
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
    heroImages: Array.isArray((slider?.value as any)?.images)
      ? (slider?.value as any).images
      : [
          { url: "/images/pocket-mai-rocket-shawarma.png", alt: "Pocket Mai Rocket" },
          { url: "/images/classic-shawarma.png", alt: "Classic Pocket" },
          { url: "/images/spicy-shawarma.png", alt: "Spicy Pocket" },
          { url: "/images/loaded-fries.png", alt: "Loaded Fries" }
        ],
    heroSliderIntervalMs: Number((slider?.value as any)?.intervalMs ?? 4500),
    featured,
    bestSellers,
    categories,
    branch,
    contact
  });
});

router.get("/categories", async (_req, res) => {
  const categories = await prisma.category.findMany({
    where: { isActive: true, slug: { notIn: PUBLIC_HIDDEN_CATEGORY_SLUGS } },
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
      AND: [
        { category: { is: { slug: { notIn: PUBLIC_HIDDEN_CATEGORY_SLUGS } } } },
        ...(category ? [{ category: { is: { slug: category } } }] : [])
      ],
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
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }]
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
        isActive: true,
        category: { is: { slug: { notIn: PUBLIC_HIDDEN_CATEGORY_SLUGS } } }
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
        category: { is: { slug: { notIn: PUBLIC_HIDDEN_CATEGORY_SLUGS } } },
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
  const settings = await prisma.setting.findMany({
    where: {
      key: {
        in: Array.from(PUBLIC_SETTING_KEYS)
      }
    }
  });
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
      valid: true,
      discount: Math.min(payload.subtotal, Number(discount.toFixed(2)))
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/track", async (req, res, next) => {
  let payload: { orderNumber: string; phone: string };
  try {
    payload = z
      .object({
        orderNumber: z.string().min(3).max(40),
        phone: z.string().min(4).max(20)
      })
      .parse(req.body);
  } catch (error) {
    return next(error);
  }

  const order = await prisma.order.findUnique({
    where: { orderNumber: payload.orderNumber },
    include: {
      items: {
        include: {
          addOns: true,
          bundleComponents: true
        }
      },
      branch: true,
      address: true
    }
  });

  if (!order) {
    return res.status(404).json({ message: "Order not found." });
  }

  const normalizedInputPhone = payload.phone.replace(/\D/g, "");
  const normalizedOrderPhone = (order.customerPhone ?? "").replace(/\D/g, "");
  if (!normalizedOrderPhone || normalizedInputPhone.slice(-7) !== normalizedOrderPhone.slice(-7)) {
    return res.status(404).json({ message: "Order not found." });
  }

  return res.json({
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      branch: {
        name: order.branch.name
      },
      expectedDeliveryAt: order.expectedDeliveryAt,
      totalAmount: Number(order.totalAmount),
      placedAt: order.placedAt,
      items: order.items.map((item) => ({
        id: item.id,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice)
      }))
    }
  });
});

router.get("/receipts/:orderNumber", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";

  if (!token) {
    return res.status(401).json({ message: "Receipt token is required." });
  }

  try {
    const payload = verifyReceiptToken(token);
    if (payload.orderNumber !== req.params.orderNumber) {
      return res.status(401).json({ message: "Invalid receipt token." });
    }

    const order = await prisma.order.findFirst({
      where: {
        id: payload.orderId,
        orderNumber: payload.orderNumber
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true
          }
        },
        branch: true,
        items: {
          include: {
            addOns: true,
            bundleComponents: true
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({ message: "Receipt not found." });
    }

    return res.json({ order: formatOrderForReceipt(order) });
  } catch {
    return res.status(401).json({ message: "Invalid receipt token." });
  }
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
              quantity: z.number().int().min(1).max(20),
              selectedAddOnIds: z.array(z.string().cuid()).default([])
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
        addOnGroups: {
          orderBy: { sortOrder: "asc" },
          include: {
            options: {
              where: { isActive: true },
              orderBy: { sortOrder: "asc" }
            }
          }
        },
        branchPricing: {
          where: { branchId: branch.id }
        }
      }
    });

    if (products.length !== payload.items.length) {
      return res.status(400).json({ message: "One or more items are unavailable." });
    }

    const productMap = new Map(products.map((product) => [product.id, product]));
    const normalizedItems = payload.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new Error("One or more items are unavailable.");
      }

      const selectedAddOnIds = [...new Set(item.selectedAddOnIds)];
      const addOns = product.addOnGroups.flatMap((group) => {
        const selectedOptions = group.options.filter((option) => selectedAddOnIds.includes(option.id));
        if (selectedOptions.length < group.minSelect || selectedOptions.length > group.maxSelect) {
          throw new Error(`${product.name}: ${group.name} requires ${group.minSelect} to ${group.maxSelect} selections.`);
        }

        return selectedOptions.map((option) => ({
          optionId: option.id,
          optionName: option.name,
          priceDelta: Number(option.priceDelta)
        }));
      });

      if (addOns.length !== selectedAddOnIds.length) {
        throw new Error(`${product.name}: invalid add-on selection.`);
      }

      const basePrice = Number(product.branchPricing[0]?.price ?? product.basePrice);
      const unitPrice = basePrice + addOns.reduce((sum, addOn) => sum + addOn.priceDelta, 0);

      return {
        ...item,
        product,
        addOns,
        unitPrice
      };
    });

    const subtotal = normalizedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

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

      customerId = existingCustomer.id;
    } else {
      const guestPasswordHash = await bcrypt.hash(`guest-${Date.now()}-${Math.random().toString(36).slice(2)}`, 12);
      const customer = await prisma.user.create({
        data: {
          roleId: role.id,
          name: payload.name,
          username: buildUniqueUsername(payload.email),
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

    const { orderNumber, result: order } = await withGeneratedOrderNumber((orderNumber) =>
      prisma.$transaction(async (transaction) => {
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
              create: normalizedItems.map((item) => {
                return {
                  productId: item.product.id,
                  productName: item.product.name,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  addOns: item.addOns.length
                    ? {
                        create: item.addOns.map((addOn) => ({
                          optionId: addOn.optionId,
                          optionName: addOn.optionName,
                          priceDelta: addOn.priceDelta
                        }))
                      }
                    : undefined
                };
              })
            }
          },
          include: {
            items: {
              include: {
                addOns: true,
                bundleComponents: true
              }
            },
            branch: true,
            address: true,
            customer: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true
              }
            }
          }
        });

        await applyOrderInventory({
          transaction,
          branchId: branch.id,
          orderId: createdOrder.id,
          actorId: customerId,
          items: createdOrder.items,
          mode: "consume",
          serviceType: ServiceType.DELIVERY
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
      }, INVENTORY_TRANSACTION_OPTIONS)
    );

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
