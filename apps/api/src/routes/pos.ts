import { DiscountType, OrderChannel, PaymentMethod, PaymentStatus, RoleCode, ServiceType, type Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { INVENTORY_TRANSACTION_OPTIONS, prisma } from "../lib/prisma.js";
import { withGeneratedOrderNumber } from "../lib/order-number.js";
import { writeAuditLog } from "../lib/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { applyOrderInventory } from "../lib/inventory.js";

const router = Router();

router.use(authenticate, authorize(RoleCode.ADMIN, RoleCode.SUPER_ADMIN, RoleCode.POS_STAFF));

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
  branchPricing: true
};

const paymentTaxDefaults: Record<PaymentMethod, number> = {
  CASH_ON_DELIVERY: 15,
  CASH: 15,
  EASYPAISA: 15,
  JAZZCASH: 15,
  CARD: 5
};

const FBR_REFERENCE_NUMBER = "8816692-5";

const selectionSchema = z.object({
  groupId: z.string().cuid(),
  optionIds: z.array(z.string().cuid()).default([])
});

const cartItemSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("product"),
    productId: z.string().cuid(),
    quantity: z.number().int().min(1).max(50),
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
    unitPrice: z.number().nonnegative(),
    note: z.string().max(240).optional()
  })
]);

const checkoutSchema = z.object({
  branchId: z.string().cuid(),
  serviceType: z.nativeEnum(ServiceType),
  paymentMethod: z.enum(["CASH", "CARD", "EASYPAISA", "JAZZCASH"]),
  customerName: z.string().max(80).optional(),
  customerPhone: z.string().max(20).optional(),
  taxRate: z.number().min(0).max(100),
  discountType: z.enum(["NONE", "PERCENTAGE", "FIXED"]).default("NONE"),
  discountValue: z.number().min(0).default(0),
  paidAmount: z.number().nonnegative(),
  note: z.string().max(240).optional(),
  items: z.array(cartItemSchema).min(1)
});

function formatOrderForReceipt(order: any) {
  const taxRate = Number(order.taxRate);
  const serviceFee = Number(order.deliveryFee ?? 0);
  const grossTotal = Number(order.subtotal);
  const discountAmount = Number(order.discountAmount);
  const totalTax = Number(order.taxAmount);
  const netTotal = Number(order.totalAmount);

  return {
    id: order.id,
    receiptNumber: order.orderNumber,
    orderNumber: order.orderNumber,
    fbrReferenceNumber: FBR_REFERENCE_NUMBER,
    posNo: "001",
    userId: order.cashierId ?? "Admin",
    channel: order.channel,
    serviceType: order.serviceType,
    orderType: order.serviceType,
    status: order.status,
    customerName: order.customerName ?? order.customer?.name ?? "Walk-in Customer",
    customerPhone: order.customerPhone ?? order.customer?.phone ?? null,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    createdAt: order.placedAt,
    subtotal: grossTotal,
    grossTotal,
    discountAmount,
    serviceFee,
    taxRate,
    totalTax,
    netTotal,
    totalAmount: netTotal,
    paidAmount: Number(order.cashReceivedAmount ?? order.totalAmount),
    changeDueAmount: Number(order.changeDueAmount ?? 0),
    placedAt: order.placedAt,
    branch: {
      id: order.branch.id,
      name: order.branch.name,
      addressLine1: order.branch.addressLine1,
      phone: order.branch.phone
    },
    items: order.items.map((item: any) => ({
      id: item.id,
      productName: item.productName,
      customDescription: item.customDescription ?? null,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      taxRate,
      taxAmount: Number((Number(item.unitPrice) * item.quantity * taxRate / 100).toFixed(2)),
      lineTotal: Number((Number(item.unitPrice) * item.quantity * (1 + taxRate / 100)).toFixed(2)),
      note: item.note ?? null,
      addOns: item.addOns.map((addOn: any) => ({
        id: addOn.id,
        optionName: addOn.optionName,
        priceDelta: Number(addOn.priceDelta)
      }))
    }))
  };
}

router.get("/catalog", async (req, res, next) => {
  try {
    const query = z
      .object({
        branchId: z.string().cuid().optional(),
        categoryId: z.string().cuid().optional(),
        search: z.string().optional()
      })
      .parse(req.query);

    const branches = await prisma.branch.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" }
    });
    const branchId = query.branchId ?? branches[0]?.id;

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

    return res.json({ branches, branchId, categories, products });
  } catch (error) {
    return next(error);
  }
});

router.get("/orders/:orderId", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.orderId },
    include: {
      customer: true,
      branch: true,
      items: {
        include: {
          addOns: true
        }
      }
    }
  });

  if (!order || order.channel !== OrderChannel.POS) {
    return res.status(404).json({ message: "POS order not found." });
  }

  return res.json({ order: formatOrderForReceipt(order) });
});

