import { describe, expect, it } from 'vitest';
import { LinkStepError, saveAccountWithLink, type LinkableSfAccount, type Request } from '../../client/src/lib/accounts';

type Call = { path: string; method?: string; body?: unknown };

function fakeRequest(opts: { failOn?: string } = {}) {
  const calls: Call[] = [];
  const request: Request = async (path, init) => {
    calls.push({ path, method: init?.method, body: init?.body ? JSON.parse(init.body) : undefined });
    if (opts.failOn && `${init?.method} ${path}` === opts.failOn) throw new Error('Bank bridge unavailable');
    return { data: { id: 42 } } as never;
  };
  return { request, calls };
}

const data = { name: 'Everyday Checking' };
const target: LinkableSfAccount = { key: '1:abc', connectionId: 1, simplefinAccountId: 'abc', name: 'Checking', org: 'Sample Bank', link: null };

describe('saveAccountWithLink', () => {
  it('creates an account and nothing else when the link is untouched', async () => {
    const { request, calls } = fakeRequest();
    const res = await saveAccountWithLink(request, { accountId: null, data, linkKey: undefined, sfAccounts: [target] });
    expect(res).toEqual({ accountId: 42, created: true });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /accounts']);
  });

  it('creates an account and links it to the chosen SimpleFIN account', async () => {
    const { request, calls } = fakeRequest();
    await saveAccountWithLink(request, { accountId: null, data, linkKey: target.key, sfAccounts: [target] });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /accounts', 'POST /simplefin/links']);
    expect(calls[1].body).toMatchObject({ simplefinConnectionId: 1, simplefinAccountId: 'abc', accountId: 42, simplefinAccountName: 'Checking', simplefinOrgName: 'Sample Bank' });
  });

  it('updates an existing account and replaces its old link', async () => {
    const { request, calls } = fakeRequest();
    const old: LinkableSfAccount = { ...target, key: '1:old', simplefinAccountId: 'old', link: { id: 7, accountId: 5 } };
    const taken: LinkableSfAccount = { ...target, key: '1:taken', simplefinAccountId: 'taken', link: { id: 8, accountId: 9 } };
    await saveAccountWithLink(request, { accountId: 5, data, linkKey: taken.key, sfAccounts: [old, taken] });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['PUT /accounts/5', 'DELETE /simplefin/links/7', 'DELETE /simplefin/links/8', 'POST /simplefin/links']);
  });

  it('removes the link when linkKey is null', async () => {
    const { request, calls } = fakeRequest();
    const old: LinkableSfAccount = { ...target, link: { id: 7, accountId: 5 } };
    await saveAccountWithLink(request, { accountId: 5, data, linkKey: null, sfAccounts: [old] });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['PUT /accounts/5', 'DELETE /simplefin/links/7']);
  });

  it('reports the saved account id when only the link step fails', async () => {
    const { request } = fakeRequest({ failOn: 'POST /simplefin/links' });
    const err = await saveAccountWithLink(request, { accountId: null, data, linkKey: target.key, sfAccounts: [target] }).catch((e) => e);
    expect(err).toBeInstanceOf(LinkStepError);
    expect(err.accountId).toBe(42);
    expect(err.message).toContain('Bank bridge unavailable');
  });

  it('a retry with the returned id updates instead of creating a duplicate', async () => {
    const { request, calls } = fakeRequest();
    await saveAccountWithLink(request, { accountId: 42, data, linkKey: target.key, sfAccounts: [target] });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['PUT /accounts/42', 'POST /simplefin/links']);
  });

  it('lets a failed create propagate as a plain error (nothing saved)', async () => {
    const { request } = fakeRequest({ failOn: 'POST /accounts' });
    const err = await saveAccountWithLink(request, { accountId: null, data, linkKey: undefined, sfAccounts: [] }).catch((e) => e);
    expect(err).not.toBeInstanceOf(LinkStepError);
    expect(err.message).toBe('Bank bridge unavailable');
  });
});
