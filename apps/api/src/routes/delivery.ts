import { Router } from "express";
import {
  DeliveryStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  RiderAvailability,
  RoleCode,
  ServiceType
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { writeAuditLog } from "../lib/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { resolveBranchContext } from "../lib/branch-context.js";
import { requireAdminRoutePermission } from "../lib/permissions.js";
import { formatPakistanPhone, isPakistanMobile, normalizePakistanPhone } from "../lib/phone.js";
import { cancelUnsentRiderCallout, notifyRiderIfOrderReady } from "../lib/delivery-notify.js";
import {
  buildRiderRevocationMessage,
  dispatchWhatsAppMessage,
  getWhatsAppProvider,
  markWhatsAppMessageSent,
  queueWhatsAppMessage,
  retryWhatsAppMessage,
  serializeWhatsAppMessage
} from "../lib/whatsapp/index.js";

/**
 * Delivery & Takeaway module routes.
 *
 * Mounted at /api/admin alongside routes/admin.ts, which is already past 6,700
 * lines. Express falls through unmatched paths, so co-mounting keeps this module
 * self-contained without changing any existing URL. The middleware chain is
 * deliberately identical to routes/admin.ts so permission behaviour matches.
 */
const router = Router();

router.use(authenticate, authorize(RoleCode.SUPER_ADMIN, RoleCode.POS_STAFF), requireAdminRoutePermission());

const VEHICLE_TYPES = ["MOTORCYCLE", "SCOOTER", "BICYCLE", "CAR", "RICKSHAW"] as const;

const riderSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(7).max(20),
  altPhone: z.string().trim().max(20).optional().or(z.literal("")),
  cnic: z.string().trim().max(20).optional().or(z.literal("")),
  licenceNumber: z.string().trim().max(40).optional().or(z.literal("")),
  vehicleType: z.enum(VEHICLE_TYPES).default("MOTORCYCLE"),
  vehiclePlate: z.string().trim().max(20).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  availability: z.nativeEnum(RiderAvailability).optional(),
  isActive: z.boolean().optional()
});

const riderQuerySchema = z.object({
  search: z.string().trim().optional(),
  includeInactive: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true")
});

/** Empty strings from form inputs mean "cleared", which is null in the database. */
function optionalText(value: string | undefined) {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function serializeRider(rider: any) {
  const activeDeliveries = rider.deliveries?.length ?? 0;
  return {
    id: rider.id,
    branchId: rider.branchId,
    name: rider.name,
    phone: rider.phone,
    phoneDisplay: formatPakistanPhone(rider.phone),
    altPhone: rider.altPhone ?? null,
    cnic: rider.cnic ?? null,
    licenceNumber: rider.licenceNumber ?? null,
    vehicleType: rider.vehicleType,
    vehiclePlate: rider.vehiclePlate ?? null,
    availability: rider.availability,
    isActive: rider.isActive,
    notes: rider.notes ?? null,
    activeDeliveryCount: activeDeliveries,
    totalDeliveryCount: rider._count?.deliveries ?? 0,
    createdByName: rider.createdBy?.name ?? null,
    createdAt: rider.createdAt,
    updatedAt: rider.updatedAt
  };
}

const riderInclude = {
  createdBy: { select: { name: true } },
  _count: { select: { deliveries: true } }
} satisfies Prisma.RiderInclude;

/**
 * A rider's phone is the WhatsApp destination, so it must be canonical before it
 * hits the unique [branchId, phone] constraint. Without this, 0300-1234567 and
 * +923001234567 would be accepted as two different riders.
 */
function requireCanonicalPhone(value: string, field: string) {
  const normalized = normalizePakistanPhone(value);
  if (!isPakistanMobile(normalized)) {
    throw Object.assign(
      new Error(
        `${field} must be a Pakistani mobile number so the rider can be reached on WhatsApp, for example 0300 1234567.`
      ),
      { statusCode: 400, code: "RIDER_PHONE_INVALID", entity: "Rider", action: "validate" }
    );
  }
  return normalized;
}

router.get("/riders", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const query = riderQuerySchema.parse(req.query);
    const search = query.search;

    const riders = await prisma.rider.findMany({
      where: {
        branchId: branchContext.branchId,
        ...(query.includeInactive ? {} : { isActive: true }),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { phone: { contains: normalizePakistanPhone(search) || search } },
                { vehiclePlate: { contains: search, mode: "insensitive" } },
                { cnic: { contains: search, mode: "insensitive" } }
              ]
            }
          : {})
      },
      include: riderInclude,
      orderBy: [{ isActive: "desc" }, { name: "asc" }]
    });

    return res.json({
      riders: riders.map(serializeRider),
      vehicleTypes: VEHICLE_TYPES,
      branchId: branchContext.branchId
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/riders", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const payload = riderSchema.parse(req.body);
    const phone = requireCanonicalPhone(payload.phone, "Phone");
    const altPhone = payload.altPhone?.trim() ? normalizePakistanPhone(payload.altPhone) : null;

    const duplicate = await prisma.rider.findUnique({
      where: { branchId_phone: { branchId: branchContext.branchId, phone } }
    });
    if (duplicate) {
      // Reactivating beats blocking: a rider who left and came back is the same
      // person, and the unique constraint would otherwise be a dead end.
      return res.status(409).json({
        message: duplicate.isActive
          ? `${duplicate.name} already uses ${formatPakistanPhone(phone)} at this branch.`
          : `${duplicate.name} previously used ${formatPakistanPhone(phone)} at this branch and is deactivated. Reactivate that rider instead.`,
        code: "RIDER_PHONE_TAKEN",
        details: { riderId: duplicate.id, isActive: duplicate.isActive }
      });
    }

    const rider = await prisma.rider.create({
      data: {
        branchId: branchContext.branchId,
        createdById: req.user!.id,
        name: payload.name,
        phone,
        altPhone,
        cnic: optionalText(payload.cnic) ?? null,
        licenceNumber: optionalText(payload.licenceNumber) ?? null,
        vehicleType: payload.vehicleType,
        vehiclePlate: optionalText(payload.vehiclePlate) ?? null,
        notes: optionalText(payload.notes) ?? null,
        ...(payload.availability ? { availability: payload.availability } : {})
      },
      include: riderInclude
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "rider.create",
      entityType: "rider",
      entityId: rider.id,
      payload: { name: rider.name, phone: rider.phone, branchId: rider.branchId }
    });

    return res.status(201).json({ rider: serializeRider(rider) });
  } catch (error) {
    return next(error);
  }
});

