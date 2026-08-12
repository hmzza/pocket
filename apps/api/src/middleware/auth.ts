import type { NextFunction, Request, Response } from "express";
import { RoleCode, type User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { verifyToken } from "../lib/auth.js";
import { getEffectivePermissionKeys } from "../lib/permissions.js";

export type RequestUser = Pick<User, "id" | "email" | "name" | "username" | "canAccessAdmin" | "canAccessPos"> & {
  role: RoleCode;
  permissions: string[];
};

export const AUTH_COOKIE_NAME = "pocket_session";

declare module "express-serve-static-core" {
  interface Request {
    user?: RequestUser;
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const bearerToken = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const token = req.cookies?.[AUTH_COOKIE_NAME] ?? bearerToken;

  if (!token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true, permissionGrants: { include: { permission: true } } }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Invalid session." });
    }

    const permissions = await getEffectivePermissionKeys(user.id, user.role.code);
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      canAccessAdmin: user.role.code === RoleCode.SUPER_ADMIN || permissions.some((permission) => permission !== "POS"),
      canAccessPos: user.role.code === RoleCode.SUPER_ADMIN || permissions.includes("POS"),
      role: user.role.code,
      permissions
    };

    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

export function authorize(...roles: RoleCode[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions." });
    }

    return next();
  };
}
