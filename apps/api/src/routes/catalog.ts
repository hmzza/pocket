import { Router } from "express";
import { DiscountType, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

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

export default router;
