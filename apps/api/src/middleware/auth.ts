import type { NextFunction, Request, Response } from "express";
import type { RoleCode, User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { verifyToken } from "../lib/auth.js";

export type RequestUser = Pick<User, "id" | "email" | "name" | "username" | "canAccessAdmin" | "canAccessPos"> & {
  role: RoleCode;
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
      include: { role: true }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Invalid session." });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      canAccessAdmin: user.canAccessAdmin,
      canAccessPos: user.canAccessPos,
      role: user.role.code
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
