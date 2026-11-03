import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import express from 'express';
import type { ContributionSetup } from '@ledger/shared/src/types.js';

// Contribution setups (#416): which Transfers categories are tracked, and the accounts
// they pay into. Every test runs on an in-memory copy of a fresh install (built in a
// temporary folder); data/ is never opened.
const handle = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('../src/db/index.js', async () => {
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const schema = await import('../src/db/schema.js');
  return {
    get sqlite() { return handle.current; },
    get db() { return drizzle(handle.current as Database.Database, { schema }); },
  };
});

let migrated: Buffer;
beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-contributions-'));
  process.env.DATABASE_PATH = path.join(dir, 'ledger.db');
  try {
    const real = await vi.importActual<typeof import('../src/db/index.js')>('../src/db/index.js');
    const { runMigrations } = await import('../src/db/migrate.js');
    runMigrations(real.sqlite);
    real.sqlite.pragma('journal_mode = DELETE'); // an in-memory copy can't open a WAL image
    migrated = real.sqlite.serialize();
    real.sqlite.close();
  } finally {
    delete process.env.DATABASE_PATH;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);

let sql: Database.Database;
let transferGroup: number;
let canonical: number; // Transfers > Transfer
let college: number;   // Transfers > College 529, untracked
let groceries: number; // an expense category
let incomeGroup: number;

beforeEach(() => {
  sql = new Database(migrated);
  sql.pragma('foreign_keys = ON');
  handle.current = sql;
  sql.exec(`
    INSERT INTO users (id, username, password_hash, display_name, role) VALUES
      (1, 'sample-owner', 'x', 'John', 'owner'), (2, 'sample-admin', 'x', 'Jane', 'admin'),
      (10, 'sample-editor', 'x', 'Sam', 'member'), (11, 'sample-creator', 'x', 'Kim', 'member'),
      (12, 'sample-viewer', 'x', 'Viewer', 'member');
    INSERT INTO user_permissions (user_id, permission, granted) VALUES
      (10, 'categories.edit', 1), (11, 'categories.edit', 1), (11, 'categories.create', 1),
      (12, 'categories.create', 1), (12, 'categories.delete', 1);
    INSERT INTO accounts (id, name, type, classification, owner, is_active) VALUES
      (1, 'Joint Checking', 'checking', 'liquid', 'John', 1),
      (2, 'College 529', 'investment', 'investment', 'John', 1),
      (3, 'Old Brokerage', 'investment', 'investment', 'Jane', 0),
      (4, 'Roth IRA', 'retirement', 'investment', 'Jane', 1);
  `);
  transferGroup = (sql.prepare("SELECT id FROM category_groups WHERE type = 'transfer' AND name = 'Transfers'").get() as { id: number }).id;
  incomeGroup = (sql.prepare("SELECT id FROM category_groups WHERE type = 'income' LIMIT 1").get() as { id: number }).id;
  canonical = (sql.prepare("SELECT id FROM categories WHERE type = 'transfer' AND sub_name = 'Transfer'").get() as { id: number }).id;
  groceries = (sql.prepare("SELECT id FROM categories WHERE sub_name = 'Groceries'").get() as { id: number }).id;
  college = Number(sql.prepare(`INSERT INTO categories (group_id, group_name, sub_name, display_name, type, exclude_from_budget, sort_order)
    VALUES (?, 'Transfers', 'College Fund', 'Transfers: College Fund', 'transfer', 1,
      (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM categories WHERE group_id = ?))`).run(transferGroup, transferGroup).lastInsertRowid);
});

const users: Record<string, { userId: number; role: string }> = {
  owner: { userId: 1, role: 'owner' }, admin: { userId: 2, role: 'admin' },
  editor: { userId: 10, role: 'member' }, creator: { userId: 11, role: 'member' }, viewer: { userId: 12, role: 'member' },
};
type Res = { status: number; body: { data?: unknown; error?: string } };

