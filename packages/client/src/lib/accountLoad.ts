/**
 * What the account detail page should show once its load finishes.
 * Only a real "no such account" answer (the list came back without it, or the
 * server said 404) is `missing`; every other failure is `error`, so a flaky
 * connection never claims a real account was removed.
 */
export type AccountLoadResult<T> =
  | { state: 'found'; account: T }
  | { state: 'missing' }
  | { state: 'error' };

export function resolveAccountLoad<T>(accountFound: T | undefined): AccountLoadResult<T> {
  return accountFound === undefined ? { state: 'missing' } : { state: 'found', account: accountFound };
}

export function resolveAccountLoadError(err: unknown): AccountLoadResult<never> {
  const status = (err as { status?: unknown } | null)?.status;
  return status === 404 ? { state: 'missing' } : { state: 'error' };
}
