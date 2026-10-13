import { describe, expect, it } from 'vitest';
import { buildReportsCsv, csvType, type CsvTxn } from '../../client/src/lib/reportsCsv';

const acct = { name: "John's Savings", lastFour: '2046' };
const txn = (over: Partial<CsvTxn>): CsvTxn => ({
  date: '2026-10-10', description: null, amount: 1, merchant: { name: 'Shop' }, account: acct,
  category: { displayName: 'Daily Living: Groceries', type: 'expense' }, ...over,
});

describe('reports CSV export', () => {
  it('adds Type as the last header column', () => {
    expect(buildReportsCsv([]).split('\n')[0]).toBe('Date,Merchant,Category,Account,Amount,Type');
  });

  it('writes income, expense, refund and transfer rows with the sign unchanged', () => {
    const lines = buildReportsCsv([
      txn({ merchant: { name: 'Larkspindle Finance' }, amount: -3, category: { displayName: 'Income: Interest Income', type: 'income' } }),
      txn({ merchant: { name: 'Publix' }, amount: 69.19 }),
      txn({ merchant: { name: 'Amazon Refund' }, amount: -24.5 }),
      txn({ merchant: { name: 'Card payment' }, amount: 100, category: { displayName: 'Transfers: Card Payment', type: 'transfer' } }),
    ]).split('\n');
    expect(lines[1]).toBe('2026-10-10,"Larkspindle Finance","Income: Interest Income","John\'s Savings (…2046)",-3.00,Income');
    expect(lines[2]).toMatch(/,69\.19,Expense$/);
    expect(lines[3]).toMatch(/,-24\.50,Refund$/);
    expect(lines[4]).toMatch(/,100\.00,Transfer$/);
  });

  it('leaves Type empty without a category, and reads income by category not sign', () => {
    expect(buildReportsCsv([txn({ category: null })]).split('\n')[1]).toMatch(/,"",.*,1\.00,$/);
    expect(csvType({ amount: 5, category: { type: 'income' } })).toBe('Income');
  });

  it('quotes commas and quotes in merchant names, and falls back to the description', () => {
    const lines = buildReportsCsv([
      txn({ merchant: { name: 'Smith, "Jo" & Sons' } }),
      txn({ merchant: null, description: 'Plain, note' }),
    ]).split('\n');
    expect(lines[1]).toContain('"Smith, ""Jo"" & Sons"');
    expect(lines[2]).toContain('"Plain, note"');
  });
});
