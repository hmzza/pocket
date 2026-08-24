/**
 * Pakistani phone normalisation.
 *
 * Numbers reach us in every shape a human might type: 0300-1234567,
 * +92 300 1234567, 00923001234567, 3001234567. They are used as the guest
 * identity key at checkout and as the WhatsApp destination for riders, so both
 * paths must agree on one canonical form or the same person becomes two records
 * and messages go nowhere.
 *
 * Canonical form is bare international digits with no punctuation and no plus:
 * "923001234567". This matches what wa.me expects in its path segment, and
 * mirrors formatWhatsAppPhone in apps/web/components/pos/pos-terminal.tsx.
 */

const PK_COUNTRY_CODE = "92";
const PK_MOBILE_PATTERN = /^923\d{9}$/;

/**
 * Reduce any input to canonical digits. Returns "" when there is nothing usable,
 * so callers can treat empty as "not provided" without a null check.
 */
export function normalizePakistanPhone(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "";

  // 00 is the international access prefix: 00923001234567 -> 923001234567
  if (digits.startsWith("00")) return digits.slice(2);
  // Already international: 923001234567
  if (digits.startsWith(PK_COUNTRY_CODE) && digits.length >= 12) return digits;
  // National trunk form: 03001234567 -> 923001234567
  if (digits.startsWith("0")) return `${PK_COUNTRY_CODE}${digits.slice(1)}`;
  // Bare mobile without trunk or country code: 3001234567 -> 923001234567
  if (digits.length === 10 && digits.startsWith("3")) return `${PK_COUNTRY_CODE}${digits}`;

  return digits;
}

/** True when the canonical form is a reachable Pakistani mobile (WhatsApp-capable). */
export function isPakistanMobile(value: string | null | undefined): boolean {
  return PK_MOBILE_PATTERN.test(normalizePakistanPhone(value));
}

/** Human-readable rendering for admin screens and message bodies: +92 300 1234567. */
export function formatPakistanPhone(value: string | null | undefined): string {
  const digits = normalizePakistanPhone(value);
  if (!PK_MOBILE_PATTERN.test(digits)) return value?.trim() ?? "";
  return `+${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
}

/**
 * Last-7-digit comparison, matching the existing tolerance of the public order
 * lookup in routes/catalog.ts so a customer who typed their number slightly
 * differently at checkout can still find their order.
 */
export function phonesMatchLoosely(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = normalizePakistanPhone(left);
  const b = normalizePakistanPhone(right);
  if (!a || !b) return false;
  return a.slice(-7) === b.slice(-7);
}
