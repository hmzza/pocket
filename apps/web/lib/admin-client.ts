"use client";

import type {
  AdminCustomer,
  AdminExpenseData,
  AdminInventoryForecast,
  AdminRecipeData,
  AdminInventoryData,
  AdminOrderSegment,
  AdminOrder,
  AdminProduct,
  AdminRangePreset,
  AdminUser,
  AdminUserData,
  AdminVendor,
  AdminVendorData,
  Category,
  DashboardData
} from "@/lib/types";
import { getPocketImageAltFromFilename, isSupportedPocketImageFile, preparePocketImageUpload, readFileAsDataUrl } from "@/lib/image-upload";
import { resolvePocketImagePath } from "@/lib/image-paths";

const API_URL = typeof window === "undefined" ? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000" : "";

async function adminFetch<T>(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);

  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
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
      const details = normalizeDetails(payload?.details ?? payload?.issues);
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
  const data = await adminFetch<{ disabled: boolean }>(`/api/admin/vendors/${vendorId}`, {
    method: "DELETE"
  });
  return data.disabled;
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

export async function deleteAdminProduct(productId: string) {
  const data = await adminFetch<{ mode: "deleted" | "disabled"; message: string }>(`/api/admin/products/${productId}`, {
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
    };
  }>("/api/auth/me");
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
        revenue: Number(entry.revenue)
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
  if (branchId) searchParams.set("branchId", branchId);
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
      quantityOnHand: Number(item.quantityOnHand),
      stockValue: Number(item.stockValue),
      lowStockAlert: Boolean(item.lowStockAlert),
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
    body: JSON.stringify(payload)
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

export async function createAdminInventoryTransaction(payload: Record<string, unknown>) {
  const data = await adminFetch<{ inventory: any }>("/api/admin/inventory/transactions", {
    method: "POST",
    body: JSON.stringify(payload)
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

export async function updateAdminPreparedRecipe(ingredientId: string, components: Array<{ ingredientId: string; quantityNeeded: number }>) {
  const data = await adminFetch<{ ok: boolean }>(`/api/admin/inventory/recipes/prepared/${ingredientId}`, {
    method: "PATCH",
    body: JSON.stringify({ components })
  });
  return data.ok;
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
  if (params?.branchId) searchParams.set("branchId", params.branchId);
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
      expenseDate: expense.expenseDate,
      vendor: expense.vendor ?? undefined,
      billReference: expense.billReference ?? undefined,
      notes: expense.notes ?? undefined,
      createdByName: expense.createdByName ?? undefined,
      createdAt: expense.createdAt
    }))
  };
}

export async function createAdminExpense(payload: Record<string, unknown>) {
  const data = await adminFetch<{ expense: any }>("/api/admin/expenses", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return data.expense;
}

export async function updateAdminExpense(expenseId: string, payload: Record<string, unknown>) {
  const data = await adminFetch<{ expense: any }>(`/api/admin/expenses/${expenseId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return data.expense;
}

export async function deleteAdminExpense(expenseId: string) {
  await adminFetch(`/api/admin/expenses/${expenseId}`, {
    method: "DELETE"
  });
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