router.patch("/riders/:id", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const payload = riderSchema.partial().parse(req.body);
    const existing = await prisma.rider.findUnique({ where: { id: req.params.id } });

    if (!existing) {
      return res.status(404).json({ message: "Rider not found." });
    }
    if (existing.branchId !== branchContext.branchId) {
      return res.status(403).json({ message: "This rider belongs to another branch." });
    }

    let phone: string | undefined;
    if (payload.phone !== undefined) {
      phone = requireCanonicalPhone(payload.phone, "Phone");
      if (phone !== existing.phone) {
        const duplicate = await prisma.rider.findUnique({
          where: { branchId_phone: { branchId: branchContext.branchId, phone } }
        });
        if (duplicate) {
          return res.status(409).json({
            message: `${duplicate.name} already uses ${formatPakistanPhone(phone)} at this branch.`,
            code: "RIDER_PHONE_TAKEN",
            details: { riderId: duplicate.id, isActive: duplicate.isActive }
          });
        }
      }
    }

    const rider = await prisma.rider.update({
      where: { id: existing.id },
      data: {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(payload.altPhone !== undefined
          ? { altPhone: payload.altPhone.trim() ? normalizePakistanPhone(payload.altPhone) : null }
          : {}),
        ...(payload.cnic !== undefined ? { cnic: optionalText(payload.cnic) } : {}),
        ...(payload.licenceNumber !== undefined ? { licenceNumber: optionalText(payload.licenceNumber) } : {}),
        ...(payload.vehicleType !== undefined ? { vehicleType: payload.vehicleType } : {}),
        ...(payload.vehiclePlate !== undefined ? { vehiclePlate: optionalText(payload.vehiclePlate) } : {}),
        ...(payload.notes !== undefined ? { notes: optionalText(payload.notes) } : {}),
        ...(payload.availability !== undefined ? { availability: payload.availability } : {}),
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {})
      },
      include: riderInclude
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "rider.update",
      entityType: "rider",
      entityId: rider.id,
      payload
    });

    return res.json({ rider: serializeRider(rider) });
  } catch (error) {
    return next(error);
  }
});

const availabilitySchema = z.object({ availability: z.nativeEnum(RiderAvailability) });

