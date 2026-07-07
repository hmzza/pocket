"use client";

import type {
  AdminCustomer,
  AdminExpenseData,
  AdminInventoryData,
  AdminOrderSegment,
  AdminOrder,
  AdminProduct,
  AdminRangePreset,
  Category,
  DashboardData
} from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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
    try {
      const payload = await response.json();
      message = payload.message ?? message;
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
    imageUrl: category.imageUrl ?? ""
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
    imageUrl: product.images?.[0]?.url ?? "/images/shawarma-pocket.svg",
    bundleComponents: (product.bundleComponents ?? []).map((component: any) => ({
      productId: component.componentProductId,
      productName: component.componentProduct?.name ?? "Unknown product",
      quantity: Number(component.quantity),
      sortOrder: component.sortOrder ?? undefined
    })),
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
  return adminFetch<{ user: { id: string; role: string; name: string; email: string } }>("/api/auth/me");
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
      totalUnits: Number(data.summary.totalUnits)
    },
    items: data.items.map((item: any) => ({
      id: item.id,
      branchId: item.branchId,
      branchName: item.branchName,
      ingredientId: item.ingredientId,
      name: item.name,
      sku: item.sku,
      unit: item.unit,
      reorderLevel: Number(item.reorderLevel),
      costPerUnit: Number(item.costPerUnit),
      quantityOnHand: Number(item.quantityOnHand),
      stockValue: Number(item.stockValue),
      lowStockAlert: Boolean(item.lowStockAlert),
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
