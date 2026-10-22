import { afterEach, describe, expect, it, vi } from 'vitest';
import { networkErrorMessage, NETWORK_ERROR_MESSAGE } from '../../client/src/lib/networkError';
import { fetchAccounts, claimAccessUrl, BANK_UNREACHABLE_MESSAGE } from '../src/services/simplefin';

afterEach(() => vi.unstubAllGlobals());

describe('networkErrorMessage', () => {
  it('replaces the browser wording with plain English', () => {
    for (const raw of ['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.']) {
      const msg = networkErrorMessage(new TypeError(raw));
      expect(msg).toBe(NETWORK_ERROR_MESSAGE);
      expect(msg).not.toMatch(/failed|fetch/i);
    }
  });

  it('keeps an intentional abort as an abort', () => {
    expect(networkErrorMessage({ name: 'AbortError' })).toBeNull();
  });
});

describe('SimpleFIN network failure', () => {
  it('says the bank could not be reached, not "fetch failed"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(fetchAccounts('https://u:p@bridge.example/simplefin')).rejects.toThrow(BANK_UNREACHABLE_MESSAGE);
    await expect(claimAccessUrl(Buffer.from('https://bridge.example/claim').toString('base64'))).rejects.toThrow(BANK_UNREACHABLE_MESSAGE);
  });

  it('does not call a malformed setup token a connection problem', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const err = await claimAccessUrl(Buffer.from('not-a-url').toString('base64')).catch((e) => e);
    expect(err.message).not.toBe(BANK_UNREACHABLE_MESSAGE);
  });
});
