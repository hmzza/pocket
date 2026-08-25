import { DiscountType, OrderChannel, OrderStatus, PaymentMethod, PaymentStatus, RoleCode, ServiceType, type Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { INVENTORY_TRANSACTION_OPTIONS, prisma } from "../lib/prisma.js";
import { generateOrderNumber, withGeneratedOrderNumber } from "../lib/order-number.js";
import { writeAuditLog } from "../lib/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { env } from "../config.js";
import { formatOrderForReceipt } from "../lib/pos-receipt.js";
import { signReceiptToken } from "../lib/receipt-token.js";
import { applyInventoryChanges, computeInventoryChanges, readInventoryData } from "../lib/inventory.js";
import { syncMealPairingOptions } from "../lib/meal-options.js";
import { resolveBranchContext } from "../lib/branch-context.js";
import { requirePermission } from "../lib/permissions.js";
import { readIndependencePromotion } from "../lib/promotions.js";
import { DELIVERY_AREA_KEYS, DELIVERY_CITY, getDeliveryArea, isDeliverySubsector } from "../lib/delivery.js";

const router = Router();

router.use(authenticate, authorize(RoleCode.SUPER_ADMIN, RoleCode.POS_STAFF), requirePermission("POS"));

const posProductInclude = {
  category: true,
  addOnGroups: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      options: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" as const }
      }
    }
  },
  bundleComponents: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      componentProduct: {
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true
        }
      }
    }
  },
  branchPricing: true
};

const selectionSchema = z.object({
  groupId: z.string().cuid(),
  optionIds: z.array(z.string().cuid()).default([])
});

const cartItemSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("product"),
    productId: z.string().cuid(),
    quantity: z.number().int().min(1).max(50),
    promotionFreeQuantity: z.number().int().min(0).max(50).optional(),
    note: z.string().max(240).optional(),
    selections: z
      .array(selectionSchema)
      .transform((selections) =>
        selections
          .map((selection) => ({
            groupId: selection.groupId,
            optionIds: [...new Set(selection.optionIds)]
          }))
          .filter((selection) => selection.optionIds.length > 0)
      )
      .default([])
  }),
  z.object({
    type: z.literal("manual"),
    name: z.string().min(1).max(80),
    description: z.string().max(200).optional(),
    quantity: z.number().int().min(1).max(50),
    unitPrice: z.number().nonnegative().max(100_000),
    note: z.string().max(240).optional()
  })
]);

const deliveryDetailsSchema = z.object({
  sector: z.enum(DELIVERY_AREA_KEYS as [string, ...string[]]),
  subsector: z.string().min(5).max(10),
  city: z.literal(DELIVERY_CITY),
  addressLine1: z.string().min(5).max(180),
  addressLine2: z.string().max(120).optional(),
  addressInstructions: z.string().max(240).optional(),
  orderInstructions: z.string().max(240).optional()
});

const checkoutSchema = z
  .object({
    branchId: z.string().cuid().optional(),
    serviceType: z.enum(["INSHOP", "TAKEAWAY", "FOODPANDA", "DELIVERY"]),
    paymentMethod: z.enum(["CASH", "CARD", "EASYPAISA", "JAZZCASH", "FOODPANDA_PAYOUT", "CASH_ON_DELIVERY"]),
    customerName: z.string().max(80).optional(),
    customerPhone: z.string().max(20).optional(),
    foodpandaOrderNumber: z.string().max(40).optional(),
    delivery: deliveryDetailsSchema.optional(),
    placedAt: z.string().datetime().optional(),
    discountType: z.enum(["NONE", "PERCENTAGE", "FIXED"]).default("NONE"),
    discountValue: z.number().min(0).max(100_000).default(0),
    items: z.array(cartItemSchema).min(1)
  })
  .superRefine((value, ctx) => {
    if (value.serviceType === "FOODPANDA" && !value.foodpandaOrderNumber?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["foodpandaOrderNumber"],
        message: "Foodpanda order number is required for Foodpanda orders."
      });
    }

    if (value.paymentMethod === "FOODPANDA_PAYOUT" && value.serviceType !== "FOODPANDA") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paymentMethod"],
        message: "Foodpanda payout can only be used for Foodpanda orders."
      });
    }

    if (value.serviceType === "DELIVERY") {
      if (!value.delivery) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["delivery"], message: "Delivery details are required for a delivery order." });
      } else if (!isDeliverySubsector(value.delivery.sector, value.delivery.subsector)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["delivery", "subsector"], message: "Choose a valid sub-sector for the selected sector." });
      }
      if (!value.customerName?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customerName"], message: "Customer name is required for delivery." });
      }
      if (!value.customerPhone?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customerPhone"], message: "WhatsApp number is required for delivery." });
      }
      if (value.paymentMethod !== "CASH_ON_DELIVERY") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["paymentMethod"], message: "Delivery orders use Cash on Delivery." });
      }
    }
  });

