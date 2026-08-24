import { Router } from "express";
import { Prisma, RiderAvailability, RoleCode } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { writeAuditLog } from "../lib/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { resolveBranchContext } from "../lib/branch-context.js";
import { requireAdminRoutePermission } from "../lib/permissions.js";
import { formatPakistanPhone, isPakistanMobile, normalizePakistanPhone } from "../lib/phone.js";

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

export default router;
