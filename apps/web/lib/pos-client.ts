import { API_URL, normalizeProducts } from "./catalog";
import type { Branch, Category, Product } from "./types";

export type PosServiceType = "TAKEAWAY" | "DINE_IN";
export type PosDiscountType = "NONE" | "PERCENTAGE" | "FIXED";
export type PosPaymentMethod = "CASH_ON_DELIVERY" | "CARD" | "JAZZCASH" | "EASYPAISA";

export type PosCheckoutPayload = {
  branchSlug: string;
  serviceType: PosServiceType;
  customerName?: string;
  customerPhone?: string;
  paymentMethod: PosPaymentMethod;
  paidAmount: number;
  taxRate: number;
  note?: string;
  discount: {
    type: PosDiscountType;
    value: number;
  };
  items: Array<
    | {
        kind: "PRODUCT";
        productId: string;
        quantity: number;
        note?: string;
        selectedAddOnIds: string[];
      }
    | {
        kind: "CUSTOM";
        name: string;
        description?: string;
        unitPrice: number;
        quantity: number;
        note?: string;
      }
  >;
};

export type PosReceipt = {
  id: string;
  orderNumber: string;
  customerName?: string;
  customerPhone?: string;
  branchName: string;
  branchCity: string;
  serviceType: string;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: number;
  taxAmount: number;
  taxRate: number;
  discountAmount: number;
  totalAmount: number;
  cashReceivedAmount: number;
  changeDueAmount: number;
  note?: string;
  placedAt: string;
  items: Array<{
    id: string;
    productName: string;
    customDescription?: string;
    quantity: number;
    unitPrice: number;
    note?: string;
    addOns: Array<{
      id: string;
      optionName: string;
      priceDelta: number;
    }>;
  }>;
};

function getToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("pocket-pos-token") ?? window.localStorage.getItem("pocket-admin-token") ?? "";
}

async function fetchJson<T>(path: string, init?: RequestInit, authenticated = false): Promise<T> {
  const headers = new Headers(init?.headers);

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (authenticated) {
    const token = getToken();
    if (!token) {
      throw new Error("Admin session missing.");
    }

    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message ?? "Request failed.");
  }

  return (await response.json()) as T;
}

export async function fetchPosCatalog(branchSlug?: string): Promise<{
  branches: Branch[];
  categories: Category[];
  products: Product[];
}> {
  const query = branchSlug ? `?branchSlug=${encodeURIComponent(branchSlug)}` : "";
  const [branchResponse, categoryResponse, productResponse] = await Promise.all([
    fetchJson<{ branches: any[] }>("/api/branches"),
    fetchJson<{ categories: any[] }>("/api/categories"),
    fetchJson<{ products: any[] }>(`/api/products${query}`)
  ]);

  return {
    branches: branchResponse.branches.map((branch) => ({
      id: branch.id,
      slug: branch.slug,
      name: branch.name,
      city: branch.city,
      addressLine1: branch.addressLine1,
      phone: branch.phone,
      deliveryFee: Number(branch.deliveryFee)
    })),
    categories: categoryResponse.categories.map((category) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
      description: category.description ?? "",
      imageUrl: category.imageUrl ?? ""
    })),
    products: normalizeProducts(productResponse.products)
  };
}

export async function submitPosOrder(payload: PosCheckoutPayload): Promise<PosReceipt> {
  const response = await fetchJson<{ order: any; taxRate: number }>(
    "/api/pos/checkout",
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    true
  );

  return {
    id: response.order.id,
    orderNumber: response.order.orderNumber,
    customerName: response.order.customerName ?? response.order.customer?.name ?? undefined,
    customerPhone: response.order.customerPhone ?? response.order.customer?.phone ?? undefined,
    branchName: response.order.branch.name,
    branchCity: response.order.branch.city,
    serviceType: response.order.serviceType,
    paymentMethod: response.order.paymentMethod,
    paymentStatus: response.order.paymentStatus,
    subtotal: Number(response.order.subtotal),
    taxAmount: Number(response.order.taxAmount),
    taxRate: Number(response.taxRate ?? 0),
    discountAmount: Number(response.order.discountAmount),
    totalAmount: Number(response.order.totalAmount),
    cashReceivedAmount: Number(response.order.cashReceivedAmount ?? 0),
    changeDueAmount: Number(response.order.changeDueAmount ?? 0),
    note: response.order.deliveryInstructions ?? undefined,
    placedAt: response.order.placedAt,
    items: response.order.items.map((item: any) => ({
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
  };
}
