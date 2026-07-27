import type Database from 'better-sqlite3';
import { getConfig, setConfig } from './appConfig.js';
import { ingestAmazonFiles, type IngestResult } from './amazonIngest.js';
import { matchAmazonCharges, type MatchResult } from './amazonMatch.js';
import { enrichMatchedTransactions, type EnrichResult } from './amazonEnrich.js';

/**
 * The nightly Amazon pipeline: ingest sidecar JSON → match charges to ledger
 * transactions. (Enrichment — LLM item categorization + auto-splits — chains
 * on after matching.) Gated on app_config amazon.enabled; never throws.
 */
export interface AmazonPipelineResult {
  enabled: boolean;
  ingest?: IngestResult;
  match?: MatchResult;
  enrich?: EnrichResult;
}

export function amazonEnabled(sqlite: Database.Database): boolean {
  return getConfig(sqlite, 'amazon.enabled') === '1';
}

export async function runAmazonPipeline(sqlite: Database.Database): Promise<AmazonPipelineResult> {
  if (!amazonEnabled(sqlite)) return { enabled: false };
  const result: AmazonPipelineResult = { enabled: true };
  try {
    result.ingest = ingestAmazonFiles(sqlite);
    result.match = matchAmazonCharges(sqlite);
    result.enrich = await enrichMatchedTransactions(sqlite);
    setConfig(sqlite, 'amazon.last_ingest_at', new Date().toISOString());
    if (result.ingest.files > 0 || (result.match?.matched ?? 0) > 0 || (result.enrich?.enriched ?? 0) > 0) {
      console.log(
        `[amazon] ingested ${result.ingest.files} file(s) (${result.ingest.orders} orders, ${result.ingest.charges} charges), ` +
        `matched ${result.match.matched} txn(s) (${result.match.ambiguous} ambiguous), ` +
        `enriched ${result.enrich.enriched} (${result.enrich.split} split)`,
      );
    }
  } catch (err) {
    console.error('[amazon] pipeline failed:', err instanceof Error ? err.message : err);
  }
  return result;
}