router.patch("/riders/:id/availability", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const payload = availabilitySchema.parse(req.body);
    const existing = await prisma.rider.findUnique({ where: { id: req.params.id } });

    if (!existing) {
      return res.status(404).json({ message: "Rider not found." });
    }
    if (existing.branchId !== branchContext.branchId) {
      return res.status(403).json({ message: "This rider belongs to another branch." });
    }
    if (!existing.isActive && payload.availability !== RiderAvailability.OFF_DUTY) {
      return res.status(409).json({ message: "Reactivate this rider before putting them back on duty." });
    }
    // ON_DELIVERY is owned by the dispatch flow, not by a manual toggle, or the
    // board and the roster would disagree about who is actually carrying an order.
    if (payload.availability === RiderAvailability.ON_DELIVERY) {
      return res.status(409).json({
        message: "On-delivery is set automatically when an order is assigned.",
        code: "RIDER_AVAILABILITY_MANAGED"
      });
    }
    if (existing.availability === RiderAvailability.ON_DELIVERY) {
      return res.status(409).json({
        message: `${existing.name} is out on a delivery. Complete or reassign that delivery first.`,
        code: "RIDER_ON_DELIVERY"
      });
    }

    const rider = await prisma.rider.update({
      where: { id: existing.id },
      data: { availability: payload.availability },
      include: riderInclude
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "rider.availability_update",
      entityType: "rider",
      entityId: rider.id,
      payload
    });

    return res.json({ rider: serializeRider(rider) });
  } catch (error) {
    return next(error);
  }
});

router.delete("/riders/:id", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const existing = await prisma.rider.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { deliveries: true } } }
    });

    if (!existing) {
      return res.status(404).json({ message: "Rider not found." });
    }
    if (existing.branchId !== branchContext.branchId) {
      return res.status(403).json({ message: "This rider belongs to another branch." });
    }
    if (existing.availability === RiderAvailability.ON_DELIVERY) {
      return res.status(409).json({
        message: `${existing.name} is out on a delivery. Complete or reassign that delivery first.`,
        code: "RIDER_ON_DELIVERY"
      });
    }

    // A rider with delivery history is deactivated rather than deleted, because
    // past orders reference them and that history has to stay readable. A rider
    // with no history at all was almost certainly a typo, so remove them fully.
    if (existing._count.deliveries > 0) {
      const rider = await prisma.rider.update({
        where: { id: existing.id },
        data: { isActive: false, availability: RiderAvailability.OFF_DUTY },
        include: riderInclude
      });

      await writeAuditLog({
        actorId: req.user!.id,
        action: "rider.deactivate",
        entityType: "rider",
        entityId: rider.id,
        payload: { mode: "deactivated", deliveryCount: existing._count.deliveries }
      });

      return res.json({ deleted: false, deactivated: true, rider: serializeRider(rider) });
    }

    await prisma.rider.delete({ where: { id: existing.id } });
    await writeAuditLog({
      actorId: req.user!.id,
      action: "rider.delete",
      entityType: "rider",
      entityId: existing.id,
      payload: { mode: "deleted", name: existing.name }
    });

    return res.json({ deleted: true, deactivated: false });
  } catch (error) {
    return next(error);
  }
});

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Order statuses a delivery can be assigned from. PENDING is excluded on
 * purpose: an order has to be accepted before a rider is sent for it.
 */
const ASSIGNABLE_ORDER_STATUSES = [
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.WATCH_LATER
] as const;

/** A delivery in one of these states is finished and no longer holds a rider. */
const CLOSED_DELIVERY_STATUSES = [
  DeliveryStatus.DELIVERED,
  DeliveryStatus.FAILED,
  DeliveryStatus.CANCELLED,
  DeliveryStatus.REJECTED
] as const;

function isClosedDelivery(status: DeliveryStatus) {
  return (CLOSED_DELIVERY_STATUSES as readonly DeliveryStatus[]).includes(status);
}

function isCashOnDelivery(paymentMethod: PaymentMethod) {
  return paymentMethod === PaymentMethod.CASH_ON_DELIVERY || paymentMethod === PaymentMethod.CASH;
}

const deliveryInclude = {
  rider: true,
  order: {
    include: {
      address: true,
      items: { select: { id: true, productName: true, quantity: true, unitPrice: true } }
    }
  },
  events: {
    include: { rider: { select: { name: true } }, actor: { select: { name: true, username: true } } },
    orderBy: { createdAt: "desc" as const },
    take: 12
  },
  whatsAppMessages: { orderBy: { queuedAt: "desc" as const }, take: 6 }
} satisfies Prisma.DeliveryInclude;

