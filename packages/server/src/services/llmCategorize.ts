import type Database from 'better-sqlite3';
import type { CategorizeResult } from './categorize.js';
import { getConfig } from './appConfig.js';

/**
 * Local-LLM categorization stage (Ollama). Runs AFTER the deterministic
 * categorizer for every transaction it isn't 100% sure about; the deterministic
 * result rides along as a prior the model must beat. Few-shot context comes
 * from category_feedback — the user's own corrections and confirmations.
 *
 * Failure philosophy: this stage can only ever improve on the prior. Any
 * error, timeout, malformed reply, or unknown category id → the prior stands.
 * Nothing here throws to callers.
 */

export interface LlmTxnInput {
  /** Correlation key echoed back by the model (index into the caller's array). */
  key: number;
  date: string;
  /** Ledger sign: positive = money out. */
  amount: number;
  accountName?: string;
  accountType?: string;
  merchantName?: string | null;
  description: string;
  bankDescription?: string | null;
  prior: CategorizeResult;
}

export interface LlmVerdict {
  categoryId: number | null; // null = abstained
  confidence: number;        // 0..1 (already clamped)
  reasoning?: string;
}

export interface LlmSettings {
  baseUrl: string;
  model: string;
  batchSize: number;
  timeoutMs: number;
}

/** Max LLM confidence — only explicit user rules ever reach 1.0. */
const LLM_CONF_CAP = 0.95;
const FEWSHOT_LIMIT = 12;

/** null = disabled or unconfigured (feature is a no-op then). */
export function llmConfig(sqlite: Database.Database): LlmSettings | null {
  if (getConfig(sqlite, 'llm.enabled') !== '1') return null;
  const baseUrl = (getConfig(sqlite, 'llm.base_url') ?? '').trim().replace(/\/+$/, '');
  const model = (getConfig(sqlite, 'llm.model') ?? '').trim();
  if (!baseUrl || !model) return null;
  const batchSize = Math.max(1, Number(getConfig(sqlite, 'llm.batch_size') ?? 8) || 8);
  const timeoutMs = Math.max(5_000, Number(getConfig(sqlite, 'llm.timeout_ms') ?? 60_000) || 60_000);
  return { baseUrl, model, batchSize, timeoutMs };
}

/* ------ prompt building ------ */

function taxonomyLines(sqlite: Database.Database): { lines: string; validIds: Set<number> } {
  const cats = sqlite.prepare(
    'SELECT id, type, group_name, sub_name FROM categories ORDER BY type, group_name, sub_name'
  ).all() as { id: number; type: string; group_name: string; sub_name: string }[];
  const validIds = new Set(cats.map((c) => c.id));
  const lines = cats.map((c) => `${c.id} | ${c.type} / ${c.group_name} / ${c.sub_name}`).join('\n');
  return { lines, validIds };
}

interface FeedbackRow {
  description: string;
  merchant_id: number | null;
  merchant_name: string | null;
  amount: number;
  corrected_category_id: number;
  kind: string;
  cat_path: string | null;
}

/**
 * Few-shot retrieval: corrections for the batch's merchants first (≤2 per
 * merchant), then recent global corrections, then confirmations as filler.
 * Deduped on (merchant, category); rows pointing at deleted categories drop out
 * via the JOIN.
 */
