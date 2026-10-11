// Canonical filter model shared across the app (Transactions is the reference UI).
export interface FilterDraft {
  account: string[];    // account id strings; empty = every account
  type: string;         // 'All' | 'Expense' | 'Income'  (rendered as Debits/Credits)
  category: string[];   // tokens: 'sub:<id>' (group toggles add all its subs)
  merchant: string[];   // merchant id strings
  op: string;           // '' | 'gt' | 'lt' | 'eq' | 'bt'
  val: string; min: string; max: string;
  needsReview?: boolean; // only surfaced where the host opts in (Transactions)
}

export const EMPTY_FILTER: FilterDraft = { account: [], type: 'All', category: [], merchant: [], op: '', val: '', min: '', max: '', needsReview: false };

export const filterDraftCount = (d: FilterDraft) =>
  d.category.filter((c) => c.startsWith('sub:')).length + d.merchant.length + d.account.length + (d.op ? 1 : 0) + (d.type !== 'All' ? 1 : 0) + (d.needsReview ? 1 : 0);

export const FILTER_SECTIONS = ['Categories', 'Merchants', 'Accounts', 'Amount', 'Other'] as const;
export type FilterSection = (typeof FILTER_SECTIONS)[number];

// Same shape as DateRangePopover's DateRangeValue (not imported: this file stays free of JSX for the unit tests).
export interface DateRangeValue { preset: string; start: string; end: string }

// --- URL round trip: Account detail's "View all in Transactions" -> Transactions ---
// Both pages use these helpers so they agree on parameter names and formats.

export const URL_DATE_PRESETS = ['this-month', 'last-month', 'this-quarter', 'last-quarter', 'this-year', 'last-year', 'ytd'];
const AMOUNT_OPS = ['gt', 'lt', 'eq', 'bt'];
const isId = (v: string) => /^\d+$/.test(v);
const isAmount = (v: string) => v.trim() !== '' && Number.isFinite(Number(v));
const isRealDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

/** The state Transactions should start from, read off a URL. Only valid parts are filled in. */
export interface UrlFilters {
  search: string;
  date: DateRangeValue | null;
  filter: FilterDraft; // `account` is left empty: accountId is read by the page
}

/** Search, date range and filters (not the account) as URL parameters. Empty parts are left out. */
export function filtersToParams(search: string, date: DateRangeValue, f: FilterDraft): URLSearchParams {
  const p = new URLSearchParams();
  if (search.trim()) p.set('q', search.trim());
  if (date.preset === 'custom') {
    if (date.start) p.set('startDate', date.start);
    if (date.end) p.set('endDate', date.end);
  } else if (date.preset !== 'all') p.set('datePreset', date.preset);
  const cats = f.category.filter((c) => c.startsWith('sub:')).map((c) => c.slice(4));
  if (cats.length) p.set('categoryIds', cats.join(','));
  if (f.merchant.length) p.set('merchantIds', f.merchant.join(','));
  if (f.type !== 'All') p.set('type', f.type.toLowerCase());
  if (f.op) {
    p.set('amountOp', f.op);
    if (f.op === 'bt') { if (f.min) p.set('amountMin', f.min); if (f.max) p.set('amountMax', f.max); }
    else if (f.val) p.set('amountValue', f.val);
  }
  if (f.needsReview) p.set('needsReviewOnly', '1');
  return p;
}

/** The reverse of `filtersToParams`; bad or unknown values are dropped, valid ones kept. */
export function filtersFromParams(p: URLSearchParams): UrlFilters {
  const filter: FilterDraft = { ...EMPTY_FILTER, account: [], category: [], merchant: [] };
  const list = (k: string) => [...new Set((p.get(k) ?? '').split(',').map((v) => v.trim()).filter(isId))];
  filter.category = list('categoryIds').map((id) => `sub:${id}`);
  filter.merchant = list('merchantIds');
  const type = (p.get('type') ?? '').toLowerCase();
  if (type === 'expense') filter.type = 'Expense';
  else if (type === 'income') filter.type = 'Income';
  const op = p.get('amountOp') ?? '';
  if (AMOUNT_OPS.includes(op)) {
    const val = p.get('amountValue') ?? '', min = p.get('amountMin') ?? '', max = p.get('amountMax') ?? '';
    if (op === 'bt' && (isAmount(min) || isAmount(max))) {
      filter.op = op; filter.min = isAmount(min) ? min : ''; filter.max = isAmount(max) ? max : '';
    } else if (op !== 'bt' && isAmount(val)) { filter.op = op; filter.val = val; }
  }
  filter.needsReview = p.get('needsReviewOnly') === '1';

  let date: DateRangeValue | null = null;
  const preset = p.get('datePreset') ?? '';
  const sd = p.get('startDate') ?? '', ed = p.get('endDate') ?? '';
  const start = isRealDate(sd) ? sd : '', end = isRealDate(ed) ? ed : '';
  if (start || end) date = { preset: 'custom', start, end };
  else if (URL_DATE_PRESETS.includes(preset)) date = { preset, start: '', end: '' };
  return { search: (p.get('q') ?? '').trim(), date, filter };
}

/** Whether the URL carries any search, date or filter part, so the page knows to apply it. */
export const hasUrlFilters = (u: UrlFilters) =>
  u.search !== '' || u.date !== null || filterDraftCount(u.filter) > 0;
