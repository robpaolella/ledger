/**
 * Self-test for payCycleMath. There is no test runner in this repo, so this is a
 * standalone assertion script. Run with:
 *
 *   npx tsx packages/server/src/utils/payCycleMath.selftest.ts
 *
 * Exits non-zero on the first failed assertion.
 */
import { computePaydaysInMonth, type PayCycleForMath } from './payCycleMath.js';

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : '');
  }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function base(overrides: Partial<PayCycleForMath>): PayCycleForMath {
  return {
    id: 1, label: 'test', user_id: null, ownerName: null,
    category_id: 100, sub_name: 'Take Home Pay', group_name: 'Income',
    frequency: 'biweekly', amount: 1000,
    anchor_date: null, day_of_month_1: null, day_of_month_2: null, day_of_month: null,
    interval: null, months: null,
    effective_start: null, effective_end: null, is_active: 1,
    ...overrides,
  };
}
const countsForYear = (c: PayCycleForMath, year: number) =>
  Array.from({ length: 12 }, (_, i) => computePaydaysInMonth(c, year, i + 1).length);

// 1. Biweekly anchor 2026-01-02 — extra checks in Jan & Jul (26/yr)
{
  const c = base({ frequency: 'biweekly', amount: 1750, anchor_date: '2026-01-02' });
  const counts = countsForYear(c, 2026);
  console.log('Biweekly anchor 2026-01-02:');
  check('counts = [3,2,2,2,2,2,3,2,2,2,2,2]', eq(counts, [3, 2, 2, 2, 2, 2, 3, 2, 2, 2, 2, 2]), counts);
  check('total = 26', counts.reduce((a, b) => a + b, 0) === 26);
  check('Jan paydays', eq(computePaydaysInMonth(c, 2026, 1), ['2026-01-02', '2026-01-16', '2026-01-30']));
  check('Jul paydays', eq(computePaydaysInMonth(c, 2026, 7), ['2026-07-03', '2026-07-17', '2026-07-31']));
}

// 2. Weekly anchor 2026-01-02 — 5-check months Jan/May/Jul/Oct (52/yr)
{
  const c = base({ frequency: 'weekly', amount: 875, anchor_date: '2026-01-02' });
  const counts = countsForYear(c, 2026);
  console.log('Weekly anchor 2026-01-02:');
  check('counts = [5,4,4,4,5,4,5,4,4,5,4,4]', eq(counts, [5, 4, 4, 4, 5, 4, 5, 4, 4, 5, 4, 4]), counts);
  check('total = 52', counts.reduce((a, b) => a + b, 0) === 52);
}

// 3. Semi-monthly 15th & last day — always 2/month; Feb resolves to 02-28
{
  const c = base({ frequency: 'semi_monthly', amount: 500, day_of_month_1: 15, day_of_month_2: 0 });
  const counts = countsForYear(c, 2026);
  console.log('Semi-monthly 15 & last:');
  check('every month count = 2', counts.every((x) => x === 2), counts);
  check('Feb paydays = [15, 28]', eq(computePaydaysInMonth(c, 2026, 2), ['2026-02-15', '2026-02-28']));
}

// 4. Monthly on the 31st — clamps in short months
{
  const c = base({ frequency: 'monthly', amount: 450, day_of_month: 31 });
  console.log('Monthly day 31:');
  check('Feb payday = 02-28', eq(computePaydaysInMonth(c, 2026, 2), ['2026-02-28']));
  check('Apr payday = 04-30', eq(computePaydaysInMonth(c, 2026, 4), ['2026-04-30']));
  check('Jan payday = 01-31', eq(computePaydaysInMonth(c, 2026, 1), ['2026-01-31']));
}

// 5. Mid-year anchor must NOT zero out earlier months (the fixed bug)
{
  const c = base({ frequency: 'biweekly', amount: 1750, anchor_date: '2026-06-15' });
  const counts = countsForYear(c, 2026);
  console.log('Biweekly mid-year anchor 2026-06-15 (backward extrapolation):');
  check('Jan is NOT zero', counts[0] > 0, counts);
  check('total = 26', counts.reduce((a, b) => a + b, 0) === 26, counts);
}

// 6. effective_start bounds the schedule (inclusive)
{
  const c = base({ frequency: 'biweekly', amount: 1750, anchor_date: '2026-01-02', effective_start: '2026-01-16' });
  console.log('effective_start 2026-01-16:');
  check('Jan drops 01-02, keeps 01-16 & 01-30', eq(computePaydaysInMonth(c, 2026, 1), ['2026-01-16', '2026-01-30']));
}

// 7. Future-start job: effective_start gates out earlier months
{
  const c = base({ frequency: 'biweekly', amount: 1750, anchor_date: '2027-03-01', effective_start: '2027-03-01' });
  console.log('Future job (anchor + effective_start 2027-03-01), projecting 2026:');
  check('2026 fully zero', countsForYear(c, 2026).every((x) => x === 0));
}


// 10. every_n_months — quarterly anchored 2026-02-10, day 10, across a year boundary
{
  const c = base({ frequency: 'every_n_months', amount: 300, interval: 3, anchor_date: '2026-02-10', day_of_month: 10 });
  const counts = countsForYear(c, 2026);
  console.log('every_n_months (quarterly, anchor 2026-02-10 day 10):');
  check('2026 counts = Feb/May/Aug/Nov', eq(counts, [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), counts);
  check('Feb payday = 02-10', eq(computePaydaysInMonth(c, 2026, 2), ['2026-02-10']));
  // Year boundary continuity: next in-phase month after Nov 2026 is Feb 2027, and
  // Jan 2027 (11 months from anchor) is NOT in phase, but 2027-02 IS (12 % 3 === 0).
  check('2027-01 not in phase', computePaydaysInMonth(c, 2027, 1).length === 0);
  check('2027-02 in phase', eq(computePaydaysInMonth(c, 2027, 2), ['2027-02-10']));
  // Backward extrapolation: 2025-11 (−3 months) is in phase.
  check('2025-11 in phase (backward)', eq(computePaydaysInMonth(c, 2025, 11), ['2025-11-10']));
}

// 11. every_n_months day 31 clamps to short in-phase months
{
  const c = base({ frequency: 'every_n_months', amount: 100, interval: 1, anchor_date: '2026-01-31', day_of_month: 31 });
  console.log('every_n_months (monthly-equiv, day 31):');
  check('Feb clamps to 02-28', eq(computePaydaysInMonth(c, 2026, 2), ['2026-02-28']));
  check('Apr clamps to 04-30', eq(computePaydaysInMonth(c, 2026, 4), ['2026-04-30']));
}

// 12. custom_months — occurs only in Mar & Nov, day 10
{
  const c = base({ frequency: 'custom_months', amount: 200, months: [3, 11], day_of_month: 10 });
  const counts = countsForYear(c, 2026);
  console.log('custom_months [3,11] day 10:');
  check('only Mar & Nov', eq(counts, [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0]), counts);
  check('Mar payday = 03-10', eq(computePaydaysInMonth(c, 2026, 3), ['2026-03-10']));
}

// 13. custom_months day 31 in Feb clamps (leap-year aware)
{
  const c = base({ frequency: 'custom_months', amount: 200, months: [2], day_of_month: 31 });
  console.log('custom_months [2] day 31 (leap clamp):');
  check('2026-02 (non-leap) = 02-28', eq(computePaydaysInMonth(c, 2026, 2), ['2026-02-28']));
  check('2028-02 (leap) = 02-29', eq(computePaydaysInMonth(c, 2028, 2), ['2028-02-29']));
}

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
