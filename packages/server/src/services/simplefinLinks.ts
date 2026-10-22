import type Database from 'better-sqlite3';

/**
 * Removing a SimpleFIN link must take its dependents with it: current holdings
 * and the holdings history both reference the link id with no cascade, so a
 * bare DELETE on a link that ever synced an investment account fails the FK
 * check. Every caller (link delete, connection delete, account removal, user
 * deletion, orphan cleanup) goes through here, inside one transaction.
 */
export function deleteLinksCascade(sqlite: Database.Database, linkIds: number[]): void {
  if (linkIds.length === 0) return;
  const run = sqlite.transaction((ids: number[]) => {
    const delHistory = sqlite.prepare('DELETE FROM holdings_history WHERE simplefin_link_id = ?');
    const delHoldings = sqlite.prepare('DELETE FROM simplefin_holdings WHERE simplefin_link_id = ?');
    const delLink = sqlite.prepare('DELETE FROM simplefin_links WHERE id = ?');
    for (const id of ids) {
      try { delHistory.run(id); } catch { /* table absent on a very old DB */ }
      delHoldings.run(id);
      delLink.run(id);
    }
  });
  run(linkIds);
}

/** Every link id under a connection. */
export function linkIdsForConnection(sqlite: Database.Database, connectionId: number): number[] {
  return (sqlite.prepare('SELECT id FROM simplefin_links WHERE simplefin_connection_id = ?').all(connectionId) as { id: number }[]).map((r) => r.id);
}

/** Every link id pointing at a Ledger account. */
export function linkIdsForAccount(sqlite: Database.Database, accountId: number): number[] {
  return (sqlite.prepare('SELECT id FROM simplefin_links WHERE account_id = ?').all(accountId) as { id: number }[]).map((r) => r.id);
}
