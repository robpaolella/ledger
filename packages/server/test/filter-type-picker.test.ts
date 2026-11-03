import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTER, FILTER_SECTIONS, filterDraftCount, filterSectionCount, isSearchableSection, visibleFilterSections,
  type FilterDraft,
} from '../../client/src/components/filterModel';

describe('filter types a page lists', () => {
  it('lists all five on Transactions, which opts in to Other', () => {
    expect(visibleFilterSections(undefined, true)).toEqual(['Categories', 'Merchants', 'Accounts', 'Amount', 'Other']);
  });

  it('lists four on Reports, which has no Other', () => {
    expect(visibleFilterSections(undefined, false)).toEqual(['Categories', 'Merchants', 'Accounts', 'Amount']);
  });

  it('lists exactly the sections a page passes (Account detail drops Accounts, Accounts page has one)', () => {
    expect(visibleFilterSections(['Categories', 'Merchants', 'Amount', 'Other'], true)).toEqual(['Categories', 'Merchants', 'Amount', 'Other']);
    expect(visibleFilterSections(['Accounts'], false)).toEqual(['Accounts']);
  });
});

describe('filters counted per type', () => {
  const draft: FilterDraft = {
    ...EMPTY_FILTER, category: ['sub:1', 'sub:2', 'group:3'], merchant: ['4'], account: ['5', '6', '7'], op: 'gt', val: '10', type: 'Expense', needsReview: true,
  };

  it('counts each type the way the list under it selects', () => {
    expect(filterSectionCount('Categories', draft)).toBe(2); // only sub: tokens count
    expect(filterSectionCount('Merchants', draft)).toBe(1);
    expect(filterSectionCount('Accounts', draft)).toBe(3);
    expect(filterSectionCount('Amount', draft)).toBe(2); // amount rule + debits/credits
    expect(filterSectionCount('Other', draft)).toBe(1);
  });

  it('adds up to the "N filters selected" total', () => {
    expect(FILTER_SECTIONS.reduce((n, s) => n + filterSectionCount(s, draft), 0)).toBe(filterDraftCount(draft));
  });

  it('is zero everywhere on an empty draft', () => {
    expect(FILTER_SECTIONS.map((s) => filterSectionCount(s, EMPTY_FILTER))).toEqual([0, 0, 0, 0, 0]);
  });

  it('counts a Credits-only type on its own as one Amount filter', () => {
    expect(filterSectionCount('Amount', { ...EMPTY_FILTER, type: 'Income' })).toBe(1);
  });
});

describe('which types have a search box', () => {
  it('searches the three lists, not Amount or Other', () => {
    expect(FILTER_SECTIONS.filter(isSearchableSection)).toEqual(['Categories', 'Merchants', 'Accounts']);
  });
});
