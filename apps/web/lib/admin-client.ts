"use client";

import type {
  AdminCustomer,
  AdminExpenseData,
  AdminFixedExpenseData,
  AdminDailyClosingData,
  AdminCashPositionData,
  AdminFoodpandaSettlementData,
  AdminInventoryForecast,
  AdminInvestmentData,
  AdminRecipeData,
  AdminInventoryData,
  AdminLoanData,
  AdminMoneyTransferData,
  AdminOrderSegment,
  AdminPackagingRuleData,
  AdminOrder,
  AdminProduct,
  AdminRangePreset,
  AdminUser,
  AdminUserData,
  AdminVendor,
  AdminVendorData,
  Branch,
  Category,
  DashboardData,
  AdminPromotionData,
  PosPromotion
} from "@/lib/types";
import { getPocketImageAltFromFilename, isSupportedPocketImageFile, preparePocketImageUpload, readFileAsDataUrl } from "@/lib/image-upload";
import { resolvePocketImagePath } from "@/lib/image-paths";
import { getSelectedBranchId } from "@/lib/branch-selection";

const API_URL = typeof window === "undefined" ? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000" : "";

function selectedBranchIdOr(explicitBranchId?: string) {
  return getSelectedBranchId() || explicitBranchId || "";
}

function withSelectedBranch(payload: Record<string, unknown>) {
  const selectedBranchId = getSelectedBranchId();
  return selectedBranchId ? { ...payload, branchId: selectedBranchId } : payload;
}

