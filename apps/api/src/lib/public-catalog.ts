import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export const PUBLIC_HIDDEN_CATEGORY_SLUGS = ["add-ons"];

export async function resolvePublicBranch(branchSlug?: string) {
  const branch = await prisma.branch.findFirst({
    where: {
      isActive: true,
      ...(branchSlug ? { slug: branchSlug } : {})
    },
    include: { hours: { orderBy: { dayOfWeek: "asc" } } },
    orderBy: { name: "asc" }
  });

  return branch;
}

export function publicProductWhere(branchId: string): Prisma.ProductWhereInput {
  return {
    isActive: true,
    category: {
      is: {
        isActive: true,
        slug: { notIn: [...PUBLIC_HIDDEN_CATEGORY_SLUGS] }
      }
    },
    branchPricing: {
      some: {
        branchId,
        isAvailable: true
      }
    }
  };
}

export function publicBranchPricingInclude(branchId: string) {
  return {
    where: { branchId },
    include: { branch: true }
  } as const;
}
