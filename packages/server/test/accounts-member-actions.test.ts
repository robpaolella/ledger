import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import express from 'express';
import {
  NO_ADD_ACCOUNT, NO_ADD_ASSET, NO_EDIT_ASSET, actionState,
} from '../../client/src/lib/permissionState';

// A member without the permission sees Add account / asset Add / pencil disabled with a reason
// (actionState), and the server still refuses the same actions with 403. Runs on an in-memory
// database holding only a member with no grants; data/ is never opened.
const handle = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('../src/db/index.js', async () => {
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const schema = await import('../src/db/schema.js');
  return {
    get sqlite() { return handle.current; },
    get db() { return drizzle(handle.current as Database.Database, { schema }); },
  };
});
// The real uploads service creates its folder under data/, so it is replaced.
vi.mock('../src/services/uploads.js', () => ({ saveImage: () => '', deleteImage: () => {} }));

describe('actionState', () => {
  it('leaves an allowed action enabled, with no reason', () => {
    expect(actionState(true, NO_ADD_ACCOUNT)).toEqual({ disabled: false });
  });
  it.each([NO_ADD_ACCOUNT, NO_ADD_ASSET, NO_EDIT_ASSET])('disables a denied action and gives the reason: %s', (reason) => {
    expect(actionState(false, reason)).toEqual({ disabled: true, reason });
  });
});

describe('member without permission', () => {
  let server: ReturnType<express.Express['listen']>;
  let base: string;
  beforeAll(async () => {
    const sqlite = new Database(':memory:');
    sqlite.exec('CREATE TABLE user_permissions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, permission TEXT NOT NULL, granted INTEGER NOT NULL DEFAULT 0)');
    handle.current = sqlite;
    const { default: accounts } = await import('../src/routes/accounts.js');
    const { default: assets } = await import('../src/routes/assets.js');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { userId: 7, role: 'member' } as never; next(); });
    app.use('/accounts', accounts);
    app.use('/assets', assets);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => { server?.close(); });

  it.each([
    ['POST', '/accounts', 'accounts.create'],
    ['POST', '/assets', 'assets.create'],
    ['PUT', '/assets/1', 'assets.edit'],
  ])('still gets 403 from %s %s', async (method, url, key) => {
    const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { requiredPermission: string }).requiredPermission).toBe(key);
  });
});