function serializeDelivery(delivery: any) {
  return {
    id: delivery.id,
    orderId: delivery.orderId,
    orderNumber: delivery.order.orderNumber,
    status: delivery.status,
    trackingToken: delivery.trackingToken,
    assignmentCount: delivery.assignmentCount,
    codAmount: delivery.codAmount == null ? null : Number(delivery.codAmount),
    failureReason: delivery.failureReason ?? null,
    deliveryNotes: delivery.deliveryNotes ?? null,
    assignedAt: delivery.assignedAt,
    riderNotifiedAt: delivery.riderNotifiedAt,
    // Assigned, but the kitchen has not finished, so no call-out has gone out.
    waitingOnKitchen: Boolean(delivery.riderId) && !delivery.riderNotifiedAt && delivery.order.status !== OrderStatus.READY,
    pickedUpAt: delivery.pickedUpAt,
    deliveredAt: delivery.deliveredAt,
    cancelledAt: delivery.cancelledAt,
    rider: delivery.rider
      ? {
          id: delivery.rider.id,
          name: delivery.rider.name,
          phone: delivery.rider.phone,
          phoneDisplay: formatPakistanPhone(delivery.rider.phone),
          vehicleType: delivery.rider.vehicleType,
          vehiclePlate: delivery.rider.vehiclePlate ?? null
        }
      : null,
    order: {
      status: delivery.order.status,
      customerName: delivery.order.customerName ?? "Customer",
      customerPhone: delivery.order.customerPhone ?? null,
      customerPhoneDisplay: formatPakistanPhone(delivery.order.customerPhone),
      totalAmount: Number(delivery.order.totalAmount),
      paymentMethod: delivery.order.paymentMethod,
      paymentStatus: delivery.order.paymentStatus,
      placedAt: delivery.order.placedAt,
      deliveryInstructions: delivery.order.deliveryInstructions ?? null,
      address: delivery.order.address
        ? {
            addressLine1: delivery.order.address.addressLine1,
            addressLine2: delivery.order.address.addressLine2 ?? null,
            city: delivery.order.address.city,
            instructions: delivery.order.address.instructions ?? null
          }
        : null,
      items: (delivery.order.items ?? []).map((item: any) => ({
        id: item.id,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice)
      }))
    },
    events: (delivery.events ?? []).map((event: any) => ({
      id: event.id,
      status: event.status,
      note: event.note ?? null,
      riderName: event.rider?.name ?? null,
      actorName: event.actor?.name ?? event.actor?.username ?? null,
      createdAt: event.createdAt
    })),
    messages: (delivery.whatsAppMessages ?? []).map(serializeWhatsAppMessage)
  };
}


/**
 * Sends queued messages after their transaction has committed.
 *
 * Deliberately fire-and-forget with a swallowed rejection: a WhatsApp problem
 * must never turn a successful assignment into a failed request. Failures are
 * already recorded on the message row for the board to show and retry.
 */
function dispatchQueuedMessages(messageIds: string[]) {
  for (const id of messageIds) {
    void dispatchWhatsAppMessage(id).catch(() => null);
  }
}

router.get("/deliveries", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const branchId = branchContext.branchId;

    const [activeDeliveries, assignableOrders, riders, recentDeliveries] = await Promise.all([
      prisma.delivery.findMany({
        where: { branchId, status: { notIn: [...CLOSED_DELIVERY_STATUSES] } },
        include: deliveryInclude,
        orderBy: [{ assignedAt: "asc" }, { createdAt: "asc" }]
      }),
      // Delivery orders that are accepted and have no live delivery attached.
      prisma.order.findMany({
        where: {
          branchId,
          serviceType: ServiceType.DELIVERY,
          status: { in: [...ASSIGNABLE_ORDER_STATUSES] },
          OR: [{ delivery: { is: null } }, { delivery: { is: { status: { in: [...CLOSED_DELIVERY_STATUSES] } } } }]
        },
        include: {
          address: true,
          delivery: { select: { id: true, status: true, failureReason: true } },
          items: { select: { id: true, productName: true, quantity: true, unitPrice: true } }
        },
        orderBy: { placedAt: "asc" }
      }),
      prisma.rider.findMany({
        where: { branchId, isActive: true },
        orderBy: [{ availability: "asc" }, { name: "asc" }]
      }),
      prisma.delivery.findMany({
        where: { branchId, status: { in: [...CLOSED_DELIVERY_STATUSES] } },
        include: deliveryInclude,
        orderBy: { updatedAt: "desc" },
        take: 20
      })
    ]);

    return res.json({
      active: activeDeliveries.map(serializeDelivery),
      recent: recentDeliveries.map(serializeDelivery),
      assignable: assignableOrders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        customerName: order.customerName ?? "Customer",
        customerPhone: order.customerPhone ?? null,
        customerPhoneDisplay: formatPakistanPhone(order.customerPhone),
        totalAmount: Number(order.totalAmount),
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        placedAt: order.placedAt,
        deliveryInstructions: order.deliveryInstructions ?? null,
        // Set when a previous attempt failed, so dispatch knows this is a retry.
        previousFailureReason: order.delivery?.failureReason ?? null,
        // Shown as blocked rather than hidden, so a fixable order is not silently
        // dropped from the board.
        canAssign: Boolean(order.addressId),
        blockedReason: order.addressId ? null : "No delivery address on this order.",
        address: order.address
          ? {
              addressLine1: order.address.addressLine1,
              addressLine2: order.address.addressLine2 ?? null,
              city: order.address.city,
              instructions: order.address.instructions ?? null
            }
          : null,
        items: order.items.map((item) => ({
          id: item.id,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice)
        }))
      })),
      riders: riders.map((rider) => ({
        id: rider.id,
        name: rider.name,
        phone: rider.phone,
        phoneDisplay: formatPakistanPhone(rider.phone),
        vehicleType: rider.vehicleType,
        vehiclePlate: rider.vehiclePlate ?? null,
        availability: rider.availability,
        isActive: rider.isActive
      })),
      provider: {
        name: getWhatsAppProvider().name,
        automatic: getWhatsAppProvider().automatic
      }
    });
  } catch (error) {
    return next(error);
  }
});

