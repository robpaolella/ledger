/**
 * Client-side pay-cycle schedule math — used ONLY for the live "year preview" in
 * the Pay Cycles form (before a cycle is saved). It mirrors the authoritative
 * server implementation in packages/server/src/utils/payCycleMath.ts; the server
 * is the source of truth at import time. Keep the two in sync if the algorithm
 * changes.
 *
 * All arithmetic is in UTC epoch-ms (no DST, no toISOString-of-local-date drift).
 */

export type PayFrequency = 'weekly' | 'biweekly' | 'semi_monthly' | 'monthly';

export interface PreviewCycle {
  frequency: PayFrequency;
  amount: number;
  anchor_date: string | null;
  day_of_month_1: number | null;
  day_of_month_2: number | null;
  day_of_month: number | null;
  effective_start: string | null;
  effective_end: string | null;
}

const DAY_MS = 86_400_000;
const ymdToMs = (y: number, m: number, d: number): number => Date.UTC(y, m - 1, d);
const ymdStrToMs = (s: string): number => { const [y, m, d] = s.split('-').map(Number); return ymdToMs(y, m, d); };
const lastDayOfMonth = (year: number, mon: number): number => new Date(Date.UTC(year, mon, 0)).getUTCDate();
const resolveDay = (day: number, lastDay: number): number => (day === 0 ? lastDay : Math.min(day, lastDay));

/** Count of paydays in month `mon` (1-based) of `year` for one cycle. */
export function paydayCountInMonth(cycle: PreviewCycle, year: number, mon: number): number {
  const lastDay = lastDayOfMonth(year, mon);
  let startMs = ymdToMs(year, mon, 1);
  let endMs = ymdToMs(year, mon, lastDay);
  if (cycle.effective_start) startMs = Math.max(startMs, ymdStrToMs(cycle.effective_start));
  if (cycle.effective_end) endMs = Math.min(endMs, ymdStrToMs(cycle.effective_end));
  if (startMs > endMs) return 0;

  if (cycle.frequency === 'weekly' || cycle.frequency === 'biweekly') {
    if (!cycle.anchor_date) return 0;
    const step = (cycle.frequency === 'weekly' ? 7 : 14) * DAY_MS;
    const anchorMs = ymdStrToMs(cycle.anchor_date);
    // anchor is a phase reference — k may be negative (extrapolate backward)
    const k = Math.ceil((startMs - anchorMs) / step);
    let p = anchorMs + k * step;
    let count = 0;
    while (p <= endMs) { if (p >= startMs) count++; p += step; }
    return count;
  }
  if (cycle.frequency === 'semi_monthly') {
    const days = [...new Set([resolveDay(cycle.day_of_month_1 ?? 1, lastDay), resolveDay(cycle.day_of_month_2 ?? 15, lastDay)])];
    return days.filter((d) => { const p = ymdToMs(year, mon, d); return p >= startMs && p <= endMs; }).length;
  }
  // monthly
  const d = resolveDay(cycle.day_of_month ?? 1, lastDay);
  const p = ymdToMs(year, mon, d);
  return p >= startMs && p <= endMs ? 1 : 0;
}

export interface YearPreview {
  perMonth: number[]; // 12 counts, Jan..Dec
  baseline: number; // min non-zero monthly count
  totalChecks: number;
  extraMonths: number[]; // 1-based month numbers exceeding baseline
  annual: number;
}

export function computeYearPreview(cycle: PreviewCycle, year: number): YearPreview {
  const perMonth = Array.from({ length: 12 }, (_, i) => paydayCountInMonth(cycle, year, i + 1));
  // Baseline is the typical full-month count from the UNBOUNDED schedule, so a
  // partial boundary month (from effective_start/end) doesn't deflate it and
  // wrongly highlight ordinary months as extra. Mirrors server yearlyBaseline.
  const canonical: PreviewCycle = { ...cycle, effective_start: null, effective_end: null };
  const canonCounts = Array.from({ length: 12 }, (_, i) => paydayCountInMonth(canonical, year, i + 1)).filter((c) => c > 0);
  const baseline = canonCounts.length ? Math.min(...canonCounts) : 0;
  const totalChecks = perMonth.reduce((a, b) => a + b, 0);
  const extraMonths = perMonth.map((c, i) => ({ c, m: i + 1 })).filter((x) => x.c > baseline).map((x) => x.m);
  return { perMonth, baseline, totalChecks, extraMonths, annual: totalChecks * (cycle.amount || 0) };
}
