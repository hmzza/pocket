import { Router } from "express";
import { DiscountType, PaymentMethod, PaymentStatus } from "@prisma/client";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { INVENTORY_TRANSACTION_OPTIONS, prisma } from "../lib/prisma.js";
import { withGeneratedOrderNumber } from "../lib/order-number.js";
import { writeAuditLog } from "../lib/audit.js";
import { applyOrderInventory } from "../lib/inventory.js";

const router = Router();

router.use(authenticate);

function serializeCustomerProfile(profile: any) {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    avatarUrl: profile.avatarUrl,
    marketingOptIn: profile.marketingOptIn,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    addresses: profile.addresses ?? [],
    orders: profile.orders ?? []
  };
}

router.get("/profile", async (req, res) => {
  const profile = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: {
      addresses: true,
      orders: {
        include: { items: true },
        orderBy: { placedAt: "desc" }
      }
    }
  });

  return res.json({ profile: profile ? serializeCustomerProfile(profile) : null });
});

router.patch("/profile", async (req, res, next) => {
  try {
    const payload = z
      .object({
        name: z.string().min(2).max(80).optional(),
        phone: z.string().min(8).max(20).optional(),
        marketingOptIn: z.boolean().optional()
      })
      .parse(req.body);

    const profile = await prisma.user.update({
      where: { id: req.user!.id },
      data: payload,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        marketingOptIn: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return res.json({ profile });
  } catch (error) {
    return next(error);
  }
});

router.get("/cart", async (req, res) => {
  const cart = await prisma.shoppingCart.findUnique({
    where: { userId: req.user!.id },
    include: {
      branch: true,
      items: {
        include: {
          product: {
            include: {
              images: true,
              addOnGroups: { include: { options: true } }
            }
          }
        }
      }
    }
  });

  return res.json({ cart });
});

router.post("/cart/items", async (req, res, next) => {
  try {
    const payload = z
      .object({
        branchSlug: z.string(),
        productId: z.string().cuid(),
        quantity: z.number().int().min(1).max(20).default(1),
        note: z.string().max(240).optional(),
        selectedAddOnIds: z.array(z.string().cuid()).default([])
      })
      .parse(req.body);

    const branch = await prisma.branch.findUniqueOrThrow({ where: { slug: payload.branchSlug } });
    const cart = await prisma.shoppingCart.upsert({
      where: { userId: req.user!.id },
      update: { branchId: branch.id },
      create: { userId: req.user!.id, branchId: branch.id }
    });

    const item = await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId: payload.productId,
        quantity: payload.quantity,
        note: payload.note,
        selectedAddOnIds: payload.selectedAddOnIds
      }
    });

    return res.status(201).json({ item });
  } catch (error) {
    return next(error);
  }
});

router.patch("/cart/items/:itemId", async (req, res, next) => {
  try {
    const payload = z
      .object({
        quantity: z.number().int().min(1).max(20).optional(),
        note: z.string().max(240).optional(),
        selectedAddOnIds: z.array(z.string().cuid()).optional()
      })
      .parse(req.body);

    const existing = await prisma.cartItem.findFirst({
      where: {
        id: req.params.itemId,
        cart: {
          is: {
            userId: req.user!.id
          }
        }
      }
    });

    if (!existing) {
      return res.status(404).json({ message: "Cart item not found." });
    }

    const item = await prisma.cartItem.update({
      where: { id: existing.id },
      data: payload
    });

    return res.json({ item });
  } catch (error) {
    return next(error);
  }
});

router.delete("/cart/items/:itemId", async (req, res) => {
  const existing = await prisma.cartItem.findFirst({
    where: {
      id: req.params.itemId,
      cart: {
        is: {
          userId: req.user!.id
        }
      }
    }
  });

  if (!existing) {
    return res.status(404).json({ message: "Cart item not found." });
  }

  await prisma.cartItem.delete({ where: { id: existing.id } });
  return res.status(204).send();
});

router.get("/favorites", async (req, res) => {
  const favorites = await prisma.favorite.findMany({
    where: { userId: req.user!.id },
    include: {
      product: {
        include: {
          category: true,
          images: { orderBy: { sortOrder: "asc" } }
        }
      }
    }
  });

  return res.json({ favorites });
});

router.post("/favorites/:productId", async (req, res) => {
  const favorite = await prisma.favorite.upsert({
    where: {
      userId_productId: {
        userId: req.user!.id,
        productId: req.params.productId
      }
    },
    update: {},
    create: {
      userId: req.user!.id,
      productId: req.params.productId
    }
  });

  return res.status(201).json({ favorite });
});

router.delete("/favorites/:productId", async (req, res) => {
  await prisma.favorite.delete({
    where: {
      userId_productId: {
        userId: req.user!.id,
        productId: req.params.productId
      }
    }
  });

  return res.status(204).send();
});

