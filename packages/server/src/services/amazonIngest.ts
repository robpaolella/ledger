import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import { dataDir } from '../db/index.js';
import { getConfig, setConfig } from './appConfig.js';
import { notifyAmazonFailure, clearAmazonFailureNotification } from './notifications.js';

/**
 * Consume the Amazon scraper sidecar's JSON drops (scripts/amazon) into the
 * amazon_* tables. File-name ordering is the resume cursor: each file commits
 * in its own transaction and advances app_config['amazon.last_ingested_file'],
 * so a crash mid-batch resumes at the next file.
 */

export const AMAZON_SCHEMA_VERSION = 1;
const LAST_FILE_KEY = 'amazon.last_ingested_file';
const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

export function amazonDir(): string {
  return process.env.AMAZON_DATA_DIR || path.join(dataDir, 'amazon');
}

interface ScrapeFile {
  schemaVersion: number;
  scrapedAt: string;
  orders: {
    orderNumber: string; orderDate: string;
    grandTotal: number | null; subtotal: number | null; tax: number | null;
    items: { title: string; asin: string | null; unitPrice: number | null; quantity: number | null; seller: string | null }[];
  }[];
  charges: {
    date: string | null; amount: number | null; orderNumbers: string[];
    paymentMethod: string | null; isRefund: boolean;
  }[];
}

interface StatusFile {
  lastRun: string; ok: boolean; errorKind: 'auth' | 'other' | null;
  message: string; ordersSeen: number; sessionOk: boolean;
}

export interface IngestResult {
  files: number;
  orders: number;
  charges: number;
  status: StatusFile | null;
}

export function ingestAmazonFiles(sqlite: Database.Database): IngestResult {
  const dir = amazonDir();
  const result: IngestResult = { files: 0, orders: 0, charges: 0, status: null };
  if (!fs.existsSync(dir)) return result;

  const cursor = getConfig(sqlite, LAST_FILE_KEY) ?? '';
  const files = fs.readdirSync(dir)
    .filter((f) => /^orders-.*\.json$/.test(f) && f > cursor)
    .sort();

  const upsertOrder = sqlite.prepare(`
    INSERT INTO amazon_orders (order_number, order_date, total, subtotal, tax, raw_json, scraped_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(order_number) DO UPDATE SET
      order_date = excluded.order_date, total = excluded.total, subtotal = excluded.subtotal,
      tax = excluded.tax, raw_json = excluded.raw_json, scraped_at = excluded.scraped_at
  `);
  const deleteItems = sqlite.prepare('DELETE FROM amazon_order_items WHERE order_number = ?');
  const insertItem = sqlite.prepare(`
    INSERT INTO amazon_order_items (order_number, title, unit_price, quantity, asin, seller)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertCharge = sqlite.prepare(`
    INSERT OR IGNORE INTO amazon_charges (charge_date, amount, order_number, payment_method, is_refund)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const file of files) {
    let parsed: ScrapeFile;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as ScrapeFile;
    } catch (err) {
      console.error(`[amazon-ingest] skipping unreadable ${file}:`, err instanceof Error ? err.message : err);
      setConfig(sqlite, LAST_FILE_KEY, file); // don't re-attempt a corrupt file forever
      continue;
    }
    if (parsed.schemaVersion !== AMAZON_SCHEMA_VERSION) {
      console.error(`[amazon-ingest] ${file} has schemaVersion ${parsed.schemaVersion}, expected ${AMAZON_SCHEMA_VERSION} — skipping`);
      setConfig(sqlite, LAST_FILE_KEY, file);
      continue;
    }

    sqlite.transaction(() => {
      for (const o of parsed.orders ?? []) {
        if (!o.orderNumber || !o.orderDate) continue;
        upsertOrder.run(o.orderNumber, o.orderDate, o.grandTotal, o.subtotal, o.tax, JSON.stringify(o), parsed.scrapedAt);
        deleteItems.run(o.orderNumber);
        for (const it of o.items ?? []) {
          if (!it.title) continue;
          insertItem.run(o.orderNumber, it.title, it.unitPrice, it.quantity ?? 1, it.asin, it.seller);
        }
        result.orders++;
      }
      const knownOrder = sqlite.prepare('SELECT 1 FROM amazon_orders WHERE order_number = ?');
      for (const c of parsed.charges ?? []) {
        if (!c.date || c.amount == null) continue;
        // FK target must exist; keep the charge even when its order fell outside
        // the scraped window (order_number NULL still matches by amount).
        const orderNumber = c.orderNumbers?.[0] && knownOrder.get(c.orderNumbers[0]) ? c.orderNumbers[0] : null;
        const r = insertCharge.run(c.date, c.amount, orderNumber, c.paymentMethod, c.isRefund ? 1 : 0);
        if (r.changes > 0) result.charges++;
      }
      setConfig(sqlite, LAST_FILE_KEY, file);
    })();
    result.files++;
  }

  // Sidecar health → notifications.
  const statusPath = path.join(dir, 'status.json');
  if (fs.existsSync(statusPath)) {
    try {
      const status = JSON.parse(fs.readFileSync(statusPath, 'utf-8')) as StatusFile;
      result.status = status;
      if (status.errorKind === 'auth') {
        notifyAmazonFailure(sqlite, 'auth', 'Amazon session expired — run `amazon-orders login` on the server (see scripts/amazon/README.md).');
      } else if (status.ok) {
        clearAmazonFailureNotification(sqlite);
        if (Date.now() - new Date(status.lastRun).getTime() > STALE_AFTER_MS) {
          notifyAmazonFailure(sqlite, 'stale', 'Amazon scraper has not run in over 48 hours — check the systemd timer.');
        }
      } else {
        notifyAmazonFailure(sqlite, 'other', `Amazon scrape failing: ${status.message}`);
      }
    } catch (err) {
      console.error('[amazon-ingest] unreadable status.json:', err instanceof Error ? err.message : err);
    }
  }

  return result;
}
