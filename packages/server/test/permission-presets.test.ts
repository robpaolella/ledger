import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ACCESS_PRESETS, PERMISSION_KEYS, accessLevelOf, presetPermissions } from '@ledger/shared';
import { DEFAULT_MEMBER_PERMISSIONS } from '../src/db/migrate-roles-permissions.js';

// permissions.ts opens the shared db handle on import, so point it at a scratch file first.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-permission-presets-'));
process.env.DATABASE_PATH = path.join(scratch, 'test.db');

let ALL_PERMISSIONS: readonly string[];
beforeAll(async () => {
  ({ ALL_PERMISSIONS } = await import('../src/middleware/permissions.js'));
});

const grant = (keys: readonly string[]) => Object.fromEntries(PERMISSION_KEYS.map((k) => [k, keys.includes(k)]));
const everyday = ACCESS_PRESETS.everyday.keys;

describe('permission keys', () => {
  it('match the server’s 18 keys exactly', () => {
    expect([...PERMISSION_KEYS].sort()).toEqual([...ALL_PERMISSIONS].sort());
    expect(PERMISSION_KEYS).toHaveLength(18);
  });

  it('Everyday is exactly the server’s default for a new member', () => {
    const defaults = Object.entries(DEFAULT_MEMBER_PERMISSIONS).filter(([, v]) => v === 1).map(([k]) => k);
    expect([...everyday].sort()).toEqual(defaults.sort());
  });

  it('Everything grants all 18 keys', () => {
    expect([...ACCESS_PRESETS.everything.keys].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });
});

describe('accessLevelOf', () => {
  it.each(['view', 'everyday', 'everything'] as const)('recognises the %s preset', (preset) => {
    expect(accessLevelOf(presetPermissions(preset))).toBe(preset);
    expect(accessLevelOf(grant(ACCESS_PRESETS[preset].keys))).toBe(preset);
  });

  it('treats nothing granted as View only', () => {
    expect(accessLevelOf(grant([]))).toBe('view');
    expect(accessLevelOf({})).toBe('view');
    expect(accessLevelOf(null)).toBe('view');
  });

  it('treats a partly granted compound switch as Custom', () => {
    expect(accessLevelOf(grant([...everyday, 'accounts.create']))).toBe('custom');
    expect(accessLevelOf(grant(ALL_PERMISSIONS.filter((k) => k !== 'assets.delete')))).toBe('custom');
  });

  it('treats one extra or one missing key as Custom', () => {
    expect(accessLevelOf(grant([...everyday, 'transactions.delete']))).toBe('custom');
    expect(accessLevelOf(grant(everyday.filter((k) => k !== 'balances.update')))).toBe('custom');
    expect(accessLevelOf(grant(['transactions.create']))).toBe('custom');
  });

  it('ignores keys the server does not know', () => {
    expect(accessLevelOf({ ...grant(everyday), 'something.else': true })).toBe('everyday');
  });
});

describe('presetPermissions', () => {
  it('sends all 18 keys, granting only the preset’s', () => {
    const perms = presetPermissions('everyday');
    expect(Object.keys(perms).sort()).toEqual([...ALL_PERMISSIONS].sort());
    expect(Object.entries(perms).filter(([, v]) => v).map(([k]) => k).sort()).toEqual([...everyday].sort());
  });
});