type CheckoutPayload = z.infer<typeof checkoutSchema>;
type ResolvedCheckoutPayload = CheckoutPayload & { branchId: string };

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function normalizePakistanWhatsAppNumber(value: string) {
  const digits = normalizePhone(value);
  const national = digits.startsWith("0092") ? digits.slice(4) : digits.startsWith("92") ? digits.slice(2) : digits.startsWith("0") ? digits.slice(1) : digits;
  return /^3\d{9}$/.test(national) ? `+92${national}` : null;
}

function buildDigitalReceiptUrl(order: { id: string; orderNumber: string }) {
  const token = signReceiptToken({ orderId: order.id, orderNumber: order.orderNumber });
  return `${env.WEB_URL}/receipt/${order.orderNumber}?token=${encodeURIComponent(token)}`;
}

function formatReceiptResponse(order: any) {
  return {
    ...formatOrderForReceipt(order),
    digitalReceiptUrl: buildDigitalReceiptUrl(order)
  };
}

function formatEditablePosOrder(order: any) {
  function buildSelections(item: any) {
    const groups = item.product?.addOnGroups ?? [];
    const groupByOptionId = new Map<string, string>();

    for (const group of groups) {
      for (const option of group.options ?? []) {
        groupByOptionId.set(option.id, group.id);
      }
    }

    const selections = new Map<string, string[]>();
    for (const addOn of item.addOns ?? []) {
      const groupId = groupByOptionId.get(addOn.optionId ?? "");
      if (!groupId) {
        continue;
      }

      const current = selections.get(groupId) ?? [];
      if (!current.includes(addOn.optionId)) {
        selections.set(groupId, [...current, addOn.optionId]);
      }
    }

    return Array.from(selections.entries()).map(([groupId, optionIds]) => ({
      groupId,
      optionIds
    }));
  }

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    branchId: order.branchId,
    customerName: order.customerName ?? "",
    customerPhone: order.customerPhone ?? "",
    serviceType: order.serviceType,
    paymentMethod: order.paymentMethod,
    discountType: order.manualDiscountType ?? "NONE",
    discountValue: Number(order.manualDiscountValue ?? 0),
    promotionName: order.promotionName ?? null,
    promotionDiscountAmount: order.promotionDiscountAmount == null ? null : Number(order.promotionDiscountAmount),
    foodpandaOrderNumber: order.foodpandaOrderNumber ?? "",
    items: order.items.map((item: any) => ({
      id: item.id,
      productId: item.productId ?? item.product?.id ?? null,
      productName: item.productName,
      categoryName: item.product?.category?.name ?? "Manual",
      quantity: Number(item.quantity),
      promotionFreeQuantity: Number(item.promotionFreeQuantity ?? 0),
      unitPrice: Number(item.unitPrice),
      customDescription: item.customDescription ?? null,
      note: item.note ?? null,
      bundleComponents: (item.bundleComponents ?? []).map((component: any) => ({
        productId: component.productId ?? "",
        productName: component.componentProductName,
        quantity: Number(component.quantity),
        sortOrder: component.sortOrder ?? undefined
      })),
      addOns: (item.addOns ?? []).map((addOn: any) => ({
        id: addOn.id,
        optionId: addOn.optionId ?? "",
        optionName: addOn.optionName,
        priceDelta: Number(addOn.priceDelta)
      })),
      selections: buildSelections(item),
      product: item.product
        ? {
            addOnGroups: (item.product.addOnGroups ?? []).map((group: any) => ({
              id: group.id,
              name: group.name,
              minSelect: group.minSelect,
              maxSelect: group.maxSelect,
              isRequired: group.isRequired,
              options: (group.options ?? []).map((option: any) => ({
                id: option.id,
                name: option.name,
                priceDelta: Number(option.priceDelta)
              }))
            }))
          }
        : null
    }))
  };
}

