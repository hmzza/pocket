import { randomUUID } from "crypto";

function normalizeUsernameSeed(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function buildUniqueUsername(seed: string) {
  const normalized = normalizeUsernameSeed(seed);
  const base = normalized.slice(0, 24) || "user";
  return `${base}_${randomUUID().slice(0, 8)}`;
}
