import { prisma } from "./prisma.js";

export async function generateOrderNumber() {
  const year = new Date().getUTCFullYear();
  const prefix = `PKT-${year}-`;
  const count = await prisma.order.count({
    where: {
      orderNumber: {
        startsWith: prefix
      }
    }
  });

  return `${prefix}${String(count + 1).padStart(6, "0")}`;
}

