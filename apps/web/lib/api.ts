import { branch, categories, dashboardData, homeContent, mockCustomers, products, trackedOrders } from "./mock-data";
import { API_URL, normalizeProducts } from "./catalog";
import type { DashboardData, Product, TrackedOrder } from "./types";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      next: { revalidate: 60 }
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function getHomeData() {
  const data = await fetchJson<any>("/api/content/home");
  if (!data) {
    return {
      hero: homeContent.hero,
      whyPocket: homeContent.whyPocket,
      testimonials: homeContent.testimonials,
      featured: products.filter((product) => product.featured).slice(0, 4),
      bestSellers: products.filter((product) => product.bestSeller).slice(0, 4),
      categories,
      branch,
      contact: {
        value: {
          phone: branch.phone,
          email: "hello@pocketshawarma.com",
          instagram: "@pocket.pakistan"
        }
      }
    };
  }

  return {
    hero: data.hero?.content ?? homeContent.hero,
    whyPocket: data.whyPocket?.content ?? homeContent.whyPocket,
    testimonials: data.testimonials?.content ?? homeContent.testimonials,
    featured: normalizeProducts(data.featured),
    bestSellers: normalizeProducts(data.bestSellers),
    categories: data.categories ?? categories,
    branch: data.branch
      ? {
          id: data.branch.id,
          slug: data.branch.slug,
          name: data.branch.name,
          city: data.branch.city,
          addressLine1: data.branch.addressLine1,
          phone: data.branch.phone,
          deliveryFee: Number(data.branch.deliveryFee)
        }
      : branch,
    contact: data.contact ?? {
      value: {
        phone: branch.phone,
        email: "hello@pocketshawarma.com",
        instagram: "@pocket.pakistan"
      }
    }
  };
}

export async function getProducts() {
  const data = await fetchJson<any>("/api/products");
  return data ? normalizeProducts(data.products) : products;
}

export async function getProductBySlug(slug: string) {
  const data = await fetchJson<any>(`/api/products/${slug}`);
  if (!data) {
    const product = products.find((entry) => entry.slug === slug) ?? null;
    return product
      ? {
          product,
          related: products.filter((entry) => entry.category.slug === product.category.slug && entry.slug !== slug).slice(0, 4)
        }
      : null;
  }

  const normalized = normalizeProducts([data.product])[0]!;
  return {
    product: normalized,
    related: normalizeProducts(data.related)
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const dashboard = await fetchJson<any>("/api/admin/dashboard");

  if (!dashboard) {
    return dashboardData;
  }

  return {
    range: {
      preset: dashboard.range.preset,
      start: dashboard.range.start,
      end: dashboard.range.end,
      label: dashboard.range.label,
      segment: dashboard.range.segment ?? "all"
    },
    summary: dashboard.summary,
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
    breakdowns: dashboard.breakdowns
  };
}

export async function getTrackedOrder(orderNumber: string, phone: string): Promise<TrackedOrder | null> {
  const data = await fetchJson<any>("/api/track", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ orderNumber, phone })
  });
  if (!data) {
    return trackedOrders.find((entry) => entry.orderNumber === orderNumber) ?? null;
  }

  return {
    id: data.order.id,
    orderNumber: data.order.orderNumber,
    status: data.order.status,
    branch: data.order.branch.name,
    expectedDeliveryAt: data.order.expectedDeliveryAt,
    totalAmount: Number(data.order.totalAmount),
    placedAt: data.order.placedAt,
    items: data.order.items.map((item: any) => ({
      id: item.id,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice)
    }))
  };
}

export async function getAdminCustomers() {
  const data = await fetchJson<any>("/api/admin/customers");
  return data?.customers ?? mockCustomers;
}

export async function getAdminOrders() {
  const data = await fetchJson<any>("/api/admin/orders");
  return (
    data?.orders?.map((order: any) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customer?.name ?? order.customerName ?? "Walk-in Customer",
      status: order.status,
      branch: order.branch?.name ?? branch.name,
      totalAmount: Number(order.totalAmount),
      itemCount: order.items.length
    })) ??
    dashboardData.recentOrders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      status: "PENDING",
      branch: order.branch,
      totalAmount: order.totalAmount,
      itemCount: 2
    }))
  );
}

export async function getAdminProducts() {
  const data = await fetchJson<any>("/api/admin/products");
  return data?.products ? normalizeProducts(data.products) : products;
}
