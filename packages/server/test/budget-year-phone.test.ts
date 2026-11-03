import { describe, expect, it } from 'vitest';
import { isUnbudgetedYear, sectionYearLine, yearLine, yearSum } from '../../client/src/lib/budgetYear';

const plan = (m: number, v: number) => Array.from({ length: 12 }, (_, i) => (i === m ? v : 0));

describe('phone Budget Year helpers', () => {
  it('adds a year of plans, ignoring missing values', () => {
    expect(yearSum([100, 0, 50.5, ...new Array(9).fill(0)])).toBe(150.5);
    expect(yearSum([])).toBe(0);
  });

  it('hides only rows with nothing planned in the whole year', () => {
    expect(isUnbudgetedYear(new Array(12).fill(0))).toBe(true);
    expect(isUnbudgetedYear(plan(3, 640))).toBe(false); // planned in April only: stays visible
    expect(isUnbudgetedYear(plan(11, 1))).toBe(false);
  });

  it('keeps the unbudgeted count the same whichever month is chosen', () => {
    const rows = [plan(3, 640), new Array(12).fill(0), plan(9, 20), new Array(12).fill(0)];
    const count = () => rows.filter(isUnbudgetedYear).length;
    const counts = Array.from({ length: 12 }, () => count());
    expect(new Set(counts)).toEqual(new Set([2]));
  });

  it('words the year line under a name', () => {
    expect(yearLine([14851, ...new Array(11).fill(0)], 2026)).toBe('$14,851 in 2026');
    expect(yearLine(new Array(12).fill(0), 2026)).toBe('Nothing in 2026');
  });

  it('words the year line under a section heading', () => {
    expect(sectionYearLine([97968, ...new Array(11).fill(0)], 2026)).toBe('$97,968 planned in 2026');
    expect(sectionYearLine(new Array(12).fill(0), 2027)).toBe('Nothing planned in 2027');
  });
});
