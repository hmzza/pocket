import { OrderStatus, PaymentStatus, RoleCode } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { INVENTORY_TRANSACTION_OPTIONS, prisma } from "../lib/prisma.js";
import { writeAuditLog } from "../lib/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { applyOrderInventory } from "../lib/inventory.js";
import { businessDayRange, getBusinessDateKey } from "../lib/business-day.js";
import { resolveBranchContext } from "../lib/branch-context.js";
import { requirePermission } from "../lib/permissions.js";
import { dispatchDeliveryOrder } from "../lib/delivery.js";

const router = Router();

router.use(authenticate, authorize(RoleCode.SUPER_ADMIN, RoleCode.POS_STAFF), requirePermission("POS"));

const querySchema = z.object({
  scope: z.enum(["active", "watch_later", "delivered", "unpaid", "all"]).default("active"),
  search: z.string().optional(),
  today: z.enum(["true"]).optional()
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
    cashierUsername: order.cashier?.username ?? null,
    cashierName: order.cashier?.name ?? null,
    placedAt: order.placedAt,
    deliveryInstructions: order.deliveryInstructions ?? undefined,
    deliverySector: order.deliverySector ?? undefined,
    deliverySubsector: order.deliverySubsector ?? undefined,
    riderName: order.riderName ?? undefined,
    riderPhone: order.riderPhone ?? undefined,
    riderAssignedAt: order.riderAssignedAt ?? undefined,
    acceptedByName: order.acceptedBy?.name ?? order.acceptedBy?.username ?? null,
    acceptedAt: order.acceptedAt ?? null,
    dispatchedByName: order.dispatchedBy?.name ?? order.dispatchedBy?.username ?? null,
    dispatchedAt: order.dispatchedAt ?? null,
    address: order.address
      ? {
          addressLine1: order.address.addressLine1,
          addressLine2: order.address.addressLine2 ?? undefined,
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

function todayPakistanRange() {
  const range = businessDayRange(getBusinessDateKey());
  return { gte: range.start, lte: range.end };
}

router.get("/orders", async (req, res, next) => {
  try {
    const query = querySchema.parse(req.query);
    const branchContext = await resolveBranchContext(req);
    const todayRange = todayPakistanRange();
    const where =
      query.scope === "active"
        ? { status: { notIn: [OrderStatus.DELIVERED, OrderStatus.CANCELLED, OrderStatus.WATCH_LATER] }, placedAt: todayRange }
        : query.scope === "watch_later"
          ? { status: OrderStatus.WATCH_LATER }
        : query.scope === "delivered"
          ? { status: OrderStatus.DELIVERED }
        : query.scope === "unpaid"
          ? { paymentStatus: PaymentStatus.PENDING, status: { not: OrderStatus.CANCELLED } }
          : query.today
            ? { status: { not: OrderStatus.CANCELLED }, placedAt: todayRange }
            : {
                OR: [
                  { status: { notIn: [OrderStatus.DELIVERED, OrderStatus.CANCELLED, OrderStatus.WATCH_LATER] }, placedAt: todayRange },
                  { status: OrderStatus.WATCH_LATER }
                ]
              };

    const orders = await prisma.order.findMany({
      where: {
        ...where,
        branchId: branchContext.branchId,
        ...(query.today && !("placedAt" in where) ? { placedAt: todayRange } : {}),
        ...(query.search
          ? {
              AND: [{
                OR: [
                  { orderNumber: { contains: query.search, mode: "insensitive" } },
                  { customerName: { contains: query.search, mode: "insensitive" } },
                  { foodpandaOrderNumber: { contains: query.search, mode: "insensitive" } },
                  { customer: { is: { name: { contains: query.search, mode: "insensitive" } } } }
                ]
              }]
            }
          : {})
      },
      include: {
        customer: {
          select: {
            name: true,
            phone: true
          }
        },
        branch: { select: { name: true } },
        cashier: { select: { username: true, name: true } },
        acceptedBy: { select: { username: true, name: true } },
        dispatchedBy: { select: { username: true, name: true } },
        address: { select: { addressLine1: true, addressLine2: true, city: true, instructions: true } },
        items: {
          select: {
            id: true,
            productName: true,
            customDescription: true,
            quantity: true,
            unitPrice: true,
            note: true,
            addOns: {
              select: {
                optionName: true,
                priceDelta: true
              }
            }
          }
        }
      },
      orderBy: [{ placedAt: "asc" }, { id: "asc" }]
    });

    return res.json({ orders: orders.map(serializeOrder) });
  } catch (error) {
    return next(error);
  }
});

router.patch("/orders/:id/status", async (req, res, next) => {
  try {
    const payload = z.object({ status: z.nativeEnum(OrderStatus) }).parse(req.body);
    const branchContext = await resolveBranchContext(req);
    const order = await prisma.$transaction(async (transaction) => {
      const currentOrder = await transaction.order.findUnique({
        where: { id: req.params.id },
        include: {
          items: {
            include: {
              addOns: true,
              bundleComponents: true
            }
          }
        }
      });

      if (!currentOrder) {
        throw Object.assign(new Error("Order not found."), { statusCode: 404 });
      }
      if (currentOrder.branchId !== branchContext.branchId) {
        throw Object.assign(new Error("This order belongs to another branch."), { statusCode: 403 });
      }

      if (isTerminalStatus(currentOrder.status) && currentOrder.status !== payload.status) {
        throw Object.assign(new Error("Terminal order statuses cannot be changed."), { statusCode: 409 });
      }

      if (currentOrder.status !== OrderStatus.CANCELLED && payload.status === OrderStatus.CANCELLED) {
        await applyOrderInventory({
          transaction,
          branchId: currentOrder.branchId,
          orderId: currentOrder.id,
          actorId: req.user!.id,
          items: currentOrder.items,
          mode: "return",
          serviceType: currentOrder.serviceType
        });
      }

      return transaction.order.update({
        where: { id: req.params.id },
        data: {
          status: payload.status,
          ...(currentOrder.serviceType === "DELIVERY" && currentOrder.status === OrderStatus.PENDING && payload.status === OrderStatus.CONFIRMED
            ? { acceptedById: req.user!.id, acceptedAt: new Date() }
            : {})
        }
      });
    }, INVENTORY_TRANSACTION_OPTIONS);

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
    const branchContext = await resolveBranchContext(req);
    const currentOrder = await prisma.order.findUnique({ where: { id: req.params.id }, select: { branchId: true } });
    if (!currentOrder) {
      return res.status(404).json({ message: "Order not found." });
    }
    if (currentOrder.branchId !== branchContext.branchId) {
      return res.status(403).json({ message: "This order belongs to another branch." });
    }
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

router.patch("/orders/:id/dispatch", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const { order, whatsappUrl } = await dispatchDeliveryOrder({
      orderId: req.params.id,
      branchId: branchContext.branchId,
      actorId: req.user!.id
    });

    if (order.customerId) {
      await prisma.notification.create({
        data: {
          userId: order.customerId,
          type: "ORDER",
          title: "Order is on the way",
          message: `${order.orderNumber} has been assigned to the delivery rider.`,
          metadata: { orderNumber: order.orderNumber, status: order.status, rider: order.riderName }
        }
      });
    }

    await writeAuditLog({
      actorId: req.user!.id,
      action: "delivery.dispatch",
      entityType: "order",
      entityId: order.id,
      payload: { orderNumber: order.orderNumber, riderName: order.riderName }
    });

    return res.json({ order, whatsappUrl });
  } catch (error) {
    return next(error);
  }
});

router.patch("/orders/bulk-status", async (req, res, next) => {
  try {
    const payload = bulkStatusSchema.parse(req.body);
    const branchContext = await resolveBranchContext(req);
    const updatedOrders = await prisma.$transaction(async (transaction) => {
      const orders = await transaction.order.findMany({
        where: { id: { in: payload.orderIds } }
      });

      if (orders.length !== payload.orderIds.length) {
        throw Object.assign(new Error("One or more orders were not found."), { statusCode: 404 });
      }
      if (orders.some((order) => order.branchId !== branchContext.branchId)) {
        throw Object.assign(new Error("One or more orders belong to another branch."), { statusCode: 403 });
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

router.delete("/orders/:id", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const deletedOrder = await prisma.$transaction(async (transaction) => {
      const currentOrder = await transaction.order.findUnique({
        where: { id: req.params.id },
        include: {
          items: {
            include: {
              addOns: true,
              bundleComponents: true
            }
          }
        }
      });

      if (!currentOrder) {
        throw Object.assign(new Error("Order not found."), { statusCode: 404 });
      }
      if (currentOrder.branchId !== branchContext.branchId) {
        throw Object.assign(new Error("This order belongs to another branch."), { statusCode: 403 });
      }

      if (currentOrder.status !== OrderStatus.CANCELLED) {
        await applyOrderInventory({
          transaction,
          branchId: currentOrder.branchId,
          orderId: currentOrder.id,
          actorId: req.user!.id,
          mode: "return",
          serviceType: currentOrder.serviceType,
          items: currentOrder.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            addOns: item.addOns.map((addOn) => ({
              optionName: addOn.optionName
            })),
            bundleComponents: item.bundleComponents.map((component) => ({
              productId: component.productId,
              quantity: component.quantity
            }))
          }))
        });
      }

      await transaction.order.delete({
        where: { id: currentOrder.id }
      });

      return {
        id: currentOrder.id,
        orderNumber: currentOrder.orderNumber
      };
    }, INVENTORY_TRANSACTION_OPTIONS);

    await writeAuditLog({
      actorId: req.user!.id,
      action: "order.delete",
      entityType: "order",
      entityId: deletedOrder.id,
      payload: {
        orderNumber: deletedOrder.orderNumber
      }
    });

    return res.json({ deleted: true });
  } catch (error) {
    return next(error);
  }
});

export default router;
