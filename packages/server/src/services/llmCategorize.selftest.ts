/**
 * Self-test for the LLM categorization stage. No Ollama needed — fetch is
 * mocked. Run: npx tsx src/services/llmCategorize.selftest.ts
 */
import Database from 'better-sqlite3';
import assert from 'node:assert';
import {
  llmConfig, stripThink, parseVerdicts, mergeLlmResult, llmCategorizeBatch, fewShotExamples,
} from './llmCategorize.js';
import type { CategorizeResult } from './categorize.js';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE app_config (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE, value TEXT);
    CREATE TABLE categories (id INTEGER PRIMARY KEY, type TEXT, group_name TEXT, sub_name TEXT);
    CREATE TABLE merchants (id INTEGER PRIMARY KEY, name TEXT UNIQUE);
    CREATE TABLE category_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id INTEGER, description TEXT,
      bank_description TEXT, merchant_id INTEGER, account_id INTEGER, amount REAL,
      txn_date TEXT, prior_category_id INTEGER, prior_source TEXT, prior_confidence REAL,
      corrected_category_id INTEGER, kind TEXT, user_id INTEGER, created_at TEXT
    );
  `);
  db.prepare("INSERT INTO categories VALUES (10,'expense','Daily Living','Groceries')").run();
  db.prepare("INSERT INTO categories VALUES (11,'expense','Daily Living','Dining/Eating Out')").run();
  db.prepare("INSERT INTO categories VALUES (12,'expense','Household','Supplies')").run();
  db.prepare("INSERT INTO merchants VALUES (1,'Amazon')").run();
  return db;
}

const setCfg = (db: Database.Database, k: string, v: string) =>
  db.prepare('INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, v);

const prior = (categoryId: number | null, confidence: number, source: CategorizeResult['source']): CategorizeResult =>
  ({ categoryId, groupName: 'G', subName: 'S', confidence, source });

async function main() {
  // --- llmConfig gating ---
  const db = makeDb();
  assert.equal(llmConfig(db), null, 'disabled by default');
  setCfg(db, 'llm.enabled', '1');
  assert.equal(llmConfig(db), null, 'no base_url/model → still null');
  setCfg(db, 'llm.base_url', 'http://gpu:11434/');
  setCfg(db, 'llm.model', 'qwen3:4b');
  const cfg = llmConfig(db)!;
  assert.equal(cfg.baseUrl, 'http://gpu:11434', 'trailing slash stripped');
  assert.equal(cfg.batchSize, 8);

  // --- stripThink ---
  assert.equal(stripThink('<think>blah\nblah</think>{"a":1}'), '{"a":1}');
  assert.equal(stripThink('{"a":1}'), '{"a":1}');

  // --- parseVerdicts ---
  const valid = new Set([10, 11, 12]);
  let v = parseVerdicts('{"results":[{"key":0,"categoryId":10,"confidence":0.9}]}', valid);
  assert.equal(v.get(0)!.categoryId, 10);
  v = parseVerdicts('<think>hm</think>{"results":[{"key":1,"categoryId":11,"confidence":1.4}]}', valid);
  assert.equal(v.get(1)!.confidence, 0.95, 'clamped to cap');
  v = parseVerdicts('{"results":[{"key":2,"categoryId":999,"confidence":0.9}]}', valid);
  assert.equal(v.has(2), false, 'hallucinated id dropped');
  v = parseVerdicts('{"results":[{"key":3,"categoryId":null,"confidence":0.2}]}', valid);
  assert.equal(v.get(3)!.categoryId, null, 'abstain preserved');
  assert.equal(parseVerdicts('not json', valid).size, 0, 'garbage → empty');

  // --- mergeLlmResult ---
  const det = prior(11, 0.6, 'heuristic');
  assert.equal(mergeLlmResult(det, undefined), det, 'missing → prior');
  assert.equal(mergeLlmResult(det, { categoryId: null, confidence: 0.9 }), det, 'abstain → prior');
  let m = mergeLlmResult(det, { categoryId: 11, confidence: 0.9 });
  assert.equal(m.source, 'heuristic', 'agreement keeps provenance');
  assert.equal(m.confidence, 0.9, 'agreement raises confidence');
  m = mergeLlmResult(det, { categoryId: 10, confidence: 0.85 });
  assert.equal(m.source, 'llm');
  assert.equal(m.categoryId, 10, 'higher-confidence disagreement wins');
  m = mergeLlmResult(prior(11, 0.9, 'merchant-history'), { categoryId: 10, confidence: 0.85 });
  assert.equal(m.categoryId, 11, 'lower-confidence disagreement loses');
  m = mergeLlmResult(prior(null, 0, 'none'), { categoryId: 12, confidence: 0.7 });
  assert.equal(m.categoryId, 12, 'fills uncategorized');

  // --- fewShotExamples: corrections before confirmations, dedupe ---
  const ins = db.prepare(`INSERT INTO category_feedback (description, merchant_id, amount, corrected_category_id, kind) VALUES (?, ?, ?, ?, ?)`);
  ins.run('AMZN MKTP US*1', 1, 42.1, 12, 'correction');
  ins.run('AMZN MKTP US*2', 1, 12.0, 12, 'correction');   // dupe (merchant,cat) → dropped
  ins.run('AMZN MKTP US*3', 1, 9.0, 10, 'confirmation');
  const shots = fewShotExamples(db, [1]);
  assert.equal(shots.length, 2, `dedupe: got ${shots.length}`);
  assert.ok(shots[0].includes('corrected'), 'corrections first');

  // --- llmCategorizeBatch with mocked fetch ---
  let calls = 0;
  const okFetch = (async (_url: unknown, init?: { body?: unknown }) => {
    calls++;
    const body = JSON.parse(String((init as { body: string }).body));
    assert.equal(body.think, false);
    assert.ok(body.messages[1].content.includes('TAXONOMY'), 'prompt has taxonomy');
    return {
      ok: true,
      json: async () => ({ message: { content: '{"results":[{"key":0,"categoryId":10,"confidence":0.9},{"key":1,"categoryId":99,"confidence":0.9}]}' } }),
    };
  }) as unknown as typeof fetch;
  const items = [
    { key: 0, date: '2026-07-26', amount: 12.5, description: 'STARBUCKS #1', prior: prior(11, 0.6, 'heuristic') },
    { key: 1, date: '2026-07-26', amount: 99.0, description: 'MYSTERY', prior: prior(null, 0, 'none') },
  ];
  const res = await llmCategorizeBatch(db, items, okFetch);
  assert.equal(calls, 1, 'one batch');
  assert.equal(res.get(0)!.categoryId, 10);
  assert.equal(res.has(1), false, 'invalid id for key 1 dropped');

  const failFetch = (async () => { throw new Error('boom'); }) as unknown as typeof fetch;
  const res2 = await llmCategorizeBatch(db, items, failFetch);
  assert.equal(res2.size, 0, 'transport failure → empty, no throw');

  console.log('llmCategorize selftest: all assertions passed');
}

main().catch((err) => { console.error(err); process.exit(1); });
