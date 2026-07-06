export const MONTHLY_BREAKEVEN_TARGET = 530000;

export const FOODPANDA_PAYOUT_RATIO = {
  min: 0.58,
  estimate: 0.59,
  max: 0.6
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