const assignSchema = z.object({
  orderId: z.string().min(1),
  riderId: z.string().min(1),
  note: z.string().trim().max(240).optional()
});

router.post("/deliveries/assign", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const payload = assignSchema.parse(req.body);

    const { delivery, messageIds } = await prisma.$transaction(async (transaction) => {
      const order = await transaction.order.findUnique({
        where: { id: payload.orderId },
        include: { delivery: true }
      });

      if (!order) throw Object.assign(new Error("Order not found."), { statusCode: 404 });
      if (order.branchId !== branchContext.branchId) {
        throw Object.assign(new Error("This order belongs to another branch."), { statusCode: 403 });
      }
      if (order.serviceType !== ServiceType.DELIVERY) {
        throw Object.assign(new Error("Only delivery orders can be assigned to a rider."), {
          statusCode: 409,
          code: "ORDER_NOT_DELIVERY"
        });
      }
      if (order.status === OrderStatus.PENDING) {
        throw Object.assign(new Error("Accept this order before assigning a rider."), {
          statusCode: 409,
          code: "ORDER_NOT_ACCEPTED"
        });
      }
      if (!(ASSIGNABLE_ORDER_STATUSES as readonly OrderStatus[]).includes(order.status)) {
        throw Object.assign(new Error(`An order that is ${order.status.replaceAll("_", " ").toLowerCase()} cannot be assigned.`), {
          statusCode: 409,
          code: "ORDER_NOT_ASSIGNABLE"
        });
      }
      if (order.delivery && !isClosedDelivery(order.delivery.status)) {
        throw Object.assign(new Error("This order already has a rider. Use reassign instead."), {
          statusCode: 409,
          code: "DELIVERY_ALREADY_ACTIVE"
        });
      }
      // Online checkout always captures an address, but older delivery orders
      // predate that. Sending a rider out with "No address on file" is worse
      // than refusing, so refuse and let staff fix the order first.
      if (!order.addressId) {
        throw Object.assign(new Error("This order has no delivery address, so a rider cannot be sent. Add the address to the order first."), {
          statusCode: 409,
          code: "ORDER_MISSING_ADDRESS"
        });
      }

      const rider = await transaction.rider.findUnique({ where: { id: payload.riderId } });
      if (!rider) throw Object.assign(new Error("Rider not found."), { statusCode: 404 });
      if (rider.branchId !== branchContext.branchId) {
        throw Object.assign(new Error("This rider belongs to another branch."), { statusCode: 403 });
      }
      if (!rider.isActive) {
        throw Object.assign(new Error(`${rider.name} is deactivated.`), { statusCode: 409, code: "RIDER_INACTIVE" });
      }
      if (rider.availability === RiderAvailability.ON_DELIVERY) {
        throw Object.assign(new Error(`${rider.name} is already out on a delivery.`), {
          statusCode: 409,
          code: "RIDER_BUSY"
        });
      }
      if (rider.availability === RiderAvailability.OFF_DUTY) {
        throw Object.assign(new Error(`${rider.name} is off duty. Put them on duty first.`), {
          statusCode: 409,
          code: "RIDER_OFF_DUTY"
        });
      }

      const codAmount = isCashOnDelivery(order.paymentMethod) ? order.totalAmount : null;

      const saved = await transaction.delivery.upsert({
        where: { orderId: order.id },
        // A failed attempt leaves a row behind; reuse it so the event history and
        // attempt count for this order stay in one place.
        update: {
          riderId: rider.id,
          assignedById: req.user!.id,
          status: DeliveryStatus.ASSIGNED,
          assignedAt: new Date(),
          pickedUpAt: null,
          deliveredAt: null,
          cancelledAt: null,
          failureReason: null,
          // A fresh assignment has not been called out yet, even if a previous
          // rider on this order had been.
          riderNotifiedAt: null,
          codAmount,
          deliveryNotes: payload.note ?? null,
          assignmentCount: { increment: 1 }
        },
        create: {
          orderId: order.id,
          branchId: order.branchId,
          riderId: rider.id,
          assignedById: req.user!.id,
          status: DeliveryStatus.ASSIGNED,
          trackingToken: randomUUID(),
          assignedAt: new Date(),
          codAmount,
          deliveryNotes: payload.note ?? null,
          assignmentCount: 1
        }
      });

      await transaction.rider.update({
        where: { id: rider.id },
        data: { availability: RiderAvailability.ON_DELIVERY }
      });

      await transaction.deliveryEvent.create({
        data: {
          deliveryId: saved.id,
          riderId: rider.id,
          actorId: req.user!.id,
          status: DeliveryStatus.ASSIGNED,
          note: payload.note ?? null
        }
      });

      return { delivery: saved, messageIds: [] as string[] };
    });

    // The rider is called out when the food is ready, not now. If the kitchen
    // has already finished, this sends immediately; otherwise marking the order
    // READY will. Either way the rule lives in one place.
    await notifyRiderIfOrderReady(delivery.orderId);
    dispatchQueuedMessages(messageIds);

    await writeAuditLog({
      actorId: req.user!.id,
      action: "delivery.assign",
      entityType: "delivery",
      entityId: delivery.id,
      payload: { orderId: delivery.orderId, riderId: delivery.riderId, attempt: delivery.assignmentCount }
    });

    const fresh = await prisma.delivery.findUniqueOrThrow({ where: { id: delivery.id }, include: deliveryInclude });
    return res.status(201).json({ delivery: serializeDelivery(fresh) });
  } catch (error) {
    return next(error);
  }
});

