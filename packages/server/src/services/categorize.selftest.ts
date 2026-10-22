/**
 * Self-test for the unified categorizer. No test runner in this repo; standalone
 * assertion script over an in-memory SQLite DB. Run with:
 *
 *   npx tsx packages/server/src/services/categorize.selftest.ts
 *
 * Exits non-zero on the first failed assertion.
 */
import Database from 'better-sqlite3';
import { buildCategorizer, REVIEW_THRESHOLD } from './categorize.js';

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE categories (id INTEGER PRIMARY KEY, group_name TEXT, sub_name TEXT, display_name TEXT, type TEXT);
  CREATE TABLE merchants (id INTEGER PRIMARY KEY, name TEXT UNIQUE);
  CREATE TABLE transactions (id INTEGER PRIMARY KEY, description TEXT, merchant_id INTEGER, category_id INTEGER, amount REAL, needs_review INTEGER DEFAULT 0);
  CREATE TABLE category_rules (id INTEGER PRIMARY KEY, match_type TEXT, pattern TEXT, category_id INTEGER, priority INTEGER DEFAULT 0);
  CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT, last_four TEXT, classification TEXT, type TEXT, is_active INTEGER DEFAULT 1);
`);

// The user's own accounts — the transfer signal corroborates against these.
db.prepare("INSERT INTO accounts (name, last_four, classification, type) VALUES (?,?,?,?)")
  .run('Main Checking', '2910', 'liquid', 'checking');
db.prepare("INSERT INTO accounts (name, last_four, classification, type) VALUES (?,?,?,?)")
  .run('Rewards Visa', '3794', 'liability', 'credit');

// Categories
const cat = (g: string, s: string, t = 'expense') =>
  Number(db.prepare('INSERT INTO categories (group_name, sub_name, display_name, type) VALUES (?,?,?,?)').run(g, s, `${g}/${s}`, t).lastInsertRowid);
const DINING = cat('Daily Living', 'Dining/Eating Out');
const GROCERIES = cat('Daily Living', 'Groceries');
const FUEL = cat('Auto/Transportation', 'Fuel');
const SHOPPING = cat('Daily Living', 'Personal Supplies');
const TRANSFER = cat('Transfers', 'Transfer', 'transfer');
const CARD_PAYMENT = cat('Transfers', 'Credit Card Payment', 'transfer');
// NOTE: deliberately NO 'Dues/Subscriptions'/'Gym' category → tests heuristic skip-unresolved.

// Merchants
const mer = (name: string) => Number(db.prepare('INSERT INTO merchants (name) VALUES (?)').run(name).lastInsertRowid);
const STARBUCKS = mer('Starbucks');
const WALMART = mer('Walmart');

// History: Starbucks 3× Dining, 1× Groceries (majority = Dining, not first-seen)
const txn = (desc: string, mid: number | null, cid: number | null) =>
  db.prepare('INSERT INTO transactions (description, merchant_id, category_id, amount) VALUES (?,?,?,?)').run(desc, mid, cid, 5);
txn('SBUX GROCERY RUN', STARBUCKS, GROCERIES); // the earliest row — first-seen bug would pick this
txn('STARBUCKS #1', STARBUCKS, DINING);
txn('STARBUCKS #2', STARBUCKS, DINING);
txn('STARBUCKS #3', STARBUCKS, DINING);
// Walmart: single sample → confidence must be capped below threshold
txn('WALMART #5', WALMART, SHOPPING);
// Merchant-less legacy row for text-history
txn('LOCAL FARM STAND', null, GROCERIES);

const c = buildCategorizer(db);

console.log('merchant-history majority vote (fixes first-seen bug)');
{
  const r = c.categorize({ description: 'STARBUCKS STORE 00456 SEATTLE WA', amount: 6 });
  check('picks Dining (3 of 4), not first-seen Groceries', r.categoryId === DINING, r);
  check('source = merchant-history', r.source === 'merchant-history', r);
  check('confidence ≈ 0.75', Math.abs(r.confidence - 0.75) < 1e-9, r);
}

console.log('single-sample merchant confidence capped');
{
  const r = c.categorize({ description: 'WM SUPERCENTER #5023', amount: 9 });
  check('picks Personal Supplies', r.categoryId === SHOPPING, r);
  check('confidence capped at 0.75 (single sample)', r.confidence <= 0.75 + 1e-9, r);
}

console.log('user rule overrides history — conf 1.0');
{
  db.prepare('INSERT INTO category_rules (match_type, pattern, category_id, priority) VALUES (?,?,?,?)')
    .run('merchant', String(STARBUCKS), GROCERIES, 10);
  const c2 = buildCategorizer(db);
  const r = c2.categorize({ description: 'STARBUCKS #999', amount: 6 });
  check('rule wins → Groceries', r.categoryId === GROCERIES, r);
  check('source = rule, conf 1.0', r.source === 'rule' && r.confidence === 1.0, r);
}

console.log('contains rule');
{
  db.prepare('INSERT INTO category_rules (match_type, pattern, category_id, priority) VALUES (?,?,?,?)')
    .run('contains', 'costco', FUEL, 5);
  const c3 = buildCategorizer(db);
  const r = c3.categorize({ description: 'COSTCO WHSE #0401', amount: 40 });
  check('contains "costco" → Fuel (rule)', r.categoryId === FUEL && r.source === 'rule', r);
}

console.log('text-history fallback (merchant-less)');
{
  const r = c.categorize({ description: 'LOCAL FARM STAND', amount: 12 });
  check('exact desc history → Groceries', r.categoryId === GROCERIES, r);
  check('source = text-history', r.source === 'text-history', r);
}

console.log('heuristic keyword — resolves');
{
  const r = c.categorize({ description: 'SHELL OIL 574 SAN JOSE CA', amount: 45 });
  check('SHELL → Fuel (heuristic)', r.categoryId === FUEL && r.source === 'heuristic', r);
  check('heuristic confidence 0.6', Math.abs(r.confidence - 0.6) < 1e-9, r);
}

console.log('heuristic keyword — skips unresolved (group,sub)');
{
  // "PLANET FITNESS" matches a Gym heuristic, but no Gym category exists → must NOT
  // emit a dead suggestion; falls through to none.
  const r = c.categorize({ description: 'PLANET FITNESS 12345', amount: 20 });
  check('unresolved gym rule → none', r.categoryId === null && r.source === 'none', r);
}

console.log('transfer signal — strong, above merchant history');
{
  const r = c.categorize({
    description: 'Online Transfer to Checking 3732',
    bankDescription: 'Online Transfer to CHK ...3732 transaction#: XXXXXXXXX46',
    amount: 2807, accountClassification: 'liquid', accountType: 'checking',
  });
  check('structural phrasing → Transfer', r.categoryId === TRANSFER, r);
  check('source = transfer-signal, conf 0.9', r.source === 'transfer-signal' && Math.abs(r.confidence - 0.9) < 1e-9, r);
  check('clears the review threshold', r.confidence >= REVIEW_THRESHOLD, r);
}

console.log('transfer signal — card payment reads direction, not text alone');
{
  const inbound = c.categorize({
    description: 'Payment', bankDescription: 'Payment Thank You-Mobile',
    amount: -903.52, accountClassification: 'liability', accountType: 'credit',
  });
  check('money onto a card → Credit Card Payment', inbound.categoryId === CARD_PAYMENT, inbound);
  check('strong, so it is not queued for review', inbound.confidence >= REVIEW_THRESHOLD, inbound);

  const outbound = c.categorize({
    description: 'TJX Rewards Credit Card', bankDescription: 'Web Authorized Pmt Tjx Rew Mstrcrd',
    amount: 173.79, accountClassification: 'liquid', accountType: 'checking',
  });
  check('an untracked card stays weak', outbound.confidence < REVIEW_THRESHOLD, outbound);
}

console.log('transfer signal — settled merchant history outranks a strong TRANSFER signal');
{
  // Rent wired to a landlord reads exactly like a move between the user's own
  // accounts. Two consistent filings is enough for history to keep it.
  const RENT = cat('Household', 'Rent');
  const LANDLORD = mer('Online Realtime Transfer To Landlord');
  txn('Online Realtime Transfer to Landlord', LANDLORD, RENT);
  txn('Online Realtime Transfer to Landlord', LANDLORD, RENT);
  const c4 = buildCategorizer(db);
  const r = c4.categorize({ description: 'Online Realtime Transfer to Landlord', amount: 1500 });
  check('history wins → Rent, not Transfer', r.categoryId === RENT && r.source === 'merchant-history', r);

  // A card payment is exempt from that guard: it was history that once filed
  // one of these as Dining/Eating Out.
  const CARD_MERCHANT = mer('Payment');
  txn('Payment', CARD_MERCHANT, DINING);
  txn('Payment', CARD_MERCHANT, DINING);
  const c5 = buildCategorizer(db);
  const r2 = c5.categorize({
    description: 'Payment', bankDescription: 'MOBILE PAYMENT - THANK YOU',
    amount: -500, accountClassification: 'liability', accountType: 'credit',
  });
  check('card payment overrides even settled history', r2.categoryId === CARD_PAYMENT, r2);
}

console.log('transfer signal — weak tier sits below the heuristics');
{
  const r = c.categorize({ description: 'MYSTERY PAYMENT 4432', amount: 60 });
  check('bare payment word → Transfer at 0.6', r.categoryId === TRANSFER && Math.abs(r.confidence - 0.6) < 1e-9, r);
  check('below the review threshold', r.confidence < REVIEW_THRESHOLD, r);
}

console.log('unknown → none');
{
  const r = c.categorize({ description: 'SOME OBSCURE VENDOR XYZ', amount: 3 });
  check('no match → categoryId null, conf 0', r.categoryId === null && r.confidence === 0, r);
}

if (failures > 0) { console.error(`\n${failures} assertion(s) failed.`); process.exit(1); }
console.log('\nAll categorize self-tests passed.');
