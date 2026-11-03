import Database from 'better-sqlite3';

/**
 * Migration: merchants.suppress_rule_suggest — the user answered "never ask
 * again" to the always-categorize prompt for this merchant.
 *
 * Distinct from having a rule: a merchant can be suppressed with no rule (never
 * offer one), or carry a rule with suggestions still on (offer to change it when
 * the category is edited). Reversible from the merchant's edit modal, so the
 * choice is never a dead end. Idempotent.
 */
export function migrateMerchantRulePrefs(sqlite: Database.Database): void {
  const exists = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='merchants'"
  ).get() as { cnt: number };
  if (exists.cnt === 0) return;

  const cols = new Set(
    (sqlite.prepare("PRAGMA table_info('merchants')").all() as { name: string }[]).map((c) => c.name),
  );
  if (!cols.has('suppress_rule_suggest')) {
    sqlite.exec('ALTER TABLE merchants ADD COLUMN suppress_rule_suggest INTEGER NOT NULL DEFAULT 0');
  }
}
