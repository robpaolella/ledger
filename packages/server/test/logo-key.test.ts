import assert from 'node:assert/strict';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const mocks = vi.hoisted(() => ({
  dataDir: `/tmp/ledger-logo-key-${process.pid}-${Date.now()}`,
  rows: [] as { id: number; domain: string; logo_url: string | null }[],
  fetchLogo: vi.fn(),
  configured: vi.fn(() => true),
  updates: [] as unknown[][],
}));

vi.mock('../src/db/index.js', () => ({
  dataDir: mocks.dataDir,
  sqlite: {
    prepare: vi.fn((statement: string) => ({
      get: () => statement.includes('SELECT id, domain, logo_url') ? mocks.rows[0] : undefined,
      all: () => statement.includes('WHERE logo_url IS NULL') ? mocks.rows : [],
      run: (...values: unknown[]) => { mocks.updates.push(values); },
    })),
  },
}));
vi.mock('../src/middleware/permissions.js', () => ({
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../src/services/institutionLogos.js', () => ({
  fetchInstitutionLogo: mocks.fetchLogo,
  fetchVendorLogo: mocks.fetchLogo,
  logoDevConfigured: mocks.configured,
}));
vi.mock('../src/db/migrate-financial-institutions.js', () => ({ migrateFinancialInstitutions: vi.fn() }));
vi.mock('../src/db/migrate-vendor-logos.js', () => ({ migrateVendorLogos: vi.fn() }));

import router from '../src/routes/financialInstitutions.js';
import { hydrate } from '../src/db/hydrate-institution-logos.js';
import { saveImageFromUrl } from '../src/services/uploads.js';

const rejectedKeyMessage = "The logo service isn't accepting this app's key. Check the key and try again.";

async function routeRequest(path: string): Promise<Response> {
  const app = express();
  app.use(express.json());
  app.use(router);
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    const address = server.address();
    assert(address && typeof address !== 'string');
    return await fetch(`http://127.0.0.1:${address.port}${path}`, { method: 'POST' });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

beforeEach(() => {
  mocks.rows = [{ id: 7, domain: 'example.com', logo_url: null }];
  mocks.fetchLogo.mockReset();
  mocks.configured.mockReturnValue(true);
  mocks.updates = [];
});
afterAll(() => rmSync(mocks.dataDir, { recursive: true, force: true }));

describe('logo.dev image downloads', () => {
  it('marks 401 and 403 as a rejected key, while 404 remains a normal miss', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 401 }));
      expect(await saveImageFromUrl('institution', 1, 'https://example.test')).toEqual({ url: null, keyRejected: true });
      globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 403 }));
      expect(await saveImageFromUrl('institution', 1, 'https://example.test')).toEqual({ url: null, keyRejected: true });
      globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 404 }));
      expect(await saveImageFromUrl('institution', 1, 'https://example.test')).toEqual({ url: null, keyRejected: false });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('saves a successful logo download', async () => {
    const originalFetch = globalThis.fetch;
    try {
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(png, { headers: { 'content-type': 'image/png' } }));
      expect(await saveImageFromUrl('institution', 8, 'https://example.test')).toEqual({ url: '/uploads/institution-8.png', keyRejected: false });
      expect(readdirSync(join(mocks.dataDir, 'uploads'))).toContain('institution-8.png');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('logo hydration', () => {
  it('stops after a rejected key rather than trying every domain', async () => {
    mocks.rows = [
      { id: 7, domain: 'example.com', logo_url: null },
      { id: 8, domain: 'example.org', logo_url: null },
    ];
    mocks.fetchLogo.mockResolvedValue({ url: null, keyRejected: true });

    await expect(hydrate('financial_institutions', mocks.fetchLogo)).resolves.toBe(true);
    expect(mocks.fetchLogo).toHaveBeenCalledTimes(1);
  });
});

describe('institution logo routes', () => {
  it('reports a rejected key and stops the bulk request after the first attempt', async () => {
    const key = 'pk_test_key_that_must_not_escape';
    mocks.rows = [
      { id: 7, domain: 'example.com', logo_url: null },
      { id: 8, domain: 'example.org', logo_url: null },
    ];
    mocks.fetchLogo.mockResolvedValue({ url: null, keyRejected: true });

    const response = await routeRequest('/hydrate-logos');
    const body = await response.json() as { error: string };
    expect(response.status).toBe(502);
    expect(body.error).toBe(rejectedKeyMessage);
    expect(body.error).not.toContain(key);
    expect(mocks.fetchLogo).toHaveBeenCalledTimes(1);
  });

  it('reports a rejected key from the single-logo route', async () => {
    mocks.fetchLogo.mockResolvedValue({ url: null, keyRejected: true });
    const response = await routeRequest('/7/refresh-logo');
    const body = await response.json() as { error: string };
    expect(response.status).toBe(502);
    expect(body.error).toBe(rejectedKeyMessage);
  });

  it('keeps a missing logo as a 404 response', async () => {
    mocks.fetchLogo.mockResolvedValue({ url: null, keyRejected: false });

    const response = await routeRequest('/7/refresh-logo');
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'No logo found for that domain' });
  });
});
