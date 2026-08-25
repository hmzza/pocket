import { RoleCode } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "./prisma.js";

export const PERMISSION_DEFINITIONS = [
  { key: "OVERVIEW", label: "Overview", routePrefix: "/admin", permissionGroup: "Admin", sortOrder: 10 },
  { key: "BUSINESS_ANALYTICS", label: "Business Analytics", routePrefix: "/admin/analytics", permissionGroup: "Admin", sortOrder: 20 },
  { key: "PRODUCT_ANALYTICS", label: "Product Analytics", routePrefix: "/admin/analytics/products", permissionGroup: "Admin", sortOrder: 30 },
  { key: "FOODPANDA", label: "Foodpanda", routePrefix: "/admin/foodpanda", permissionGroup: "Admin", sortOrder: 40 },
  { key: "BUSINESS_HEALTH", label: "Business Health", routePrefix: "/admin/health", permissionGroup: "Admin", sortOrder: 50 },
  { key: "PRODUCTS", label: "Products", routePrefix: "/admin/products", permissionGroup: "Admin", sortOrder: 60 },
  { key: "PROMOTIONS", label: "Promotions", routePrefix: "/admin/promotions", permissionGroup: "Admin", sortOrder: 65 },
  { key: "WEBSITE", label: "Website Control", routePrefix: "/admin/website", permissionGroup: "Admin", sortOrder: 70 },
  { key: "USERS", label: "Users", routePrefix: "/admin/users", permissionGroup: "Admin", sortOrder: 80 },
  { key: "INVENTORY", label: "Inventory", routePrefix: "/admin/inventory", permissionGroup: "Operations", sortOrder: 90 },
  { key: "ORDERS", label: "Orders", routePrefix: "/admin/orders", permissionGroup: "Operations", sortOrder: 100 },
  { key: "CUSTOMERS", label: "Customers", routePrefix: "/admin/customers", permissionGroup: "Operations", sortOrder: 110 },
  { key: "EXPENSES", label: "Expenses", routePrefix: "/admin/expenses", permissionGroup: "Finance", sortOrder: 120 },
  { key: "CAPITAL", label: "Capital", routePrefix: "/admin/capital", permissionGroup: "Finance", sortOrder: 130 },
  { key: "FINANCES", label: "Finances", routePrefix: "/admin/finances", permissionGroup: "Finance", sortOrder: 140 },
  { key: "DAILY_CLOSING", label: "Daily Closing", routePrefix: "/admin/finances/daily-closing", permissionGroup: "Finance", sortOrder: 150 },
  { key: "FOODPANDA_SETTLEMENTS", label: "Foodpanda Settlements", routePrefix: "/admin/finances/foodpanda-settlements", permissionGroup: "Finance", sortOrder: 160 },
  { key: "POS", label: "POS", routePrefix: "/pos", permissionGroup: "Operations", sortOrder: 170 }
] as const;

export type PermissionKey = (typeof PERMISSION_DEFINITIONS)[number]["key"];

export function permissionKeysForUser(user: { role: RoleCode; permissions?: string[] }) {
  if (user.role === RoleCode.SUPER_ADMIN) return PERMISSION_DEFINITIONS.map((permission) => permission.key);
  return user.permissions ?? [];
}

export async function getEffectivePermissionKeys(userId: string, role: RoleCode) {
  if (role === RoleCode.SUPER_ADMIN) return PERMISSION_DEFINITIONS.map((permission) => permission.key);
  const grants = await prisma.userPermission.findMany({ where: { userId }, include: { permission: true } });
  return grants.filter((grant) => grant.permission.isActive).map((grant) => grant.permission.key);
}

export function resolveAdminPermission(path: string): PermissionKey | null {
  const matches: Array<[string, PermissionKey]> = [
    ["/api/admin/analytics/products", "PRODUCT_ANALYTICS"],
    ["/api/admin/analytics", "BUSINESS_ANALYTICS"],
    ["/api/admin/finances/daily-closing", "DAILY_CLOSING"],
    ["/api/admin/finances/foodpanda-settlements", "FOODPANDA_SETTLEMENTS"],
    ["/api/admin/finances", "FINANCES"],
    ["/api/admin/finance", "FINANCES"],
    ["/api/admin/foodpanda-settlements", "FOODPANDA_SETTLEMENTS"],
    ["/api/admin/foodpanda", "FOODPANDA"],
    ["/api/admin/health", "BUSINESS_HEALTH"],
    ["/api/admin/products", "PRODUCTS"],
    ["/api/admin/promotions", "PROMOTIONS"],
    ["/api/admin/categories", "PRODUCTS"],
    ["/api/admin/website", "WEBSITE"],
    ["/api/admin/users", "USERS"],
    ["/api/admin/inventory", "INVENTORY"],
    ["/api/admin/orders", "ORDERS"],
    ["/api/admin/customers", "CUSTOMERS"],
    ["/api/admin/expenses", "EXPENSES"],
    ["/api/admin/fixed-expenses", "EXPENSES"],
    ["/api/admin/loans", "CAPITAL"],
    ["/api/admin/investments", "CAPITAL"],
    ["/api/admin/vendors", "INVENTORY"],
    ["/api/admin/dashboard", "OVERVIEW"],
    ["/api/admin/coupons", "PRODUCTS"]
  ];

  return matches.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1] ?? null;
}

export async function ensurePermissionCatalog() {
  for (const permission of PERMISSION_DEFINITIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: {
        label: permission.label,
        routePrefix: permission.routePrefix,
        permissionGroup: permission.permissionGroup,
        sortOrder: permission.sortOrder,
        isActive: true
      },
      create: permission
    });
  }
}

export function requirePermission(permission: PermissionKey) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role === RoleCode.SUPER_ADMIN || req.user?.permissions?.includes(permission)) return next();
    return res.status(403).json({
      message: "This account does not have access to this section.",
      code: "PERMISSION_REQUIRED",
      permission,
      route: req.path,
      nextStep: "Ask a Super Admin to assign this permission."
    });
  };
}

export function requireAdminRoutePermission() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role === RoleCode.SUPER_ADMIN) return next();
    const permission = resolveAdminPermission(`/api/admin${req.path}`);
    if (!permission) {
      if (req.path === "/branches" || req.path === "/permissions") return next();
      if (req.path.startsWith("/settings") && req.user?.permissions.some((permission) => permission !== "POS")) return next();
      if (req.path.startsWith("/notifications") && req.user?.permissions.includes("OVERVIEW")) return next();
      if (req.path.startsWith("/uploads") && (req.user?.permissions.includes("WEBSITE") || req.user?.permissions.includes("PRODUCTS"))) return next();
      return res.status(403).json({ message: "This admin route is not registered in the permission registry.", code: "PERMISSION_NOT_REGISTERED", route: req.path });
    }
    return requirePermission(permission)(req, res, next);
  };
}
