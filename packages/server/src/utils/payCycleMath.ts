import type {
  PayFrequency,
  PayCycleProjection,
  PayCycleProjectionCycle,
  PayCycleProjectionCategoryTotal,
} from '@ledger/shared/src/types.js';

/**
 * Pay-cycle schedule math. Single source of truth for how many paychecks fall
 * in a given calendar month and the resulting expected-income projection.
 *
 * ALL arithmetic is done in UTC epoch-milliseconds (Date.UTC / getUTC*). UTC has
 * no DST, so +7/+14 days is always exactly 7/14 calendar days, and we never round-
 * trip a locally-constructed Date through toISOString() (the app's documented
 * off-by-one hazard). Dates are 'YYYY-MM-DD' strings; months are 'YYYY-MM'.
 *
 * `amount` is the per-paycheck take-home and is POSITIVE. Income *budget* rows are
 * stored positive (unlike income *transactions*, which are stored negative), so
 * projectedAmount flows straight into a budget row with no sign flip.
 */

const DAY_MS = 86_400_000;

/** Minimal cycle shape the math needs, plus meta used to shape the projection. */
export interface PayCycleForMath {
  id: number;
  label: string;
  user_id: number | null;
  ownerName: string | null;
  category_id: number;
  sub_name: string;
  group_name: string;
  frequency: PayFrequency;
  amount: number;
  anchor_date: string | null;
  day_of_month_1: number | null;
  day_of_month_2: number | null;
  day_of_month: number | null;
  effective_start: string | null;
  effective_end: string | null;
  is_active: number;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');
const ymdToMs = (y: number, m: number, d: number): number => Date.UTC(y, m - 1, d);
const ymdStrToMs = (s: string): number => { const [y, m, d] = s.split('-').map(Number); return ymdToMs(y, m, d); };
const msToYmd = (ms: number): string => { const dt = new Date(ms); return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`; };
/** Last calendar day of month `mon` (1-based) in `year`, e.g. Feb 2026 -> 28. */
const lastDayOfMonth = (year: number, mon: number): number => new Date(Date.UTC(year, mon, 0)).getUTCDate();
/** Resolve a stored day-of-month to an actual day: 0 = last day; otherwise clamp into the month. */
const resolveDay = (day: number, lastDay: number): number => (day === 0 ? lastDay : Math.min(day, lastDay));

/** Parse a 'YYYY-MM' month string into numeric year + 1-based month. */
export function parseMonth(month: string): { year: number; mon: number } {
  const [year, mon] = month.split('-').map(Number);
  return { year, mon };
}

/**
 * The payday dates ('YYYY-MM-DD') that fall within calendar month `mon`/`year`
 * for one cycle, intersected with its effective_start/effective_end window.
 *
 * For weekly/biweekly the anchor_date is a PHASE reference — the cadence extends
 * infinitely in both directions, so k may be negative (extrapolate backward).
 * Activation is bounded only by effective_start/effective_end, never by where the
 * anchor happens to sit. (Clamping k>=0 would wrongly blank every month before the
 * anchor.)
 */
export function computePaydaysInMonth(cycle: PayCycleForMath, year: number, mon: number): string[] {
  const lastDay = lastDayOfMonth(year, mon);
  let startMs = ymdToMs(year, mon, 1);
  let endMs = ymdToMs(year, mon, lastDay);
  if (cycle.effective_start) startMs = Math.max(startMs, ymdStrToMs(cycle.effective_start));
  if (cycle.effective_end) endMs = Math.min(endMs, ymdStrToMs(cycle.effective_end));
  if (startMs > endMs) return [];

  const out: number[] = [];

  if (cycle.frequency === 'weekly' || cycle.frequency === 'biweekly') {
    if (!cycle.anchor_date) return [];
    const step = (cycle.frequency === 'weekly' ? 7 : 14) * DAY_MS;
    const anchorMs = ymdStrToMs(cycle.anchor_date);
    // Smallest k (possibly negative) with anchorMs + k*step >= startMs.
    const k = Math.ceil((startMs - anchorMs) / step);
    let p = anchorMs + k * step;
    while (p <= endMs) {
      if (p >= startMs) out.push(p);
      p += step;
    }
  } else if (cycle.frequency === 'semi_monthly') {
    const d1 = resolveDay(cycle.day_of_month_1 ?? 1, lastDay);
    const d2 = resolveDay(cycle.day_of_month_2 ?? 15, lastDay);
    for (const d of [...new Set([d1, d2])].sort((a, b) => a - b)) {
      const p = ymdToMs(year, mon, d);
      if (p >= startMs && p <= endMs) out.push(p);
    }
  } else if (cycle.frequency === 'monthly') {
    const d = resolveDay(cycle.day_of_month ?? 1, lastDay);
    const p = ymdToMs(year, mon, d);
    if (p >= startMs && p <= endMs) out.push(p);
  }

  return out.map(msToYmd);
}

/**
 * The typical full-month paycheck count for a cycle in `year` (2 for biweekly,
 * 4 for weekly, 2 for semi_monthly, 1 for monthly). Used to flag "this month has
 * an extra paycheck" (count > baseline). Computed against the UNBOUNDED schedule
 * so a partial boundary month created by effective_start/effective_end does not
 * deflate the baseline and wrongly flag ordinary months as extra. Returns 0 if
 * the cycle never pays.
 */
export function yearlyBaseline(cycle: PayCycleForMath, year: number): number {
  const canonical: PayCycleForMath = { ...cycle, effective_start: null, effective_end: null };
  let min = Infinity;
  for (let m = 1; m <= 12; m++) {
    const c = computePaydaysInMonth(canonical, year, m).length;
    if (c > 0 && c < min) min = c;
  }
  return min === Infinity ? 0 : min;
}

/**
 * Project expected income for `month` ('YYYY-MM') across a set of cycles.
 * Inactive cycles and cycles with zero paydays in the month are excluded.
 * Cycles targeting the same category are summed into one categoryTotal.
 */
export function projectPayCycles(cycles: PayCycleForMath[], month: string): PayCycleProjection {
  const { year, mon } = parseMonth(month);
  const cycleOut: PayCycleProjectionCycle[] = [];
  const byCat = new Map<number, PayCycleProjectionCategoryTotal>();

  for (const c of cycles) {
    if (!c.is_active) continue;
    const paydays = computePaydaysInMonth(c, year, mon);
    const paydayCount = paydays.length;
    if (paydayCount === 0) continue;

    const projectedAmount = c.amount * paydayCount;
    cycleOut.push({
      id: c.id,
      label: c.label,
      userId: c.user_id,
      ownerName: c.ownerName,
      categoryId: c.category_id,
      subName: c.sub_name,
      groupName: c.group_name,
      frequency: c.frequency,
      perPaycheckAmount: c.amount,
      paydays,
      paydayCount,
      projectedAmount,
    });

    const exceedsBaseline = paydayCount > yearlyBaseline(c, year);
    const cur = byCat.get(c.category_id) ?? {
      categoryId: c.category_id,
      subName: c.sub_name,
      groupName: c.group_name,
      projectedAmount: 0,
      cycleIds: [] as number[],
      paydayCount: 0,
      hasExtraPaycheck: false,
    };
    cur.projectedAmount += projectedAmount;
    cur.cycleIds.push(c.id);
    cur.paydayCount += paydayCount;
    if (exceedsBaseline) cur.hasExtraPaycheck = true;
    byCat.set(c.category_id, cur);
  }

  return { month, cycles: cycleOut, categoryTotals: [...byCat.values()] };
}