async function adminFetch<T>(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);

  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  const selectedBranchId = getSelectedBranchId();
  if (selectedBranchId && !headers.has("x-branch-id")) {
    headers.set("x-branch-id", selectedBranchId);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include"
  });

  if (!response.ok) {
    let message = "Request failed.";
    if (response.status === 413) {
      message = "Image is too large. The app compresses uploads automatically, but this file still exceeds the server limit.";
    }
    try {
      const payload = await response.json();
      const structured = {
        ...(payload?.code ? { code: payload.code } : {}),
        ...(payload?.entity ? { entity: payload.entity } : {}),
        ...(payload?.action ? { action: payload.action } : {})
      };
      const details = [
        ...normalizeDetails(Object.keys(structured).length ? structured : null),
        ...normalizeDetails(payload?.details ?? payload?.issues)
      ];
      const responseMessage = payload.message ?? message;
      message = details.length ? [responseMessage, ...details].filter(Boolean).join("\n") : responseMessage;
    } catch {}
    throw new Error(message);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

export async function fetchAdminProducts() {
  const [productResponse, categoryResponse] = await Promise.all([
    adminFetch<{ products: any[] }>("/api/admin/products"),
    adminFetch<{ categories: any[] }>("/api/admin/categories")
  ]);

  const categories: Category[] = categoryResponse.categories.map((category) => ({
    id: category.id,
    slug: category.slug,
    name: category.name,
    description: category.description ?? "",
    imageUrl: resolvePocketImagePath(category.imageUrl ?? "")
  }));

  const products: AdminProduct[] = productResponse.products.map((product) => ({
    id: product.id,
    categoryId: product.categoryId,
    slug: product.slug,
    sku: product.sku,
    name: product.name,
    description: product.description,
    ingredients: product.ingredients ?? [],
    basePrice: Number(product.branchPricing?.[0]?.price ?? product.basePrice),
    foodPackagingCost: product.foodPackagingCost == null ? null : Number(product.foodPackagingCost),
    costSettingsUpdatedAt: product.costSettingsUpdatedAt ?? null,
    calories: product.calories ?? undefined,
    featured: Boolean(product.featured),
    bestSeller: Boolean(product.bestSeller),
    isActive: Boolean(product.isActive),
    stockStatus: product.stockStatus,
    imageUrl: resolvePocketImagePath(product.images?.[0]?.url ?? "/images/shawarma-pocket.svg"),
    images: (product.images ?? []).map((image: any) => ({
      url: resolvePocketImagePath(image.url),
      alt: image.alt ?? product.name,
      sortOrder: image.sortOrder ?? undefined
    })),
    bundleComponents: (product.bundleComponents ?? []).map((component: any) => ({
      productId: component.componentProductId,
      productName: component.componentProduct?.name ?? "Unknown product",
      quantity: Number(component.quantity),
      sortOrder: component.sortOrder ?? undefined
    })),
    costSummary: product.costSummary
      ? {
          recipeCost: Number(product.costSummary.recipeCost),
          packagingCost: Number(product.costSummary.packagingCost),
          totalCost: Number(product.costSummary.totalCost),
          salePrice: Number(product.costSummary.salePrice),
          grossProfit: Number(product.costSummary.grossProfit),
          marginPercent: Number(product.costSummary.marginPercent),
          calories: Number(product.costSummary.calories),
          linkedIngredients: Number(product.costSummary.linkedIngredients),
          items: (product.costSummary.items ?? []).map((item: any) => ({
            ingredientId: item.ingredientId,
            ingredientName: item.ingredientName,
            ingredientType: item.ingredientType,
            unit: item.unit,
            quantity: Number(item.quantity),
            unitCost: Number(item.unitCost),
            cost: Number(item.cost),
            calories: Number(item.calories)
          }))
        }
      : undefined,
    category: {
      id: product.category.id,
      slug: product.category.slug,
      name: product.category.name,
      description: product.category.description ?? "",
      imageUrl: product.category.imageUrl ?? ""
    }
  }));

  return { products, categories };
}

export async function fetchAdminSettings() {
  const data = await adminFetch<{ settings: Array<{ key: string; value: unknown }> }>("/api/admin/settings");
  return data.settings;
}

export async function fetchAdminVendors(): Promise<AdminVendorData> {
  const data = await adminFetch<{ vendors: any[]; categories: string[] }>("/api/admin/vendors");
  return {
    vendors: data.vendors.map((vendor) => ({
      id: vendor.id,
      ingredientCategory: vendor.ingredientCategory,
      vendorName: vendor.vendorName,
      contactNumber: vendor.contactNumber ?? "",
      type: vendor.type ?? "",
      provides: vendor.provides ?? "",
      quotedPrice: vendor.quotedPrice ?? "",
      rateListUrl: vendor.rateListUrl ?? "",
      notes: vendor.notes ?? "",
      isActive: vendor.isActive ?? true,
      createdAt: vendor.createdAt,
      updatedAt: vendor.updatedAt
    })),
    categories: data.categories
  };
}

export async function createAdminVendorCategory(name: string) {
  const data = await adminFetch<{ category: string }>("/api/admin/vendors/categories", {
    method: "POST",
    body: JSON.stringify({ name })
  });
  return data.category;
}

export async function createAdminVendor(payload: Record<string, unknown>) {
  const data = await adminFetch<{ vendor: AdminVendor }>("/api/admin/vendors", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return data.vendor;
}

export async function updateAdminVendor(vendorId: string, payload: Record<string, unknown>) {
  const data = await adminFetch<{ vendor: AdminVendor }>(`/api/admin/vendors/${vendorId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return data.vendor;
}

export async function deleteAdminVendor(vendorId: string) {
  const data = await adminFetch<{ deleted: boolean }>(`/api/admin/vendors/${vendorId}`, {
    method: "DELETE"
  });
  return data.deleted;
}

export async function uploadAdminVendorRateList(file: File) {
  const allowedTypes = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel"
  ]);
  if (!allowedTypes.has(file.type)) {
    throw new Error("Only PDF, image, CSV, and Excel rate lists are allowed.");
  }

  const dataUrl = await readFileAsDataUrl(file);
  const data = await adminFetch<{ url: string; filename: string }>("/api/admin/vendors/rate-list", {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      dataUrl
    })
  });
  return data;
}

export async function uploadAdminImage(file: File) {
  if (!isSupportedPocketImageFile(file)) {
    throw new Error("Only PNG and JPEG images are allowed.");
  }

  const preparedFile = await preparePocketImageUpload(file);
  const dataUrl = await readFileAsDataUrl(preparedFile);
  const data = await adminFetch<{ url: string; filename: string }>("/api/admin/uploads/images", {
    method: "POST",
    body: JSON.stringify({
      filename: preparedFile.name,
      dataUrl
    })
  });

  return {
    url: data.url,
    filename: data.filename,
    alt: getPocketImageAltFromFilename(file.name)
  };
}

export async function createAdminProduct(payload: Record<string, unknown>) {
  const data = await adminFetch<{ product: any }>("/api/admin/products", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return data.product;
}

export async function updateAdminProduct(productId: string, payload: Record<string, unknown>) {
  const data = await adminFetch<{ product: any }>(`/api/admin/products/${productId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return data.product;
}

export async function updateAdminProductCostSettings(productId: string, payload: Record<string, unknown>) {
  const data = await adminFetch<{ product: any }>(`/api/admin/products/${productId}/cost-settings`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return data.product;
}

export async function downloadAdminProductAnalyticsExport(params: {
  preset: AdminRangePreset;
  start?: string;
  end?: string;
  category?: string;
  search?: string;
  sort?: "revenue" | "profit" | "units" | "margin";
}) {
  const searchParams = new URLSearchParams({ preset: params.preset });
  if (params.start) searchParams.set("start", params.start);
  if (params.end) searchParams.set("end", params.end);
  if (params.category && params.category !== "all") searchParams.set("category", params.category);
  if (params.search) searchParams.set("search", params.search);
  if (params.sort) searchParams.set("sort", params.sort);

  const response = await fetch(`${API_URL}/api/admin/products/analytics/export?${searchParams.toString()}`, { credentials: "include" });
  if (!response.ok) {
    let message = "Product analytics export failed.";
    try {
      const payload = await response.json();
      message = payload.message ?? message;
    } catch {}
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="?([^\"]+)"?/i);
  const fileName = match?.[1] ?? "pocket-product-analytics.xlsx";
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function deleteAdminProduct(productId: string) {
  const data = await adminFetch<{ mode: "deleted"; message: string }>(`/api/admin/products/${productId}`, {
    method: "DELETE"
  });
  return data;
}

export async function fetchAdminOrders(params?: {
  segment?: AdminOrderSegment;
  preset?: AdminRangePreset;
  start?: string;
  end?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.segment) searchParams.set("segment", params.segment);
  if (params?.preset) searchParams.set("preset", params.preset);
  if (params?.start) searchParams.set("start", params.start);
  if (params?.end) searchParams.set("end", params.end);
  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const data = await adminFetch<{ orders: any[] }>(`/api/admin/orders${suffix}`);
  const orders: AdminOrder[] = data.orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    channel: order.channel,
    serviceType: order.serviceType,
    foodpandaOrderNumber: order.foodpandaOrderNumber ?? null,
    customerName: order.customerName ?? order.customer?.name ?? "Walk-in Customer",
    customerPhone: order.customerPhone ?? order.customer?.phone ?? undefined,
    status: order.status,
    branch: typeof order.branch === "string" ? order.branch : order.branch?.name ?? "Unknown branch",
    totalAmount: Number(order.totalAmount),
    subtotal: Number(order.subtotal),
    discountAmount: Number(order.discountAmount),
    taxRate: Number(order.taxRate),
    taxAmount: Number(order.taxAmount),
    paidAmount: Number(order.cashReceivedAmount ?? order.totalAmount),
    changeDueAmount: Number(order.changeDueAmount ?? 0),
    manualDiscountType: order.manualDiscountType ?? undefined,
    manualDiscountValue: order.manualDiscountValue == null ? undefined : Number(order.manualDiscountValue),
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    placedAt: order.placedAt,
    deliveryInstructions: order.deliveryInstructions ?? undefined,
    address: order.address
      ? {
          addressLine1: order.address.addressLine1,
          city: order.address.city,
          instructions: order.address.instructions ?? undefined
        }
      : undefined,
    items: (order.items ?? []).map((item: any) => ({
      id: item.id,
      productName: item.productName,
      customDescription: item.customDescription ?? undefined,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      note: item.note ?? undefined,
      bundleComponents: (item.bundleComponents ?? []).map((component: any) => ({
        productId: component.productId ?? "",
        productName: component.componentProductName,
        quantity: Number(component.quantity),
        sortOrder: component.sortOrder ?? undefined
      })),
      addOns: item.addOns.map((addOn: any) => ({
        id: addOn.id,
        optionName: addOn.optionName,
        priceDelta: Number(addOn.priceDelta)
      }))
    }))
  }));

  return orders;
}

export async function fetchAdminSession() {
  return adminFetch<{
    user: {
      id: string;
      role: string;
      name: string;
      username: string;
      email: string;
      canAccessAdmin: boolean;
      canAccessPos: boolean;
      permissions: string[];
      availablePermissions: Array<{ key: string; label: string; routePrefix: string; permissionGroup: string; sortOrder: number }>;
      branches: Branch[];
      primaryBranchId: string | null;
      canSwitchBranches: boolean;
    };
  }>("/api/auth/me");
}

export async function fetchAdminIndependencePromotion(params?: { preset?: string; date?: string }) {
  const query = new URLSearchParams();
  if (params?.preset) query.set("preset", params.preset);
  if (params?.date) query.set("date", params.date);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return adminFetch<AdminPromotionData>(`/api/admin/promotions/independence-day${suffix}`);
}

export async function updateAdminIndependencePromotion(isActive: boolean) {
  const data = await adminFetch<{ promotion: PosPromotion }>("/api/admin/promotions/independence-day", {
    method: "PATCH",
    body: JSON.stringify({ isActive })
  });
  return data.promotion;
}

export async function fetchAdminBranches() {
  return adminFetch<{
    branches: Branch[];
    selectedBranchId: string;
    primaryBranchId: string | null;
    canSwitchBranches: boolean;
  }>("/api/admin/branches");
}

export async function createAdminBranch(payload: Record<string, unknown>) {
  const data = await adminFetch<{ branch: Branch }>("/api/admin/branches", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return data.branch;
}

export async function updateAdminBranch(branchId: string, payload: Record<string, unknown>) {
  const data = await adminFetch<{ branch: Branch }>(`/api/admin/branches/${branchId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return data.branch;
}

function normalizeDetails(value: unknown, path = ""): string[] {
  if (value == null) {
    return [];
  }

  if (typeof value === "string") {
    const text = value.trim();
    return text ? [path ? `${path}: ${text}` : text] : [];
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [path ? `${path}: ${String(value)}` : String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeDetails(entry, path)).filter(Boolean);
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
      const nextPath = path ? `${path}.${key}` : key;
      return normalizeDetails(entry, nextPath);
    });
  }

  return [path ? `${path}: ${String(value)}` : String(value)];
}

export async function logoutAdminSession() {
  await adminFetch<null>("/api/auth/logout", {
    method: "POST"
  });
}

export async function deleteAdminOrder(orderId: string) {
  const data = await adminFetch<{ deleted: boolean }>(`/api/admin/orders/${orderId}`, {
    method: "DELETE"
  });
  return data.deleted;
}

export async function deleteAllAdminOrders() {
  const data = await adminFetch<{ deletedCount: number }>("/api/admin/orders", {
    method: "DELETE"
  });
  return data.deletedCount;
}

export async function fetchAdminDashboard(params?: {
  preset?: AdminRangePreset;
  start?: string;
  end?: string;
  segment?: AdminOrderSegment;
}): Promise<DashboardData> {
  const searchParams = new URLSearchParams();
  if (params?.preset) searchParams.set("preset", params.preset);
  if (params?.start) searchParams.set("start", params.start);
  if (params?.end) searchParams.set("end", params.end);
  if (params?.segment) searchParams.set("segment", params.segment);

  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const dashboard = await adminFetch<any>(`/api/admin/dashboard${suffix}`);

  return {
    range: {
      preset: dashboard.range.preset,
      start: dashboard.range.start,
      end: dashboard.range.end,
      label: dashboard.range.label,
      segment: dashboard.range.segment ?? params?.segment ?? "all"
    },
    summary: {
      revenue: Number(dashboard.summary.revenue),
      previousRevenue: Number(dashboard.summary.previousRevenue),
      orders: dashboard.summary.orders,
      previousOrders: dashboard.summary.previousOrders,
      averageOrderValue: Number(dashboard.summary.averageOrderValue),
      previousAverageOrderValue: Number(dashboard.summary.previousAverageOrderValue),
      activeCustomers: dashboard.summary.activeCustomers,
      repeatCustomers: dashboard.summary.repeatCustomers,
      totalCustomers: dashboard.summary.totalCustomers,
      revenueDelta: Number(dashboard.summary.revenueDelta),
      ordersDelta: Number(dashboard.summary.ordersDelta),
      averageOrderValueDelta: Number(dashboard.summary.averageOrderValueDelta)
    },
    series: dashboard.series.map((entry: any) => ({
      label: entry.label,
      revenue: Number(entry.revenue),
      orders: entry.orders
    })),
    topProducts: dashboard.topProducts.map((entry: any) => ({
      productName: entry.productName,
      quantity: entry.quantity,
      revenue: Number(entry.revenue)
    })),
    recentOrders: dashboard.recentOrders.map((order: any) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      totalAmount: Number(order.totalAmount),
      placedAt: order.placedAt,
      branch: order.branch,
      channel: order.channel,
      serviceType: order.serviceType
    })),
    lowStock: dashboard.lowStock.map((entry: any) => ({
      ingredient: entry.ingredient,
      branch: entry.branch,
      quantityOnHand: Number(entry.quantityOnHand)
    })),
    breakdowns: {
      channels: dashboard.breakdowns.channels.map((entry: any) => ({
        label: entry.label,
        count: entry.count,
        revenue: Number(entry.revenue)
      })),
      serviceTypes: dashboard.breakdowns.serviceTypes.map((entry: any) => ({
        label: entry.label,
        count: entry.count,
        revenue: Number(entry.revenue)
      })),
      payments: dashboard.breakdowns.payments.map((entry: any) => ({
        label: entry.label,
        count: entry.count,
        revenue: Number(entry.revenue)
      })),
      branches: dashboard.breakdowns.branches.map((entry: any) => ({
        label: entry.label,
        count: entry.count,
        revenue: Number(entry.revenue),
        foodpandaRevenue: Number(entry.foodpandaRevenue ?? 0)
      })),
      weekdays: dashboard.breakdowns.weekdays.map((entry: any) => ({
        label: entry.label,
        count: entry.count,
        revenue: Number(entry.revenue)
      })),
      hours: dashboard.breakdowns.hours.map((entry: any) => ({
        label: entry.label,
        count: entry.count,
        revenue: Number(entry.revenue)
      }))
    }
  };
}

export async function fetchAdminCustomers(): Promise<AdminCustomer[]> {
  const data = await adminFetch<{ customers: any[] }>("/api/admin/customers");
  return data.customers.map((customer) => ({
    id: customer.id,
    name: customer.name ?? "Unknown customer",
    email: customer.email,
    phone: customer.phone ?? undefined,
    totalOrders: customer.totalOrders,
    totalSpend: Number(customer.totalSpend),
    lastOrderDate: customer.lastOrderDate
  }));
}

export async function fetchAdminUsers(params?: { search?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set("search", params.search);
  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const data = await adminFetch<AdminUserData>(`/api/admin/users${suffix}`);
  return data.users;
}

export async function createAdminUser(payload: Record<string, unknown>) {
  const data = await adminFetch<{ user: AdminUser }>("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return data.user;
}

export async function updateAdminUser(userId: string, payload: Record<string, unknown>) {
  const data = await adminFetch<{ user: AdminUser }>(`/api/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return data.user;
}

export async function deleteAdminUser(userId: string) {
  const data = await adminFetch<{ deleted: boolean }>(`/api/admin/users/${userId}`, {
    method: "DELETE"
  });
  return data.deleted;
}

export async function updateAdminSetting(key: string, value: unknown) {
  const data = await adminFetch<{ setting: { key: string; value: unknown } }>(`/api/admin/settings/${key}`, {
    method: "PUT",
    body: JSON.stringify({ value })
  });
  return data.setting;
}

export async function fetchAdminInventory(branchId?: string): Promise<AdminInventoryData> {
  const searchParams = new URLSearchParams();
  const activeBranchId = selectedBranchIdOr(branchId);
  if (activeBranchId) searchParams.set("branchId", activeBranchId);
  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const data = await adminFetch<any>(`/api/admin/inventory${suffix}`);

  return {
    branches: data.branches.map((branch: any) => ({
      id: branch.id,
      slug: branch.slug,
      name: branch.name,
      city: branch.city,
      addressLine1: branch.addressLine1,
      phone: branch.phone,
      deliveryFee: Number(branch.deliveryFee)
    })),
    summary: {
      totalItems: data.summary.totalItems,
      lowStockItems: data.summary.lowStockItems,
      totalStockValue: Number(data.summary.totalStockValue),
      totalUnits: Number(data.summary.totalUnits),
      wastageCostToday: Number(data.summary.wastageCostToday ?? 0),
      suggestedPurchaseCost: Number(data.summary.suggestedPurchaseCost ?? 0)
    },
    items: data.items.map((item: any) => ({
      id: item.id,
      branchId: item.branchId,
      branchName: item.branchName,
      ingredientId: item.ingredientId,
      name: item.name,
      sku: item.sku,
      unit: item.unit,
      type: item.type ?? "RAW",
      reorderLevel: Number(item.reorderLevel),
      costPerUnit: Number(item.costPerUnit),
      caloriesPerUnit: Number(item.caloriesPerUnit ?? 0),
      isActive: item.isActive !== false,
      quantityOnHand: Number(item.quantityOnHand),
      stockValue: Number(item.stockValue),
      lowStockAlert: Boolean(item.lowStockAlert),
      purchaseUnits: (item.purchaseUnits ?? []).map((unit: any) => ({
        id: unit.id,
        name: unit.name,
        quantityInBaseUnits: Number(unit.quantityInBaseUnits),
        isActive: unit.isActive !== false
      })),
      linkedProducts: (item.linkedProducts ?? []).map((usage: any) => ({
        productId: usage.productId,
        productName: usage.productName,
        quantityNeeded: Number(usage.quantityNeeded)
      })),
      updatedAt: item.updatedAt
    })),
    recentTransactions: data.recentTransactions.map((entry: any) => ({
      id: entry.id,
      branchId: entry.branchId,
      branchName: entry.branchName,
      ingredientId: entry.ingredientId,
      ingredientName: entry.ingredientName,
      type: entry.type,
      quantity: Number(entry.quantity),
      balanceAfter: Number(entry.balanceAfter),
      note: entry.note ?? undefined,
      referenceType: entry.referenceType ?? undefined,
      referenceId: entry.referenceId ?? undefined,
      vendorName: entry.vendorName ?? undefined,
      purchaseDate: entry.purchaseDate ?? undefined,
      purchaseCost: entry.purchaseCost == null ? undefined : Number(entry.purchaseCost),
      purchaseQuantity: entry.purchaseQuantity == null ? undefined : Number(entry.purchaseQuantity),
      purchaseUnitId: entry.purchaseUnitId ?? undefined,
      purchaseUnitLabel: entry.purchaseUnitLabel ?? undefined,
      wastageReason: entry.wastageReason ?? undefined,
      editedAt: entry.editedAt ?? undefined,
      actorName: entry.actorName ?? undefined,
      createdAt: entry.createdAt
    }))
  };
}

export async function createAdminInventoryItem(payload: Record<string, unknown>) {
  const data = await adminFetch<{ ingredient: any }>("/api/admin/inventory/items", {
    method: "POST",
    body: JSON.stringify(withSelectedBranch(payload))
  });
  return data.ingredient;
}

export async function updateAdminInventoryItem(ingredientId: string, payload: Record<string, unknown>) {
  const data = await adminFetch<{ ingredient: any }>(`/api/admin/inventory/items/${ingredientId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return data.ingredient;
}

export async function updateAdminInventoryItemStatus(ingredientId: string, isActive: boolean) {
  const data = await adminFetch<{ ingredient: any }>(`/api/admin/inventory/items/${ingredientId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive })
  });
  return data.ingredient;
}

export async function deleteAdminInventoryItem(ingredientId: string) {
  await adminFetch(`/api/admin/inventory/items/${ingredientId}`, {
    method: "DELETE"
  });
}

export async function createAdminInventoryTransaction(payload: Record<string, unknown>) {
  const data = await adminFetch<{ inventory: any }>("/api/admin/inventory/transactions", {
    method: "POST",
    body: JSON.stringify(withSelectedBranch(payload))
  });
  return data.inventory;
}

export async function updateAdminInventoryTransaction(transactionId: string, payload: Record<string, unknown>) {
  const data = await adminFetch<{ ok: boolean }>(`/api/admin/inventory/transactions/${transactionId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return data.ok;
}

export async function fetchAdminInventoryForecast(): Promise<AdminInventoryForecast> {
  const data = await adminFetch<any>("/api/admin/inventory/forecast");
  return {
    branchId: data.branchId,
    generatedAt: data.generatedAt,
    horizons: (data.horizons ?? []).map((horizon: any) => ({
      label: horizon.label,
      days: Number(horizon.days),
      suggestedPurchaseCost: Number(horizon.suggestedPurchaseCost),
      items: (horizon.items ?? []).map((item: any) => ({
        ingredientId: item.ingredientId,
        name: item.name,
        unit: item.unit,
        currentStock: Number(item.currentStock),
        expectedUsage: Number(item.expectedUsage),
        suggestedBuy: Number(item.suggestedBuy),
        estimatedCost: Number(item.estimatedCost),
        confidence: item.confidence
      }))
    }))
  };
}

export async function fetchAdminInventoryRecipes(): Promise<AdminRecipeData> {
  return adminFetch<AdminRecipeData>("/api/admin/inventory/recipes");
}

export async function updateAdminProductRecipe(productId: string, components: Array<{ ingredientId: string; quantityNeeded: number }>) {
  const data = await adminFetch<{ ok: boolean }>(`/api/admin/inventory/recipes/products/${productId}`, {
    method: "PATCH",
    body: JSON.stringify({ components })
  });
  return data.ok;
}

export async function updateAdminProductPackagingRules(
  productId: string,
  rules: Array<{ serviceType: string; ingredientId: string; quantityNeeded: number }>
) {
  const data = await adminFetch<{ ok: boolean }>(`/api/admin/inventory/recipes/products/${productId}/packaging`, {
    method: "PATCH",
    body: JSON.stringify({ rules })
  });
  return data.ok;
}

export async function updateAdminPreparedRecipe(ingredientId: string, components: Array<{ ingredientId: string; quantityNeeded: number }>) {
  const data = await adminFetch<{ ok: boolean }>(`/api/admin/inventory/recipes/prepared/${ingredientId}`, {
    method: "PATCH",
    body: JSON.stringify({ components })
  });
  return data.ok;
}

export async function fetchAdminPackagingRules(): Promise<AdminPackagingRuleData> {
  return adminFetch<AdminPackagingRuleData>("/api/admin/inventory/rules");
}

export async function saveAdminPackagingRule(payload: Record<string, unknown>) {
  const data = await adminFetch<{ rule: any }>("/api/admin/inventory/rules", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return data.rule;
}

export async function deleteAdminPackagingRule(ruleId: string) {
  await adminFetch(`/api/admin/inventory/rules/${ruleId}`, {
    method: "DELETE"
  });
}

export async function fetchAdminMoneyTransfers(branchId?: string): Promise<AdminMoneyTransferData> {
  const searchParams = new URLSearchParams();
  const activeBranchId = selectedBranchIdOr(branchId);
  if (activeBranchId) searchParams.set("branchId", activeBranchId);
  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
  return adminFetch<AdminMoneyTransferData>(`/api/admin/inventory/transfers${suffix}`);
}

export async function createAdminMoneyTransfer(payload: Record<string, unknown>) {
  const data = await adminFetch<{ transfer: any }>("/api/admin/inventory/transfers", {
    method: "POST",
    body: JSON.stringify(withSelectedBranch(payload))
  });
  return data.transfer;
}

export async function deleteAdminMoneyTransfer(transferId: string) {
  await adminFetch(`/api/admin/inventory/transfers/${transferId}`, {
    method: "DELETE"
  });
}

export async function fetchAdminDailyClosing(branchId: string, date?: string): Promise<AdminDailyClosingData> {
  const searchParams = new URLSearchParams({ branchId: selectedBranchIdOr(branchId) });
  if (date) searchParams.set("date", date);
  return adminFetch<AdminDailyClosingData>(`/api/admin/inventory/closing?${searchParams.toString()}`);
}

export async function saveAdminDailyClosing(payload: Record<string, unknown>) {
  const data = await adminFetch<{ closing: any }>("/api/admin/inventory/closing", {
    method: "POST",
    body: JSON.stringify(withSelectedBranch(payload))
  });
  return data.closing;
}

export async function saveAdminOpeningBalance(payload: Record<string, unknown>) {
  const data = await adminFetch<{ openingBalance: any }>("/api/admin/inventory/opening-balance", {
    method: "POST",
    body: JSON.stringify(withSelectedBranch(payload))
  });
  return data.openingBalance;
}

export async function deleteAdminDailyClosing(closingId: string) {
  await adminFetch(`/api/admin/inventory/closing/${closingId}`, {
    method: "DELETE"
  });
}

export async function fetchAdminFoodpandaSettlements(period: "week" | "month" | "year" = "month") {
  return adminFetch<AdminFoodpandaSettlementData>(`/api/admin/foodpanda-settlements?period=${period}`);
}

export async function fetchAdminCashPosition() {
  return adminFetch<AdminCashPositionData>("/api/admin/finance/cash-position");
}

export async function receiveAdminFoodpandaSettlement(payload: Record<string, unknown>) {
  const data = await adminFetch<{ settlement: any }>("/api/admin/foodpanda-settlements/receive", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return data.settlement;
}

export async function ignoreAdminFoodpandaSettlement(weekStart: string) {
  await adminFetch(`/api/admin/foodpanda-settlements/${encodeURIComponent(weekStart)}`, { method: "DELETE" });
}

export async function fetchAdminLoans(params?: {
  preset?: AdminRangePreset;
  branchId?: string;
  status?: "all" | "open" | "paid";
  search?: string;
  monthKey?: string;
  start?: string;
  end?: string;
}): Promise<AdminLoanData> {
  const searchParams = new URLSearchParams();
  if (params?.preset) searchParams.set("preset", params.preset);
  const activeBranchId = selectedBranchIdOr(params?.branchId);
  if (activeBranchId) searchParams.set("branchId", activeBranchId);
  if (params?.status) searchParams.set("status", params.status);
  if (params?.search) searchParams.set("search", params.search);
  if (params?.monthKey) searchParams.set("monthKey", params.monthKey);
  if (params?.start) searchParams.set("start", params.start);
  if (params?.end) searchParams.set("end", params.end);
  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
  return adminFetch<AdminLoanData>(`/api/admin/loans${suffix}`);
}

export async function createAdminLoan(payload: Record<string, unknown>) {
  const data = await adminFetch<{ loan: any }>("/api/admin/loans", {
    method: "POST",
    body: JSON.stringify(withSelectedBranch(payload))
  });
  return data.loan;
}

export async function updateAdminLoan(loanId: string, payload: Record<string, unknown>) {
  const data = await adminFetch<{ loan: any }>(`/api/admin/loans/${loanId}`, {
    method: "PATCH",
    body: JSON.stringify(withSelectedBranch(payload))
  });
  return data.loan;
}

export async function deleteAdminLoan(loanId: string) {
  await adminFetch(`/api/admin/loans/${loanId}`, {
    method: "DELETE"
  });
}

export async function createAdminLoanRepayment(loanId: string, payload: Record<string, unknown>) {
  const data = await adminFetch<{ repayment: any }>(`/api/admin/loans/${loanId}/repayments`, {
    method: "POST",
    body: JSON.stringify(withSelectedBranch(payload))
  });
  return data.repayment;
}

export async function deleteAdminLoanRepayment(loanId: string, repaymentId: string) {
  await adminFetch(`/api/admin/loans/${loanId}/repayments/${repaymentId}`, {
    method: "DELETE"
  });
}

export async function saveAdminInventoryPurchaseUnits(ingredientId: string, units: Array<{ id?: string; name: string; quantityInBaseUnits: number; isActive?: boolean }>) {
  const data = await adminFetch<{ units: any[] }>(`/api/admin/inventory/items/${ingredientId}/purchase-units`, {
    method: "PUT",
    body: JSON.stringify({ units })
  });
  return data.units;
}

export async function resetAdminDailyClosing(closingId: string) {
  const data = await adminFetch<{ closing: any }>(`/api/admin/inventory/closing/${closingId}/reset`, {
    method: "POST"
  });
  return data.closing;
}

export async function fetchAdminOtherMoneyIn(preset: "today" | "7d" | "30d" | "month" | "year" = "month") {
  return adminFetch<{ amount: number; range: { start: string; end: string; label: string } }>(`/api/admin/finance/other-money-in?preset=${preset}`);
}

export async function createAdminMoneyAddition(payload: Record<string, unknown>) {
  const data = await adminFetch<{ addition: any }>("/api/admin/inventory/closing/additions", {
    method: "POST",
    body: JSON.stringify(withSelectedBranch(payload))
  });
  return data.addition;
}

export async function deleteAdminMoneyAddition(additionId: string) {
  await adminFetch(`/api/admin/inventory/closing/additions/${additionId}`, { method: "DELETE" });
}

export async function fetchAdminPermissions() {
  const data = await adminFetch<{ permissions: Array<{ key: string; label: string; routePrefix: string; permissionGroup: string; sortOrder: number }> }>("/api/admin/permissions");
  return data.permissions;
}

export async function fetchAdminInvestments(): Promise<AdminInvestmentData> {
  return adminFetch<AdminInvestmentData>("/api/admin/investments");
}

export async function createAdminInvestmentPartner(payload: Record<string, unknown>) {
  const data = await adminFetch<{ partner: any }>("/api/admin/investments/partners", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return data.partner;
}

export async function updateAdminInvestmentPartner(partnerId: string, payload: Record<string, unknown>) {
  const data = await adminFetch<{ partner: any }>(`/api/admin/investments/partners/${partnerId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return data.partner;
}

export async function deleteAdminInvestmentPartner(partnerId: string) {
  await adminFetch(`/api/admin/investments/partners/${partnerId}`, {
    method: "DELETE"
  });
}

export async function createAdminInvestmentCommitment(payload: Record<string, unknown>) {
  const data = await adminFetch<{ commitment: any }>("/api/admin/investments/commitments", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return data.commitment;
}

export async function updateAdminInvestmentCommitment(commitmentId: string, payload: Record<string, unknown>) {
  const data = await adminFetch<{ commitment: any }>(`/api/admin/investments/commitments/${commitmentId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return data.commitment;
}

export async function deleteAdminInvestmentCommitment(commitmentId: string) {
  await adminFetch(`/api/admin/investments/commitments/${commitmentId}`, {
    method: "DELETE"
  });
}

export async function createAdminInvestmentPayment(payload: Record<string, unknown>) {
  const data = await adminFetch<{ payment: any }>("/api/admin/investments/payments", {
    method: "POST",
    body: JSON.stringify(withSelectedBranch(payload))
  });
  return data.payment;
}

export async function updateAdminInvestmentPayment(paymentId: string, payload: Record<string, unknown>) {
  const data = await adminFetch<{ payment: any }>(`/api/admin/investments/payments/${paymentId}`, {
    method: "PATCH",
    body: JSON.stringify(withSelectedBranch(payload))
  });
  return data.payment;
}

export async function deleteAdminInvestmentPayment(paymentId: string) {
  await adminFetch(`/api/admin/investments/payments/${paymentId}`, {
    method: "DELETE"
  });
}

export async function fetchAdminExpenses(params?: {
  preset?: AdminRangePreset;
  branchId?: string;
  category?: string;
  search?: string;
  monthKey?: string;
  start?: string;
  end?: string;
}): Promise<AdminExpenseData> {
  const searchParams = new URLSearchParams();
  if (params?.preset) searchParams.set("preset", params.preset);
  const activeBranchId = selectedBranchIdOr(params?.branchId);
  if (activeBranchId) searchParams.set("branchId", activeBranchId);
  if (params?.category) searchParams.set("category", params.category);
  if (params?.search) searchParams.set("search", params.search);
  if (params?.monthKey) searchParams.set("monthKey", params.monthKey);
  if (params?.start) searchParams.set("start", params.start);
  if (params?.end) searchParams.set("end", params.end);
  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const data = await adminFetch<any>(`/api/admin/expenses${suffix}`);

  return {
    range: {
      preset: data.range.preset,
      start: data.range.start,
      end: data.range.end,
      label: data.range.label
    },
    branches: data.branches.map((branch: any) => ({
      id: branch.id,
      slug: branch.slug,
      name: branch.name,
      city: branch.city,
      addressLine1: branch.addressLine1,
      phone: branch.phone,
      deliveryFee: Number(branch.deliveryFee)
    })),
    summary: {
      totalAmount: Number(data.summary.totalAmount),
      totalCount: data.summary.totalCount,
      averageAmount: Number(data.summary.averageAmount)
    },
    series: data.series.map((entry: any) => ({
      label: entry.label,
      revenue: Number(entry.revenue),
      orders: entry.orders
    })),
    categories: data.categories.map((entry: any) => ({
      label: entry.label,
      amount: Number(entry.amount),
      count: entry.count
    })),
    expenses: data.expenses.map((expense: any) => ({
      id: expense.id,
      branchId: expense.branchId,
      branchName: expense.branchName,
      title: expense.title,
      category: expense.category,
      amount: Number(expense.amount),
      paymentSource: expense.paymentSource ?? "CASH",
      expenseDate: expense.expenseDate,
      vendor: expense.vendor ?? undefined,
      billReference: expense.billReference ?? undefined,
      notes: expense.notes ?? undefined,
      stockTransactionId: expense.stockTransactionId ?? undefined,
      stockPurchase: expense.stockPurchase
        ? {
            ingredientId: expense.stockPurchase.ingredientId,
            ingredientName: expense.stockPurchase.ingredientName,
            purchaseUnitId: expense.stockPurchase.purchaseUnitId ?? undefined,
            purchaseQuantity: Number(expense.stockPurchase.purchaseQuantity),
            purchaseUnitLabel: expense.stockPurchase.purchaseUnitLabel,
            baseQuantity: Number(expense.stockPurchase.baseQuantity),
            purchaseDate: expense.stockPurchase.purchaseDate ?? undefined
          }
        : null,
      createdByName: expense.createdByName ?? undefined,
      createdAt: expense.createdAt
    }))
  };
}

export async function createAdminExpense(payload: Record<string, unknown>) {
  const data = await adminFetch<{ expense: any }>("/api/admin/expenses", {
    method: "POST",
    body: JSON.stringify(withSelectedBranch(payload))
  });
  return data.expense;
}

export async function createAdminStockPurchase(payload: Record<string, unknown>) {
  const data = await adminFetch<{ expense: any; stock: any }>("/api/admin/expenses/stock-purchases", {
    method: "POST",
    body: JSON.stringify(withSelectedBranch(payload))
  });
  return data;
}

export async function updateAdminStockPurchase(expenseId: string, payload: Record<string, unknown>) {
  const data = await adminFetch<{ expense: any }>(`/api/admin/expenses/stock-purchases/${expenseId}`, {
    method: "PATCH",
    body: JSON.stringify(withSelectedBranch(payload))
  });
  return data.expense;
}

export async function updateAdminExpense(expenseId: string, payload: Record<string, unknown>) {
  const data = await adminFetch<{ expense: any }>(`/api/admin/expenses/${expenseId}`, {
    method: "PATCH",
    body: JSON.stringify(withSelectedBranch(payload))
  });
  return data.expense;
}

export async function deleteAdminExpense(expenseId: string) {
  await adminFetch(`/api/admin/expenses/${expenseId}`, {
    method: "DELETE"
  });
}

export async function fetchAdminFixedExpenses(monthKey?: string): Promise<AdminFixedExpenseData> {
  const suffix = monthKey ? `?monthKey=${encodeURIComponent(monthKey)}` : "";
  const data = await adminFetch<any>(`/api/admin/fixed-expenses${suffix}`);
  return {
    monthKey: data.monthKey,
    monthLabel: data.monthLabel,
    branches: data.branches.map((branch: any) => ({
      id: branch.id,
      slug: branch.slug,
      name: branch.name,
      city: branch.city,
      addressLine1: branch.addressLine1,
      phone: branch.phone,
      deliveryFee: Number(branch.deliveryFee)
    })),
    summary: {
      totalFixedExpenses: Number(data.summary.totalFixedExpenses),
      paid: Number(data.summary.paid),
      remaining: Number(data.summary.remaining),
      upcomingDue: Number(data.summary.upcomingDue)
    },
    fixedExpenses: data.fixedExpenses.map((expense: any) => ({
      id: expense.id,
      branchId: expense.branchId,
      branchName: expense.branchName,
      name: expense.name,
      category: expense.category,
      monthlyAmount: Number(expense.monthlyAmount),
      dueDay: Number(expense.dueDay),
      autoRepeat: Boolean(expense.autoRepeat),
      isActive: Boolean(expense.isActive),
      currentMonth: expense.currentMonth
        ? {
            id: expense.currentMonth.id,
            expenseId: expense.currentMonth.expenseId,
            status: expense.currentMonth.status,
            paidAt: expense.currentMonth.paidAt ?? null,
            expenseDate: expense.currentMonth.expenseDate
          }
        : null
    }))
  };
}

export async function generateAdminFixedExpenses(monthKey?: string) {
  return adminFetch<{ monthKey: string; generated: number }>("/api/admin/fixed-expenses/generate", {
    method: "POST",
    body: JSON.stringify(monthKey ? { monthKey } : {})
  });
}

export async function createAdminFixedExpense(payload: Record<string, unknown>) {
  const data = await adminFetch<{ fixedExpense: any }>("/api/admin/fixed-expenses", {
    method: "POST",
    body: JSON.stringify(withSelectedBranch(payload))
  });
  return data.fixedExpense;
}

export async function updateAdminFixedExpense(fixedExpenseId: string, payload: Record<string, unknown>) {
  const data = await adminFetch<{ fixedExpense: any }>(`/api/admin/fixed-expenses/${fixedExpenseId}`, {
    method: "PATCH",
    body: JSON.stringify(withSelectedBranch(payload))
  });
  return data.fixedExpense;
}

export async function deleteAdminFixedExpense(fixedExpenseId: string) {
  await adminFetch(`/api/admin/fixed-expenses/${fixedExpenseId}`, {
    method: "DELETE"
  });
}

export async function updateAdminFixedExpenseOccurrence(occurrenceId: string, status: "PAID" | "UNPAID") {
  const data = await adminFetch<{ occurrence: any }>(`/api/admin/fixed-expenses/occurrences/${occurrenceId}`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
  return data.occurrence;
}

export async function downloadAdminExpenseExport(params?: {
  preset?: AdminRangePreset;
  branchId?: string;
  category?: string;
  search?: string;
  monthKey?: string;
  start?: string;
  end?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.preset) searchParams.set("preset", params.preset);
  if (params?.branchId) searchParams.set("branchId", params.branchId);
  if (params?.category) searchParams.set("category", params.category);
  if (params?.search) searchParams.set("search", params.search);
  if (params?.monthKey) searchParams.set("monthKey", params.monthKey);
  if (params?.start) searchParams.set("start", params.start);
  if (params?.end) searchParams.set("end", params.end);

  const response = await fetch(`${API_URL}/api/admin/expenses/export?${searchParams.toString()}`, {
    headers: getSelectedBranchId() ? { "x-branch-id": getSelectedBranchId() } : undefined,
    credentials: "include"
  });

  if (!response.ok) {
    let message = "Export failed.";
    try {
      const payload = await response.json();
      message = payload.message ?? message;
    } catch {}
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename=\"?([^"]+)\"?/i);
  const fileName = match?.[1] ?? "pocket-expenses.xlsx";
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
