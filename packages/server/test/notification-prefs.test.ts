import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type Database from 'better-sqlite3';
import BetterSqlite from 'better-sqlite3';
import express from 'express';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The routes use the shared db handle, so point it at a scratch file before importing them.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-notification-prefs-'));
process.env.DATABASE_PATH = path.join(scratch, 'test.db');
const FIXTURE = path.join(__dirname, 'fixtures', 'v1.0.2', 'ledger.db');

let sqlite: Database.Database;
let checkBudgetExceeded: typeof import('../src/services/budgetAlerts.js').checkBudgetExceeded;
let server: Server;
let base = '';
let catCount = 0;
const MONTH = '2026-05';

const tokenFor = async (userId: number, role = 'member') => {
  const { getJwtSecret } = await import('../src/utils/jwt.js');
  return jwt.sign({ userId, username: `u${userId}`, displayName: `User ${userId}`, role }, getJwtSecret());
};
const call = async (userId: number | null, method: string, body?: unknown, urlPath = '/preferences') => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (userId != null) headers.Authorization = `Bearer ${await tokenFor(userId)}`;
  const res = await fetch(`${base}${urlPath}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as { data?: { overBudgetAlerts: boolean } } };
};
const flag = (id: number) => (sqlite.prepare('SELECT over_budget_alerts AS v FROM users WHERE id = ?').get(id) as { v: number }).v;

/** An expense category budgeted at $100 with `spent` already booked in MONTH. */
function overBudgetCat(spent: number): number {
  const id = Number(sqlite.prepare(
    "INSERT INTO categories (group_name, sub_name, display_name, type) VALUES ('Prefs', ?, ?, 'expense')",
  ).run(`Cat ${++catCount}`, `Prefs: Cat ${catCount}`).lastInsertRowid);
  sqlite.prepare('INSERT INTO budgets (category_id, month, amount, override) VALUES (?, ?, 100, 0)').run(id, MONTH);
  setSpent(id, spent);
  return id;
}
function setSpent(categoryId: number, spent: number) {
  sqlite.prepare('DELETE FROM transactions WHERE category_id = ?').run(categoryId);
  sqlite.prepare("INSERT INTO transactions (account_id, date, description, amount, category_id) VALUES (1, ?, 'Sample spend', ?, ?)")
    .run(`${MONTH}-10`, spent, categoryId);
}
const alertFor = (userId: number, categoryId: number) =>
  sqlite.prepare('SELECT body, is_read FROM notifications WHERE user_id = ? AND dedupe_key = ?')
    .get(userId, `budget_exceeded:${categoryId}:${MONTH}`) as { body: string; is_read: number } | undefined;

beforeAll(async () => {
  ({ sqlite } = await import('../src/db/index.js'));
  (await import('../src/db/migrate.js')).runMigrations(sqlite);
  sqlite.exec(`
    INSERT INTO users (id, username, password_hash, display_name, role) VALUES
      (1, 'u1', 'x', 'User 1', 'owner'), (2, 'u2', 'x', 'User 2', 'member'), (3, 'u3', 'x', 'User 3', 'member');
    INSERT INTO accounts (id, name, type, classification, owner) VALUES (1, 'Sample Checking', 'checking', 'liquid', 'User 1');
  `);
  ({ checkBudgetExceeded } = await import('../src/services/budgetAlerts.js'));
  const { authenticate } = await import('../src/middleware/auth.js');
  const app = express();
  app.use(express.json());
  app.use('/api', authenticate);
  app.use('/api/notifications', (await import('../src/routes/notifications.js')).default);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/notifications`;
});

