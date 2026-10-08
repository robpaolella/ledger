import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
dotenv.config();

import { sqlite } from './index.js';
import { migrateFinancialInstitutions } from './migrate-financial-institutions.js';
import { migrateVendorLogos } from './migrate-vendor-logos.js';
import { fetchInstitutionLogo, fetchVendorLogo, logoDevConfigured, type LogoFetchResult } from '../services/institutionLogos.js';

export const LOGODEV_KEY_REJECTED_EXIT_CODE = 2;

/**
 * One-off: fetch logos from logo.dev for every seeded institution AND vendor that
 * doesn't have one cached yet, cache them under /uploads, then backfill those
 * vendor logos onto existing merchants. Idempotent — only fills gaps.
 *
 *   1. Sign up at logo.dev, copy your publishable token (pk_...).
 *   2. LOGODEV_TOKEN=pk_... npm run logos   (from packages/server)
 */
export async function hydrate(
  table: string,
  fetcher: (id: number, domain: string) => Promise<LogoFetchResult>,
): Promise<boolean> {
  const rows = sqlite.prepare(
    `SELECT id, name, domain FROM ${table} WHERE logo_url IS NULL AND domain IS NOT NULL AND TRIM(domain) <> ''`
  ).all() as { id: number; name: string; domain: string }[];
  console.log(`\n${table}: hydrating ${rows.length} logo(s) from logo.dev...`);
  const setLogo = sqlite.prepare(`UPDATE ${table} SET logo_url = ? WHERE id = ?`);
  let ok = 0;
  const missed: string[] = [];
  for (const r of rows) {
    const result = await fetcher(r.id, r.domain);
    if (result.keyRejected) return true;
    if (result.url) { setLogo.run(result.url, r.id); ok++; process.stdout.write('.'); }
    else { missed.push(`${r.name} (${r.domain})`); process.stdout.write('x'); }
  }
  console.log(`\n  ${ok} cached, ${missed.length} not found.`);
  if (missed.length) console.log('  Missing:', missed.join(', '));
  return false;
}

async function main(): Promise<void> {
  if (!logoDevConfigured()) {
    console.error('LOGODEV_TOKEN is not set. Add it to packages/server/.env, then re-run: npm run logos');
    process.exit(1);
  }

  // Ensure tables + seed rows exist even if the server was never started.
  migrateFinancialInstitutions(sqlite);
  migrateVendorLogos(sqlite);

  const keyRejected = await hydrate('financial_institutions', fetchInstitutionLogo)
    || await hydrate('vendor_logos', fetchVendorLogo);
  if (keyRejected) {
    console.error('logo.dev rejected the key');
    sqlite.close();
    process.exitCode = LOGODEV_KEY_REJECTED_EXIT_CODE;
    return;
  }

  // Re-run the vendor migration so its merchant-logo backfill picks up the logos
  // we just cached (attaches them to existing merchants whose name matches).
  migrateVendorLogos(sqlite);

  console.log('\nDone. (Logos that were not found render a colored monogram.)');
  sqlite.close();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => { console.error('Logo hydration failed:', err); process.exit(1); });
}