function getProductIds(items: CheckoutPayload["items"]) {
  return [
    ...new Set(
      items
        .filter((item): item is Extract<CheckoutPayload["items"][number], { type: "product" }> => item.type === "product")
        .map((item) => item.productId)
    )
  ];
}

function getBundleComponentProductIds(products: Array<{ bundleComponents?: Array<{ componentProductId: string }> }>) {
  return [
    ...new Set(products.flatMap((product) => (product.bundleComponents ?? []).map((component) => component.componentProductId)))
  ];
}

async function buildPosOrderPayload(payload: ResolvedCheckoutPayload) {
  await syncMealPairingOptions(prisma);
  const requestedProductIds = getProductIds(payload.items);
  const promotion = await readIndependencePromotion(prisma, payload.branchId);
  const productIds = [...new Set([
    ...requestedProductIds,
    ...(promotion.isActive && promotion.available && promotion.rewardProductId ? [promotion.rewardProductId] : [])
  ])];

  const [branch, products] = await Promise.all([
    prisma.branch.findFirst({
      where: { id: payload.branchId, isActive: true }
    }),
    prisma.product.findMany({
      where: {
        id: { in: productIds },
        isActive: true
      },
      include: {
        ...posProductInclude,
        branchPricing: {
          where: { branchId: payload.branchId }
        }
      }
    })
  ]);

  if (!branch) {
    throw Object.assign(new Error("Selected branch is unavailable."), { statusCode: 404 });
  }

  if (products.length !== productIds.length) {
    throw Object.assign(new Error("One or more selected products are unavailable."), { statusCode: 400 });
  }

  const productMap = new Map(products.map((product) => [product.id, product]));
  const inventoryProductIds = [...new Set([...productIds, ...getBundleComponentProductIds(products)])];
  const inventoryData = await readInventoryData(prisma, payload.branchId, inventoryProductIds);

  const normalizedItems = payload.items.map((item) => {
    if (item.type === "manual") {
      return {
        type: "manual" as const,
        productId: null,
        productName: item.name,
        customDescription: item.description?.trim() || null,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice.toFixed(2)),
        note: item.note?.trim() || null,
        addOns: [] as Array<{ optionId: string; optionName: string; priceDelta: number }>,
        bundleComponents: [] as Array<{ productId: string; productName: string; quantity: number }>,
        promotionFreeQuantity: 0
      };
    }

    const product = productMap.get(item.productId);
    if (!product) {
      throw Object.assign(new Error("Selected product is unavailable."), { statusCode: 400 });
    }

    const branchPricing = product.branchPricing[0];
    if (branchPricing && !branchPricing.isAvailable) {
      throw Object.assign(new Error(`${product.name} is not available for this branch.`), { statusCode: 400 });
    }

    const inactiveBundleComponent = product.bundleComponents.find((component) => !component.componentProduct.isActive);
    if (inactiveBundleComponent) {
      throw Object.assign(new Error(`${product.name}: one or more bundle items are unavailable.`), { statusCode: 400 });
    }

    const productAddOnGroups = product.slug === "loaded-fries"
      ? product.addOnGroups.filter((group) => group.name !== "Extras")
      : product.addOnGroups;
    const groups = new Map(productAddOnGroups.map((group) => [group.id, group]));
    const selectedGroups = new Map(item.selections.map((selection) => [selection.groupId, selection.optionIds]));
    const lineAddOns: Array<{ optionId: string; optionName: string; priceDelta: number }> = [];

    for (const group of productAddOnGroups) {
      const selectedOptionIds = selectedGroups.get(group.id) ?? [];
      if (selectedOptionIds.length < group.minSelect || selectedOptionIds.length > group.maxSelect) {
        throw Object.assign(new Error(`${product.name}: ${group.name} requires ${group.minSelect} to ${group.maxSelect} selections.`), { statusCode: 400 });
      }

      const dedupedOptionIds = [...new Set(selectedOptionIds)];
      for (const optionId of dedupedOptionIds) {
        const option = group.options.find((entry) => entry.id === optionId);
        if (!option) {
          throw Object.assign(new Error(`${product.name}: invalid add-on selection.`), { statusCode: 400 });
        }

        lineAddOns.push({
          optionId: option.id,
          optionName: option.name,
          priceDelta: Number(option.priceDelta)
        });
      }
    }

    for (const selection of item.selections) {
      if (!groups.has(selection.groupId)) {
        throw Object.assign(new Error(`${product.name}: invalid add-on group.`), { statusCode: 400 });
      }
    }

    const baseUnitPrice = Number((branchPricing?.price ?? product.basePrice).toString());
    const addOnTotal = lineAddOns.reduce((sum, addOn) => sum + addOn.priceDelta, 0);
    const bundleComponents = (product.bundleComponents ?? []).map((component) => ({
      productId: component.componentProduct.id,
      productName: component.componentProduct.name,
      quantity: component.quantity * item.quantity
    }));

    return {
      type: "product" as const,
      productId: product.id,
      productName: product.name,
      customDescription: null,
      quantity: item.quantity,
      unitPrice: Number((baseUnitPrice + addOnTotal).toFixed(2)),
      note: item.note?.trim() || null,
      addOns: lineAddOns,
      bundleComponents,
      promotionFreeQuantity: Math.min(item.promotionFreeQuantity ?? 0, item.quantity)
    };
  });

  let appliedPromotionName: string | null = null;
  let promotionDiscountAmount = 0;
  if (promotion.isActive && promotion.available && promotion.rewardProductId && (payload.serviceType === "INSHOP" || payload.serviceType === "TAKEAWAY")) {
    const eligibleShawarmaQuantity = normalizedItems.reduce((total, item) => {
      if (item.type !== "product") return total;
      const product = productMap.get(item.productId);
      return product?.category.slug === "shawarma" ? total + item.quantity : total;
    }, 0);
    const freeQuantity = Math.floor(eligibleShawarmaQuantity / promotion.threshold);
    const rewardProduct = productMap.get(promotion.rewardProductId);
    const rewardPricing = rewardProduct?.branchPricing[0];
    const rewardUnitPrice = rewardProduct ? Number((rewardPricing?.price ?? rewardProduct.basePrice).toString()) : 0;
    const rewardHasRequiredSelections = Boolean(rewardProduct?.addOnGroups.some((group) => group.name !== "Extras" && group.minSelect > 0));

    if (rewardProduct && !rewardHasRequiredSelections) {
      const plainRewardIndexes = normalizedItems
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.type === "product" && item.productId === rewardProduct.id && item.addOns.length === 0)
        .map(({ index }) => index);
      const plainRewardIndex = plainRewardIndexes[0];
      const currentFreeQuantity = plainRewardIndexes.reduce((sum, index) => sum + normalizedItems[index]!.promotionFreeQuantity, 0);
      const currentPaidQuantity = plainRewardIndexes.reduce((sum, index) => sum + Math.max(0, normalizedItems[index]!.quantity - normalizedItems[index]!.promotionFreeQuantity), 0);

      if (plainRewardIndex !== undefined && freeQuantity > 0) {
        const rewardLine = normalizedItems[plainRewardIndex]!;
        rewardLine.quantity = currentPaidQuantity + freeQuantity;
        rewardLine.promotionFreeQuantity = freeQuantity;
        for (const index of plainRewardIndexes.slice(1).reverse()) normalizedItems.splice(index, 1);
      } else if (freeQuantity > 0) {
        normalizedItems.push({
          type: "product",
          productId: rewardProduct.id,
          productName: rewardProduct.name,
          customDescription: null,
          quantity: freeQuantity,
          unitPrice: Number(rewardUnitPrice.toFixed(2)),
          note: null,
          addOns: [],
          bundleComponents: rewardProduct.bundleComponents.map((component) => ({
            productId: component.componentProduct.id,
            productName: component.componentProduct.name,
            quantity: component.quantity * freeQuantity
          })),
          promotionFreeQuantity: freeQuantity
        });
      } else if (plainRewardIndex !== undefined && currentFreeQuantity > 0) {
        const rewardLine = normalizedItems[plainRewardIndex]!;
        rewardLine.quantity = currentPaidQuantity;
        rewardLine.promotionFreeQuantity = 0;
        for (const index of plainRewardIndexes.slice(1).reverse()) normalizedItems.splice(index, 1);
      }
      if (freeQuantity > 0) {
        appliedPromotionName = promotion.name;
        promotionDiscountAmount = Number((freeQuantity * rewardUnitPrice).toFixed(2));
      }
    }
  } else {
    for (const item of normalizedItems) {
      if (item.type === "product" && item.promotionFreeQuantity > 0) {
        item.quantity = Math.max(0, item.quantity - item.promotionFreeQuantity);
        item.promotionFreeQuantity = 0;
      }
    }
    for (let index = normalizedItems.length - 1; index >= 0; index--) {
      if (normalizedItems[index]!.quantity <= 0) normalizedItems.splice(index, 1);
    }
  }

  const subtotal = Number(
    normalizedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0).toFixed(2)
  );
  const manualDiscountAmount =
    payload.discountType === "PERCENTAGE"
      ? Number(((subtotal * payload.discountValue) / 100).toFixed(2))
      : payload.discountType === "FIXED"
        ? Number(payload.discountValue.toFixed(2))
        : 0;
  const safeDiscountAmount = appliedPromotionName
    ? Math.min(subtotal, promotionDiscountAmount)
    : Math.min(subtotal, manualDiscountAmount);
  const totalAmount = Number(Math.max(0, subtotal - safeDiscountAmount).toFixed(2));

  const consumeChanges = computeInventoryChanges({
    productIngredients: inventoryData.productIngredients,
    packagingRules: inventoryData.packagingRules,
    products: inventoryData.products,
    branchInventories: inventoryData.branchInventories,
    items: normalizedItems,
    mode: "consume",
    serviceType: payload.serviceType
  });

  return {
    branch,
    productIds,
    normalizedItems,
    subtotal,
    discountAmount: safeDiscountAmount,
    promotionName: appliedPromotionName,
    promotionDiscountAmount: appliedPromotionName ? safeDiscountAmount : 0,
    totalAmount,
    paidAmount: totalAmount,
    changeDueAmount: 0,
    consumeChanges
  };
}

