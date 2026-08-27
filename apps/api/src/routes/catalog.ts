import { Router, type NextFunction, type Request, type Response } from "express";
import { DiscountType, OrderChannel, OrderStatus, PaymentMethod, PaymentStatus, Prisma, RoleCode, ServiceType } from "@prisma/client";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { INVENTORY_TRANSACTION_OPTIONS, prisma } from "../lib/prisma.js";
import { buildUniqueUsername } from "../lib/username.js";
import { withGeneratedOrderNumber } from "../lib/order-number.js";
import { writeAuditLog } from "../lib/audit.js";
import { applyOrderInventory } from "../lib/inventory.js";
import { formatOrderForReceipt } from "../lib/pos-receipt.js";
import { verifyReceiptToken } from "../lib/receipt-token.js";
import { DELIVERY_AREA_KEYS, DELIVERY_CITY, getDeliveryArea, isDeliverySubsector } from "../lib/delivery.js";
import { publishDeliveryOrderEvent } from "../lib/delivery-events.js";
import rateLimit from "express-rate-limit";
import { publicBranchPricingInclude, publicProductWhere, PUBLIC_HIDDEN_CATEGORY_SLUGS, resolvePublicBranch } from "../lib/public-catalog.js";

const router = Router();
const PUBLIC_SETTING_KEYS = new Set(["store.contact"]);
const DELIVERY_AVAILABILITY_SETTING_KEY = "store.delivery";
const reviewSubmissionCooldowns = new Map<string, number>();
const inFlightCheckoutKeys = new Set<string>();

function isOnlineDeliveryEnabled(value: unknown) {
  return !(
    value &&
    typeof value === "object" &&
    "enabled" in value &&
    (value as { enabled?: unknown }).enabled === false
  );
}

const publicCheckoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const phone = req.body && typeof req.body === "object" && typeof (req.body as Record<string, unknown>).phone === "string"
      ? String((req.body as Record<string, unknown>).phone).replace(/\D/g, "")
      : "";
    return phone || req.ip || "unknown";
  }
});

const checkoutIdempotency = (req: Request, res: Response, next: NextFunction) => {
  const requestKey = typeof req.get("Idempotency-Key") === "string" ? req.get("Idempotency-Key")!.trim() : "";
  if (!requestKey) return next();
  const key = `${req.ip}:${requestKey}`;
  if (inFlightCheckoutKeys.has(key)) {
    return res.status(409).json({ message: "This order is already being submitted. Please wait for the first attempt to finish." });
  }
  inFlightCheckoutKeys.add(key);
  res.on("finish", () => inFlightCheckoutKeys.delete(key));
  return next();
};

function normalizePakistanWhatsAppNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  const national = digits.startsWith("0092")
    ? digits.slice(4)
    : digits.startsWith("92")
      ? digits.slice(2)
      : digits.startsWith("0")
        ? digits.slice(1)
        : digits;

  return /^3\d{9}$/.test(national) ? `+92${national}` : null;
}

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

router.get("/content/home", async (req, res) => {
  const requestedBranchSlug = typeof req.query.branchSlug === "string" ? req.query.branchSlug : undefined;
  const branch = await resolvePublicBranch(requestedBranchSlug);
  if (!branch) return res.status(404).json({ message: "The selected branch is unavailable." });
  const branchId = branch.id;
  const [hero, whyPocket, testimonials, slider, featured, bestSellers, categories, contact, deliveryAvailability, customerReviews] = await Promise.all([
    prisma.cmsContent.findUnique({ where: { key: "homepage.hero" } }),
    prisma.cmsContent.findUnique({ where: { key: "homepage.why-pocket" } }),
    prisma.cmsContent.findUnique({ where: { key: "homepage.testimonials" } }),
    prisma.setting.findUnique({ where: { key: "homepage.slider" } }),
    prisma.product.findMany({
      where: { ...publicProductWhere(branchId), featured: true },
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
        branchPricing: publicBranchPricingInclude(branchId)
      },
      take: 4
    }),
    prisma.product.findMany({
      where: { ...publicProductWhere(branchId), bestSeller: true },
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
        branchPricing: publicBranchPricingInclude(branchId)
      },
      take: 4
    }),
    prisma.category.findMany({
      where: {
        isActive: true,
        slug: { notIn: PUBLIC_HIDDEN_CATEGORY_SLUGS },
        products: { some: publicProductWhere(branchId) }
      },
      orderBy: { sortOrder: "asc" }
    }),
    prisma.setting.findUnique({ where: { key: "store.contact" } }),
    prisma.setting.findUnique({ where: { key: DELIVERY_AVAILABILITY_SETTING_KEY } }),
    prisma.customerReview.findMany({
      where: { isApproved: true },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, authorName: true, rating: true, body: true, createdAt: true }
    })
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
    contact,
    deliveryEnabled: isOnlineDeliveryEnabled(deliveryAvailability?.value),
    customerReviews
  });
});

