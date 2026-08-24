import { Router } from "express";
import { DiscountType, OrderChannel, PaymentMethod, PaymentStatus, Prisma, RoleCode, ServiceType } from "@prisma/client";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { INVENTORY_TRANSACTION_OPTIONS, prisma } from "../lib/prisma.js";
import { buildUniqueUsername } from "../lib/username.js";
import { withGeneratedOrderNumber } from "../lib/order-number.js";
import { writeAuditLog } from "../lib/audit.js";
import { applyOrderInventory } from "../lib/inventory.js";
import { formatOrderForReceipt } from "../lib/pos-receipt.js";
import { verifyReceiptToken } from "../lib/receipt-token.js";
import { formatPakistanPhone, isPakistanMobile, normalizePakistanPhone, phonesMatchLoosely } from "../lib/phone.js";

const router = Router();
const PUBLIC_HIDDEN_CATEGORY_SLUGS = ["add-ons"];
const PUBLIC_SETTING_KEYS = new Set(["store.contact"]);

/**
 * Checkout is unauthenticated and creates a User row for each new guest
 * identity, so it is a cheaper target than the rest of the API. The global
 * limiter allows 500 requests per 15 minutes across every route, which is far
 * too generous for a write path that provisions accounts.
 */
const checkoutRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many order attempts. Please wait a few minutes and try again." }
});

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

  // Same last-7-digit tolerance as before, now via the shared helper so the
  // lookup agrees with how checkout stores the number.
  if (!phonesMatchLoosely(payload.phone, order.customerPhone)) {
    // Deliberately the same 404 as an unknown order number: confirming that an
    // order exists but the phone is wrong would turn this into an order-number
    // oracle for anyone guessing.
    return res.status(404).json({ message: "Order not found." });
  }

  return res.json({
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      serviceType: order.serviceType,
      branch: {
        name: order.branch.name,
        addressLine1: order.branch.addressLine1,
        phone: order.branch.phone
      },
      deliveryAddress:
        order.serviceType === ServiceType.DELIVERY && order.address
          ? { addressLine1: order.address.addressLine1, city: order.address.city }
          : null,
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

router.post("/checkout", checkoutRateLimit, async (req, res, next) => {
  try {
    const payload = z
      .object({
        name: z.string().trim().min(2).max(80),
        phone: z.string().trim().min(8).max(20),
        // Optional: phone is the identity key for a cash-on-delivery guest, and
        // requiring an email adds friction with nothing depending on it yet.
        email: z.string().email().optional().or(z.literal("")),
        branchSlug: z.string(),
        serviceType: z.enum([ServiceType.DELIVERY, ServiceType.TAKEAWAY]).default(ServiceType.DELIVERY),
        paymentMethod: z.nativeEnum(PaymentMethod),
        couponCode: z.string().optional(),
        deliveryInstructions: z.string().max(240).optional(),
        // Client-generated id used to collapse a double submit into one order.
        clientRequestId: z.string().trim().min(8).max(64).optional(),
        address: z
          .object({
            label: z.string().optional(),
            addressLine1: z.string().min(5),
            addressLine2: z.string().optional(),
            city: z.string().min(2),
            instructions: z.string().optional()
          })
          .optional(),
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
      .superRefine((value, context) => {
        if (value.serviceType === ServiceType.DELIVERY && !value.address) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A delivery address is required for delivery orders.",
            path: ["address"]
          });
        }
      })
      .parse(req.body);

    const customerPhone = normalizePakistanPhone(payload.phone);
    if (!isPakistanMobile(customerPhone)) {
      return res.status(400).json({
        message: "Enter a valid Pakistani mobile number, for example 0300 1234567. The rider will call you on it.",
        code: "CUSTOMER_PHONE_INVALID"
      });
    }

    const isDelivery = payload.serviceType === ServiceType.DELIVERY;
    const customerEmail = payload.email?.trim() ? payload.email.trim().toLowerCase() : null;

    // Collapse a double submit before doing any work. The unique index on
    // clientRequestId is the real guard against a race; this is the fast path
    // that hands back the original order instead of an error.
    if (payload.clientRequestId) {
      const existingOrder = await prisma.order.findUnique({
        where: { clientRequestId: payload.clientRequestId },
        include: { items: { include: { addOns: true, bundleComponents: true } }, branch: true, address: true }
      });
      if (existingOrder) {
        return res.status(200).json({ order: existingOrder, duplicate: true });
      }
    }

    // findUniqueOrThrow would surface as a 500 on a public endpoint; an unknown
    // or closed branch is a client error worth naming.
    const branch = await prisma.branch.findFirst({ where: { slug: payload.branchSlug, isActive: true } });
    if (!branch) {
      return res.status(400).json({ message: "This branch is not accepting online orders.", code: "BRANCH_UNAVAILABLE" });
    }

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
    // Takeaway is collected at the counter, so there is no delivery to charge for.
    const deliveryFee = isDelivery ? Number(branch.deliveryFee) : 0;
    const totalAmount = Math.max(0, subtotal + taxAmount + deliveryFee - discountAmount);

    const role = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.CUSTOMER } });
    // Match the canonical phone first, then the number exactly as typed, because
    // guest rows created before phone normalisation still hold raw formats.
    const existingCustomer = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: customerPhone },
          { phone: payload.phone },
          ...(customerEmail ? [{ email: customerEmail }] : [])
        ]
      },
      include: { role: true }
    });

    let customerId = existingCustomer?.id;
    if (existingCustomer) {
      if (existingCustomer.role.code !== RoleCode.CUSTOMER) {
        return res.status(409).json({
          message: "This phone number or email belongs to a staff account. Please use a different one.",
          code: "IDENTITY_BELONGS_TO_STAFF"
        });
      }

      customerId = existingCustomer.id;
    } else {
      const guestPasswordHash = await bcrypt.hash(`guest-${Date.now()}-${Math.random().toString(36).slice(2)}`, 12);
      const customer = await prisma.user.create({
        data: {
          roleId: role.id,
          name: payload.name,
          // Seed from the email when supplied, otherwise the phone. The username
          // only has to be unique and readable.
          username: buildUniqueUsername(customerEmail ?? customerPhone),
          // User.email is unique and non-null, so a guest who gave no email gets
          // a placeholder on a domain that cannot receive mail. Claiming the
          // account later replaces it with a real address.
          email: customerEmail ?? `guest.${customerPhone}@guest.invalid`,
          phone: customerPhone,
          passwordHash: guestPasswordHash
        }
      });
      customerId = customer.id;
    }

    if (!customerId) {
      return res.status(500).json({ message: "Unable to create customer session." });
    }

    // Takeaway has nowhere to deliver to, so no Address row is created.
    const address = payload.address
      ? await prisma.address.create({
          data: {
            userId: customerId,
            label: payload.address.label,
            addressLine1: payload.address.addressLine1,
            addressLine2: payload.address.addressLine2,
            city: payload.address.city,
            instructions: payload.address.instructions
          }
        })
      : null;

    const { orderNumber, result: order } = await withGeneratedOrderNumber((orderNumber) =>
      prisma.$transaction(async (transaction) => {
        const createdOrder = await transaction.order.create({
          data: {
            orderNumber,
            customerId,
            branchId: branch.id,
            addressId: address?.id ?? null,
            couponId,
            channel: OrderChannel.ONLINE,
            orderSource: "ONLINE",
            serviceType: payload.serviceType,
            clientRequestId: payload.clientRequestId ?? null,
            customerName: payload.name,
            customerPhone,
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
          // Was hardcoded to DELIVERY, which made a takeaway order consume
          // delivery packaging. PackagingRule is keyed on serviceType.
          serviceType: payload.serviceType
        });

        await transaction.notification.create({
          data: {
            type: "ORDER",
            title: isDelivery ? "New delivery order" : "New takeaway order",
            message: `${orderNumber} requires confirmation.`,
            metadata: {
              orderNumber,
              branch: branch.slug,
              serviceType: payload.serviceType,
              customerPhone: formatPakistanPhone(customerPhone)
            }
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
      payload: { orderNumber, guest: true, serviceType: payload.serviceType }
    });

    return res.status(201).json({ order });
  } catch (error) {
    return next(error);
  }
});

export default router;
