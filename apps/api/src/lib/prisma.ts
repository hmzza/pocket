import { PrismaClient } from "@prisma/client";

declare global {
  var __pocketPrisma__: PrismaClient | undefined;
}

export const prisma = global.__pocketPrisma__ ?? new PrismaClient();

export const INVENTORY_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 20_000
} as const;

if (process.env.NODE_ENV !== "production") {
  global.__pocketPrisma__ = prisma;
}