async function call(user: string, method: string, url: string, body?: unknown): Promise<Res> {
  const { default: contributions } = await import('../src/routes/contributions.js');
  const { default: categories } = await import('../src/routes/categories.js');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as unknown as { user: unknown }).user = users[user]; next(); });
  app.use('/api/contributions', contributions);
  app.use('/api/categories', categories);
  // Quiet stand-in for the app's error handler, so a forced failure is a plain 500.
  app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(500).json({ error: 'failed' }); });
  const server = app.listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${url}`, {
      method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() as Res['body'] };
  } finally { server.close(); }
}

const create = (body: unknown, user = 'owner') => call(user, 'POST', '/api/contributions/setups', body);
const setupCount = () => (sql.prepare('SELECT COUNT(*) AS n FROM contribution_setups').get() as { n: number }).n;
const categoryCount = () => (sql.prepare('SELECT COUNT(*) AS n FROM categories').get() as { n: number }).n;

describe('creating a setup', () => {
  it('tracks an existing Transfers category with its accounts and the external choice', async () => {
    const res = await create({ categoryId: college, accountIds: [2, 4], external: true });
    expect(res.status).toBe(201);
    const setup = res.body.data as ContributionSetup;
    expect(setup).toMatchObject({
      category: { id: college, groupId: transferGroup, groupName: 'Transfers', name: 'College Fund' },
      accounts: [
        { id: 2, name: 'College 529', type: 'investment', isActive: true },
        { id: 4, name: 'Roth IRA', type: 'retirement', isActive: true },
      ],
      external: true,
    });
    const list = await call('owner', 'GET', '/api/contributions/setups');
    expect(list.body.data).toEqual([setup]);
  });

  it('stores "An account not in Ledger" on its own, never as an empty list', async () => {
    const res = await create({ categoryId: college, accountIds: [], external: true });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ accounts: [], external: true });
    expect(sql.prepare('SELECT includes_external FROM contribution_setups').get()).toEqual({ includes_external: 1 });
  });

  it('creates a new Transfers category and its setup in one request', async () => {
    const before = categoryCount();
    const res = await create({ newCategory: { groupId: transferGroup, subName: '  Retirement  ', emoji: '🏦' }, accountIds: [4], external: false });
    expect(res.status).toBe(201);
    const setup = res.body.data as ContributionSetup;
    expect(setup.category).toMatchObject({ groupId: transferGroup, groupName: 'Transfers', name: 'Retirement', emoji: '🏦' });
    expect(categoryCount()).toBe(before + 1);
    expect(sql.prepare('SELECT type, display_name, exclude_from_budget FROM categories WHERE id = ?').get(setup.category.id))
      .toEqual({ type: 'transfer', display_name: 'Transfers: Retirement', exclude_from_budget: 1 });
  });

  it('leaves no category behind when the setup fails after the category is made', async () => {
    const before = categoryCount();
    sql.exec("CREATE TEMP TRIGGER boom BEFORE INSERT ON contribution_setups BEGIN SELECT RAISE(ABORT, 'forced'); END;");
    const res = await create({ newCategory: { groupId: transferGroup, subName: 'Brokerage' }, accountIds: [2], external: false });
    expect(res.status).toBe(500);
    expect(categoryCount()).toBe(before);
    expect(sql.prepare("SELECT 1 FROM categories WHERE sub_name = 'Brokerage'").get()).toBeUndefined();
    expect(setupCount()).toBe(0);
  });

  it('allows one setup per category', async () => {
    expect((await create({ categoryId: college, accountIds: [2], external: false })).status).toBe(201);
    const again = await create({ categoryId: college, accountIds: [4], external: false });
    expect(again).toEqual({ status: 409, body: { error: 'This category is already tracked in Contributions.' } });
    expect(setupCount()).toBe(1);
  });

  it.each([
    ['an income or expense category', () => ({ categoryId: groceries, accountIds: [2], external: false }), 400, 'Only a Transfers category can be tracked as a contribution.'],
    ['a missing category', () => ({ categoryId: 99999, accountIds: [2], external: false }), 404, "That category doesn't exist."],
    ['no destination', () => ({ categoryId: college, accountIds: [], external: false }), 400, 'Choose at least one account.'],
    ['no destination fields at all', () => ({ categoryId: college }), 400, 'Choose at least one account.'],
    ['an unknown account', () => ({ categoryId: college, accountIds: [2, 999], external: false }), 400, "One of the chosen accounts isn't in Ledger."],
    ['a duplicate account', () => ({ categoryId: college, accountIds: [2, 2], external: false }), 400, 'Each account can only be chosen once.'],
    ['a malformed account list', () => ({ categoryId: college, accountIds: ['2'], external: false }), 400, 'Choose accounts from the list.'],
    ['an inactive account', () => ({ categoryId: college, accountIds: [3], external: false }), 400, 'Old Brokerage is inactive. Choose an active account.'],
    ['neither a category nor a new one', () => ({ accountIds: [2], external: false }), 400, 'Choose a Transfers category, or name a new one.'],
    ['both a category and a new one', () => ({ categoryId: college, newCategory: { groupId: transferGroup, subName: 'X' }, accountIds: [2], external: false }), 400, 'Choose a Transfers category, or name a new one.'],
    ['a new category outside Transfers', () => ({ newCategory: { groupId: incomeGroup, subName: 'Bonus' }, accountIds: [2], external: false }), 400, 'Choose a group in Transfers for the new category.'],
    ['a new category with no name', () => ({ newCategory: { groupId: transferGroup, subName: '  ' }, accountIds: [2], external: false }), 400, 'Enter a name for the new category.'],
    ['a new category name that clashes', () => ({ newCategory: { groupId: transferGroup, subName: 'college fund ' }, accountIds: [2], external: false }), 409, 'A category with that name already exists in this group.'],
  ])('refuses %s with a plain reason', async (_what, body, status, error) => {
    const before = categoryCount();
    expect(await create(body())).toEqual({ status, body: { error } });
    expect(setupCount()).toBe(0);
    expect(categoryCount()).toBe(before);
  });
});

describe('changing and stopping a setup', () => {
  it('replaces the destinations', async () => {
    const { id } = (await create({ categoryId: college, accountIds: [2], external: false })).body.data as ContributionSetup;
    const res = await call('owner', 'PUT', `/api/contributions/setups/${id}`, { accountIds: [4], external: true });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id, accounts: [{ id: 4 }], external: true });
    expect(await call('owner', 'PUT', `/api/contributions/setups/${id}`, { accountIds: [], external: false }))
      .toEqual({ status: 400, body: { error: 'Choose at least one account.' } });
    expect(await call('owner', 'PUT', '/api/contributions/setups/9999', { accountIds: [2], external: false }))
      .toEqual({ status: 404, body: { error: "That contribution isn't tracked." } });
  });

  it('keeps a deactivated destination, reported as inactive, but never adds one anew', async () => {
    const { id } = (await create({ categoryId: college, accountIds: [2, 4], external: false })).body.data as ContributionSetup;
    sql.prepare('UPDATE accounts SET is_active = 0 WHERE id = 2').run(); // accounts are only ever deactivated
    const listed = (await call('owner', 'GET', '/api/contributions/setups')).body.data as ContributionSetup[];
    expect(listed[0].accounts).toEqual([
      { id: 2, name: 'College 529', type: 'investment', isActive: false },
      { id: 4, name: 'Roth IRA', type: 'retirement', isActive: true },
    ]);
    // Saving the setup with the already-chosen inactive account is fine; adding another isn't.
    expect((await call('owner', 'PUT', `/api/contributions/setups/${id}`, { accountIds: [2], external: false })).status).toBe(200);
    expect(await call('owner', 'PUT', `/api/contributions/setups/${id}`, { accountIds: [2, 3], external: false }))
      .toEqual({ status: 400, body: { error: 'Old Brokerage is inactive. Choose an active account.' } });
  });

  it('stopping tracking removes only the setup', async () => {
    const { id } = (await create({ categoryId: college, accountIds: [2], external: true })).body.data as ContributionSetup;
    sql.prepare("INSERT INTO transactions (account_id, date, description, category_id, amount) VALUES (1, '2026-10-01', 'To 529', ?, 500)").run(college);
    sql.prepare("INSERT INTO category_rules (match_type, pattern, category_id) VALUES ('contains', '529', ?)").run(college);
    const dump = () => ({
      category: sql.prepare('SELECT * FROM categories WHERE id = ?').get(college),
      transactions: sql.prepare('SELECT * FROM transactions WHERE category_id = ?').all(college),
      rules: sql.prepare('SELECT * FROM category_rules WHERE category_id = ?').all(college),
    });
    const before = dump();
    expect(await call('owner', 'DELETE', `/api/contributions/setups/${id}`)).toEqual({ status: 200, body: { data: { id } } });
    expect(dump()).toEqual(before);
    expect(setupCount()).toBe(0);
    expect(sql.prepare('SELECT COUNT(*) AS n FROM contribution_setup_accounts').get()).toEqual({ n: 0 });
    expect((await call('owner', 'DELETE', `/api/contributions/setups/${id}`)).status).toBe(404);
  });
});

describe('protecting tracked categories', () => {
  it('refuses to delete a tracked category, and allows it once tracking stops', async () => {
    const { id } = (await create({ categoryId: college, accountIds: [2], external: false })).body.data as ContributionSetup;
    expect(await call('owner', 'DELETE', `/api/categories/${college}`))
      .toEqual({ status: 400, body: { error: 'Stop tracking this category in Contributions before you delete it.' } });
    await call('owner', 'DELETE', `/api/contributions/setups/${id}`);
    expect((await call('owner', 'DELETE', `/api/categories/${college}`)).status).toBe(200);
  });

  it('refuses to move a tracked category out of Transfers, but allows other edits', async () => {
    await create({ categoryId: college, accountIds: [2], external: false });
    const expenseGroup = (sql.prepare("SELECT id FROM category_groups WHERE type = 'expense' LIMIT 1").get() as { id: number }).id;
    for (const groupId of [expenseGroup, incomeGroup]) {
      expect(await call('owner', 'PUT', `/api/categories/${college}`, { groupId }))
        .toEqual({ status: 400, body: { error: 'Stop tracking this category in Contributions before you move it out of Transfers.' } });
    }
    expect(sql.prepare('SELECT type, group_id FROM categories WHERE id = ?').get(college)).toEqual({ type: 'transfer', group_id: transferGroup });
    // Renaming, or moving to another Transfers group, is still fine.
    const other = Number(sql.prepare("INSERT INTO category_groups (type, name) VALUES ('transfer', 'Investing')").run().lastInsertRowid);
    const res = await call('owner', 'PUT', `/api/categories/${college}`, { groupId: other, subName: 'College 529 Plan' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ type: 'transfer', group_id: other, sub_name: 'College 529 Plan' });
  });

  it('the categories list says which categories are tracked', async () => {
    await create({ categoryId: college, accountIds: [2], external: false });
    const rows = (await call('viewer', 'GET', '/api/categories')).body.data as { id: number; contribution_tracked: boolean }[];
    expect(rows.find((r) => r.id === college)?.contribution_tracked).toBe(true);
    expect(rows.filter((r) => r.contribution_tracked).map((r) => r.id)).toEqual([college]);
  });
});

describe('permissions', () => {
  it.each(['owner', 'admin'])('%s can do everything', async (user) => {
    const made = await create({ newCategory: { groupId: transferGroup, subName: `New ${user}` }, accountIds: [2], external: false }, user);
    expect(made.status).toBe(201);
    const { id } = made.body.data as ContributionSetup;
    expect((await call(user, 'GET', '/api/contributions/setups')).status).toBe(200);
    expect((await call(user, 'PUT', `/api/contributions/setups/${id}`, { accountIds: [4], external: false })).status).toBe(200);
    expect((await call(user, 'DELETE', `/api/contributions/setups/${id}`)).status).toBe(200);
  });

  it('a member with categories.edit manages setups but needs categories.create for a new category', async () => {
    const made = await create({ categoryId: college, accountIds: [2], external: false }, 'editor');
    expect(made.status).toBe(201);
    const { id } = made.body.data as ContributionSetup;
    expect((await call('editor', 'GET', '/api/contributions/setups')).status).toBe(200);
    expect((await call('editor', 'PUT', `/api/contributions/setups/${id}`, { accountIds: [4], external: false })).status).toBe(200);
    expect((await call('editor', 'DELETE', `/api/contributions/setups/${id}`)).status).toBe(200);

    const before = categoryCount();
    const refused = await create({ newCategory: { groupId: transferGroup, subName: 'Brokerage' }, accountIds: [2], external: false }, 'editor');
    expect(refused.status).toBe(403);
    expect(categoryCount()).toBe(before);
    expect(setupCount()).toBe(0);

    expect((await create({ newCategory: { groupId: transferGroup, subName: 'Brokerage' }, accountIds: [2], external: false }, 'creator')).status).toBe(201);
  });

  it('a member without categories.edit gets 403 on every endpoint', async () => {
    const { id } = (await create({ categoryId: college, accountIds: [2], external: false })).body.data as ContributionSetup;
    const attempts: [string, string, unknown?][] = [
      ['GET', '/api/contributions/setups'],
      ['POST', '/api/contributions/setups', { categoryId: canonical, accountIds: [2], external: false }],
      ['POST', '/api/contributions/setups', { newCategory: { groupId: transferGroup, subName: 'Brokerage' }, accountIds: [2], external: false }],
      ['PUT', `/api/contributions/setups/${id}`, { accountIds: [4], external: false }],
      ['DELETE', `/api/contributions/setups/${id}`],
    ];
    for (const [method, url, body] of attempts) {
      expect((await call('viewer', method, url, body)).status, `${method} ${url}`).toBe(403);
    }
    expect(setupCount()).toBe(1);
  });
});

describe('migration', () => {
  it('starts every category untracked, and a second startup changes nothing', async () => {
    expect(setupCount()).toBe(0);
    await create({ categoryId: college, accountIds: [2], external: true });
    const dump = () => ({
      setups: sql.prepare('SELECT * FROM contribution_setups').all(),
      accounts: sql.prepare('SELECT * FROM contribution_setup_accounts').all(),
      // Not sort_order: migrateCategorySortOrder re-sorts it on every boot (a separate, older behaviour).
      categories: sql.prepare('SELECT id, type, group_id, sub_name FROM categories ORDER BY id').all(),
    });
    const before = dump();
    const { runMigrations } = await import('../src/db/migrate.js');
    runMigrations(sql);
    expect(dump()).toEqual(before);
    expect(sql.pragma('foreign_key_check')).toEqual([]);
  });

  it('a folded duplicate Transfers > Transfer keeps its tracking on the canonical category', async () => {
    const { migrateTransferCategoryDedupe } = await import('../src/db/migrate-transfer-category-dedupe.js');
    const twin = () => Number(sql.prepare(`INSERT INTO categories (group_id, group_name, sub_name, display_name, type)
      VALUES (?, 'Transfers', 'Transfer', 'Transfers: Transfer', 'transfer')`).run(transferGroup).lastInsertRowid);
    const destinations = () => sql.prepare(`SELECT s.category_id, s.includes_external, sa.account_id
      FROM contribution_setups s LEFT JOIN contribution_setup_accounts sa ON sa.setup_id = s.id ORDER BY sa.account_id`).all();

    // Only the twin is tracked: its setup moves across.
    await create({ categoryId: twin(), accountIds: [2], external: false });
    migrateTransferCategoryDedupe(sql);
    expect(destinations()).toEqual([{ category_id: canonical, includes_external: 0, account_id: 2 }]);

    // Both are tracked: the twin's destinations join the canonical setup.
    await create({ categoryId: twin(), accountIds: [2, 4], external: true });
    migrateTransferCategoryDedupe(sql);
    expect(destinations()).toEqual([
      { category_id: canonical, includes_external: 1, account_id: 2 },
      { category_id: canonical, includes_external: 1, account_id: 4 },
    ]);
    expect(sql.pragma('foreign_key_check')).toEqual([]);
  });
});