const reassignSchema = z.object({
  riderId: z.string().min(1),
  reason: z.string().trim().min(3).max(240)
});

router.post("/deliveries/:id/reassign", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const payload = reassignSchema.parse(req.body);

    const outcome = await prisma.$transaction(async (transaction) => {
      const delivery = await transaction.delivery.findUnique({
        where: { id: req.params.id },
        include: { rider: true, order: { select: { orderNumber: true, status: true } } }
      });

      if (!delivery) throw Object.assign(new Error("Delivery not found."), { statusCode: 404 });
      if (delivery.branchId !== branchContext.branchId) {
        throw Object.assign(new Error("This delivery belongs to another branch."), { statusCode: 403 });
      }
      if (isClosedDelivery(delivery.status)) {
        throw Object.assign(new Error("This delivery is already finished and cannot be reassigned."), {
          statusCode: 409,
          code: "DELIVERY_CLOSED"
        });
      }
      if (delivery.riderId === payload.riderId) {
        throw Object.assign(new Error("That rider already has this delivery."), {
          statusCode: 409,
          code: "SAME_RIDER"
        });
      }

      const nextRider = await transaction.rider.findUnique({ where: { id: payload.riderId } });
      if (!nextRider) throw Object.assign(new Error("Rider not found."), { statusCode: 404 });
      if (nextRider.branchId !== branchContext.branchId) {
        throw Object.assign(new Error("This rider belongs to another branch."), { statusCode: 403 });
      }
      if (!nextRider.isActive) {
        throw Object.assign(new Error(`${nextRider.name} is deactivated.`), { statusCode: 409, code: "RIDER_INACTIVE" });
      }
      if (nextRider.availability === RiderAvailability.ON_DELIVERY) {
        throw Object.assign(new Error(`${nextRider.name} is already out on a delivery.`), {
          statusCode: 409,
          code: "RIDER_BUSY"
        });
      }
      if (nextRider.availability === RiderAvailability.OFF_DUTY) {
        throw Object.assign(new Error(`${nextRider.name} is off duty. Put them on duty first.`), {
          statusCode: 409,
          code: "RIDER_OFF_DUTY"
        });
      }

      const previousRider = delivery.rider;

      // Free the outgoing rider before claiming the incoming one, so a rider is
      // never left marked busy for a delivery they no longer hold.
      if (previousRider) {
        await transaction.rider.update({
          where: { id: previousRider.id },
          data: { availability: RiderAvailability.AVAILABLE }
        });
        await transaction.deliveryEvent.create({
          data: {
            deliveryId: delivery.id,
            riderId: previousRider.id,
            actorId: req.user!.id,
            status: DeliveryStatus.REASSIGNED,
            note: `Taken off ${delivery.order.orderNumber}: ${payload.reason}`
          }
        });
      }

      await transaction.rider.update({
        where: { id: nextRider.id },
        data: { availability: RiderAvailability.ON_DELIVERY }
      });

      const updated = await transaction.delivery.update({
        where: { id: delivery.id },
        data: {
          riderId: nextRider.id,
          assignedById: req.user!.id,
          status: DeliveryStatus.ASSIGNED,
          assignedAt: new Date(),
          pickedUpAt: null,
          // The incoming rider has not been called out yet.
          riderNotifiedAt: null,
          assignmentCount: { increment: 1 }
        }
      });

      await transaction.deliveryEvent.create({
        data: {
          deliveryId: delivery.id,
          riderId: nextRider.id,
          actorId: req.user!.id,
          status: DeliveryStatus.ASSIGNED,
          note: `Reassigned from ${previousRider?.name ?? "unassigned"}: ${payload.reason}`
        }
      });

      // If the previous rider had already taken the food, the order was out for
      // delivery. Handing it to someone else means it is up for collection
      // again, so put it back to ready: the delivery is ASSIGNED with no pickup
      // time, and leaving the order OUT_FOR_DELIVERY would contradict that and
      // would stop the incoming rider being called out at all.
      if (delivery.order.status === OrderStatus.OUT_FOR_DELIVERY) {
        await transaction.order.update({
          where: { id: delivery.orderId },
          data: { status: OrderStatus.READY }
        });
      }

      return { delivery: updated, previousRider, orderNumber: delivery.order.orderNumber };
    });

    const queuedIds: string[] = [];

    // Revoke first. If only one message gets through, it should be the one that
    // stops a rider delivering an order that is no longer theirs.
    if (outcome.previousRider) {
      const branch = await prisma.branch.findUniqueOrThrow({
        where: { id: branchContext.branchId },
        select: { name: true, phone: true }
      });
      const revocation = buildRiderRevocationMessage({
        rider: { name: outcome.previousRider.name, phone: outcome.previousRider.phone },
        order: { orderNumber: outcome.orderNumber },
        reason: payload.reason,
        branch
      });
      const queued = await prisma.$transaction((transaction) =>
        queueWhatsAppMessage(transaction, {
          ...revocation,
          riderId: outcome.previousRider!.id,
          deliveryId: outcome.delivery.id,
          orderId: outcome.delivery.orderId
        })
      );
      queuedIds.push(queued.id);
    }

    // Retire a call-out the outgoing rider never actually received, so the board
    // does not keep prompting someone to send it. An already-sent one stands, and
    // the revocation above covers it.
    if (outcome.previousRider) {
      await cancelUnsentRiderCallout(outcome.delivery.id, outcome.previousRider.id);
    }

    dispatchQueuedMessages(queuedIds);

    // Call the incoming rider out only if the food is already ready.
    await notifyRiderIfOrderReady(outcome.delivery.orderId);

    await writeAuditLog({
      actorId: req.user!.id,
      action: "delivery.reassign",
      entityType: "delivery",
      entityId: outcome.delivery.id,
      payload: {
        from: outcome.previousRider?.id ?? null,
        to: outcome.delivery.riderId,
        reason: payload.reason,
        attempt: outcome.delivery.assignmentCount
      }
    });

    const fresh = await prisma.delivery.findUniqueOrThrow({
      where: { id: outcome.delivery.id },
      include: deliveryInclude
    });
    return res.json({ delivery: serializeDelivery(fresh) });
  } catch (error) {
    return next(error);
  }
});

