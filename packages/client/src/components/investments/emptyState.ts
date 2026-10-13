export interface HoldingsEmptyCopy {
  title: string;
  before: string;
  /** Bold pointer to a place the viewer can open; null when they have none. */
  link: string | null;
  after: string;
}

/**
 * Whether the viewer can link an account in Settings → Bank Sync: owners, admins and
 * anyone with "Manage bank connections". "Run bank sync" alone can't link one (Bank
 * Sync tells them an admin manages connections), so it gets no pointer.
 */
export function canLinkAccounts(user: { role: string; permissions: Record<string, boolean> } | null): boolean {
  if (!user) return false;
  return user.role === 'owner' || user.role === 'admin' || user.permissions['simplefin.manage'] === true;
}

/**
 * Which empty state Investments shows, or null when there are holdings.
 * `page` = nothing is held anywhere; `selection` = the ticked accounts hold nothing.
 */
export function holdingsEmpty(
  holdingGroups: number,
  selectedCount: number,
  canLink: boolean,
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
    copy: canLink
      ? { title: 'No holdings yet', before: 'Link an investment or retirement account in ', link: 'Settings → Bank Sync', after: '. Holdings sync automatically and appear here.' }
      : { title: 'No holdings yet', before: 'Holdings appear here once an owner or admin links an investment account.', link: null, after: '' },
  };
}
