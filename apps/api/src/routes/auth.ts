import { Router } from "express";
import { RoleCode } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hashPassword, signToken, verifyPassword } from "../lib/auth.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  phone: z.string().min(8).max(20).optional(),
  password: z.string().min(8)
});

router.post("/register", async (req, res, next) => {
  try {
    const payload = registerSchema.parse(req.body);
    const role = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.CUSTOMER } });
    const passwordHash = await hashPassword(payload.password);
    const user = await prisma.user.create({
      data: {
        roleId: role.id,
        name: payload.name,
        email: payload.email,
        phone: payload.phone,
        passwordHash
      },
      include: { role: true }
    });

    return res.status(201).json({
      token: signToken({ sub: user.id, email: user.email, role: user.role.code }),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.code
      }
    });
  } catch (error) {
    return next(error);
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

async function authenticateCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: true }
  });

  if (!user) {
    return null;
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid || !user.isActive) {
    return null;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  });

  return user;
}

function buildAuthResponse(user: NonNullable<Awaited<ReturnType<typeof authenticateCredentials>>>) {
  return {
    token: signToken({ sub: user.id, email: user.email, role: user.role.code }),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role.code
    }
  };
}

router.post("/login", async (req, res, next) => {
  try {
    const payload = loginSchema.parse(req.body);
    const user = await authenticateCredentials(payload.email, payload.password);

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    if (user.role.code !== RoleCode.CUSTOMER) {
      return res.status(403).json({ message: "Use the staff login page for this account." });
    }

    return res.json(buildAuthResponse(user));
  } catch (error) {
    return next(error);
  }
});

router.post("/admin-login", async (req, res, next) => {
  try {
    const payload = loginSchema.parse(req.body);
    const user = await authenticateCredentials(payload.email, payload.password);

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    if (user.role.code !== RoleCode.ADMIN && user.role.code !== RoleCode.SUPER_ADMIN) {
      return res.status(403).json({ message: "Admin access is restricted to admin roles." });
    }

    return res.json(buildAuthResponse(user));
  } catch (error) {
    return next(error);
  }
});

router.post("/pos-login", async (req, res, next) => {
  try {
    const payload = loginSchema.parse(req.body);
    const user = await authenticateCredentials(payload.email, payload.password);

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    if (user.role.code !== RoleCode.ADMIN && user.role.code !== RoleCode.SUPER_ADMIN && user.role.code !== RoleCode.POS_STAFF) {
      return res.status(403).json({ message: "POS access is restricted to approved staff accounts." });
    }

    return res.json(buildAuthResponse(user));
  } catch (error) {
    return next(error);
  }
});

router.get("/me", authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: {
      role: true,
      addresses: true
    }
  });

  return res.json({
    user: {
      id: user!.id,
      name: user!.name,
      email: user!.email,
      phone: user!.phone,
      role: user!.role.code,
      addresses: user!.addresses
    }
  });
});

export default router;

