export interface HoldingsEmptyCopy {
  title: string;
  before: string;
  /** Bold pointer to a place the viewer can open; null when they have none. */
  link: string | null;
  after: string;
}

/**
 * Which empty state Investments shows, or null when there are holdings.
 * `page` = nothing is held anywhere; `selection` = the ticked accounts hold nothing.
 */
export function holdingsEmpty(
  holdingGroups: number,
  selectedCount: number,
  canBankSync: boolean,
): { scope: 'page' | 'selection'; copy: HoldingsEmptyCopy } | null {
  if (holdingGroups > 0) return null;
  if (selectedCount > 0) {
    return {
      scope: 'selection',
      copy: { title: 'No holdings', before: 'No holdings for the selected accounts.', link: null, after: '' },
    };
  }
  return {
    scope: 'page',
    copy: canBankSync
      ? { title: 'No holdings yet', before: 'Link an investment or retirement account in ', link: 'Settings → Bank Sync', after: '. Holdings sync automatically and appear here.' }
      : { title: 'No holdings yet', before: 'Holdings appear here once an owner or admin links an investment account.', link: null, after: '' },
  };
}