router.post("/checkout", async (req, res, next) => {
  try {
    const payload = checkoutSchema.parse(req.body);
    const branch = await prisma.branch.findFirst({
      where: { id: payload.branchId, isActive: true }
    });

    if (!branch) {
      return res.status(404).json({ message: "Selected branch is unavailable." });
    }

    const productItems = payload.items.filter((item) => item.type === "product");
    const products = await prisma.product.findMany({
      where: {
        id: { in: productItems.map((item) => item.productId) },
        isActive: true
      },
      include: {
        ...posProductInclude,
        branchPricing: {
          where: { branchId: payload.branchId }
        }
      }
    });

    if (products.length !== new Set(productItems.map((item) => item.productId)).size) {
      return res.status(400).json({ message: "One or more selected products are unavailable." });
    }

    const productMap = new Map(products.map((product) => [product.id, product]));

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
          addOns: [] as Array<{ optionId: string; optionName: string; priceDelta: number }>
        };
      }

      const product = productMap.get(item.productId);
      if (!product) {
        throw new Error("Selected product is unavailable.");
      }

      const branchPricing = product.branchPricing[0];
      if (branchPricing && !branchPricing.isAvailable) {
        throw new Error(`${product.name} is not available for this branch.`);
      }

      const groups = new Map(product.addOnGroups.map((group) => [group.id, group]));
      const selectedGroups = new Map(item.selections.map((selection) => [selection.groupId, selection.optionIds]));
      const lineAddOns: Array<{ optionId: string; optionName: string; priceDelta: number }> = [];

      for (const group of product.addOnGroups) {
        const selectedOptionIds = selectedGroups.get(group.id) ?? [];
        if (selectedOptionIds.length < group.minSelect || selectedOptionIds.length > group.maxSelect) {
          throw new Error(`${product.name}: ${group.name} requires ${group.minSelect} to ${group.maxSelect} selections.`);
        }

        const dedupedOptionIds = [...new Set(selectedOptionIds)];
        for (const optionId of dedupedOptionIds) {
          const option = group.options.find((entry) => entry.id === optionId);
          if (!option) {
            throw new Error(`${product.name}: invalid add-on selection.`);
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
          throw new Error(`${product.name}: invalid add-on group.`);
        }
      }

      const baseUnitPrice = Number((branchPricing?.price ?? product.basePrice).toString());
      const addOnTotal = lineAddOns.reduce((sum, addOn) => sum + addOn.priceDelta, 0);

      return {
        type: "product" as const,
        productId: product.id,
        productName: product.name,
        customDescription: null,
        quantity: item.quantity,
        unitPrice: Number((baseUnitPrice + addOnTotal).toFixed(2)),
        note: item.note?.trim() || null,
        addOns: lineAddOns
      };
    });

    const subtotal = Number(
      normalizedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0).toFixed(2)
    );
    const discountAmount =
      payload.discountType === "PERCENTAGE"
        ? Number(((subtotal * payload.discountValue) / 100).toFixed(2))
        : payload.discountType === "FIXED"
          ? Number(payload.discountValue.toFixed(2))
          : 0;
    const safeDiscountAmount = Math.min(subtotal, discountAmount);
    const taxableAmount = Math.max(0, subtotal - safeDiscountAmount);
    const taxAmount = Number(((taxableAmount * payload.taxRate) / 100).toFixed(2));
    const totalAmount = Number((taxableAmount + taxAmount).toFixed(2));
    const paidAmount = Number(payload.paidAmount.toFixed(2));
    const changeDueAmount = Number((paidAmount - totalAmount).toFixed(2));

    if (paidAmount < totalAmount) {
      return res.status(400).json({ message: "Paid amount must cover the order total." });
    }

    const { orderNumber, result: order } = await withGeneratedOrderNumber((orderNumber) =>
      prisma.$transaction(async (transaction) => {
        const createdOrder = await transaction.order.create({
          data: {
            orderNumber,
            branchId: payload.branchId,
            customerName: payload.customerName?.trim() || null,
            customerPhone: payload.customerPhone?.trim() || null,
            channel: OrderChannel.POS,
            serviceType: payload.serviceType,
            status: "CONFIRMED",
            paymentMethod: payload.paymentMethod as PaymentMethod,
            paymentStatus: PaymentStatus.PAID,
            cashierId: req.user!.id,
            subtotal,
            taxRate: payload.taxRate,
            taxAmount,
            deliveryFee: 0,
            discountAmount: safeDiscountAmount,
            manualDiscountType: payload.discountType === "NONE" ? null : (payload.discountType as DiscountType),
            manualDiscountValue: payload.discountType === "NONE" ? null : payload.discountValue,
            cashReceivedAmount: paidAmount,
            changeDueAmount,
            totalAmount,
            deliveryInstructions: payload.note?.trim() || null,
            items: {
              create: normalizedItems.map((item) => ({
                productId: item.productId,
                productName: item.productName,
                customDescription: item.customDescription,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                note: item.note,
                addOns: item.addOns.length
                  ? {
                      create: item.addOns.map((addOn) => ({
                        optionId: addOn.optionId,
                        optionName: addOn.optionName,
                        priceDelta: addOn.priceDelta
                      }))
                    }
                  : undefined
              }))
            }
          },
          include: {
            customer: true,
            branch: true,
            items: {
              include: {
                addOns: true
              }
            }
          }
        });

        await applyOrderInventory({
          transaction,
          branchId: payload.branchId,
          orderId: createdOrder.id,
          actorId: req.user!.id,
          items: createdOrder.items,
          mode: "consume"
        });

        return createdOrder;
      }, INVENTORY_TRANSACTION_OPTIONS)
    );

    await writeAuditLog({
      actorId: req.user!.id,
      action: "pos.checkout",
      entityType: "order",
      entityId: order.id,
      payload: {
        orderNumber,
        branchId: payload.branchId,
        itemCount: payload.items.length,
        paymentMethod: payload.paymentMethod,
        defaultTaxRate: paymentTaxDefaults[payload.paymentMethod as PaymentMethod]
      }
    });

    return res.status(201).json({
      order: formatOrderForReceipt(order),
      defaults: {
        taxRate: paymentTaxDefaults[payload.paymentMethod as PaymentMethod]
      }
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
