import { describe, expect, it } from 'vitest';
import { buildReportsCsv, csvType, contributionDrillTxn, type CsvTxn } from '../../client/src/lib/reportsCsv';

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

describe('contribution drill-in rows in the CSV', () => {
  const c = { categoryId: 7, groupName: 'Savings', name: '529 College Fund' };
  const row = (over: object) => ({
    transactionId: 1, splitId: null, date: '2026-10-05', merchant: 'Mossquill College Savings', description: 'Deposit',
    accountName: 'Joint Checking', destinationAccountName: 'Emma’s 529 Plan', amount: 500, direction: 'putIn' as const, ...over,
  });

  it('writes from → to in the Account column (flipped for money taken out), Transfer as the Type, and the stored sign', () => {
    const lines = buildReportsCsv([
      contributionDrillTxn(row({}), c),
      contributionDrillTxn(row({ transactionId: 2, date: '2026-08-14', accountName: 'Joint Checking', destinationAccountName: 'Emma’s 529 Plan', direction: 'takenOut' }), c),
    ]).split('\n');
    expect(lines[0]).toBe('Date,Merchant,Category,Account,Amount,Type');
    expect(lines[1]).toBe('2026-10-05,"Mossquill College Savings","529 College Fund","Joint Checking → Emma’s 529 Plan",500.00,Transfer');
    expect(lines[2]).toBe('2026-08-14,"Mossquill College Savings","529 College Fund","Emma’s 529 Plan → Joint Checking",-500.00,Transfer');
  });

  it('names an account that is not in Ledger, and keeps split rows of one transaction apart', () => {
    const a = contributionDrillTxn(row({ splitId: 10, destinationAccountName: null }), c);
    const b = contributionDrillTxn(row({ splitId: 11 }), c);
    expect(a.route).toBe('Joint Checking → An account not in Ledger');
    expect(contributionDrillTxn(row({ destinationAccountName: null, direction: 'takenOut' }), c).route).toBe('An account not in Ledger → Joint Checking');
    expect(a.rowKey).not.toBe(b.rowKey);
  });

  it('falls back to the description without a merchant', () => {
    expect(buildReportsCsv([contributionDrillTxn(row({ merchant: null }), c)])).toContain('"Deposit"');
  });
});
