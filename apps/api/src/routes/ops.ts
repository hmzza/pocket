import { OrderStatus, RoleCode } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { writeAuditLog } from "../lib/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = Router();

router.use(authenticate, authorize(RoleCode.ADMIN, RoleCode.SUPER_ADMIN, RoleCode.POS_STAFF));

const querySchema = z.object({
  scope: z.enum(["active", "watch_later", "delivered", "all"]).default("active"),
  search: z.string().optional()
});

const bulkStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  orderIds: z.array(z.string().min(1)).min(1)
});

const paymentStatusSchema = z.object({
  paymentStatus: z.enum(["PENDING", "PAID"])
});

function serializeOrder(order: any) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    channel: order.channel,
    serviceType: order.serviceType,
    foodpandaOrderNumber: order.foodpandaOrderNumber ?? null,
    customerName: order.customerName ?? order.customer?.name ?? "Walk-in Customer",
    customerPhone: order.customerPhone ?? order.customer?.phone ?? undefined,
    status: order.status,
    branch: order.branch?.name ?? "Unknown branch",
    totalAmount: Number(order.totalAmount),
    subtotal: Number(order.subtotal),
    discountAmount: Number(order.discountAmount),
    taxRate: Number(order.taxRate),
    taxAmount: Number(order.taxAmount),
    paidAmount: Number(order.cashReceivedAmount ?? order.totalAmount),
    changeDueAmount: Number(order.changeDueAmount ?? 0),
    manualDiscountType: order.manualDiscountType ?? undefined,
    manualDiscountValue: order.manualDiscountValue == null ? undefined : Number(order.manualDiscountValue),
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    placedAt: order.placedAt,
    deliveryInstructions: order.deliveryInstructions ?? undefined,
    address: order.address
      ? {
          addressLine1: order.address.addressLine1,
          city: order.address.city,
          instructions: order.address.instructions ?? undefined
        }
      : undefined,
    items: order.items.map((item: any) => ({
      id: item.id,
      productName: item.productName,
      customDescription: item.customDescription ?? undefined,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      note: item.note ?? undefined,
      addOns: item.addOns.map((addOn: any) => ({
        id: addOn.id,
        optionName: addOn.optionName,
        priceDelta: Number(addOn.priceDelta)
      }))
    }))
  };
}

function isTerminalStatus(status: OrderStatus) {
  return status === OrderStatus.DELIVERED || status === OrderStatus.CANCELLED;
}

router.get("/orders", async (req, res, next) => {
  try {
    const query = querySchema.parse(req.query);
    const where =
      query.scope === "active"
        ? { status: { notIn: [OrderStatus.DELIVERED, OrderStatus.CANCELLED, OrderStatus.WATCH_LATER] } }
        : query.scope === "watch_later"
          ? { status: OrderStatus.WATCH_LATER }
        : query.scope === "delivered"
          ? { status: OrderStatus.DELIVERED }
          : {};

    const orders = await prisma.order.findMany({
      where: {
        ...where,
        ...(query.search
          ? {
              OR: [
                { orderNumber: { contains: query.search, mode: "insensitive" } },
                { customerName: { contains: query.search, mode: "insensitive" } },
                { foodpandaOrderNumber: { contains: query.search, mode: "insensitive" } },
                { customer: { is: { name: { contains: query.search, mode: "insensitive" } } } }
              ]
            }
          : {})
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
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

    return res.json({ orders: orders.map(serializeOrder) });
  } catch (error) {
    return next(error);
  }
});

router.patch("/orders/:id/status", async (req, res, next) => {
  try {
    const payload = z.object({ status: z.nativeEnum(OrderStatus) }).parse(req.body);
    const order = await prisma.$transaction(async (transaction) => {
      const currentOrder = await transaction.order.findUnique({
        where: { id: req.params.id }
      });

      if (!currentOrder) {
        throw Object.assign(new Error("Order not found."), { statusCode: 404 });
      }

      if (isTerminalStatus(currentOrder.status) && currentOrder.status !== payload.status) {
        throw Object.assign(new Error("Terminal order statuses cannot be changed."), { statusCode: 409 });
      }

      return transaction.order.update({
        where: { id: req.params.id },
        data: { status: payload.status }
      });
    });

    if (order.customerId) {
      await prisma.notification.create({
        data: {
          userId: order.customerId,
          type: "ORDER",
          title: "Order status updated",
          message: `${order.orderNumber} is now ${payload.status.replaceAll("_", " ")}.`,
          metadata: { orderNumber: order.orderNumber, status: payload.status }
        }
      });
    }

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

router.patch("/orders/:id/payment-status", async (req, res, next) => {
  try {
    const payload = paymentStatusSchema.parse(req.body);
    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: { paymentStatus: payload.paymentStatus }
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "order.payment_status_update",
      entityType: "order",
      entityId: order.id,
      payload
    });

    return res.json({ order });
  } catch (error) {
    return next(error);
  }
});

router.patch("/orders/bulk-status", async (req, res, next) => {
  try {
    const payload = bulkStatusSchema.parse(req.body);
    const updatedOrders = await prisma.$transaction(async (transaction) => {
      const orders = await transaction.order.findMany({
        where: { id: { in: payload.orderIds } }
      });

      if (orders.length !== payload.orderIds.length) {
        throw Object.assign(new Error("One or more orders were not found."), { statusCode: 404 });
      }

      await transaction.order.updateMany({
        where: { id: { in: payload.orderIds } },
        data: { status: payload.status }
      });

      return orders;
    });

    await Promise.all(
      updatedOrders.flatMap((order) =>
        order.customerId
          ? [
              prisma.notification.create({
                data: {
                  userId: order.customerId,
                  type: "ORDER",
                  title: "Order status updated",
                  message: `${order.orderNumber} is now ${payload.status.replaceAll("_", " ")}.`,
                  metadata: { orderNumber: order.orderNumber, status: payload.status }
                }
              })
            ]
          : []
      )
    );

    await writeAuditLog({
      actorId: req.user!.id,
      action: "order.bulk_status_update",
      entityType: "order",
      entityId: "bulk",
      payload
    });

    return res.json({ updatedCount: updatedOrders.length });
  } catch (error) {
    return next(error);
  }
});

export default router;
