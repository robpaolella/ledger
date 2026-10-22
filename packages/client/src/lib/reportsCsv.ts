// CSV export for Reports. Amounts keep Ledger's sign (money out positive, money in negative);
// the Type column says what each row is, taken from the category type, never from the sign.

export interface CsvTxn {
  date: string;
  description: string | null;
  amount: number;
  merchant: { name: string } | null;
  account: { name: string; lastFour: string | null } | null;
  category: { displayName: string; type: string } | null;
}

/** A row of a contribution's drill-in list, shaped like a Reports transaction. The Account
 *  column (and the list's account line) reads "from → to". */
export interface ContributionDrillTxn extends CsvTxn {
  id: number;
  rowKey: string;
  route: string;
  category: { id: number; groupName: string; subName: string; displayName: string; type: 'transfer' };
}

interface ContributionRow {
  transactionId: number; splitId: number | null; date: string; merchant: string | null; description: string;
  accountName: string; destinationAccountName: string | null; amount: number; direction: 'putIn' | 'takenOut';
}

/** Money put in moves out of the paying account (positive); money taken out comes back in (negative),
 *  the same stored sign every transfer has. */
export function contributionDrillTxn(r: ContributionRow, c: { categoryId: number; groupName: string; name: string }): ContributionDrillTxn {
  // The row's account is the paying side for money put in; for money taken out the tracked
  // account (the "destination") is where it left from, so the direction flips.
  const tracked = r.destinationAccountName ?? 'An account not in Ledger';
  const route = r.direction === 'putIn' ? `${r.accountName} → ${tracked}` : `${tracked} → ${r.accountName}`;
  return {
    id: r.transactionId,
    rowKey: `${r.transactionId}-${r.splitId ?? ''}`,
    route,
    date: r.date,
    description: r.description,
    amount: r.direction === 'putIn' ? r.amount : -r.amount,
    merchant: r.merchant ? { name: r.merchant } : null,
    account: { name: route, lastFour: null },
    category: { id: c.categoryId, groupName: c.groupName, subName: c.name, displayName: c.name, type: 'transfer' },
  };
}

export const CSV_HEADER = ['Date', 'Merchant', 'Category', 'Account', 'Amount', 'Type'];

/** Income, Expense, Transfer, or Refund (money back into an expense category). Empty with no category. */
export function csvType(t: { amount: number; category: { type: string } | null }): string {
  const type = t.category?.type;
  if (type === 'income') return 'Income';
  if (type === 'transfer') return 'Transfer';
  if (type === 'expense') return t.amount < 0 ? 'Refund' : 'Expense';
  return '';
}

const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;

export function buildReportsCsv(txns: CsvTxn[]): string {
  const lines = [CSV_HEADER.join(',')];
  for (const t of txns) {
    const account = t.account ? `${t.account.name}${t.account.lastFour ? ` (…${t.account.lastFour})` : ''}` : '';
    lines.push([t.date, esc(t.merchant?.name || t.description || ''), esc(t.category?.displayName || ''), esc(account), t.amount.toFixed(2), csvType(t)].join(','));
  }
  return lines.join('\n');
}
