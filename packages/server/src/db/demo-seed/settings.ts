/** Deterministic, offline sample states for the Settings screens: bank connections, daily sync, rules. */
import type { Helpers } from './helpers.js';
import type { PeopleAccounts } from './people-accounts.js';
import { FAILURE_SENTENCES } from '../../services/simplefinSync.js';

const DAILY_RUN_HOUR = 5;
const DAILY_RUN_MINUTE = 31;
const EXTRA_RULES = 15;
const MUTED_MERCHANTS = 3;

/** The most recent 5:31 am local time that is not in the future. */
function lastDailyRun(now: Date): Date {
  const run = new Date(now);
  run.setHours(DAILY_RUN_HOUR, DAILY_RUN_MINUTE, 0, 0);
  if (run > now) run.setDate(run.getDate() - 1);
  return run;
}

const localDay = (d: Date) => d.toLocaleDateString('en-CA');

/**
 * Runs after the reviews/rules and investments data exist. Every access URL is
 * `demo://`, which cannot make a network request, and the seed stores no token.
 */
export function seedSettings({ db, rel, now }: Helpers, { johnId, janeId }: PeopleAccounts) {
  const run = lastDailyRun(now);
  const at = run.toISOString();

  db.transaction(() => {
    // The six investment feeds from seedInvestments synced fine on the last run.
    db.prepare("UPDATE simplefin_connections SET sync_status = 'working', sync_attempt_at = ?").run(at);
    db.prepare("UPDATE simplefin_links SET last_sync_status = 'ok', last_sync_attempt_at = ?").run(at);

    const insertConnection = db.prepare(`INSERT INTO simplefin_connections
      (user_id, access_url, label, sync_status, sync_error_kind, sync_message, sync_attempt_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const insertLink = db.prepare(`INSERT INTO simplefin_links
      (simplefin_connection_id, simplefin_account_id, account_id, simplefin_account_name, simplefin_org_name,
       last_synced_at, last_sync_status, last_sync_error, last_sync_attempt_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const spendingAccounts = db.prepare(
      "SELECT id, name FROM accounts WHERE type IN ('checking', 'savings', 'credit') ORDER BY id",
    ).all() as Array<{ id: number; name: string }>;
    const previousDay = localDay(new Date(run.getTime() - 86_400_000));

    const connections = [
      { label: 'Sample checking feed', userId: null, status: 'failed', kind: 'other' },
      { label: 'Sample card feed', userId: johnId, status: 'failed', kind: 'rate_limit' },
      { label: 'Sample savings feed', userId: janeId, status: 'reconnect_needed', kind: 'auth' },
    ] as const;
    for (const [index, connection] of connections.entries()) {
      const account = spendingAccounts[index * 3];
      if (!account) throw new Error('Synthetic accounts are incomplete for bank connection fixtures');
      const message = FAILURE_SENTENCES[connection.kind];
      const id = Number(insertConnection.run(connection.userId, `demo://settings-${index + 1}`, connection.label, connection.status, connection.kind, message, at).lastInsertRowid);
      // A failed connection keeps the data from its last good pull.
      insertLink.run(id, `demo-settings-${index + 1}`, account.id, account.name, 'Sample Bank', previousDay, 'error', message, at);
    }
    // Connected, but with nothing linked yet.
    insertConnection.run(null, 'demo://settings-4', 'Sample new feed', 'working', null, null, at);

    const connectionCount = (db.prepare('SELECT COUNT(*) AS n FROM simplefin_connections').get() as { n: number }).n;
    // Daily sync stays on (no enabled key). last_success stays today, set by seedInvestments, so the scheduler is idle.
    db.prepare("INSERT OR REPLACE INTO app_config (key, value) VALUES ('daily_sync.last_run', ?)").run(JSON.stringify({
      day: localDay(run), at, transactionsImported: 7, connections: connectionCount, connectionsWithProblems: connections.length,
    }));

    // More rules, taken from the busiest merchants that have none: merchant rules
    // first, then "contains" and pattern rules, which get higher priority so they
    // are checked before the plain merchant matches.
    const candidates = db.prepare(`
      SELECT t.merchant_id, m.name, t.category_id, COUNT(*) AS count
      FROM transactions t JOIN merchants m ON m.id = t.merchant_id
      WHERE t.category_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM category_rules r WHERE r.match_type = 'merchant' AND r.pattern = CAST(t.merchant_id AS TEXT))
      GROUP BY t.merchant_id, t.category_id
      ORDER BY count DESC, t.merchant_id ASC, t.category_id ASC
    `).all() as Array<{ merchant_id: number; name: string; category_id: number }>;
    const picked = candidates.filter((row, index, rows) =>
      rows.findIndex(candidate => candidate.merchant_id === row.merchant_id) === index);
    if (picked.length < EXTRA_RULES + MUTED_MERCHANTS) throw new Error('Synthetic transactions have too few categorized merchants for extra rules');

    const firstWord = (name: string) => name.match(/[A-Za-z0-9]{4,}/)?.[0] ?? name;
    const insertRule = db.prepare('INSERT INTO category_rules (match_type, pattern, category_id, priority, created_at) VALUES (?, ?, ?, ?, ?)');
    const types = ['merchant', 'contains', 'merchant', 'regex', 'merchant', 'contains', 'merchant', 'merchant', 'regex', 'merchant', 'contains', 'merchant', 'merchant', 'regex', 'merchant'] as const;
    for (const [index, row] of picked.slice(0, EXTRA_RULES).entries()) {
      const type = types[index];
      const pattern = type === 'merchant' ? String(row.merchant_id)
        : type === 'contains' ? firstWord(row.name).toLowerCase()
        : `^${firstWord(row.name)}\\b`;
      insertRule.run(type, pattern, row.category_id, type === 'regex' ? 20 : type === 'contains' ? 10 : 0, rel(`2026-0${1 + index % 3}-${String(10 + index).padStart(2, '0')}`));
    }
    const mute = db.prepare('UPDATE merchants SET suppress_rule_suggest = 1 WHERE id = ?');
    for (const row of picked.slice(EXTRA_RULES, EXTRA_RULES + MUTED_MERCHANTS)) mute.run(row.merchant_id);
  })();

  console.log(`  Created 4 sample bank connections, a daily-sync last run, ${EXTRA_RULES} more rules, and ${MUTED_MERCHANTS} muted merchants`);
}