afterAll(() => {
  server?.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe('migration', () => {
  it('adds the column on a copy of the v1.0.2 fixture, twice in a row, with every user on', async () => {
    const copy = path.join(scratch, 'v102.db');
    fs.copyFileSync(FIXTURE, copy);
    const db = new BetterSqlite(copy);
    try {
      const { migrateNotificationPrefs } = await import('../src/db/migrate-notification-prefs.js');
      const users = () => db.prepare('SELECT id, over_budget_alerts AS v FROM users').all() as { id: number; v?: number }[];
      const before = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
      expect(before).toBeGreaterThan(0);
      migrateNotificationPrefs(db);
      migrateNotificationPrefs(db);
      expect(users()).toHaveLength(before);
      expect(users().every((u) => u.v === 1)).toBe(true);
    } finally { db.close(); }
  });

  it('is on for new users and survives a second run of the full chain on a fresh database', async () => {
    (await import('../src/db/migrate.js')).runMigrations(sqlite);
    expect([1, 2, 3].map(flag)).toEqual([1, 1, 1]);
  });
});

describe('over-budget alerts', () => {
  it('skip a person who switched off, on the first crossing and on a later refresh', () => {
    sqlite.prepare('UPDATE users SET over_budget_alerts = 0 WHERE id = 3').run();
    const cat = overBudgetCat(130);
    checkBudgetExceeded(sqlite, { month: MONTH, categoryIds: [cat] });
    expect(alertFor(1, cat)?.body).toContain('$30.00');
    expect(alertFor(2, cat)?.body).toContain('$30.00');
    expect(alertFor(3, cat)).toBeUndefined();

    setSpent(cat, 150);
    checkBudgetExceeded(sqlite, { month: MONTH, categoryIds: [cat] });
    expect(alertFor(2, cat)?.body).toContain('$50.00');
    expect(alertFor(3, cat)).toBeUndefined();
  });

  it('leave an alert already in the bell alone after the person switches off', () => {
    const cat = overBudgetCat(130);
    checkBudgetExceeded(sqlite, { month: MONTH, categoryIds: [cat] });
    sqlite.prepare('UPDATE users SET over_budget_alerts = 0 WHERE id = 2').run();
    setSpent(cat, 160);
    checkBudgetExceeded(sqlite, { month: MONTH, categoryIds: [cat] });
    expect(alertFor(2, cat)?.body).toContain('$30.00'); // not refreshed, not deleted
    expect(alertFor(1, cat)?.body).toContain('$60.00');
    sqlite.prepare('UPDATE users SET over_budget_alerts = 1 WHERE id = 2').run();
  });

  it('come back for the next crossing once the person switches on again', () => {
    const cat = overBudgetCat(130);
    checkBudgetExceeded(sqlite, { month: MONTH, categoryIds: [cat] });
    expect(alertFor(3, cat)).toBeUndefined();
    sqlite.prepare('UPDATE users SET over_budget_alerts = 1 WHERE id = 3').run();
    const next = overBudgetCat(120);
    checkBudgetExceeded(sqlite, { month: MONTH, categoryIds: [next] });
    expect(alertFor(3, next)?.body).toContain('$20.00');
  });

  it('skip inactive people even when their choice is on', () => {
    sqlite.prepare('UPDATE users SET is_active = 0 WHERE id = 3').run();
    const cat = overBudgetCat(130);
    checkBudgetExceeded(sqlite, { month: MONTH, categoryIds: [cat] });
    expect(alertFor(3, cat)).toBeUndefined();
    sqlite.prepare('UPDATE users SET is_active = 1 WHERE id = 3').run();
  });
});

describe('GET/PUT /api/notifications/preferences', () => {
  it('rejects calls without a sign-in', async () => {
    expect((await call(null, 'GET')).status).toBe(401);
    expect((await call(null, 'PUT', { overBudgetAlerts: false })).status).toBe(401);
    expect(flag(2)).toBe(1);
  });

  it('reads and changes only the caller\'s own choice', async () => {
    expect((await call(2, 'GET')).json.data).toEqual({ overBudgetAlerts: true });
    expect((await call(2, 'PUT', { overBudgetAlerts: false })).json.data).toEqual({ overBudgetAlerts: false });
    expect((await call(2, 'GET')).json.data).toEqual({ overBudgetAlerts: false });
    expect([1, 2, 3].map(flag)).toEqual([1, 0, 1]);
    // A user id in the body is ignored: the caller's own row is the only one written.
    await call(2, 'PUT', { overBudgetAlerts: true, userId: 1, id: 1 });
    await call(1, 'PUT', { overBudgetAlerts: false });
    expect([1, 2, 3].map(flag)).toEqual([0, 1, 1]);
    await call(1, 'PUT', { overBudgetAlerts: true });
  });

  it.each([['"false"', 'false'], ['1', 1], ['null', null], ['missing', undefined]])('answers 400 for a non-boolean (%s)', async (_n, value) => {
    const body = value === undefined ? {} : { overBudgetAlerts: value };
    expect((await call(2, 'PUT', body)).status).toBe(400);
    expect(flag(2)).toBe(1);
  });
});