const deliveryStatusSchema = z
  .object({
    status: z.enum([
      DeliveryStatus.PICKED_UP,
      DeliveryStatus.ON_THE_WAY,
      DeliveryStatus.DELIVERED,
      DeliveryStatus.FAILED,
      DeliveryStatus.CANCELLED
    ]),
    failureReason: z.string().trim().max(240).optional()
  })
  .superRefine((value, context) => {
    if ((value.status === DeliveryStatus.FAILED || value.status === DeliveryStatus.CANCELLED) && !value.failureReason?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A reason is required so the order can be followed up.",
        path: ["failureReason"]
      });
    }
  });

router.post("/deliveries/:id/status", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const payload = deliveryStatusSchema.parse(req.body);

    const updated = await prisma.$transaction(async (transaction) => {
      const delivery = await transaction.delivery.findUnique({
        where: { id: req.params.id },
        include: { order: true }
      });

      if (!delivery) throw Object.assign(new Error("Delivery not found."), { statusCode: 404 });
      if (delivery.branchId !== branchContext.branchId) {
        throw Object.assign(new Error("This delivery belongs to another branch."), { statusCode: 403 });
      }
      if (isClosedDelivery(delivery.status)) {
        throw Object.assign(new Error("This delivery is already finished."), {
          statusCode: 409,
          code: "DELIVERY_CLOSED"
        });
      }

      const now = new Date();
      const deliveryData: Prisma.DeliveryUpdateInput = { status: payload.status };
      let orderData: Prisma.OrderUpdateInput | null = null;
      let freeRider = false;

      if (payload.status === DeliveryStatus.PICKED_UP) {
        deliveryData.pickedUpAt = now;
        // The order only becomes out for delivery once it is physically with the
        // rider. Assignment alone does not move it, or the kitchen queue would
        // claim food had left before it was made.
        orderData = { status: OrderStatus.OUT_FOR_DELIVERY };
      }

      if (payload.status === DeliveryStatus.DELIVERED) {
        deliveryData.deliveredAt = now;
        if (!delivery.pickedUpAt) deliveryData.pickedUpAt = now;
        orderData = {
          status: OrderStatus.DELIVERED,
          // Cash reached the rider at the door. Iteration 7 reads this to decide
          // whether the money counts toward the day's close.
          ...(isCashOnDelivery(delivery.order.paymentMethod) ? { paymentStatus: PaymentStatus.PAID } : {})
        };
        freeRider = true;
      }

      if (payload.status === DeliveryStatus.FAILED || payload.status === DeliveryStatus.CANCELLED) {
        deliveryData.failureReason = payload.failureReason?.trim() ?? null;
        deliveryData.cancelledAt = now;
        // Back to ready rather than cancelled: the food exists and the shop has
        // to decide what happens to it. Stock stays consumed for the same reason.
        orderData = { status: OrderStatus.READY };
        freeRider = true;
      }

      const saved = await transaction.delivery.update({ where: { id: delivery.id }, data: deliveryData });

      if (orderData) {
        await transaction.order.update({ where: { id: delivery.orderId }, data: orderData });
      }

      if (freeRider && delivery.riderId) {
        await transaction.rider.update({
          where: { id: delivery.riderId },
          data: { availability: RiderAvailability.AVAILABLE }
        });
      }

      await transaction.deliveryEvent.create({
        data: {
          deliveryId: delivery.id,
          riderId: delivery.riderId,
          actorId: req.user!.id,
          status: payload.status,
          note: payload.failureReason?.trim() ?? null
        }
      });

      return saved;
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "delivery.status_update",
      entityType: "delivery",
      entityId: updated.id,
      payload
    });

    const fresh = await prisma.delivery.findUniqueOrThrow({ where: { id: updated.id }, include: deliveryInclude });
    return res.json({ delivery: serializeDelivery(fresh) });
  } catch (error) {
    return next(error);
  }
});

