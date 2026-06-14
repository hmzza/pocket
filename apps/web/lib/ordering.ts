import { API_URL } from "./catalog";

export const ORDER_TAX_RATE = 0.12;
export const STORED_COUPON_KEY = "pocket-coupon-code";

export type CouponValidationResult = {
  code: string;
  discount: number;
  title?: string;
};

export function calculateOrderTotals(subtotal: number, delivery: number, discount: number) {
  const safeSubtotal = Math.max(0, subtotal);
  const safeDiscount = Math.min(safeSubtotal, Math.max(0, discount));
  const safeDelivery = Math.max(0, delivery);
  const tax = Number((safeSubtotal * ORDER_TAX_RATE).toFixed(2));
  const total = Math.max(0, Number((safeSubtotal + tax + safeDelivery - safeDiscount).toFixed(2)));

  return {
    subtotal: safeSubtotal,
    discount: safeDiscount,
    tax,
    delivery: safeDelivery,
    total
  };
}

export async function validateCouponCode(code: string, subtotal: number): Promise<CouponValidationResult> {
  const normalizedCode = code.trim().toUpperCase();

  if (!normalizedCode) {
    throw new Error("Enter a coupon code.");
  }

  const response = await fetch(`${API_URL}/api/coupons/validate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      code: normalizedCode,
      subtotal
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message ?? "Unable to validate coupon.");
  }

  return {
    code: normalizedCode,
    discount: Number(payload?.discount ?? 0),
    title: payload?.coupon?.title
  };
}

export function readStoredCoupon() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORED_COUPON_KEY) ?? "";
}

export function writeStoredCoupon(code: string) {
  if (typeof window === "undefined") return;

  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) {
    window.localStorage.removeItem(STORED_COUPON_KEY);
    return;
  }

  window.localStorage.setItem(STORED_COUPON_KEY, normalizedCode);
}
