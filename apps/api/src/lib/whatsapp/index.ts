import { Prisma, WhatsAppMessageStatus, type WhatsAppMessage } from "@prisma/client";
import { env } from "../../config.js";
import { prisma } from "../prisma.js";
import { cloudApiProvider } from "./cloud-api.js";
import { buildWhatsAppDeepLink, deepLinkProvider } from "./deep-link.js";
import type { OutgoingWhatsAppMessage, WhatsAppProvider } from "./types.js";

export { buildRiderAssignmentMessage, buildRiderRevocationMessage } from "./templates.js";
export { buildWhatsAppDeepLink } from "./deep-link.js";
export type { AssignmentContext, RevocationContext } from "./templates.js";
export type { OutgoingWhatsAppMessage, WhatsAppProvider, WhatsAppSendResult } from "./types.js";

const MAX_ATTEMPTS = 5;

export function getWhatsAppProvider(): WhatsAppProvider {
  return env.WHATSAPP_PROVIDER === "cloud-api" ? cloudApiProvider : deepLinkProvider;
}

/**
 * Records a message in the outbox. Call this inside the same transaction as the
 * assignment it belongs to, so we can never end up with an assignment that has
 * no corresponding notification row. Nothing is transmitted here.
 */
export async function queueWhatsAppMessage(
  transaction: Prisma.TransactionClient,
  input: OutgoingWhatsAppMessage & {
    riderId?: string | null;
    deliveryId?: string | null;
    orderId?: string | null;
  }
) {
  return transaction.whatsAppMessage.create({
    data: {
      kind: input.kind,
      status: WhatsAppMessageStatus.QUEUED,
      riderId: input.riderId ?? null,
      deliveryId: input.deliveryId ?? null,
      orderId: input.orderId ?? null,
      provider: getWhatsAppProvider().name,
      toPhone: input.toPhone,
      body: input.body,
      templateParams: input.templateParameters
    }
  });
}

/**
 * Hands a queued message to the provider and records the outcome.
 *
 * Never throws. A notification problem must not roll back or fail the
 * assignment that caused it, so every failure path ends as a FAILED row the
 * dispatch board can show and retry.
 */
export async function dispatchWhatsAppMessage(messageId: string): Promise<WhatsAppMessage | null> {
  try {
    const message = await prisma.whatsAppMessage.findUnique({ where: { id: messageId } });
    if (!message) return null;
    if (message.status === WhatsAppMessageStatus.SENT) return message;

    if (message.attempts >= MAX_ATTEMPTS) {
      return prisma.whatsAppMessage.update({
        where: { id: message.id },
        data: {
          status: WhatsAppMessageStatus.FAILED,
          lastError: `Giving up after ${MAX_ATTEMPTS} attempts. Send it by hand and mark it done.`
        }
      });
    }

    const provider = getWhatsAppProvider();
    const result = await provider.send({
      kind: message.kind,
      toPhone: message.toPhone,
      body: message.body,
      // Read back from the row, not rebuilt from live data, so a retry sends
      // exactly what was queued even if the order has changed since.
      templateParameters: message.templateParams
    });

    const attempts = message.attempts + 1;

    if (result.status === "SENT") {
      return prisma.whatsAppMessage.update({
        where: { id: message.id },
        data: {
          status: WhatsAppMessageStatus.SENT,
          provider: provider.name,
          attempts,
          sentAt: new Date(),
          lastError: null
        }
      });
    }

    if (result.status === "MANUAL_PENDING") {
      return prisma.whatsAppMessage.update({
        where: { id: message.id },
        data: {
          status: WhatsAppMessageStatus.MANUAL_PENDING,
          provider: provider.name,
          deepLinkUrl: result.deepLinkUrl,
          attempts,
          lastError: null
        }
      });
    }

    return prisma.whatsAppMessage.update({
      where: { id: message.id },
      data: {
        status: WhatsAppMessageStatus.FAILED,
        provider: provider.name,
        attempts,
        lastError: result.error,
        // Always leave a usable fallback so a failed automatic send can still be
        // completed by hand instead of stranding the rider.
        deepLinkUrl: buildWhatsAppDeepLink(message.toPhone, message.body)
      }
    });
  } catch (error) {
    // Last line of defence. Reaching here means the update itself failed, so
    // record what we can and stay silent rather than surfacing into dispatch.
    console.error("WhatsApp dispatch failed for message", messageId, error);
    return prisma.whatsAppMessage
      .update({
        where: { id: messageId },
        data: {
          status: WhatsAppMessageStatus.FAILED,
          lastError: error instanceof Error ? error.message : "Unknown dispatch error"
        }
      })
      .catch(() => null);
  }
}

/**
 * Confirms a click-to-send message was actually sent. The deep-link provider
 * cannot know this, so the admin who opened WhatsApp tells us.
 */
export async function markWhatsAppMessageSent(messageId: string, sentById: string) {
  return prisma.whatsAppMessage.update({
    where: { id: messageId },
    data: {
      status: WhatsAppMessageStatus.SENT,
      sentAt: new Date(),
      sentById,
      lastError: null
    }
  });
}

/** Puts a failed message back in the queue and dispatches it again. */
export async function retryWhatsAppMessage(messageId: string) {
  const message = await prisma.whatsAppMessage.findUnique({ where: { id: messageId } });
  if (!message) return null;
  if (message.status === WhatsAppMessageStatus.SENT) return message;

  await prisma.whatsAppMessage.update({
    where: { id: messageId },
    data: { status: WhatsAppMessageStatus.QUEUED, lastError: null }
  });

  return dispatchWhatsAppMessage(messageId);
}

export function serializeWhatsAppMessage(message: WhatsAppMessage) {
  return {
    id: message.id,
    kind: message.kind,
    status: message.status,
    provider: message.provider,
    toPhone: message.toPhone,
    body: message.body,
    deepLinkUrl: message.deepLinkUrl,
    attempts: message.attempts,
    lastError: message.lastError,
    queuedAt: message.queuedAt,
    sentAt: message.sentAt,
    // Tells the UI whether to show a "send it yourself" button or just a status.
    requiresManualSend: message.status === WhatsAppMessageStatus.MANUAL_PENDING || message.status === WhatsAppMessageStatus.FAILED
  };
}
