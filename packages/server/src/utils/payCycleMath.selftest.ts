/**
 * Self-test for payCycleMath. There is no test runner in this repo, so this is a
 * standalone assertion script. Run with:
 *
 *   npx tsx packages/server/src/utils/payCycleMath.selftest.ts
 *
 * Exits non-zero on the first failed assertion.
 */
import { computePaydaysInMonth, yearlyBaseline, projectPayCycles, type PayCycleForMath } from './payCycleMath.js';

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
  check('yearlyBaseline = 2', yearlyBaseline(c, 2026) === 2);
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

// 8. projectPayCycles: two earners sum into one category total; extra-check flag
{
  const cycles: PayCycleForMath[] = [
    base({ id: 1, label: 'A', user_id: 1, ownerName: 'Robert', frequency: 'biweekly', amount: 1750, anchor_date: '2026-01-02' }),
    base({ id: 2, label: 'B', user_id: 2, ownerName: 'Sarah', frequency: 'biweekly', amount: 1600, anchor_date: '2026-01-09' }),
  ];
  const july = projectPayCycles(cycles, '2026-07');
  const thp = july.categoryTotals.find((t) => t.categoryId === 100)!;
  console.log('projectPayCycles July 2026 (two earners, Take Home Pay):');
  // Robert: 3 x 1750 = 5250 ; Sarah: 2 x 1600 = 3200 ; sum 8450
  check('summed projectedAmount = 8450', thp.projectedAmount === 8450, thp.projectedAmount);
  check('cycleIds = [1,2]', eq(thp.cycleIds.sort(), [1, 2]));
  check('hasExtraPaycheck = true (Robert has 3 in Jul)', thp.hasExtraPaycheck === true);

  const august = projectPayCycles(cycles, '2026-08');
  const thpAug = august.categoryTotals.find((t) => t.categoryId === 100)!;
  check('August hasExtraPaycheck = false', thpAug.hasExtraPaycheck === false);
}

// 9. A partial boundary month (mid-year effective_start) must NOT deflate the
//    baseline and wrongly flag ordinary months as extra (review regression).
{
  const c = base({ frequency: 'biweekly', amount: 1750, anchor_date: '2026-01-02', effective_start: '2026-01-17' });
  console.log('Mid-year start (effective_start 2026-01-17):');
  check('yearlyBaseline = 2 (not deflated to 1)', yearlyBaseline(c, 2026) === 2);
  check('Jan (partial, 1 check) NOT flagged extra', projectPayCycles([c], '2026-01').categoryTotals[0].hasExtraPaycheck === false);
  check('Feb (normal, 2 checks) NOT flagged extra', projectPayCycles([c], '2026-02').categoryTotals[0].hasExtraPaycheck === false);
  check('Jul (3 checks) IS flagged extra', projectPayCycles([c], '2026-07').categoryTotals[0].hasExtraPaycheck === true);
}

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
