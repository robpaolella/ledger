// Paging for the Reports transactions card: 50 at a time, ordered by the server.

export const TXN_PAGE = 50;

export type ReportsSort = 'date_desc' | 'date_asc' | 'amt_desc' | 'amt_asc';

/** Server ordering for each Reports sort. The list is grouped by day, so amount sorts
 *  keep newest day first and order each day by absolute amount (as the list always has). */
export function sortQuery(sort: ReportsSort): Record<string, string> {
  if (sort === 'date_asc') return { sortBy: 'date', sortOrder: 'asc' };
  if (sort === 'amt_desc') return { sortBy: 'date', sortOrder: 'desc', thenBy: 'absAmount', thenOrder: 'desc' };
  if (sort === 'amt_asc') return { sortBy: 'date', sortOrder: 'desc', thenBy: 'absAmount', thenOrder: 'asc' };
  return { sortBy: 'date', sortOrder: 'desc' };
}

/** Query params for one page: the first page starts at 0, each "Show 50 more" at what is loaded. */
export function pageQuery(sort: ReportsSort, loaded: number, size = TXN_PAGE): Record<string, string> {
  return { ...sortQuery(sort), limit: String(size), offset: String(loaded) };
}

/** Largest page the server returns. */
export const EXPORT_PAGE = 1000;

/** Every row of the range, in list order: pages through the server until `total` rows are in.
 *  Stops early on an empty page so a shrinking range cannot loop forever. */
export async function fetchAllPages<T>(fetchPage: (offset: number, size: number) => Promise<{ rows: T[]; total: number }>, size = EXPORT_PAGE): Promise<T[]> {
  const all: T[] = [];
  for (;;) {
    const { rows, total } = await fetchPage(all.length, size);
    all.push(...rows);
    if (rows.length === 0 || all.length >= total) return all;
  }
}

export const hasMoreTxns = (loaded: number, total: number) => loaded < total;

/** "50 of 412 transactions" while more remain; otherwise null (caller shows its usual hint). */
export function pagingHint(loaded: number, total: number): string | null {
  return hasMoreTxns(loaded, total) ? `${loaded.toLocaleString()} of ${total.toLocaleString()} transactions` : null;
}

/** What the Transactions card shows: its rows, the empty note (naming what is drilled into), or the load error. */
export function txnListState(failed: boolean, rowCount: number, drilled: 'contribution' | 'category' | null):
  { kind: 'error' } | { kind: 'rows' } | { kind: 'empty'; text: string } {
  if (failed) return { kind: 'error' };
  if (rowCount > 0) return { kind: 'rows' };
  return { kind: 'empty', text: `No transactions in this ${drilled ?? 'period'}.` };
}
