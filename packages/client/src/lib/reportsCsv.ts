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
