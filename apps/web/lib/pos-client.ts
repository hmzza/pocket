"use client";

import type { AdminOrder, PosBranch, PosCatalogProduct, PosReceiptOrder } from "@/lib/types";

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

export async function fetchPosOrders(params?: { scope?: "active" | "delivered" | "all"; search?: string }) {
  const query = new URLSearchParams();
  if (params?.scope) query.set("scope", params.scope);
  if (params?.search) query.set("search", params.search);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return posFetch<{ orders: AdminOrder[] }>(`/api/ops/orders${suffix}`);
}

export async function updatePosOrderStatus(orderId: string, status: string) {
  return posFetch(`/api/ops/orders/${orderId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}

export async function fetchPosReceipt(orderId: string) {
  const data = await posFetch<{ order: PosReceiptOrder }>(`/api/pos/orders/${orderId}`);
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
