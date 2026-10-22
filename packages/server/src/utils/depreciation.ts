export interface DepreciationParams {
  cost: number;
  salvageValue: number;
  lifespanYears: number;
  purchaseDate: string;
  depreciationMethod: 'straight_line' | 'declining_balance';
  decliningRate: number | null;
  /** Value the asset as of this date instead of today — used for historical net-worth points. */
  asOf?: string | Date;
}

export function calculateCurrentValue(params: DepreciationParams): number {
  const { cost, salvageValue, purchaseDate, depreciationMethod, decliningRate, asOf } = params;
  const now = asOf ? new Date(asOf) : new Date();
  const purchased = new Date(purchaseDate);
  // Not yet owned as of the valuation date → contributes nothing (keeps /summary
  // and /history consistent for future-dated assets).
  if (now.getTime() < purchased.getTime()) return 0;
  const yearsOwned = (now.getTime() - purchased.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

  if (depreciationMethod === 'declining_balance' && decliningRate != null) {
    const currentValue = cost * Math.pow(1 - decliningRate / 100, yearsOwned);
    return Math.max(salvageValue, currentValue);
  }

  // Straight line (default)
  const { lifespanYears } = params;
  const annualDepreciation = (cost - salvageValue) / lifespanYears;
  return Math.max(salvageValue, cost - (annualDepreciation * Math.min(yearsOwned, lifespanYears)));
}
