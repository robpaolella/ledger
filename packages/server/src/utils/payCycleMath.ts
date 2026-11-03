import type { PayFrequency } from '@ledger/shared/src/types.js';

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
  // Recurring items add 'every_n_months' and 'custom_months' on top of the four
  // pay-cycle frequencies; the extra branches are purely additive.
  frequency: PayFrequency | 'every_n_months' | 'custom_months';
  amount: number;
  anchor_date: string | null;
  day_of_month_1: number | null;
  day_of_month_2: number | null;
  day_of_month: number | null;
  interval?: number | null; // every_n_months: repeat every N months from the anchor
  months?: number[] | null; // custom_months: 1-based months it occurs in
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
  } else if (cycle.frequency === 'every_n_months') {
    // Repeat every N months from an anchor month (anchor_date, else effective_start).
    // In phase when the whole-month delta from the anchor is a multiple of N — works
    // across year boundaries and extrapolates backward (modulo is sign-safe).
    const n = cycle.interval && cycle.interval > 0 ? cycle.interval : 1;
    const anchor = cycle.anchor_date ?? cycle.effective_start;
    if (anchor) {
      const [ay, am] = anchor.split('-').map(Number);
      const mDelta = (year - ay) * 12 + (mon - am);
      if (((mDelta % n) + n) % n === 0) {
        const d = resolveDay(cycle.day_of_month ?? 1, lastDay);
        const p = ymdToMs(year, mon, d);
        if (p >= startMs && p <= endMs) out.push(p);
      }
    }
  } else if (cycle.frequency === 'custom_months') {
    // Occurs only in a chosen set of 1-based months, on day_of_month.
    if (cycle.months && cycle.months.includes(mon)) {
      const d = resolveDay(cycle.day_of_month ?? 1, lastDay);
      const p = ymdToMs(year, mon, d);
      if (p >= startMs && p <= endMs) out.push(p);
    }
  }

  return out.map(msToYmd);
}

