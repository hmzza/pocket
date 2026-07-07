"use client";

import type { AdminOrder, PosBranch, PosCatalogProduct, PosCustomerLookup, PosEditableOrder, PosReceiptOrder } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const POS_RECEIPT_CACHE_PREFIX = "pocket-pos-receipt:";

async function posFetch<T>(path: string, init?: RequestInit) {
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
    const payload = await response.json().catch(() => null);
    const message =
      payload?.message ??
      payload?.error ??
      `POS request failed (${response.status}).`;
    const details = normalizeDetails(payload?.details ?? payload?.issues);
    const error = new Error(message) as Error & { details?: string[]; status?: number };
    error.details = details;
    error.status = response.status;
    throw error;
  }

  return (await response.json()) as T;
}

export function getPosReceiptCacheKey(orderId: string) {
  return `${POS_RECEIPT_CACHE_PREFIX}${orderId}`;
}

export async function fetchPosSession() {
  return posFetch<{ user: { id: string; role: string; name: string; email: string } }>("/api/auth/me");
}

export async function logoutPosSession() {
  await posFetch<null>("/api/auth/logout", {
    method: "POST"
  });
}

export async function fetchPosCatalog(params?: { branchId?: string; categoryId?: string; search?: string }) {
  const query = new URLSearchParams();
  if (params?.branchId) query.set("branchId", params.branchId);
  if (params?.categoryId) query.set("categoryId", params.categoryId);
  if (params?.search) query.set("search", params.search);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const data = await posFetch<{ branches: any[]; categories: any[]; products: any[]; branchId?: string }>(`/api/pos/catalog${suffix}`);

  return {
    branchId: data.branchId,
    branches: data.branches.map(
      (branch): PosBranch => ({
        id: branch.id,
        slug: branch.slug,
        name: branch.name
      })
    ),
    categories: data.categories.map((category) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
      description: category.description ?? undefined,
      imageUrl: category.imageUrl ?? undefined
    })),
    products: data.products.map(
      (product): PosCatalogProduct => ({
        id: product.id,
        name: product.name,
        categoryId: product.categoryId,
        categoryName: product.category.name,
        price: Number(product.branchPricing?.[0]?.price ?? product.basePrice),
        bundleComponents: (product.bundleComponents ?? []).map((component: any) => ({
          productId: component.componentProductId,
          productName: component.componentProduct?.name ?? "Unknown product",
          quantity: Number(component.quantity),
          sortOrder: component.sortOrder ?? undefined
        })),
        addOnGroups: (product.addOnGroups ?? []).map((group: any) => ({
          id: group.id,
          name: group.name,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          isRequired: group.isRequired,
          options: (group.options ?? []).map((option: any) => ({
            id: option.id,
            name: option.name,
            priceDelta: Number(option.priceDelta)
          }))
        }))
      })
    )
  };
}

export async function createPosOrder(payload: Record<string, unknown>) {
  return posFetch<{ order: PosReceiptOrder }>("/api/pos/checkout", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updatePosOrder(orderId: string, payload: Record<string, unknown>) {
  return posFetch<{ order: PosReceiptOrder }>(`/api/pos/orders/${orderId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function fetchPosOrderByNumber(orderNumber: string) {
  const query = new URLSearchParams({ orderNumber });
  return posFetch<{ order: PosReceiptOrder; editableOrder: PosEditableOrder }>(`/api/pos/orders/lookup?${query.toString()}`);
}

export async function lookupPosCustomer(phone: string) {
  const query = new URLSearchParams({ phone });
  const data = await posFetch<{ customer: PosCustomerLookup | null }>(`/api/pos/customers/lookup?${query.toString()}`);
  return data.customer;
}

export async function fetchPosOrders(params?: { scope?: "active" | "watch_later" | "delivered" | "all"; search?: string }) {
  const query = new URLSearchParams();
  if (params?.scope) query.set("scope", params.scope);
  if (params?.search) query.set("search", params.search);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const data = await posFetch<{ orders: any[] }>(`/api/ops/orders${suffix}`);
  return {
    orders: data.orders.map((order): AdminOrder => ({
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
        addOns: (item.addOns ?? []).map((addOn: any) => ({
          id: addOn.id,
          optionName: addOn.optionName,
          priceDelta: Number(addOn.priceDelta)
        }))
      }))
    }))
  };
}

export async function updatePosOrderStatus(orderId: string, status: string) {
  return posFetch(`/api/ops/orders/${orderId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}

export async function updatePosOrderPaymentStatus(orderId: string, paymentStatus: "PENDING" | "PAID") {
  return posFetch(`/api/ops/orders/${orderId}/payment-status`, {
    method: "PATCH",
    body: JSON.stringify({ paymentStatus })
  });
}

export async function bulkUpdatePosOrderStatus(orderIds: string[], status: string) {
  return posFetch(`/api/ops/orders/bulk-status`, {
    method: "PATCH",
    body: JSON.stringify({ orderIds, status })
  });
}

export async function fetchPosReceipt(orderId: string) {
  const data = await posFetch<{ order: PosReceiptOrder }>(`/api/pos/orders/${orderId}`);
  return data.order;
}

export async function fetchPublicReceipt(orderNumber: string, token: string) {
  const response = await fetch(`${API_URL}/api/receipts/${orderNumber}?token=${encodeURIComponent(token)}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message ?? "Receipt unavailable.");
  }

  const data = await response.json() as { order: PosReceiptOrder };
  return data.order;
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
