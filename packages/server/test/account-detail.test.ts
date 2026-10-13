import { describe, expect, it } from 'vitest';
import { resolveAccountLoad, resolveAccountLoadError } from '../../client/src/lib/accountLoad';

describe('resolveAccountLoad', () => {
  it('finds the account when the list includes it', () => {
    expect(resolveAccountLoad({ accountId: 1 })).toEqual({ state: 'found', account: { accountId: 1 } });
  });
  it('says missing when the list came back without it', () => {
    expect(resolveAccountLoad(undefined)).toEqual({ state: 'missing' });
  });
});

describe('resolveAccountLoadError', () => {
  it('treats a 404 as a missing account', () => {
    expect(resolveAccountLoadError({ status: 404 })).toEqual({ state: 'missing' });
  });
  it.each([[{ status: 500 }], [{ status: 403 }], [new TypeError('Failed to fetch')], [null], [undefined]])(
    'treats any other failure as an error (%j)', (err) => {
      expect(resolveAccountLoadError(err)).toEqual({ state: 'error' });
    });
});
