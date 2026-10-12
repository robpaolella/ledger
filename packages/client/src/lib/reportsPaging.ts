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
export function pageQuery(sort: ReportsSort, loaded: number): Record<string, string> {
  return { ...sortQuery(sort), limit: String(TXN_PAGE), offset: String(loaded) };
}

export const hasMoreTxns = (loaded: number, total: number) => loaded < total;

/** "50 of 412 transactions" while more remain; otherwise null (caller shows its usual hint). */
export function pagingHint(loaded: number, total: number): string | null {
  return hasMoreTxns(loaded, total) ? `${loaded.toLocaleString()} of ${total.toLocaleString()} transactions` : null;
}
