import { describe, expect, it } from 'vitest';
import { csvImportCounts, needCategoryText } from '../../client/src/lib/csvImportable';

const row = (over: Partial<{ categoryId: number | null; amount: number | null; duplicateStatus: string }> = {}) =>
  ({ categoryId: 1, amount: 5, duplicateStatus: 'none', ...over });

describe('csvImportCounts', () => {
  it('counts ticked, categorized, readable rows as importable', () => {
    expect(csvImportCounts([row(), row()], new Set([0, 1]))).toEqual({ importable: 2, duplicates: 0, needCategory: 0, unreadable: 0 });
  });

  it('keeps ticked uncategorized rows out of importable and reports them', () => {
    const c = csvImportCounts([row(), row({ categoryId: null }), row({ categoryId: null })], new Set([0, 1, 2]));
    expect(c.importable).toBe(1);
    expect(c.needCategory).toBe(2);
  });

  it('does not report unticked uncategorized rows', () => {
    expect(csvImportCounts([row({ categoryId: null })], new Set()).needCategory).toBe(0);
  });

  it('counts duplicates only among importable rows', () => {
    const c = csvImportCounts([row({ duplicateStatus: 'possible' }), row({ categoryId: null, duplicateStatus: 'exact' })], new Set([0, 1]));
    expect(c).toEqual({ importable: 1, duplicates: 1, needCategory: 1, unreadable: 0 });
  });

  it('counts unreadable amounts separately and never as importable or needing a category', () => {
    const c = csvImportCounts([row({ amount: null, categoryId: null }), row()], new Set([0, 1]));
    expect(c).toEqual({ importable: 1, duplicates: 0, needCategory: 0, unreadable: 1 });
  });

  it('selected = importable + needCategory for readable ticked rows', () => {
    const rows = [row(), row({ categoryId: null }), row({ amount: null })];
    const c = csvImportCounts(rows, new Set([0, 1]));
    expect(c.importable + c.needCategory).toBe(2);
  });
});

describe('needCategoryText', () => {
  it('pluralizes', () => {
    expect(needCategoryText(1)).toBe('1 selected row skipped: choose a category to import.');
    expect(needCategoryText(2)).toBe('2 selected rows skipped: choose a category to import.');
  });
});
