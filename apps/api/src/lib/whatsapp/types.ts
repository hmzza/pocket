import type { WhatsAppMessageKind } from "@prisma/client";

/**
 * A message ready to leave the system. Built by templates.ts and handed to
 * whichever provider is configured.
 */
export type OutgoingWhatsAppMessage = {
  kind: WhatsAppMessageKind;
  /** Canonical international digits, no plus. See lib/phone.ts. */
  toPhone: string;
  /** Human-readable body. Used verbatim by the deep-link provider. */
  body: string;
  /**
   * Ordered substitutions for a WhatsApp Cloud API template. Business-initiated
   * messages outside the 24-hour service window must use an approved template
   * rather than free text, so the same message carries both forms.
   */
  templateParameters: string[];
};

/**
 * The outcome of handing a message to a provider.
 *
 * MANUAL_PENDING is a first-class result, not a failure: the deep-link provider
 * cannot send on its own, it can only prepare a link for a human to open. The
 * dispatch board shows those as awaiting a click so nobody assumes a rider was
 * told when they were not.
 */
export type WhatsAppSendResult =
  | { status: "SENT"; providerMessageId?: string }
  | { status: "MANUAL_PENDING"; deepLinkUrl: string }
  | { status: "FAILED"; error: string };

export interface WhatsAppProvider {
  /** Stored on the message row so history shows how it was sent. */
  readonly name: string;
  /** Whether this provider can deliver without a human in the loop. */
  readonly automatic: boolean;
  send(message: OutgoingWhatsAppMessage): Promise<WhatsAppSendResult>;
}