function buildOrderItemCreateData(normalizedItems: Awaited<ReturnType<typeof buildPosOrderPayload>>["normalizedItems"]) {
  return normalizedItems.map((item) => ({
    productId: item.productId,
    productName: item.productName,
    customDescription: item.customDescription,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    promotionFreeQuantity: item.promotionFreeQuantity,
    note: item.note,
    bundleComponents: item.bundleComponents.length
      ? {
          create: item.bundleComponents.map((component) => ({
            productId: component.productId,
            componentProductName: component.productName,
            quantity: component.quantity,
            unitPrice: 0
          }))
        }
      : undefined,
    addOns: item.addOns.length
      ? {
          create: item.addOns.map((addOn) => ({
            optionId: addOn.optionId,
            optionName: addOn.optionName,
            priceDelta: addOn.priceDelta
          }))
        }
      : undefined
  }));
}

const posOrderInclude = {
  customer: {
    select: {
      id: true,
      name: true,
      phone: true
    }
  },
  branch: true,
  cashier: { select: { username: true, name: true } },
  items: {
    include: {
      addOns: true,
      bundleComponents: true,
      product: {
        select: {
          id: true,
          name: true,
          category: {
            select: {
              name: true
            }
          },
          addOnGroups: {
            orderBy: { sortOrder: "asc" as const },
            include: {
              options: {
                where: { isActive: true },
                orderBy: { sortOrder: "asc" as const }
              }
            }
          }
        }
      }
    }
  }
};

