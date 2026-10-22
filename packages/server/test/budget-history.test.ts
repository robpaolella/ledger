import { describe, expect, it } from 'vitest';
import { buildHistory, monthBefore } from '@ledger/shared';

const series = (...v: number[]) => v.map((actual, i) => ({ month: `2026-0${i + 1}`, actual }));

describe('budget editor history', () => {
  it('takes the last six months, scales bars to the largest, averages active months', () => {
    const h = buildHistory([{ month: '2025-12', actual: 999 }, ...series(100, 0, 300, 200, 0, 400)]);
    expect(h.months.map((m) => m.label)).toEqual(['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN']);
    expect(h.months.map((m) => m.height)).toEqual([0.25, 0, 0.75, 0.5, 0, 1]);
    expect(h.lastMonth).toBe(400);
    expect(h.average).toBe(250);
    expect(h.empty).toBe(false);
  });

  it('rounds the average to whole dollars', () => {
    expect(buildHistory(series(0, 0, 0, 10, 10, 11)).average).toBe(10);
  });

  it('draws no bar for a negative month but still counts it', () => {
    const h = buildHistory(series(0, 0, 0, 0, -50, 150));
    expect(h.months[4]).toMatchObject({ value: -50, height: 0 });
    expect(h.average).toBe(50);
    expect(h.empty).toBe(false);
  });

  it('is empty, with a $0 average, when all six months are zero or missing', () => {
    expect(buildHistory(series(0, 0, 0, 0, 0, 0))).toMatchObject({ average: 0, lastMonth: 0, empty: true });
    expect(buildHistory([])).toMatchObject({ average: 0, empty: true, months: [] });
  });

  it('finds the month before, across a year boundary', () => {
    expect(monthBefore('2026-03')).toBe('2026-02');
    expect(monthBefore('2026-01')).toBe('2025-12');
  });
});