router.get("/storefront/status", async (_req, res, next) => {
  try {
    const deliveryAvailability = await prisma.setting.findUnique({ where: { key: DELIVERY_AVAILABILITY_SETTING_KEY } });
    res.setHeader("Cache-Control", "no-store");
    return res.json({ deliveryEnabled: isOnlineDeliveryEnabled(deliveryAvailability?.value) });
  } catch (error) {
    return next(error);
  }
});

router.post("/reviews", async (req, res, next) => {
  try {
    const source = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const nextAllowedAt = reviewSubmissionCooldowns.get(source) ?? 0;
    if (nextAllowedAt > now) {
      return res.status(429).json({ message: "Please wait a minute before submitting another review." });
    }

    const payload = z.object({
      authorName: z.string().trim().min(2).max(80),
      rating: z.number().int().min(1).max(5),
      body: z.string().trim().min(10).max(600)
    }).parse(req.body);
    const review = await prisma.customerReview.create({
      data: payload,
      select: { id: true, authorName: true, rating: true, body: true, isApproved: true, createdAt: true }
    });
    reviewSubmissionCooldowns.set(source, now + 60_000);

    return res.status(201).json({ review, message: "Thanks for your review. It will appear after approval." });
  } catch (error) {
    return next(error);
  }
});

router.get("/categories", async (req, res) => {
  const branchSlug = typeof req.query.branchSlug === "string" ? req.query.branchSlug : undefined;
  const branch = await resolvePublicBranch(branchSlug);
  if (!branch) return res.status(404).json({ message: "The selected branch is unavailable." });
  const categories = await prisma.category.findMany({
    where: {
      isActive: true,
      slug: { notIn: PUBLIC_HIDDEN_CATEGORY_SLUGS },
      products: { some: publicProductWhere(branch.id) }
    },
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
    const branch = await resolvePublicBranch(branchSlug);
    if (!branch) return res.status(404).json({ message: "The selected branch is unavailable." });
    const where: Prisma.ProductWhereInput = {
      ...publicProductWhere(branch.id),
      AND: [
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
        branchPricing: publicBranchPricingInclude(branch.id)
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }]
    });

    return res.json({ products });
  } catch (error) {
    return next(error);
  }
});

router.get("/products/:slug", async (req, res) => {
  const branchSlug = typeof req.query.branchSlug === "string" ? req.query.branchSlug : undefined;
  const branch = await resolvePublicBranch(branchSlug);
  if (!branch) return res.status(404).json({ message: "The selected branch is unavailable." });
  const product = await prisma.product.findUnique({
    where: { slug: req.params.slug },
    include: {
      ...productInclude,
      branchPricing: publicBranchPricingInclude(branch.id)
    }
  });

  if (!product || !product.isActive || !product.category.isActive || PUBLIC_HIDDEN_CATEGORY_SLUGS.includes(product.category.slug as any) || !product.branchPricing[0]?.isAvailable) {
    return res.status(404).json({ message: "Product not found." });
  }

  const related = await prisma.product.findMany({
      where: {
        categoryId: product.categoryId,
        id: { not: product.id },
        isActive: true,
        category: { is: { isActive: true, slug: { notIn: [...PUBLIC_HIDDEN_CATEGORY_SLUGS] } } },
        branchPricing: { some: { branchId: branch.id, isAvailable: true } }
      },
    include: {
      category: true,
      images: { orderBy: { sortOrder: "asc" } },
      branchPricing: publicBranchPricingInclude(branch.id)
    },
    take: 4
  });

  return res.json({ product, related });
});

