"use client";

import type { PosBranch, PosCatalogProduct, PosReceiptOrder } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const POS_TOKEN_KEY = "pocket-pos-token";

function getToken() {
  return window.localStorage.getItem(POS_TOKEN_KEY);
}

async function posFetch<T>(path: string, init?: RequestInit) {
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
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message ?? "POS request failed.");
  }

  return (await response.json()) as T;
}

export function getPosTokenKey() {
  return POS_TOKEN_KEY;
}

export async function fetchPosSession() {
  return posFetch<{ user: { id: string; role: string; name: string; email: string } }>("/api/auth/me");
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

export async function fetchPosReceipt(orderId: string) {
  const data = await posFetch<{ order: PosReceiptOrder }>(`/api/pos/orders/${orderId}`);
  return data.order;
}