router.get("/orders", async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { customerId: req.user!.id },
    include: {
      items: {
        include: {
          addOns: true
        }
      },
      branch: true,
      address: true
    },
    orderBy: { placedAt: "desc" }
  });

  return res.json({ orders });
});

router.post("/checkout", async (req, res, next) => {
  try {
    const payload = z
      .object({
        branchSlug: z.string(),
        paymentMethod: z.nativeEnum(PaymentMethod),
        couponCode: z.string().optional(),
        deliveryInstructions: z.string().max(240).optional(),
        addressId: z.string().optional(),
        address: z
          .object({
            label: z.string().optional(),
            addressLine1: z.string().min(5),
            addressLine2: z.string().optional(),
            city: z.string().min(2),
            instructions: z.string().optional()
          })
          .optional()
      })
      .parse(req.body);

    const branch = await prisma.branch.findUniqueOrThrow({ where: { slug: payload.branchSlug } });
    const cart = await prisma.shoppingCart.findUnique({
      where: { userId: req.user!.id },
      include: {
        items: {
          include: {
            product: {
              include: {
                addOnGroups: {
                  orderBy: { sortOrder: "asc" },
                  include: {
                    options: {
                      where: { isActive: true },
                      orderBy: { sortOrder: "asc" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!cart || cart.items.length === 0) {
      return res.status(409).json({ message: "Cart is empty." });
    }

    const normalizedItems = cart.items.map((item) => {
      const selectedAddOnIds = [...new Set(item.selectedAddOnIds)];
      const addOns = item.product.addOnGroups.flatMap((group) => {
        const selectedOptions = group.options.filter((option) => selectedAddOnIds.includes(option.id));
        if (selectedOptions.length < group.minSelect || selectedOptions.length > group.maxSelect) {
          throw Object.assign(new Error(`${item.product.name}: ${group.name} requires ${group.minSelect} to ${group.maxSelect} selections.`), { statusCode: 400 });
        }

        return selectedOptions.map((option) => ({
          optionId: option.id,
          optionName: option.name,
          priceDelta: Number(option.priceDelta)
        }));
      });

      if (addOns.length !== selectedAddOnIds.length) {
        throw Object.assign(new Error(`${item.product.name}: invalid add-on selection.`), { statusCode: 400 });
      }

      const unitPrice = Number(item.product.basePrice) + addOns.reduce((sum, addOn) => sum + addOn.priceDelta, 0);

      return {
        ...item,
        addOns,
        unitPrice
      };
    });

    const subtotal = normalizedItems.reduce((total, item) => total + item.unitPrice * item.quantity, 0);

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

    let addressId = payload.addressId;
    if (addressId) {
      const address = await prisma.address.findFirst({
        where: {
          id: addressId,
          userId: req.user!.id
        },
        select: { id: true }
      });

      if (!address) {
        return res.status(403).json({ message: "Address does not belong to this account." });
      }
    }

    if (!addressId && payload.address) {
      const address = await prisma.address.create({
        data: {
          userId: req.user!.id,
          label: payload.address.label,
          addressLine1: payload.address.addressLine1,
          addressLine2: payload.address.addressLine2,
          city: payload.address.city,
          instructions: payload.address.instructions
        }
      });
      addressId = address.id;
    }

    const { orderNumber, result: order } = await withGeneratedOrderNumber((orderNumber) =>
      prisma.$transaction(async (transaction) => {
        const createdOrder = await transaction.order.create({
          data: {
            orderNumber,
            customerId: req.user!.id,
            branchId: branch.id,
            addressId,
            couponId,
            customerName: req.user!.name,
            orderSource: "ONLINE",
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
              create: normalizedItems.map((item) => ({
                productId: item.productId,
                productName: item.product.name,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                note: item.note,
                addOns: {
                  create: item.addOns.map((option) => ({
                    optionId: option.optionId,
                    optionName: option.optionName,
                    priceDelta: option.priceDelta
                  }))
                }
              }))
            }
          },
          include: {
            items: {
              include: {
                addOns: true
              }
            }
          }
        });

        await applyOrderInventory({
          transaction,
          branchId: branch.id,
          orderId: createdOrder.id,
          actorId: req.user!.id,
          items: createdOrder.items,
          mode: "consume"
        });

        await transaction.cartItem.deleteMany({ where: { cartId: cart.id } });

        if (couponId) {
          await transaction.coupon.update({
            where: { id: couponId },
            data: { usedCount: { increment: 1 } }
          });
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
      actorId: req.user!.id,
      action: "order.checkout",
      entityType: "order",
      entityId: order.id,
      payload: { orderNumber, orderSource: "ONLINE" }
    });

    return res.status(201).json({ order });
  } catch (error) {
    return next(error);
  }
});

export default router;
