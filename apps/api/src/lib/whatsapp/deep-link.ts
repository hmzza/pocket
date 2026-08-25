import { isPakistanMobile } from "../phone.js";
import type { OutgoingWhatsAppMessage, WhatsAppProvider, WhatsAppSendResult } from "./types.js";

/**
 * Click-to-send provider.
 *
 * Builds a wa.me link with the message prefilled; an admin opens it and presses
 * send in WhatsApp. This needs no Meta business account, no verified number and
 * no approved templates, and it matches how the POS already shares receipts
 * (see formatWhatsAppPhone in apps/web/components/pos/pos-terminal.tsx).
 *
 * It reports MANUAL_PENDING rather than SENT, because nothing has actually been
 * delivered until a human clicks. Claiming otherwise would let an order sit with
 * a rider who was never told about it.
 */
export const deepLinkProvider: WhatsAppProvider = {
  name: "deeplink",
  automatic: false,

  async send(message: OutgoingWhatsAppMessage): Promise<WhatsAppSendResult> {
    if (!isPakistanMobile(message.toPhone)) {
      return { status: "FAILED", error: `Not a valid Pakistani mobile number: ${message.toPhone}` };
    }

    return {
      status: "MANUAL_PENDING",
      deepLinkUrl: buildWhatsAppDeepLink(message.toPhone, message.body)
    };
  }
};

/** Exported so the dispatch board can rebuild a link without re-queuing. */
export function buildWhatsAppDeepLink(toPhone: string, body: string) {
  return `https://wa.me/${toPhone}?text=${encodeURIComponent(body)}`;
}
