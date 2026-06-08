import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import type { RoleCode } from "@prisma/client";
import { env } from "../config.js";

export type AuthPayload = {
  sub: string;
  role: RoleCode;
  email: string;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: AuthPayload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"] });
}

export function verifyToken(token: string) {
  return jwt.verify(token, env.JWT_SECRET) as AuthPayload;
}