export function fewShotExamples(sqlite: Database.Database, merchantIds: number[]): string[] {
  const picked: FeedbackRow[] = [];
  const seen = new Set<string>();

  const push = (rows: FeedbackRow[], maxPerMerchant: number | null) => {
    const perMerchant = new Map<number, number>(); // per-pass cap
    for (const r of rows) {
      if (picked.length >= FEWSHOT_LIMIT) return;
      const dedupe = `${r.merchant_id ?? r.description.toLowerCase()}:${r.corrected_category_id}`;
      if (seen.has(dedupe)) continue;
      if (maxPerMerchant != null && r.merchant_id != null) {
        const n = perMerchant.get(r.merchant_id) ?? 0;
        if (n >= maxPerMerchant) continue;
        perMerchant.set(r.merchant_id, n + 1);
      }
      seen.add(dedupe);
      picked.push(r);
    }
  };

  const base = `
    SELECT f.description, f.merchant_id, m.name AS merchant_name, f.amount,
           f.corrected_category_id, f.kind,
           c.type || ' / ' || c.group_name || ' / ' || c.sub_name AS cat_path
    FROM category_feedback f
    JOIN categories c ON c.id = f.corrected_category_id
    LEFT JOIN merchants m ON m.id = f.merchant_id
  `;

  if (merchantIds.length > 0) {
    const rows = sqlite.prepare(
      `${base} WHERE f.kind IN ('correction','split_leg') AND f.merchant_id IN (${merchantIds.map(() => '?').join(',')}) ORDER BY f.id DESC LIMIT 50`
    ).all(...merchantIds) as FeedbackRow[];
    push(rows, 2);
  }
  push(sqlite.prepare(`${base} WHERE f.kind IN ('correction','split_leg') ORDER BY f.id DESC LIMIT 50`).all() as FeedbackRow[], 2);
  push(sqlite.prepare(`${base} WHERE f.kind = 'confirmation' ORDER BY f.id DESC LIMIT 30`).all() as FeedbackRow[], 1);

  return picked.map((r) => {
    const who = r.merchant_name ? ` [${r.merchant_name}]` : '';
    const how = r.kind === 'confirmation' ? 'user confirmed' : 'user corrected to';
    return `- "${r.description}"${who} $${Math.abs(r.amount).toFixed(2)} → ${how} ${r.corrected_category_id} (${r.cat_path})`;
  });
}

const SYSTEM_PROMPT = `You categorize personal-finance transactions for a household ledger.
Sign convention: a positive amount is money SPENT, a negative amount is money RECEIVED.
For each transaction pick the best category id from the TAXONOMY. Return null for categoryId only when genuinely unsure.
Each transaction includes a deterministic hint — treat it as a prior and override it only when the evidence clearly points elsewhere.
Follow the household's past decisions when they apply. Keep reasoning under 15 words. /no_think`;

function txnLine(t: LlmTxnInput): string {
  const dir = t.amount >= 0 ? 'out' : 'in';
  const parts = [
    `key=${t.key}`,
    t.date,
    `$${Math.abs(t.amount).toFixed(2)} ${dir}`,
    t.accountName ? `account "${t.accountName}"${t.accountType ? ` (${t.accountType})` : ''}` : null,
    t.merchantName ? `merchant "${t.merchantName}"` : null,
    `desc "${t.description}"`,
    t.bankDescription && t.bankDescription !== t.description ? `bank "${t.bankDescription}"` : null,
    t.prior.categoryId != null
      ? `hint: ${t.prior.categoryId} ${t.prior.groupName}/${t.prior.subName} (${t.prior.source}, ${t.prior.confidence.toFixed(2)})`
      : 'hint: none',
  ];
  return parts.filter(Boolean).join(' | ');
}

const RESPONSE_SCHEMA = {
  type: 'object',
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        required: ['key', 'categoryId', 'confidence'],
        properties: {
          key: { type: 'integer' },
          categoryId: { type: ['integer', 'null'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          reasoning: { type: 'string' },
        },
      },
    },
  },
};

/* ------ Ollama transport ------ */