router.get("/search", async (req, res, next) => {
  try {
    const query = z.object({ q: z.string().min(1), branchSlug: z.string().optional() }).parse(req.query);
    const branch = await resolvePublicBranch(query.branchSlug);
    if (!branch) return res.status(404).json({ message: "The selected branch is unavailable." });
    const products = await prisma.product.findMany({
      where: {
        ...publicProductWhere(branch.id),
        OR: [
          { name: { contains: query.q, mode: "insensitive" } },
          { description: { contains: query.q, mode: "insensitive" } },
          { category: { is: { name: { contains: query.q, mode: "insensitive" } } } }
        ]
      },
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
        branchPricing: publicBranchPricingInclude(branch.id)
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
    const payload = z.object({ code: z.string().min(3), subtotal: z.coerce.number().nonnegative(), branchSlug: z.string().min(1) }).parse(req.body);
    const branch = await resolvePublicBranch(payload.branchSlug);
    const coupon = branch ? await prisma.coupon.findUnique({ where: { branchId_code: { branchId: branch.id, code: payload.code.toUpperCase() } } }) : null;

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
      title: coupon.title,
      discount: Math.min(payload.subtotal, Number(discount.toFixed(2)))
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/track", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }), async (req, res, next) => {
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

  const normalizedInputPhone = normalizePakistanWhatsAppNumber(payload.phone);
  const normalizedOrderPhone = order.customerPhone ? normalizePakistanWhatsAppNumber(order.customerPhone) : null;
  if (!normalizedOrderPhone || normalizedInputPhone !== normalizedOrderPhone) {
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

router.post("/checkout", publicCheckoutLimiter, checkoutIdempotency, async (req, res, next) => {
  try {
    const payload = z
      .object({
        name: z.string().min(2).max(80),
        phone: z.string().min(8).max(24),
        branchSlug: z.string().min(1).max(100),
        paymentMethod: z.literal(PaymentMethod.CASH_ON_DELIVERY),
        deliverySector: z.enum(DELIVERY_AREA_KEYS as [string, ...string[]]),
        deliverySubsector: z.string().min(5).max(10),
        couponCode: z.string().trim().max(40).optional(),
        deliveryInstructions: z.string().max(240).optional(),
        address: z.object({
          label: z.string().optional(),
          addressLine1: z.string().trim().min(5).max(240),
          city: z.literal(DELIVERY_CITY),
          instructions: z.string().max(240).optional()
        }),
        items: z
          .array(
            z.object({
              // Product and option IDs are opaque database strings. Legacy
              // catalog rows use stable non-CUID IDs, which are still fully
              // verified against the selected branch below.
              productId: z.string().min(1).max(128),
              quantity: z.number().int().min(1).max(20),
              selectedAddOnIds: z.array(z.string().min(1).max(128)).max(20).default([])
            })
          )
          .min(1)
          .max(50)
          .refine((items) => items.reduce((sum, item) => sum + item.quantity, 0) <= 100, "Maximum 100 items per order.")
      })
      .parse(req.body);

    const customerPhone = normalizePakistanWhatsAppNumber(payload.phone);
    if (!customerPhone) {
      return res.status(400).json({ message: "Enter a valid Pakistani WhatsApp number, for example 0300 1234567." });
    }

    const deliveryArea = getDeliveryArea(payload.deliverySector);
    if (!deliveryArea) {
      return res.status(400).json({ message: "We currently deliver only to the listed sectors." });
    }
    if (!isDeliverySubsector(payload.deliverySector, payload.deliverySubsector)) {
      return res.status(400).json({ message: "Choose a valid sub-sector for your selected delivery sector." });
    }

    const branch = await resolvePublicBranch(payload.branchSlug);
    if (!branch) {
      return res.status(404).json({ message: "Pocket G-11 is unavailable right now." });
    }

    const deliveryAvailability = await prisma.setting.findUnique({ where: { key: DELIVERY_AVAILABILITY_SETTING_KEY } });
    if (!isOnlineDeliveryEnabled(deliveryAvailability?.value)) {
      return res.status(503).json({ message: "Online deliveries are temporarily unavailable. Please check back shortly." });
    }

    const requestedProductIds = [...new Set(payload.items.map((item) => item.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: requestedProductIds }, ...publicProductWhere(branch.id) },
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

    if (products.length !== requestedProductIds.length) {
      return res.status(400).json({ message: "One or more items are unavailable." });
    }

    const productMap = new Map(products.map((product) => [product.id, product]));
    const normalizedItems = payload.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new Error("One or more items are unavailable.");
      }
      if (!product.branchPricing[0] || !product.branchPricing[0].isAvailable) {
        throw Object.assign(new Error(`${product.name} is unavailable from the selected branch.`), { statusCode: 400 });
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

      const basePrice = Number(product.branchPricing[0].price);
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
    let couponUsageLimit: number | undefined;
    let discountAmount = 0;
    if (payload.couponCode) {
      const coupon = await prisma.coupon.findUnique({ where: { branchId_code: { branchId: branch.id, code: payload.couponCode.toUpperCase() } } });
      if (!coupon || !coupon.isActive || (coupon.expiresAt && coupon.expiresAt <= new Date())) {
        return res.status(400).json({ message: "Coupon is invalid or expired." });
      }
      if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
        return res.status(409).json({ message: "Coupon usage limit reached." });
      }
      if (coupon.minOrderValue && subtotal < Number(coupon.minOrderValue)) {
        return res.status(409).json({ message: "Minimum order value not met." });
      }
      couponId = coupon.id;
      couponUsageLimit = coupon.usageLimit ?? undefined;
      const calculatedDiscount = coupon.type === DiscountType.PERCENTAGE
        ? (subtotal * Number(coupon.value)) / 100
        : Number(coupon.value);
      discountAmount = Math.min(subtotal, Number(calculatedDiscount.toFixed(2)));
    }

    const taxAmount = 0;
    const deliveryFee = deliveryArea.fee;
    const totalAmount = Math.max(0, subtotal + taxAmount + deliveryFee - discountAmount);

    const role = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.CUSTOMER } });
    const existingCustomer = await prisma.user.findFirst({
      where: {
        phone: customerPhone
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
      const guestEmail = `delivery-${customerPhone.replace(/\D/g, "")}@guest.pocket.local`;
      const customer = await prisma.user.create({
        data: {
          roleId: role.id,
          name: payload.name,
          username: buildUniqueUsername(guestEmail),
          email: guestEmail,
          phone: customerPhone,
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
            status: OrderStatus.PENDING,
            customerName: payload.name,
            customerPhone,
            paymentMethod: payload.paymentMethod,
            paymentStatus: payload.paymentMethod === PaymentMethod.CASH_ON_DELIVERY ? PaymentStatus.PENDING : PaymentStatus.PAID,
            subtotal,
            taxRate: 0,
            taxAmount,
            deliveryFee,
            discountAmount,
            totalAmount,
            expectedDeliveryAt: new Date(Date.now() + 35 * 60 * 1000),
            deliveryInstructions: payload.deliveryInstructions,
            deliverySector: payload.deliverySector,
            deliverySubsector: payload.deliverySubsector,
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

        if (couponId) {
          const couponUpdate = await transaction.coupon.updateMany({
            where: {
              id: couponId,
              ...(couponUsageLimit ? { usedCount: { lt: couponUsageLimit } } : {})
            },
            data: { usedCount: { increment: 1 } }
          });
          if (couponUpdate.count !== 1) {
            throw Object.assign(new Error("Coupon usage limit reached."), { statusCode: 409 });
          }
        }

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
      action: "delivery.order_placed",
      entityType: "order",
      entityId: order.id,
      payload: { orderNumber, branchId: order.branchId, source: "website", guest: true }
    });

    publishDeliveryOrderEvent({
      branchId: order.branchId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      channel: order.channel,
      kind: "NEW"
    });

    return res.status(201).json({ order });
  } catch (error) {
    return next(error);
  }
});

export default router;
