import { WhatsAppMessageKind } from "@prisma/client";
import { env } from "../../config.js";
import { isPakistanMobile } from "../phone.js";
import type { OutgoingWhatsAppMessage, WhatsAppProvider, WhatsAppSendResult } from "./types.js";

/**
 * WhatsApp Cloud API provider: genuinely automatic, no human in the loop.
 *
 * NOT VERIFIED against the live Graph API. It has never been exercised with real
 * credentials because none exist in this project yet, so treat the first run
 * against a real WABA as the actual test.
 *
 * To switch over you need, from Meta: a Business account, a verified WhatsApp
 * Business number with its phone number id, a system-user access token, and
 * approved message templates. Then set WHATSAPP_PROVIDER=cloud-api plus the
 * WHATSAPP_* variables in .env.example.
 *
 * Templates matter: a business-initiated message outside the 24-hour customer
 * service window is rejected as free text and must use an approved template.
 * Riders will almost never have messaged us first, so in practice the template
 * ids are required, not optional. If a template name is configured we send a
 * template message; otherwise we fall back to free text, which is only useful
 * for testing inside an open window.
 */
function templateNameFor(kind: WhatsAppMessageKind) {
  return kind === WhatsAppMessageKind.RIDER_ASSIGNED
    ? env.WHATSAPP_TEMPLATE_RIDER_ASSIGNED
    : env.WHATSAPP_TEMPLATE_RIDER_REVOKED;
}

function missingConfiguration() {
  const missing: string[] = [];
  if (!env.WHATSAPP_TOKEN) missing.push("WHATSAPP_TOKEN");
  if (!env.WHATSAPP_PHONE_NUMBER_ID) missing.push("WHATSAPP_PHONE_NUMBER_ID");
  return missing;
}

export const cloudApiProvider: WhatsAppProvider = {
  name: "cloud-api",
  automatic: true,

  async send(message: OutgoingWhatsAppMessage): Promise<WhatsAppSendResult> {
    const missing = missingConfiguration();
    if (missing.length) {
      return {
        status: "FAILED",
        error: `WhatsApp Cloud API is selected but not configured. Missing: ${missing.join(", ")}.`
      };
    }

    if (!isPakistanMobile(message.toPhone)) {
      return { status: "FAILED", error: `Not a valid Pakistani mobile number: ${message.toPhone}` };
    }

    const templateName = templateNameFor(message.kind);
    const payload = templateName
      ? {
          messaging_product: "whatsapp",
          to: message.toPhone,
          type: "template",
          template: {
            name: templateName,
            language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE },
            components: [
              {
                type: "body",
                parameters: message.templateParameters.map((text) => ({ type: "text", text }))
              }
            ]
          }
        }
      : {
          messaging_product: "whatsapp",
          to: message.toPhone,
          type: "text",
          text: { preview_url: false, body: message.body }
        };

    const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

    try {
      // Bounded so a hanging call cannot keep a dispatch request open.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      }).finally(() => clearTimeout(timeout));

      const text = await response.text();

      if (!response.ok) {
        // Meta nests the useful part under error.message; keep the raw body as a
        // fallback so a shape change does not swallow the reason.
        let detail = text.slice(0, 400);
        try {
          const parsed = JSON.parse(text) as { error?: { message?: string; code?: number } };
          if (parsed.error?.message) detail = `${parsed.error.message} (code ${parsed.error.code ?? "?"})`;
        } catch {
          // keep the raw text
        }
        return { status: "FAILED", error: `WhatsApp API ${response.status}: ${detail}` };
      }

      let providerMessageId: string | undefined;
      try {
        const parsed = JSON.parse(text) as { messages?: Array<{ id?: string }> };
        providerMessageId = parsed.messages?.[0]?.id;
      } catch {
        // A 2xx with an unparseable body still means it was accepted.
      }

      return { status: "SENT", providerMessageId };
    } catch (error) {
      const reason = error instanceof Error ? (error.name === "AbortError" ? "timed out after 10s" : error.message) : "unknown error";
      return { status: "FAILED", error: `WhatsApp API request failed: ${reason}` };
    }
  }
};