async function ollamaChat(
  cfg: LlmSettings,
  userPrompt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetchImpl(`${cfg.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: cfg.model,
        stream: false,
        think: false,
        format: RESPONSE_SCHEMA,
        keep_alive: '30m',
        options: { temperature: 0, num_ctx: 8192 },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data = await res.json() as { message?: { content?: string } };
    return data.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}

/** Strip a leading <think>…</think> block (older Ollama ignores think:false). */
export function stripThink(content: string): string {
  return content.replace(/^\s*<think>[\s\S]*?<\/think>\s*/, '').trim();
}

export function parseVerdicts(content: string, validIds: Set<number>): Map<number, LlmVerdict> {
  const out = new Map<number, LlmVerdict>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripThink(content));
  } catch {
    return out;
  }
  const results = (parsed as { results?: unknown })?.results;
  if (!Array.isArray(results)) return out;
  for (const r of results) {
    if (typeof r !== 'object' || r == null) continue;
    const { key, categoryId, confidence, reasoning } = r as { key?: unknown; categoryId?: unknown; confidence?: unknown; reasoning?: unknown };
    if (!Number.isInteger(key)) continue;
    const conf = typeof confidence === 'number' && Number.isFinite(confidence)
      ? Math.min(Math.max(confidence, 0), LLM_CONF_CAP) : 0;
    let catId: number | null = null;
    if (Number.isInteger(categoryId)) {
      if (!validIds.has(categoryId as number)) continue; // hallucinated id → drop (prior stands)
      catId = categoryId as number;
    }
    out.set(key as number, { categoryId: catId, confidence: conf, reasoning: typeof reasoning === 'string' ? reasoning : undefined });
  }
  return out;
}

/**
 * Deterministic merge of the LLM verdict onto the deterministic prior.
 * Callers only invoke this for prior.confidence < 1.0 (rules are absolute).
 */
export function mergeLlmResult(prior: CategorizeResult, llm: LlmVerdict | undefined): CategorizeResult {
  if (!llm || llm.categoryId == null) return prior;             // abstain/missing → prior
  if (llm.categoryId === prior.categoryId) {
    // Independent agreement is evidence — raise confidence, keep provenance.
    return { ...prior, confidence: Math.max(prior.confidence, llm.confidence) };
  }
  // Disagreement: the model must BEAT the prior, ties go to observed behavior.
  if (llm.confidence > prior.confidence) {
    return { categoryId: llm.categoryId, groupName: null, subName: null, confidence: llm.confidence, source: 'llm' };
  }
  return prior;
}

/**
 * Categorize a set of transactions via the local LLM, in sequential batches.
 * Returns a map key → verdict for every VALIDATED reply. Never throws; on any
 * batch failure that batch simply produces no verdicts.
 */
export async function llmCategorizeBatch(
  sqlite: Database.Database,
  items: LlmTxnInput[],
  fetchImpl: typeof fetch = fetch,
): Promise<Map<number, LlmVerdict>> {
  const out = new Map<number, LlmVerdict>();
  const cfg = llmConfig(sqlite);
  if (!cfg || items.length === 0) return out;

  const { lines: taxonomy, validIds } = taxonomyLines(sqlite);
  const merchantIds = [...new Set(
    items.map((i) => i.merchantName).filter((n): n is string => !!n)
      .map((n) => (sqlite.prepare('SELECT id FROM merchants WHERE name = ?').get(n) as { id: number } | undefined)?.id)
      .filter((id): id is number => id != null)
  )];
  const fewShot = fewShotExamples(sqlite, merchantIds);

  for (let i = 0; i < items.length; i += cfg.batchSize) {
    const batch = items.slice(i, i + cfg.batchSize);
    const prompt = [
      'TAXONOMY (id | section / group / category):',
      taxonomy,
      ...(fewShot.length > 0 ? ['', 'PAST DECISIONS BY THIS HOUSEHOLD (follow these patterns):', ...fewShot] : []),
      '',
      'CATEGORIZE:',
      ...batch.map(txnLine),
    ].join('\n');

    try {
      const content = await ollamaChat(cfg, prompt, fetchImpl);
      const verdicts = parseVerdicts(content, validIds);
      const batchKeys = new Set(batch.map((b) => b.key));
      for (const [key, v] of verdicts) {
        if (batchKeys.has(key)) out.set(key, v); // ignore echoed keys outside this batch
      }
    } catch (err) {
      console.error(`[llm-categorize] batch ${i / cfg.batchSize} failed:`, err instanceof Error ? err.message : err);
      // continue — remaining batches may still succeed
    }
  }
  return out;
}

/**
 * Item-level categorization for Amazon order enrichment: one verdict per line
 * item. Few-shot filtered to the given merchant's feedback (usually Amazon).
 * Same transport/validation machinery; never throws.
 */
export async function llmCategorizeItems(
  sqlite: Database.Database,
  opts: { orderNumber: string; merchantName: string; items: { key: number; title: string; unitPrice: number | null; quantity: number }[] },
  fetchImpl: typeof fetch = fetch,
): Promise<Map<number, LlmVerdict>> {
  const out = new Map<number, LlmVerdict>();
  const cfg = llmConfig(sqlite);
  if (!cfg || opts.items.length === 0) return out;

  const { lines: taxonomy, validIds } = taxonomyLines(sqlite);
  const merchantId = (sqlite.prepare('SELECT id FROM merchants WHERE name = ?').get(opts.merchantName) as { id: number } | undefined)?.id;
  const fewShot = fewShotExamples(sqlite, merchantId != null ? [merchantId] : []);

  const prompt = [
    'TAXONOMY (id | section / group / category):',
    taxonomy,
    ...(fewShot.length > 0 ? ['', 'PAST DECISIONS BY THIS HOUSEHOLD (follow these patterns):', ...fewShot] : []),
    '',
    `CATEGORIZE each purchased item from ${opts.merchantName} order ${opts.orderNumber}:`,
    ...opts.items.map((it) =>
      `key=${it.key} | "${it.title}"${it.unitPrice != null ? ` | $${it.unitPrice.toFixed(2)}` : ''}${it.quantity > 1 ? ` × ${it.quantity}` : ''}`),
  ].join('\n');

  try {
    const content = await ollamaChat(cfg, prompt, fetchImpl);
    const verdicts = parseVerdicts(content, validIds);
    const keys = new Set(opts.items.map((i) => i.key));
    for (const [key, v] of verdicts) {
      if (keys.has(key)) out.set(key, v);
    }
  } catch (err) {
    console.error(`[llm-categorize] items for order ${opts.orderNumber} failed:`, err instanceof Error ? err.message : err);
  }
  return out;
}

/** Connection probe for the Settings "Test connection" button. */
export async function llmStatus(sqlite: Database.Database, fetchImpl: typeof fetch = fetch): Promise<{
  enabled: boolean; reachable: boolean; modelAvailable: boolean; latencyMs?: number; error?: string;
}> {
  const enabled = getConfig(sqlite, 'llm.enabled') === '1';
  const baseUrl = (getConfig(sqlite, 'llm.base_url') ?? '').trim().replace(/\/+$/, '');
  const model = (getConfig(sqlite, 'llm.model') ?? '').trim();
  if (!baseUrl) return { enabled, reachable: false, modelAvailable: false, error: 'No base URL configured' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  const start = Date.now();
  try {
    const res = await fetchImpl(`${baseUrl}/api/tags`, { signal: controller.signal });
    if (!res.ok) return { enabled, reachable: false, modelAvailable: false, error: `HTTP ${res.status}` };
    const data = await res.json() as { models?: { name: string }[] };
    const names = (data.models ?? []).map((m) => m.name);
    // "qwen3:4b" should match "qwen3:4b" exactly or via the bare-name form.
    const modelAvailable = !!model && names.some((n) => n === model || n.split(':')[0] === model);
    return { enabled, reachable: true, modelAvailable, latencyMs: Date.now() - start };
  } catch (err) {
    return { enabled, reachable: false, modelAvailable: false, error: err instanceof Error ? err.message : 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}
