import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import Database from 'better-sqlite3';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrateCategorySortOrder } from '../src/db/migrate-category-sort-order.js';

// The seed and routes use the shared db handle, so point it at a scratch file before importing them.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-category-order-'));
process.env.DATABASE_PATH = path.join(scratch, 'test.db');

let sqlite: Database.Database;
let runMigrations: (db: Database.Database) => void;
let server: Server;
let base = '';

const subsIn = (db: Database.Database, type: string, group: string) =>
  (db.prepare('SELECT sub_name FROM categories WHERE type = ? AND group_name = ? ORDER BY sort_order, id').all(type, group) as { sub_name: string }[])
    .map((r) => r.sub_name);

beforeAll(async () => {
  ({ sqlite } = await import('../src/db/index.js')); // seeds the default categories on a fresh file
  ({ runMigrations } = await import('../src/db/migrate.js'));

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId: 1, username: 'owner', displayName: 'owner', role: 'owner' };
    next();
  });
  app.use('/categories', (await import('../src/routes/categories.js')).default);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
  sqlite?.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe('category order across server starts', () => {
  it('keeps the seed order on a fresh database, however many times the server starts', () => {
    const seeded = sqlite.prepare('SELECT type, group_name AS g FROM categories GROUP BY type, group_name').all() as { type: string; g: string }[];
    // The seed inserts each group in its intended order, so id order is the seed order.
    const seedOrder = (type: string, group: string) =>
      (sqlite.prepare('SELECT sub_name FROM categories WHERE type = ? AND group_name = ? ORDER BY id').all(type, group) as { sub_name: string }[])
        .map((r) => r.sub_name);
    const expected = seeded.map(({ type, g }) => [g, seedOrder(type, g)]);

    runMigrations(sqlite);
    runMigrations(sqlite);

    expect(seeded.map(({ type, g }) => [g, subsIn(sqlite, type, g)])).toEqual(expected);
    expect(subsIn(sqlite, 'income', 'Income')).toEqual(['Take Home Pay', 'Interest Income', 'Other Income']);
    expect(subsIn(sqlite, 'expense', 'Utilities')).toEqual(['Internet', 'Phone', 'Power', 'Water', 'Other']);
  });

  it('keeps an order saved through the reorder route after the server restarts', async () => {
    const rows = sqlite.prepare("SELECT id, sub_name FROM categories WHERE type = 'expense' AND group_name = 'Utilities' ORDER BY sort_order, id")
      .all() as { id: number; sub_name: string }[];
    const reversed = [...rows].reverse();
    const res = await fetch(`${base}/categories/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: reversed.map((r, i) => ({ id: r.id, sort_order: i })) }),
    });
    expect(res.status).toBe(200);
    const saved = reversed.map((r) => r.sub_name);
    expect(subsIn(sqlite, 'expense', 'Utilities')).toEqual(saved);

    runMigrations(sqlite);
    runMigrations(sqlite);

    expect(subsIn(sqlite, 'expense', 'Utilities')).toEqual(saved);
  });
});

describe('a database from before the order was set', () => {
  it('gets the alphabetical order once, then keeps any order saved afterwards', () => {
    const db = new Database(':memory:');
    try {
      db.exec(`
        CREATE TABLE app_config (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, value TEXT NOT NULL);
        CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, group_name TEXT NOT NULL, sub_name TEXT NOT NULL, type TEXT NOT NULL, sort_order INTEGER DEFAULT 0);
      `);
      const add = db.prepare("INSERT INTO categories (group_name, sub_name, type) VALUES (?, ?, 'expense')");
      for (const sub of ['Water', 'internet', 'Power']) add.run('Utilities', sub);
      add.run('Clothing', 'Shoes');
      add.run('Clothing', 'Coats');

      migrateCategorySortOrder(db);
      expect(subsIn(db, 'expense', 'Utilities')).toEqual(['internet', 'Power', 'Water']);
      expect(subsIn(db, 'expense', 'Clothing')).toEqual(['Coats', 'Shoes']);

      // The household moves Water to the top; later starts leave it there.
      db.prepare("UPDATE categories SET sort_order = CASE sub_name WHEN 'Water' THEN 0 WHEN 'internet' THEN 1 ELSE 2 END WHERE group_name = 'Utilities'").run();
      migrateCategorySortOrder(db);
      migrateCategorySortOrder(db);
      expect(subsIn(db, 'expense', 'Utilities')).toEqual(['Water', 'internet', 'Power']);
    } finally { db.close(); }
  });
});
