import { API_URL } from "./catalog";

export const ONLINE_ORDERING_SETTING_KEY = "ordering.online";

export type OnlineOrderingSetting = {
  enabled: boolean;
  closedMessage: string;
};

/**
 * Closed unless the setting says otherwise, matching the API. A failed request
 * must not accidentally open ordering, so every fallback here is "closed".
 */
export const DEFAULT_ONLINE_ORDERING: OnlineOrderingSetting = {
  enabled: false,
  closedMessage:
    "Online orders are closed for now. Please visit us to place your order, or use the Foodpanda app for delivery."
};

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

export async function fetchOnlineOrdering(): Promise<OnlineOrderingSetting> {
  try {
    const response = await fetch(`${API_URL}/api/settings`);
    if (!response.ok) return DEFAULT_ONLINE_ORDERING;
    const data = (await response.json()) as { settings?: Record<string, unknown> };
    return normalizeOnlineOrdering(data.settings?.[ONLINE_ORDERING_SETTING_KEY]);
  } catch {
    return DEFAULT_ONLINE_ORDERING;
  }
}
