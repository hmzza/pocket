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

export function toPakistanDateIso(value: string, endOfDay = false) {
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  return new Date(`${value}T${time}+05:00`).toISOString();
}

export function averageRating(ratings: number[]) {
  if (!ratings.length) return 0;
  return Number((ratings.reduce((total, rating) => total + rating, 0) / ratings.length).toFixed(1));
}
