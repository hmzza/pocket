import { prisma } from "./prisma.js";

export const ONLINE_ORDERING_SETTING_KEY = "ordering.online";

export type OnlineOrderingSetting = {
  enabled: boolean;
  /** Shown to customers while ordering is closed. */
  closedMessage: string;
};

/**
 * Online ordering was switched off in commit 19c86a4, which sent customers to
 * Foodpanda instead. Closed therefore stays the default: an environment that has
 * never set this key keeps behaving exactly as it does today, and reopening is a
 * deliberate act rather than a side effect of deploying.
 */
export const DEFAULT_ONLINE_ORDERING: OnlineOrderingSetting = {
  enabled: false,
  closedMessage:
    "Online orders are closed for now. Please visit us to place your order, or use the Foodpanda app for delivery."
};

/** Tolerates a bare boolean as well as the object form, and never throws. */
export function normalizeOnlineOrdering(value: unknown): OnlineOrderingSetting {
  if (typeof value === "boolean") {
    return { ...DEFAULT_ONLINE_ORDERING, enabled: value };
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return {
      enabled: record.enabled === true,
      closedMessage:
        typeof record.closedMessage === "string" && record.closedMessage.trim()
          ? record.closedMessage.trim()
          : DEFAULT_ONLINE_ORDERING.closedMessage
    };
  }

  return DEFAULT_ONLINE_ORDERING;
}

export async function readOnlineOrdering(): Promise<OnlineOrderingSetting> {
  const setting = await prisma.setting.findUnique({ where: { key: ONLINE_ORDERING_SETTING_KEY } });
  return normalizeOnlineOrdering(setting?.value);
}
