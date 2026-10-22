import { describe, expect, it } from 'vitest';
import { EMPTY_FILTER, filtersFromParams, filtersToParams, hasUrlFilters, type FilterDraft } from '../../client/src/components/filterModel';

const ALL = { preset: 'all', start: '', end: '' };
const roundTrip = (search: string, date: typeof ALL, f: FilterDraft) =>
  filtersFromParams(new URLSearchParams(filtersToParams(search, date, f).toString()));

describe('filter URL helpers', () => {
  it('writes nothing for empty state', () => {
    expect(filtersToParams('', ALL, EMPTY_FILTER).toString()).toBe('');
    expect(hasUrlFilters(filtersFromParams(new URLSearchParams()))).toBe(false);
  });

  it('round-trips every filter kind', () => {
    const f: FilterDraft = { ...EMPTY_FILTER, category: ['sub:3', 'sub:9'], merchant: ['4'], type: 'Expense', op: 'bt', min: '10', max: '20.5', needsReview: true };
    expect(roundTrip('', ALL, f).filter).toEqual(f);
    expect(roundTrip('', ALL, { ...EMPTY_FILTER, type: 'Income', op: 'gt', val: '5' }).filter).toMatchObject({ type: 'Income', op: 'gt', val: '5' });
  });

  it('round-trips a preset and a custom range', () => {
    expect(roundTrip('', { preset: 'last-month', start: '', end: '' }, EMPTY_FILTER).date).toEqual({ preset: 'last-month', start: '', end: '' });
    const custom = { preset: 'custom', start: '2026-01-05', end: '2026-02-10' };
    expect(roundTrip('', custom, EMPTY_FILTER).date).toEqual(custom);
    expect(roundTrip('', { preset: 'custom', start: '2026-01-05', end: '' }, EMPTY_FILTER).date).toEqual({ preset: 'custom', start: '2026-01-05', end: '' });
  });

  it('round-trips search with spaces, quotes and symbols', () => {
    const q = `joe's "coffee" & more+stuff`;
    expect(roundTrip(q, ALL, EMPTY_FILTER).search).toBe(q);
  });

  it('ignores bad values and keeps the valid ones', () => {
    const u = filtersFromParams(new URLSearchParams('categoryIds=abc,7,-1&merchantIds=x&type=bogus&amountOp=gt&amountValue=lots&datePreset=nope&startDate=2026-13-45'));
    expect(u.filter.category).toEqual(['sub:7']);
    expect(u.filter.merchant).toEqual([]);
    expect(u.filter.type).toBe('All');
    expect(u.filter.op).toBe('');
    expect(u.date).toBeNull();
    expect(filtersFromParams(new URLSearchParams('amountOp=zz&amountValue=5')).filter.op).toBe('');
    expect(filtersFromParams(new URLSearchParams('amountOp=bt&amountMin=x&amountMax=9')).filter).toMatchObject({ op: 'bt', min: '', max: '9' });
  });

  it('reads an Import-style date range', () => {
    expect(filtersFromParams(new URLSearchParams('startDate=2026-03-01&endDate=2026-03-31')).date).toEqual({ preset: 'custom', start: '2026-03-01', end: '2026-03-31' });
  });
});