router.post("/deliveries/messages/:id/retry", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const message = await prisma.whatsAppMessage.findUnique({
      where: { id: req.params.id },
      include: { delivery: { select: { branchId: true } } }
    });

    if (!message) return res.status(404).json({ message: "Message not found." });
    if (message.delivery && message.delivery.branchId !== branchContext.branchId) {
      return res.status(403).json({ message: "This message belongs to another branch." });
    }

    const retried = await retryWhatsAppMessage(message.id);
    await writeAuditLog({
      actorId: req.user!.id,
      action: "delivery.message_retry",
      entityType: "whatsapp_message",
      entityId: message.id,
      payload: { status: retried?.status ?? "unknown" }
    });

    return res.json({ message: retried ? serializeWhatsAppMessage(retried) : null });
  } catch (error) {
    return next(error);
  }
});

/**
 * Confirms a click-to-send message actually went out. The deep-link provider
 * hands a link to a human, so only that human can tell us it was sent.
 */
router.post("/deliveries/messages/:id/sent", async (req, res, next) => {
  try {
    const branchContext = await resolveBranchContext(req);
    const message = await prisma.whatsAppMessage.findUnique({
      where: { id: req.params.id },
      include: { delivery: { select: { branchId: true } } }
    });

    if (!message) return res.status(404).json({ message: "Message not found." });
    if (message.delivery && message.delivery.branchId !== branchContext.branchId) {
      return res.status(403).json({ message: "This message belongs to another branch." });
    }

    const marked = await markWhatsAppMessageSent(message.id, req.user!.id);
    await writeAuditLog({
      actorId: req.user!.id,
      action: "delivery.message_marked_sent",
      entityType: "whatsapp_message",
      entityId: message.id,
      payload: { toPhone: message.toPhone, kind: message.kind }
    });

    return res.json({ message: serializeWhatsAppMessage(marked) });
  } catch (error) {
    return next(error);
  }
});

export default router;
