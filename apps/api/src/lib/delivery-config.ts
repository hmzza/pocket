import { prisma } from "./prisma.js";
import { addDateKeyDays, getPakistanDateParts } from "./business-day.js";

export const DELIVERY_CITY = "Islamabad";
export const DELIVERY_CLOSED_MESSAGE = "Our riders are currently busy at the moment, you can call or text on 03295196981 to place your order.";

const LEGACY_SECTORS = [
  { name: "G-11", fee: 70 },
  { name: "G-10", fee: 150 },
  { name: "F-11", fee: 150 },
  { name: "G-12", fee: 180 },
  { name: "G-13", fee: 200 },
  { name: "F-10", fee: 180 },
  { name: "G-9", fee: 200 }
] as const;

export type DeliverySectorSnapshot = {
  id: string;
  name: string;
  deliveryFee: number;
  isActive: boolean;
  sortOrder: number;
  subsectors: string[];
};

export type DeliveryConfigSnapshot = {
  deliveryEnabled: boolean;
  scheduleConfigured: boolean;
  openTime: string | null;
  closeTime: string | null;
  manualEnabled: boolean;
  isWithinSchedule: boolean;
  nextTransitionAt: string | null;
  message: string | null;
  sectors: DeliverySectorSnapshot[];
};

function dateKeyFromParts(parts: { year: number; month: number; day: number }) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function parseTime(value: string) {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(value);
  if (!match) throw new Error("Delivery time must use the HH:mm format.");
  const [hour = 0, minute = 0] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function pakistanDateAt(dateKey: string, minutes: number) {
  const [year = 0, month = 1, day = 1] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60) - 5 * 60 * 60 * 1000);
}

function normalizePhone(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.startsWith("92") && digits.length === 12) return `0${digits.slice(2)}`;
  if (digits.startsWith("3") && digits.length === 10) return `0${digits}`;
  return value?.trim() || "03295196981";
}

export function getDeliverySubsectors(sectorName: string) {
  return [1, 2, 3, 4].map((number) => `${sectorName}/${number}`).concat(`${sectorName} Markaz`);
}

export function isDeliverySubsector(sectorName: string, subsector: string) {
  return getDeliverySubsectors(sectorName).includes(subsector);
}

export async function ensureDeliveryConfiguration(branchId: string) {
  const legacySetting = await prisma.setting.findUnique({ where: { key: "store.delivery" }, select: { value: true } });
  const legacyEnabled = !(
    legacySetting?.value &&
    typeof legacySetting.value === "object" &&
    "enabled" in legacySetting.value &&
    (legacySetting.value as { enabled?: unknown }).enabled === false
  );

  const configuration = await prisma.deliveryConfiguration.upsert({
    where: { branchId },
    update: {},
    create: { branchId, manualEnabled: legacyEnabled }
  });

  const sectorCount = await prisma.deliverySector.count({ where: { branchId } });
  if (!sectorCount) {
    await prisma.deliverySector.createMany({
      data: LEGACY_SECTORS.map((sector, index) => ({
        branchId,
        name: sector.name,
        deliveryFee: sector.fee,
        sortOrder: index
      }))
    });
  }

  return configuration;
}

export async function ensureDeliveryConfigurations() {
  const branches = await prisma.branch.findMany({ where: { isActive: true }, select: { id: true } });
  for (const branch of branches) {
    await ensureDeliveryConfiguration(branch.id);
  }
}

function scheduleWindow(now: Date, openTime: string, closeTime: string) {
  const openMinutes = parseTime(openTime);
  const closeMinutes = parseTime(closeTime);
  if (openMinutes === closeMinutes) {
    return { within: true, windowKey: dateKeyFromParts(getPakistanDateParts(now)), nextTransitionAt: null };
  }

  const parts = getPakistanDateParts(now);
  const currentMinutes = parts.hour * 60 + parts.minute;
  const todayKey = dateKeyFromParts(parts);
  const overnight = closeMinutes < openMinutes;
  const within = overnight
    ? currentMinutes >= openMinutes || currentMinutes < closeMinutes
    : currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  const windowKey = within && overnight && currentMinutes < closeMinutes ? addDateKeyDays(todayKey, -1) : todayKey;
  const transitionDateKey = within
    ? (overnight && currentMinutes >= openMinutes ? addDateKeyDays(todayKey, 1) : todayKey)
    : currentMinutes < openMinutes
      ? todayKey
      : addDateKeyDays(todayKey, 1);
  const transitionMinutes = within ? closeMinutes : openMinutes;

  return {
    within,
    windowKey,
    nextTransitionAt: pakistanDateAt(transitionDateKey, transitionMinutes).toISOString()
  };
}

