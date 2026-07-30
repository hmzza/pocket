export const MONTHLY_BREAKEVEN_TARGET = 530000;

export const FOODPANDA_COMMISSION_RATE = 0.38;

export const FOODPANDA_PAYOUT_RATIO = {
  min: 1 - FOODPANDA_COMMISSION_RATE,
  estimate: 1 - FOODPANDA_COMMISSION_RATE,
  max: 1 - FOODPANDA_COMMISSION_RATE
};

export function estimateFoodpandaPayout(grossRevenue: number) {
  const gross = Math.max(0, grossRevenue);
  const minimum = Number((gross * FOODPANDA_PAYOUT_RATIO.min).toFixed(2));
  const estimated = Number((gross * FOODPANDA_PAYOUT_RATIO.estimate).toFixed(2));
  const maximum = Number((gross * FOODPANDA_PAYOUT_RATIO.max).toFixed(2));

  return {
    gross,
    minimum,
    estimated,
    maximum,
    retainedMin: Number((gross - maximum).toFixed(2)),
    retainedMax: Number((gross - minimum).toFixed(2))
  };
}

export function getFoodpandaRevenueFromBreakdowns(
  breakdowns: Array<{ label: string; revenue: number }>
) {
  return breakdowns.find((entry) => entry.label.toLowerCase() === "foodpanda")?.revenue ?? 0;
}

export function getRevenueAfterFoodpandaCut(totalRevenue: number, foodpandaRevenue: number) {
  return Math.max(0, totalRevenue - Math.max(0, foodpandaRevenue) * FOODPANDA_COMMISSION_RATE);
}