router.get("/catalog", async (req, res, next) => {
  try {
    const query = z
      .object({
        branchId: z.string().cuid().optional(),
        categoryId: z.string().cuid().optional(),
        search: z.string().optional()
      })
      .parse(req.query);

    const branchContext = await resolveBranchContext(req);
    const branches = branchContext.branches;
    const branchId = branchContext.branchId;
    await syncMealPairingOptions(prisma);
    const promotion = await readIndependencePromotion(prisma, branchId);

    const where: Prisma.ProductWhereInput = {
      isActive: true,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } }
            ]
          }
        : {})
    };

    const products = await prisma.product.findMany({
      where,
      include: {
        ...posProductInclude,
        branchPricing: branchId ? { where: { branchId } } : true
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }]
    });

    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" }
    });

    const posProducts = products.map((product) =>
      product.slug === "loaded-fries"
        ? {
            ...product,
            addOnGroups: product.addOnGroups.filter((group) => group.name !== "Extras")
          }
        : product
    );

    return res.json({ branches, branchId, categories, products: posProducts, promotion });
  } catch (error) {
    return next(error);
  }
});

router.get("/promotion", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const promotion = await readIndependencePromotion(prisma, branchContext.branchId);
    return res.json({ promotion });
  } catch (error) {
    return next(error);
  }
});

