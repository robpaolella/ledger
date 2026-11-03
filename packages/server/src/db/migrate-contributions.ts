import Database from 'better-sqlite3';

/**
 * Migration: contribution setups — which Transfers categories are tracked as
 * contributions, and the accounts each one pays into.
 *
 * One setup per category (UNIQUE category_id). Its destinations are Ledger
 * accounts (contribution_setup_accounts) and/or "An account not in Ledger",
 * stored explicitly as includes_external rather than inferred from an empty
 * account list. Accounts are only ever deactivated, so the account FK never
 * blocks anything; a deactivated destination simply stays listed.
 *
 * New tables only: no existing row changes and every category starts untracked.
 * Idempotent.
 */
export function migrateContributions(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS contribution_setups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL UNIQUE REFERENCES categories(id),
      includes_external INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS contribution_setup_accounts (
      setup_id INTEGER NOT NULL REFERENCES contribution_setups(id) ON DELETE CASCADE,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      PRIMARY KEY (setup_id, account_id)
    );
    CREATE INDEX IF NOT EXISTS idx_contribution_setup_accounts_account
      ON contribution_setup_accounts(account_id);
  `);
}
