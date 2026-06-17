"use client";

import type { AdminCustomer, AdminOrder, AdminProduct, AdminRangePreset, Category, DashboardData } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED"
] as const;

function getToken() {
  return window.localStorage.getItem("pocket-admin-token");
}

async function adminFetch<T>(path: string, init?: RequestInit) {
  const token = getToken();
  const headers = new Headers(init?.headers);

  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers
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

export async function disableAdminProduct(productId: string) {
  await adminFetch(`/api/admin/products/${productId}`, {
    method: "DELETE"
  });
}

export async function fetchAdminOrders() {
  const data = await adminFetch<{ orders: any[] }>("/api/admin/orders");
  const orders: AdminOrder[] = data.orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    channel: order.channel,
    serviceType: order.serviceType,
    customerName: order.customerName ?? order.customer?.name ?? "Walk-in Customer",
    customerPhone: order.customerPhone ?? order.customer?.phone ?? undefined,
    status: order.status,
    branch: order.branch?.name ?? "Unknown branch",
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

export async function updateAdminOrderStatus(orderId: string, status: string) {
  const data = await adminFetch<{ order: any }>(`/api/admin/orders/${orderId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
  return data.order;
}

export async function fetchAdminDashboard(params?: {
  preset?: AdminRangePreset;
  start?: string;
  end?: string;
}): Promise<DashboardData> {
  const searchParams = new URLSearchParams();
  if (params?.preset) searchParams.set("preset", params.preset);
  if (params?.start) searchParams.set("start", params.start);
  if (params?.end) searchParams.set("end", params.end);

  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const dashboard = await adminFetch<any>(`/api/admin/dashboard${suffix}`);

  return {
    range: {
      preset: dashboard.range.preset,
      start: dashboard.range.start,
      end: dashboard.range.end,
      label: dashboard.range.label
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
      fulfilledRate: Number(dashboard.summary.fulfilledRate),
      cancellationRate: Number(dashboard.summary.cancellationRate),
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
      status: order.status,
      totalAmount: Number(order.totalAmount),
      placedAt: order.placedAt,
      branch: order.branch,
      channel: order.channel
    })),
    lowStock: dashboard.lowStock.map((entry: any) => ({
      ingredient: entry.ingredient,
      branch: entry.branch,
      quantityOnHand: Number(entry.quantityOnHand)
    })),
    breakdowns: {
      statuses: dashboard.breakdowns.statuses.map((entry: any) => ({
        label: entry.label,
        count: entry.count,
        revenue: Number(entry.revenue)
      })),
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
