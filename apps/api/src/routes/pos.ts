import { DiscountType, OrderStatus, PaymentMethod, PaymentStatus, RoleCode } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { hashPassword } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { generateOrderNumber } from "../lib/order-number.js";
import { prisma } from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = Router();
const POS_WALK_IN_EMAIL = "walk-in@pocket.pos.local";
const posServiceTypeSchema = z.enum(["DELIVERY", "TAKEAWAY", "DINE_IN"]);
const posDiscountSchema = z.object({
  type: z.enum(["NONE", "PERCENTAGE", "FIXED"]).default("NONE"),
  value: z.number().nonnegative().default(0)
});
const posLineItemSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("PRODUCT"),
    productId: z.string().cuid(),
    quantity: z.number().int().min(1).max(50),
    note: z.string().max(240).optional(),
    selectedAddOnIds: z.array(z.string().cuid()).default([])
  }),
  z.object({
    kind: z.literal("CUSTOM"),
    name: z.string().min(2).max(80),
    description: z.string().max(180).optional(),
    unitPrice: z.number().nonnegative(),
    quantity: z.number().int().min(1).max(50),
    note: z.string().max(240).optional()
  })
]);

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

function defaultTaxRateForPayment(paymentMethod: PaymentMethod) {
  return paymentMethod === PaymentMethod.CARD ? 5 : 15;
}

const posCheckoutSchema = z.object({
  branchSlug: z.string().min(1),
  serviceType: posServiceTypeSchema.default("TAKEAWAY"),
  customerName: z.string().min(2).max(80).optional(),
  customerPhone: z.string().min(8).max(20).optional(),
  paymentMethod: z.nativeEnum(PaymentMethod),
  paidAmount: z.number().nonnegative(),
  taxRate: z.number().min(0).max(100).optional(),
  note: z.string().max(240).optional(),
  discount: posDiscountSchema.default({
    type: "NONE",
    value: 0
  }),
  items: z.array(posLineItemSchema).min(1)
});

router.use(authenticate, authorize(RoleCode.ADMIN, RoleCode.SUPER_ADMIN, RoleCode.POS_STAFF));

