import { PrismaClient } from "@prisma/client";

declare global {
  var __pocketPrisma__: PrismaClient | undefined;
}

export const prisma = global.__pocketPrisma__ ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__pocketPrisma__ = prisma;
}