router.get("/orders/lookup", async (req, res, next) => {
  try {
    const query = z.object({ orderNumber: z.string().min(3).max(40) }).parse(req.query);
    const branchContext = await resolveBranchContext(req);
    const order = await prisma.order.findUnique({
      where: { orderNumber: query.orderNumber },
      include: posOrderInclude
    });

    if (!order || order.channel !== OrderChannel.POS || order.branchId !== branchContext.branchId) {
      return res.status(404).json({ message: "POS order not found." });
    }

    return res.json({
      order: formatReceiptResponse(order),
      editableOrder: formatEditablePosOrder(order)
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/orders/:orderId", async (req, res, next) => {
  const branchContext = await resolveBranchContext(req).catch((error) => {
    next(error);
    return null;
  });
  if (!branchContext) return;
  const order = await prisma.order.findUnique({
    where: { id: req.params.orderId },
    include: posOrderInclude
  });

  if (!order || order.channel !== OrderChannel.POS || order.branchId !== branchContext.branchId) {
    return res.status(404).json({ message: "POS order not found." });
  }

  return res.json({ order: formatReceiptResponse(order) });
});

router.get("/customers/lookup", async (req, res, next) => {
  try {
    const query = z.object({ phone: z.string().min(4).max(20) }).parse(req.query);
    const normalized = normalizePhone(query.phone);

    if (normalized.length < 4) {
      return res.json({ customer: null });
    }

    const orders = await prisma.order.findMany({
      where: {
        channel: OrderChannel.POS,
        customerPhone: {
          not: null
        }
      },
      select: {
        customerName: true,
        customerPhone: true,
        totalAmount: true,
        placedAt: true,
        items: {
          select: {
            productName: true,
            quantity: true
          }
        }
      },
      orderBy: { placedAt: "desc" },
      take: 200
    });

    const matched = orders.filter((order) => normalizePhone(order.customerPhone ?? "").endsWith(normalized.slice(-7)));
    if (!matched.length) {
      return res.json({ customer: null });
    }

    const latest = matched[0]!;
    return res.json({
      customer: {
        name: latest.customerName,
        phone: latest.customerPhone,
        totalOrders: matched.length,
        totalSpend: matched.reduce((sum, order) => sum + Number(order.totalAmount), 0),
        lastOrderDate: latest.placedAt,
        lastOrderSummary: latest.items.map((item) => `${item.quantity}x ${item.productName}`).join(", ")
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/checkout", async (req, res, next) => {
  try {
    const parsedPayload = checkoutSchema.parse(req.body);
    const branchContext = await resolveBranchContext(req);
    const payload: ResolvedCheckoutPayload = { ...parsedPayload, branchId: branchContext.branchId };
    const delivery = payload.serviceType === "DELIVERY" ? payload.delivery : undefined;
    const deliveryArea = delivery ? getDeliveryArea(delivery.sector) : null;
    if (delivery && !deliveryArea) {
      return res.status(400).json({ message: "Choose a supported delivery sector." });
    }
    const deliveryPhone = delivery ? normalizePakistanWhatsAppNumber(payload.customerPhone ?? "") : null;
    if (delivery && !deliveryPhone) {
      return res.status(400).json({ message: "Enter a valid Pakistani WhatsApp number, for example 0300 1234567." });
    }
    const paymentMethod =
      payload.serviceType === "FOODPANDA"
        ? PaymentMethod.FOODPANDA_PAYOUT
        : (payload.paymentMethod as PaymentMethod);
    const orderPayload = await buildPosOrderPayload(payload);

    // Run every independent read in parallel instead of serially. On a remote
    // database each query is a full network round-trip (~200ms+), so collapsing
    // branch validation, product/pricing lookup, order-number generation, and
    // inventory reads into one batch removes several round-trips from checkout.
    const initialOrderNumber = await generateOrderNumber();

    const { orderNumber, result: order } = await withGeneratedOrderNumber((orderNumber) =>
      prisma.$transaction(async (transaction) => {
        const address = delivery
          ? await transaction.address.create({
              data: {
                label: "Delivery",
                addressLine1: delivery.addressLine1.trim(),
                addressLine2: delivery.addressLine2?.trim() || null,
                city: DELIVERY_CITY,
                instructions: delivery.addressInstructions?.trim() || null
              }
            })
          : null;
        const createdOrder = await transaction.order.create({
          data: {
            orderNumber,
            branchId: payload.branchId,
            customerName: payload.customerName?.trim() || null,
            customerPhone: deliveryPhone ?? (payload.customerPhone?.trim() || null),
            foodpandaOrderNumber: payload.serviceType === "FOODPANDA" ? payload.foodpandaOrderNumber?.trim() || null : null,
            channel: OrderChannel.POS,
            serviceType: payload.serviceType as ServiceType,
            status: delivery ? OrderStatus.PENDING : OrderStatus.CONFIRMED,
            paymentMethod,
            paymentStatus: delivery ? PaymentStatus.PENDING : PaymentStatus.UNSET,
            cashierId: req.user!.id,
            addressId: address?.id,
            placedAt: payload.placedAt ? new Date(payload.placedAt) : undefined,
            subtotal: orderPayload.subtotal,
            taxRate: 0,
            taxAmount: 0,
            deliveryFee: deliveryArea?.fee ?? 0,
            discountAmount: orderPayload.discountAmount,
            manualDiscountType: orderPayload.promotionName ? null : (payload.discountType === "NONE" ? null : (payload.discountType as DiscountType)),
            manualDiscountValue: orderPayload.promotionName ? null : (payload.discountType === "NONE" ? null : payload.discountValue),
            promotionName: orderPayload.promotionName,
            promotionDiscountAmount: orderPayload.promotionDiscountAmount,
            cashReceivedAmount: delivery ? null : orderPayload.paidAmount,
            changeDueAmount: orderPayload.changeDueAmount,
            totalAmount: Number((orderPayload.totalAmount + (deliveryArea?.fee ?? 0)).toFixed(2)),
            deliveryInstructions: delivery?.orderInstructions?.trim() || null,
            deliverySector: delivery?.sector ?? null,
            deliverySubsector: delivery?.subsector ?? null,
            items: {
              create: buildOrderItemCreateData(orderPayload.normalizedItems)
            }
          },
          include: posOrderInclude
        });

        await applyInventoryChanges({
          transaction,
          changes: orderPayload.consumeChanges,
          orderId: createdOrder.id,
          actorId: req.user!.id,
          mode: "consume"
        });

        return createdOrder;
      }, INVENTORY_TRANSACTION_OPTIONS),
      initialOrderNumber
    );

    // The audit log is not awaited, so it never blocks the cashier response.
    // Failures are logged, not surfaced.
    void writeAuditLog({
      actorId: req.user!.id,
      action: "pos.checkout",
      entityType: "order",
      entityId: order.id,
        payload: {
          orderNumber,
          branchId: payload.branchId,
          itemCount: payload.items.length,
          paymentMethod
        }
      }).catch((auditError) => {
      console.error("Failed to write POS checkout audit log", auditError);
    });

    return res.status(201).json({
      order: formatReceiptResponse(order)
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/orders/:orderId", async (req, res, next) => {
  try {
    const parsedPayload = checkoutSchema.parse(req.body);
    const branchContext = await resolveBranchContext(req);
    const payload: ResolvedCheckoutPayload = { ...parsedPayload, branchId: branchContext.branchId };
    const paymentMethod =
      payload.serviceType === "FOODPANDA"
        ? PaymentMethod.FOODPANDA_PAYOUT
        : (payload.paymentMethod as PaymentMethod);
    const existingOrder = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      include: {
        items: {
          include: {
            addOns: true,
            bundleComponents: true
          }
        }
      }
    });

    if (!existingOrder || existingOrder.channel !== OrderChannel.POS) {
      return res.status(404).json({ message: "POS order not found." });
    }

    if (existingOrder.branchId !== payload.branchId) {
      return res.status(400).json({ message: "Order branch cannot be changed while editing." });
    }

    const orderPayload = await buildPosOrderPayload(payload);
    const oldItems = existingOrder.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      customDescription: item.customDescription,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      note: item.note,
      bundleComponents: item.bundleComponents.map((component) => ({
        productId: component.productId,
        quantity: component.quantity
      })),
      addOns: item.addOns.map((addOn) => ({
        optionId: addOn.optionId ?? "",
        optionName: addOn.optionName,
        priceDelta: Number(addOn.priceDelta)
      }))
    }));
    const oldProductIds = [
      ...new Set(
        oldItems.flatMap((item) => [
          item.productId,
          ...(item.bundleComponents ?? []).map((component) => component.productId)
        ]).filter((value): value is string => Boolean(value))
      )
    ];
    const oldInventoryData = await readInventoryData(prisma, existingOrder.branchId, oldProductIds);
    const returnChanges = computeInventoryChanges({
      productIngredients: oldInventoryData.productIngredients,
      packagingRules: oldInventoryData.packagingRules,
      products: oldInventoryData.products,
      branchInventories: oldInventoryData.branchInventories,
      items: oldItems,
      mode: "return",
      serviceType: existingOrder.serviceType
    });

    const updatedOrder = await prisma.$transaction(async (transaction) => {
      await applyInventoryChanges({
        transaction,
        changes: returnChanges,
        orderId: existingOrder.id,
        actorId: req.user!.id,
        mode: "return"
      });

      await transaction.orderItemAddOn.deleteMany({
        where: {
          orderItem: {
            orderId: existingOrder.id
          }
        }
      });
      await transaction.orderItem.deleteMany({
        where: { orderId: existingOrder.id }
      });

      const order = await transaction.order.update({
        where: { id: existingOrder.id },
        data: {
          customerName: payload.customerName?.trim() || null,
          customerPhone: payload.customerPhone?.trim() || null,
          foodpandaOrderNumber: payload.serviceType === "FOODPANDA" ? payload.foodpandaOrderNumber?.trim() || null : null,
          serviceType: payload.serviceType as ServiceType,
          status: OrderStatus.CONFIRMED,
          paymentMethod,
          paymentStatus: PaymentStatus.UNSET,
          cashierId: req.user!.id,
          // Preserve the original punch time when a paid POS order is edited.
          placedAt: existingOrder.placedAt,
          subtotal: orderPayload.subtotal,
          taxRate: 0,
          taxAmount: 0,
          deliveryFee: 0,
          discountAmount: orderPayload.discountAmount,
          manualDiscountType: orderPayload.promotionName ? null : (payload.discountType === "NONE" ? null : (payload.discountType as DiscountType)),
          manualDiscountValue: orderPayload.promotionName ? null : (payload.discountType === "NONE" ? null : payload.discountValue),
          promotionName: orderPayload.promotionName,
          promotionDiscountAmount: orderPayload.promotionDiscountAmount,
          cashReceivedAmount: orderPayload.paidAmount,
          changeDueAmount: orderPayload.changeDueAmount,
          totalAmount: orderPayload.totalAmount,
          deliveryInstructions: null,
          items: {
            create: buildOrderItemCreateData(orderPayload.normalizedItems)
          }
        },
        include: posOrderInclude
      });

      await applyInventoryChanges({
        transaction,
        changes: orderPayload.consumeChanges,
        orderId: existingOrder.id,
        actorId: req.user!.id,
        mode: "consume"
      });

      return order;
    }, INVENTORY_TRANSACTION_OPTIONS);

    void writeAuditLog({
      actorId: req.user!.id,
      action: "pos.order_update",
      entityType: "order",
      entityId: updatedOrder.id,
        payload: {
          orderNumber: updatedOrder.orderNumber,
          branchId: existingOrder.branchId,
          itemCount: payload.items.length,
          paymentMethod
        }
      }).catch((auditError) => {
      console.error("Failed to write POS order update audit log", auditError);
    });

    return res.json({
      order: formatReceiptResponse(updatedOrder)
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