export async function getDeliveryConfigSnapshot(branchId: string, options: { includeInactive?: boolean; now?: Date } = {}): Promise<DeliveryConfigSnapshot> {
  await ensureDeliveryConfiguration(branchId);
  const [configuration, branch, sectors] = await Promise.all([
    prisma.deliveryConfiguration.findUniqueOrThrow({ where: { branchId } }),
    prisma.branch.findUniqueOrThrow({ where: { id: branchId }, select: { phone: true } }),
    prisma.deliverySector.findMany({
      where: { branchId, ...(options.includeInactive ? {} : { isActive: true }) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    })
  ]);

  const now = options.now ?? new Date();
  const scheduleConfigured = Boolean(configuration.openTime && configuration.closeTime);
  const schedule = scheduleConfigured
    ? scheduleWindow(now, configuration.openTime!, configuration.closeTime!)
    : { within: true, windowKey: null, nextTransitionAt: null };
  const manualAllowed = !scheduleConfigured || schedule.within;
  const manualEnabled = configuration.manualOverrideWindowKey === schedule.windowKey
    ? configuration.manualEnabled
    : configuration.manualEnabled;
  const deliveryEnabled = manualAllowed && (!scheduleConfigured || (schedule.within && (configuration.manualOverrideWindowKey !== schedule.windowKey || manualEnabled)));

  return {
    deliveryEnabled,
    scheduleConfigured,
    openTime: configuration.openTime,
    closeTime: configuration.closeTime,
    manualEnabled,
    isWithinSchedule: schedule.within,
    nextTransitionAt: schedule.nextTransitionAt,
    message: deliveryEnabled ? null : DELIVERY_CLOSED_MESSAGE.replace("03295196981", normalizePhone(branch.phone)),
    sectors: sectors.map((sector) => ({
      id: sector.id,
      name: sector.name,
      deliveryFee: Number(sector.deliveryFee),
      isActive: sector.isActive,
      sortOrder: sector.sortOrder,
      subsectors: getDeliverySubsectors(sector.name)
    }))
  };
}

export async function setDeliveryManualState(branchId: string, enabled: boolean) {
  const configuration = await ensureDeliveryConfiguration(branchId);
  const now = new Date();
  const snapshot = await getDeliveryConfigSnapshot(branchId, { now });
  const windowKey = snapshot.scheduleConfigured && snapshot.isWithinSchedule
    ? scheduleWindow(now, snapshot.openTime!, snapshot.closeTime!).windowKey
    : null;

  return prisma.deliveryConfiguration.update({
    where: { id: configuration.id },
    data: { manualEnabled: enabled, manualOverrideWindowKey: windowKey }
  });
}

export async function setDeliveryTimings(branchId: string, openTime: string | null, closeTime: string | null) {
  if ((openTime && !closeTime) || (!openTime && closeTime)) {
    throw new Error("Set both delivery opening and closing times, or clear both.");
  }
  if (openTime) parseTime(openTime);
  if (closeTime) parseTime(closeTime);

  await ensureDeliveryConfiguration(branchId);
  return prisma.deliveryConfiguration.update({
    where: { branchId },
    data: { openTime, closeTime, manualEnabled: true, manualOverrideWindowKey: null }
  });
}

export async function findActiveDeliverySector(branchId: string, name: string) {
  return prisma.deliverySector.findFirst({ where: { branchId, name, isActive: true } });
}

export async function findDeliverySector(branchId: string, name: string, includeInactive = false) {
  return prisma.deliverySector.findFirst({ where: { branchId, name, ...(includeInactive ? {} : { isActive: true }) } });
}

export function legacyDeliverySectors() {
  return LEGACY_SECTORS;
}