router.post("/checkout", async (req, res, next) => {
  try {
    const payload: z.infer<typeof posCheckoutSchema> = posCheckoutSchema.parse(req.body);
    const branch = await prisma.branch.findUniqueOrThrow({ where: { slug: payload.branchSlug } });
    const productItems = payload.items.filter((item) => item.kind === "PRODUCT");
    const uniqueProductIds = Array.from(new Set(productItems.map((item) => item.productId)));
    const products = uniqueProductIds.length
      ? await prisma.product.findMany({
          where: {
            id: { in: uniqueProductIds },
            isActive: true
          },
          include: {
            branchPricing: {
              where: { branchId: branch.id }
            },
            addOnGroups: {
              include: {
                options: {
                  where: { isActive: true }
                }
              }
            }
          }
        })
      : [];

    if (products.length !== uniqueProductIds.length) {
      return res.status(400).json({ message: "One or more items are unavailable for POS checkout." });
    }

    const productMap = new Map(products.map((product) => [product.id, product]));
    const selectedAddOnIds = Array.from(
      new Set(productItems.flatMap((item) => item.selectedAddOnIds))
    );
    const addOnOptions = selectedAddOnIds.length
      ? await prisma.addOnOption.findMany({
          where: { id: { in: selectedAddOnIds }, isActive: true }
        })
      : [];
    const addOnMap = new Map(addOnOptions.map((option) => [option.id, option]));

    let subtotal = 0;
    for (const item of payload.items) {
      if (item.kind === "CUSTOM") {
        subtotal += roundCurrency(item.unitPrice) * item.quantity;
        continue;
      }

      const product = productMap.get(item.productId)!;
      const validOptionIds = new Set(product.addOnGroups.flatMap((group) => group.options.map((option) => option.id)));
      const invalidOption = item.selectedAddOnIds.find((optionId) => !validOptionIds.has(optionId));

      if (invalidOption) {
        return res.status(400).json({ message: `Invalid add-on selection for ${product.name}.` });
      }

      for (const group of product.addOnGroups) {
        const groupSelections = item.selectedAddOnIds.filter((optionId) => group.options.some((option) => option.id === optionId));
        if (groupSelections.length < group.minSelect) {
          return res.status(400).json({ message: `Select at least ${group.minSelect} option(s) for ${product.name} - ${group.name}.` });
        }

        if (groupSelections.length > group.maxSelect) {
          return res.status(400).json({ message: `Select no more than ${group.maxSelect} option(s) for ${product.name} - ${group.name}.` });
        }
      }

      const basePrice = Number(product.branchPricing[0]?.price ?? product.basePrice);
      const addOnTotal = item.selectedAddOnIds.reduce((sum, optionId) => sum + Number(addOnMap.get(optionId)?.priceDelta ?? 0), 0);
      subtotal += (basePrice + addOnTotal) * item.quantity;
    }

    const discountValue = payload.discount.value;
    const discountAmount =
      payload.discount.type === "PERCENTAGE"
        ? roundCurrency((subtotal * discountValue) / 100)
        : payload.discount.type === "FIXED"
          ? roundCurrency(discountValue)
          : 0;
    const safeDiscountAmount = Math.min(subtotal, discountAmount);
    const taxRate = payload.taxRate ?? defaultTaxRateForPayment(payload.paymentMethod);
    const taxAmount = roundCurrency((subtotal * taxRate) / 100);
    const totalAmount = Math.max(0, roundCurrency(subtotal + taxAmount - safeDiscountAmount));
    const paidAmount = roundCurrency(payload.paidAmount);

    if (paidAmount < totalAmount) {
      return res.status(409).json({ message: "Paid amount must cover the POS total." });
    }

    const role = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.CUSTOMER } });
    const trimmedName = payload.customerName?.trim();
    const trimmedPhone = payload.customerPhone?.trim();

    let customerId: string;
    if (trimmedPhone) {
      const existingCustomer = await prisma.user.findFirst({
        where: {
          phone: trimmedPhone
        },
        include: {
          role: true
        }
      });

      if (existingCustomer) {
        if (existingCustomer.role.code !== RoleCode.CUSTOMER) {
          return res.status(409).json({ message: "This phone number belongs to a staff account." });
        }

        await prisma.user.update({
          where: { id: existingCustomer.id },
          data: {
            name: trimmedName || existingCustomer.name
          }
        });
        customerId = existingCustomer.id;
      } else {
        const passwordHash = await hashPassword(`pos-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const createdCustomer = await prisma.user.create({
          data: {
            roleId: role.id,
            name: trimmedName || "Walk-in Customer",
            phone: trimmedPhone,
            email: `pos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@pocket.local`,
            passwordHash
          }
        });
        customerId = createdCustomer.id;
      }
    } else {
      const passwordHash = await hashPassword("walk-in-counter-customer");
      const walkInCustomer = await prisma.user.upsert({
        where: { email: POS_WALK_IN_EMAIL },
        update: {
          roleId: role.id,
          name: "Walk-in Customer"
        },
        create: {
          roleId: role.id,
          name: "Walk-in Customer",
          email: POS_WALK_IN_EMAIL,
          passwordHash
        }
      });
      customerId = walkInCustomer.id;
    }

    const orderNumber = await generateOrderNumber();
    const changeDueAmount = roundCurrency(paidAmount - totalAmount);
    const order = await prisma.$transaction(async (transaction) => {
      const createdOrder = await transaction.order.create({
        data: {
          orderNumber,
          customerId,
          customerName: trimmedName || "Walk-in Customer",
          customerPhone: trimmedPhone,
          branchId: branch.id,
          channel: "POS",
          serviceType: payload.serviceType,
          status: OrderStatus.CONFIRMED,
          paymentMethod: payload.paymentMethod,
          paymentStatus: PaymentStatus.PAID,
          subtotal,
          taxAmount,
          deliveryFee: 0,
          discountAmount: safeDiscountAmount,
          manualDiscountType:
            payload.discount.type === "NONE"
              ? undefined
              : payload.discount.type === "PERCENTAGE"
                ? DiscountType.PERCENTAGE
                : DiscountType.FIXED,
          manualDiscountValue: payload.discount.type === "NONE" ? undefined : discountValue,
          totalAmount,
          cashReceivedAmount: paidAmount,
          changeDueAmount,
          deliveryInstructions: payload.note,
          items: {
            create: payload.items.map((item) => {
              if (item.kind === "CUSTOM") {
                return {
                  productName: item.name.trim(),
                  customDescription: item.description?.trim() || undefined,
                  quantity: item.quantity,
                  unitPrice: roundCurrency(item.unitPrice),
                  note: item.note?.trim() || undefined
                };
              }

              const product = productMap.get(item.productId)!;
              const unitPrice = Number(product.branchPricing[0]?.price ?? product.basePrice);

              return {
                productId: product.id,
                productName: product.name,
                quantity: item.quantity,
                unitPrice,
                note: item.note?.trim() || undefined,
                addOns: {
                  create: item.selectedAddOnIds.map((optionId) => {
                    const option = addOnMap.get(optionId)!;

                    return {
                      optionId: option.id,
                      optionName: option.name,
                      priceDelta: Number(option.priceDelta)
                    };
                  })
                }
              };
            })
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

      await transaction.notification.create({
        data: {
          type: "ORDER",
          title: "New POS order placed",
          message: `${orderNumber} was created from the counter POS.`,
          metadata: { orderNumber, branch: branch.slug, channel: "POS", taxRate }
        }
      });

      return createdOrder;
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "order.pos_checkout",
      entityType: "order",
      entityId: order.id,
      payload: {
        orderNumber,
        serviceType: payload.serviceType,
        paymentMethod: payload.paymentMethod,
        taxRate,
        paidAmount,
        changeDueAmount
      }
    });

    return res.status(201).json({ order, taxRate });
  } catch (error) {
    return next(error);
  }
});

export default router;
