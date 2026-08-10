export const REPORT_TIME_ZONE = "Asia/Karachi";
export const PAKISTAN_UTC_OFFSET_MS = 5 * 60 * 60 * 1000;
export const BUSINESS_DAY_START_HOUR = 6;

export type PakistanDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function getPakistanDateParts(date: Date): PakistanDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
}

function dateKeyFromUtcDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }
  return { year, month, day };
}

export function addDateKeyDays(dateKey: string, days: number) {
  const { year, month, day } = parseDateKey(dateKey);
  return dateKeyFromUtcDate(new Date(Date.UTC(year, month - 1, day + days)));
}

export function getBusinessDateKey(date = new Date()) {
  const parts = getPakistanDateParts(date);
  const calendarKey = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  return parts.hour < BUSINESS_DAY_START_HOUR ? addDateKeyDays(calendarKey, -1) : calendarKey;
}

export function businessDayStart(dateKey: string) {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day, BUSINESS_DAY_START_HOUR) - PAKISTAN_UTC_OFFSET_MS);
}

export function businessDayRange(dateKey: string) {
  const start = businessDayStart(dateKey);
  return {
    start,
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)
  };
}

export function businessMonthRange(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) {
    throw new Error(`Invalid month key: ${monthKey}`);
  }
  const start = businessDayStart(`${year}-${String(month).padStart(2, "0")}-01`);
  const nextStart = businessDayStart(dateKeyFromUtcDate(new Date(Date.UTC(year, month, 1))));
  return {
    start,
    end: new Date(nextStart.getTime() - 1)
  };
}

export function businessYearRange(year: number) {
  const start = businessDayStart(`${year}-01-01`);
  const nextStart = businessDayStart(`${year + 1}-01-01`);
  return {
    start,
    end: new Date(nextStart.getTime() - 1)
  };
}

export function getBusinessWeekdayIndex(date: Date) {
  const { year, month, day } = parseDateKey(getBusinessDateKey(date));
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function getPakistanHour(date: Date) {
  return getPakistanDateParts(date).hour;
}

export function formatPakistanDate(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-PK", { ...options, timeZone: REPORT_TIME_ZONE }).format(date);
}
