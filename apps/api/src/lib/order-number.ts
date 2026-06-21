import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

const ORDER_NUMBER_ATTEMPTS = 5;

export async function generateOrderNumber() {
  const year = new Date().getUTCFullYear();
  const prefix = `PKT-${year}-`;
  const latestOrder = await prisma.order.findFirst({
    where: {
      orderNumber: {
        startsWith: prefix
      }
    },
    orderBy: {
      orderNumber: "desc"
    },
    select: {
      orderNumber: true
    }
  });

  const latestSequence = latestOrder?.orderNumber.split("-").at(-1);
  const nextSequence = (latestSequence ? Number(latestSequence) : 0) + 1;

  return `${prefix}${String(nextSequence).padStart(6, "0")}`;
}

function isOrderNumberConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    Array.isArray(error.meta?.target) &&
    error.meta.target.includes("orderNumber")
  );
}

export async function withGeneratedOrderNumber<T>(
  factory: (orderNumber: string) => Promise<T>,
  initialOrderNumber?: string
) {
  for (let attempt = 1; attempt <= ORDER_NUMBER_ATTEMPTS; attempt += 1) {
    // Reuse a pre-generated number on the first attempt (lets callers produce
    // it in parallel with other reads); regenerate only on a unique conflict.
    const orderNumber = attempt === 1 && initialOrderNumber ? initialOrderNumber : await generateOrderNumber();

    try {
      const result = await factory(orderNumber);
      return { orderNumber, result };
    } catch (error) {
      if (isOrderNumberConflict(error) && attempt < ORDER_NUMBER_ATTEMPTS) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Unable to reserve a unique order number.");
}
