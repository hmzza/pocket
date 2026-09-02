import { API_URL } from "./catalog";

// Direct Pocket delivery is quoted as item total plus the sector delivery fee.
// Do not add an extra checkout tax that was not shown to the customer.
export const ORDER_TAX_RATE = 0;
export const STORED_COUPON_KEY = "pocket-coupon-code";

export type CouponValidationResult = {
  code: string;
  discount: number;
  title?: string;
};

export type StoredCoupon = CouponValidationResult & {
  branchSlug: string;
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

export async function validateCouponCode(code: string, subtotal: number, branchSlug?: string): Promise<CouponValidationResult> {
  const normalizedCode = code.trim().toUpperCase();

  if (!normalizedCode) {
    throw new Error("Enter a coupon code.");
  }
  if (!branchSlug) {
    throw new Error("Choose a branch before applying a coupon.");
  }

  const response = await fetch(`${API_URL}/api/coupons/validate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      code: normalizedCode,
      subtotal,
      branchSlug
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message ?? "Unable to validate coupon.");
  }

  return {
    code: normalizedCode,
    discount: Number(payload?.discount ?? 0),
    title: typeof payload?.title === "string" ? payload.title : undefined
  };
}

export function readStoredCoupon() {
  return readStoredCouponState()?.code ?? "";
}

export function readStoredCouponState(): StoredCoupon | null {
  if (typeof window === "undefined") return null;

  const storedValue = window.localStorage.getItem(STORED_COUPON_KEY);
  if (!storedValue) return null;

  try {
    const parsed = JSON.parse(storedValue) as Partial<StoredCoupon>;
    if (
      typeof parsed.code === "string" &&
      parsed.code.trim() &&
      typeof parsed.branchSlug === "string" &&
      parsed.branchSlug.trim() &&
      typeof parsed.discount === "number" &&
      Number.isFinite(parsed.discount)
    ) {
      return {
        code: parsed.code.trim().toUpperCase(),
        discount: Math.max(0, parsed.discount),
        title: typeof parsed.title === "string" ? parsed.title : undefined,
        branchSlug: parsed.branchSlug.trim()
      };
    }
  } catch {
    // Older versions stored only the code. The caller can revalidate it before using it.
    const legacyCode = storedValue.trim().toUpperCase();
    if (legacyCode) {
      return { code: legacyCode, discount: 0, branchSlug: "" };
    }
  }

  return null;
}

export function writeStoredCoupon(coupon: string | StoredCoupon) {
  if (typeof window === "undefined") return;

  const normalizedCode = typeof coupon === "string" ? coupon.trim().toUpperCase() : coupon.code.trim().toUpperCase();
  if (!normalizedCode) {
    window.localStorage.removeItem(STORED_COUPON_KEY);
    return;
  }

  if (typeof coupon === "string") {
    window.localStorage.setItem(STORED_COUPON_KEY, normalizedCode);
    return;
  }

  window.localStorage.setItem(STORED_COUPON_KEY, JSON.stringify({
    code: normalizedCode,
    discount: Math.max(0, coupon.discount),
    title: coupon.title,
    branchSlug: coupon.branchSlug
  } satisfies StoredCoupon));
}
