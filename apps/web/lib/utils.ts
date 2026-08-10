import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0
  }).format(value);
}

/** Keeps full rupee amounts readable in narrow cards. */
export function formatCompactCurrency(value: number) {
  return formatCurrency(value);
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

const PAKISTAN_UTC_OFFSET_MS = 5 * 60 * 60 * 1000;
const BUSINESS_DAY_START_HOUR = 6;
const PAKISTAN_TIME_ZONE = "Asia/Karachi";

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error(`Invalid date value: ${value}`);
  }
  return { year, month, day };
}

function addDateKeyDays(value: string, days: number) {
  const { year, month, day } = parseDateKey(value);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function getPakistanParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PAKISTAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour)
  };
}

export function getCurrentBusinessDateKey(date = new Date()) {
  const parts = getPakistanParts(date);
  const calendarKey = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  return parts.hour < BUSINESS_DAY_START_HOUR ? addDateKeyDays(calendarKey, -1) : calendarKey;
}

export function toBusinessDayStartIso(value: string) {
  const { year, month, day } = parseDateKey(value);
  return new Date(Date.UTC(year, month - 1, day, BUSINESS_DAY_START_HOUR) - PAKISTAN_UTC_OFFSET_MS).toISOString();
}

export function toBusinessDayEndIso(value: string) {
  return new Date(new Date(toBusinessDayStartIso(value)).getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();
}

export function toBusinessDateInputValue(value: string | Date) {
  return getCurrentBusinessDateKey(value instanceof Date ? value : new Date(value));
}

export function toPakistanDateIso(value: string, endOfDay = false) {
  return endOfDay ? toBusinessDayEndIso(value) : toBusinessDayStartIso(value);
}

export function averageRating(ratings: number[]) {
  if (!ratings.length) return 0;
  return Number((ratings.reduce((total, rating) => total + rating, 0) / ratings.length).toFixed(1));
}
