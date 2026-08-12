import type { Request } from "express";
import { RoleCode, type Branch } from "@prisma/client";
import { prisma } from "./prisma.js";

export type BranchSummary = Pick<Branch, "id" | "slug" | "name" | "city" | "addressLine1" | "phone" | "email" | "isActive"> & {
  deliveryFee: number;
};

export type BranchContext = {
  branch: BranchSummary;
  branchId: string;
  branches: BranchSummary[];
  primaryBranchId: string | null;
  canSwitchBranches: boolean;
};

function httpError(message: string, statusCode: number, details?: unknown) {
  return Object.assign(new Error(message), {
    statusCode,
    code: statusCode === 403 ? "BRANCH_ACCESS_DENIED" : "BRANCH_CONTEXT_ERROR",
    entity: "Branch",
    action: "resolve",
    ...(details !== undefined ? { details } : {})
  });
}

function readFirstString(value: unknown) {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }

  return typeof value === "string" ? value : undefined;
}

export function readRequestedBranchId(req: Request) {
  return (
    readFirstString(req.headers["x-branch-id"]) ??
    readFirstString(req.query.branchId) ??
    (req.body && typeof req.body === "object" ? readFirstString((req.body as Record<string, unknown>).branchId) : undefined)
  );
}

export function serializeBranchForContext(branch: Branch): BranchSummary {
  return {
    id: branch.id,
    slug: branch.slug,
    name: branch.name,
    city: branch.city,
    addressLine1: branch.addressLine1,
    phone: branch.phone,
    email: branch.email,
    deliveryFee: Number(branch.deliveryFee),
    isActive: branch.isActive
  };
}

export async function getAccessibleBranchesForUser(user: { id: string; role: RoleCode }) {
  if (user.role === RoleCode.SUPER_ADMIN) {
    const branches = await prisma.branch.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }]
    });

    return {
      branches: branches.map(serializeBranchForContext),
      primaryBranchId: branches[0]?.id ?? null,
      canSwitchBranches: branches.length > 1
    };
  }

  const accessRows = await prisma.userBranchAccess.findMany({
    where: {
      userId: user.id,
      branch: { isActive: true }
    },
    include: { branch: true }
  });

  const sorted = accessRows.sort((left, right) => {
    if (left.isPrimary !== right.isPrimary) {
      return left.isPrimary ? -1 : 1;
    }

    return left.branch.name.localeCompare(right.branch.name);
  });

  return {
    branches: sorted.map((row) => serializeBranchForContext(row.branch)),
    primaryBranchId: sorted.find((row) => row.isPrimary)?.branchId ?? sorted[0]?.branchId ?? null,
    canSwitchBranches: sorted.length > 1
  };
}

export async function resolveBranchContext(req: Request): Promise<BranchContext> {
  if (!req.user) {
    throw httpError("Authentication required before resolving branch context.", 401);
  }

  const requestedBranchId = readRequestedBranchId(req);
  const access = await getAccessibleBranchesForUser(req.user);

  if (!access.branches.length) {
    throw httpError("No active branch is assigned to this account.", 403, {
      nextStep: "Assign this user to an active branch from Users."
    });
  }

  const requestedBranch = requestedBranchId ? access.branches.find((branch) => branch.id === requestedBranchId) : undefined;
  if (requestedBranchId && !requestedBranch) {
    throw httpError("You do not have access to the selected branch.", 403, {
      requestedBranchId
    });
  }

  const selectedBranch =
    requestedBranch ??
    access.branches.find((branch) => branch.id === access.primaryBranchId) ??
    access.branches[0];

  return {
    branch: selectedBranch!,
    branchId: selectedBranch!.id,
    branches: access.branches,
    primaryBranchId: access.primaryBranchId,
    canSwitchBranches: access.canSwitchBranches
  };
}
