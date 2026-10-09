/**
 * Create / update an account and apply its optional SimpleFIN link change.
 * Pure (the request function is passed in) so Settings and Accounts share it
 * and it can be tested without a browser.
 */

export type Request = <T = unknown>(path: string, init?: { method: string; body?: string }) => Promise<T>;

/** The slice of a SimpleFIN account the link step needs. */
export interface LinkableSfAccount {
  key: string;
  connectionId: number;
  simplefinAccountId: string;
  name: string;
  org: string;
  link: { id: number; accountId: number } | null;
}

/** The account was saved but the SimpleFIN link step failed. */
export class LinkStepError extends Error {
  accountId: number;
  constructor(accountId: number, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : 'unknown error';
    super(`The account was saved, but linking it to SimpleFIN failed: ${reason}. Save again to retry the link.`);
    this.name = 'LinkStepError';
    this.accountId = accountId;
  }
}

/**
 * `accountId` null creates the account; otherwise that account is updated.
 * `linkKey` undefined leaves the link alone, null removes it, a key links it.
 * Throws LinkStepError (with the saved account's id) if only the link failed.
 */
export async function saveAccountWithLink(
  request: Request,
  input: { accountId: number | null; data: unknown; linkKey: string | null | undefined; sfAccounts: LinkableSfAccount[] },
): Promise<{ accountId: number; created: boolean }> {
  const { data, linkKey, sfAccounts } = input;
  let accountId: number;
  const created = input.accountId === null;
  if (input.accountId === null) {
    const res = await request<{ data: { id: number } }>('/accounts', { method: 'POST', body: JSON.stringify(data) });
    accountId = res.data.id;
  } else {
    await request(`/accounts/${input.accountId}`, { method: 'PUT', body: JSON.stringify(data) });
    accountId = input.accountId;
  }

  // Link change: drop the previous link on this account (and on the target
  // SimpleFIN account, if it was linked elsewhere), then create the new one.
  if (linkKey !== undefined) {
    try {
      const previous = sfAccounts.find((s) => s.link?.accountId === accountId);
      if (previous?.link) await request(`/simplefin/links/${previous.link.id}`, { method: 'DELETE' });
      if (linkKey) {
        const target = sfAccounts.find((s) => s.key === linkKey);
        if (target) {
          if (target.link && target.link.accountId !== accountId) await request(`/simplefin/links/${target.link.id}`, { method: 'DELETE' });
          await request('/simplefin/links', { method: 'POST', body: JSON.stringify({ simplefinConnectionId: target.connectionId, simplefinAccountId: target.simplefinAccountId, accountId, simplefinAccountName: target.name, simplefinOrgName: target.org }) });
        }
      }
    } catch (err) {
      throw new LinkStepError(accountId, err);
    }
  }
  return { accountId, created };
}

/**
 * Remembers an account that was created but whose link step failed, so saving
 * the same form again updates it instead of creating a duplicate. Call
 * `reset()` when the form closes.
 */
export function createAccountSaver(request: Request) {
  let pendingId: number | null = null;
  return {
    async save(existingId: number | null, data: unknown, linkKey: string | null | undefined, sfAccounts: LinkableSfAccount[]) {
      const retrying = existingId === null && pendingId !== null;
      try {
        const res = await saveAccountWithLink(request, { accountId: existingId ?? pendingId, data, linkKey, sfAccounts });
        pendingId = null;
        return { accountId: res.accountId, created: res.created || retrying };
      } catch (err) {
        if (err instanceof LinkStepError && existingId === null) pendingId = err.accountId;
        throw err;
      }
    },
    reset() { pendingId = null; },
  };
}
