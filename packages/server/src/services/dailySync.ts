import type Database from 'better-sqlite3';
import type { ConnectionSyncState, DailySyncInfo } from '@ledger/shared/src/types.js';
import { getConfig, setConfig } from './appConfig.js';

/**
 * Daily-sync facts for Bank sync: the saved on/off, the last daily run, and
 * the next run / retry times. Retry facts come from the scheduler's memory
 * (RetrySnapshot) because that is what it will actually do: after a restart or
 * a new day it starts afresh, so nothing older is ever shown as current.
 */

export const LAST_SUCCESS_KEY = 'daily_sync.last_success'; // local YYYY-MM-DD
const ENABLED_KEY = 'daily_sync.enabled';                  // '0' = off; absent = on
const LAST_RUN_KEY = 'daily_sync.last_run';                // JSON DailyRun

export const localDate = (d = new Date()): string => d.toLocaleDateString('en-CA'); // YYYY-MM-DD

export const dailySyncForcedOff = (): boolean => process.env.DISABLE_DAILY_SYNC === '1';
const savedEnabled = (sqlite: Database.Database): boolean => getConfig(sqlite, ENABLED_KEY) !== '0';
export const dailySyncOn = (sqlite: Database.Database): boolean => !dailySyncForcedOff() && savedEnabled(sqlite);

export function setDailySyncEnabled(sqlite: Database.Database, enabled: boolean): void {
  setConfig(sqlite, ENABLED_KEY, enabled ? '1' : '0');
}

function runTime(): { hour: number; minute: number } {
  return { hour: Number(process.env.DAILY_SYNC_HOUR ?? 5), minute: Number(process.env.DAILY_SYNC_MINUTE ?? 30) };
}

/** The daily target time on `now`'s day plus `days`, in server time. */
export function targetAt(now: Date, days = 0): Date {
  const { hour, minute } = runTime();
  const t = new Date(now);
  t.setDate(t.getDate() + days);
  t.setHours(hour, minute, 0, 0);
  return t;
}

/** What the scheduler holds in memory for today. */
export interface RetrySnapshot {
  attempts: number;
  nextAttemptAt: number | null;            // null = gave up for today
  failedConnectionIds: number[] | null;    // null = next try is a full run
  failureCounts: Map<number, number>;
  authFailed: Set<number>;
}

type DailyRun = NonNullable<DailySyncInfo['lastRun']> & { day: string };

/**
 * Record a finished daily try. Retries re-fetch only the failed connections,
 * so a same-day retry adds its imports and updates the problem count but keeps
 * the day's connection total.
 */
export function recordDailyRun(
  sqlite: Database.Database,
  run: { day: string; transactionsImported: number; connections: number; connectionsWithProblems: number },
): void {
  const prev = readLastRun(sqlite);
  const sameDay = prev?.day === run.day;
  const next: DailyRun = {
    day: run.day,
    at: new Date().toISOString(),
    transactionsImported: run.transactionsImported + (sameDay ? prev.transactionsImported : 0),
    connections: sameDay ? prev.connections : run.connections,
    connectionsWithProblems: run.connectionsWithProblems,
  };
  setConfig(sqlite, LAST_RUN_KEY, JSON.stringify(next));
}

function readLastRun(sqlite: Database.Database): DailyRun | null {
  try {
    return JSON.parse(getConfig(sqlite, LAST_RUN_KEY) ?? 'null') as DailyRun | null;
  } catch {
    return null;
  }
}

/** Is this connection waiting on one of today's scheduler retries? */
const inRetry = (id: number, retry: RetrySnapshot | null): retry is RetrySnapshot =>
  !!retry && !!retry.failedConnectionIds?.includes(id) && !retry.authFailed.has(id);

/** When the scheduler next fetches everything (or every connection not in today's retries). */
function scheduledNext(sqlite: Database.Database, retry: RetrySnapshot | null, now: Date): { at: Date; reason: 'scheduled' | 'retry' } {
  if (getConfig(sqlite, LAST_SUCCESS_KEY) === localDate(now)) return { at: targetAt(now, 1), reason: 'scheduled' };
  if (retry && retry.attempts > 0) {
    // A run that failed outright retries everything; otherwise only the failed ones.
    if (retry.failedConnectionIds === null && retry.nextAttemptAt !== null) {
      return { at: new Date(retry.nextAttemptAt), reason: 'retry' };
    }
    return { at: targetAt(now, 1), reason: 'scheduled' };
  }
  const today = targetAt(now);
  return { at: today > now ? today : now, reason: 'scheduled' }; // past target: catch-up on the next tick
}

export function connectionSyncState(
  sqlite: Database.Database,
  row: { id: number; sync_status: string | null; sync_error_kind: string | null; sync_message: string | null; sync_attempt_at: string | null },
  retry: RetrySnapshot | null,
  now = new Date(),
): ConnectionSyncState {
  const state: ConnectionSyncState = {
    status: row.sync_status as ConnectionSyncState['status'],
    kind: row.sync_error_kind as ConnectionSyncState['kind'],
    message: row.sync_message,
    lastAttemptAt: row.sync_attempt_at,
    nextRetryAt: null,
    triesToday: retry?.failureCounts.get(row.id) ?? 0,
    gaveUp: false,
  };
  // Ledger only retries a plain failure, and only while daily sync is on.
  if (state.status !== 'failed' || !dailySyncOn(sqlite)) return state;
  if (inRetry(row.id, retry)) {
    state.gaveUp = retry.nextAttemptAt === null;
    state.nextRetryAt = (state.gaveUp ? targetAt(now, 1) : new Date(retry.nextAttemptAt!)).toISOString();
  } else {
    state.nextRetryAt = scheduledNext(sqlite, retry, now).at.toISOString();
  }
  return state;
}

/** Daily sync as seen by someone who can see `connectionIds`. */
export function dailySyncInfo(
  sqlite: Database.Database,
  connectionIds: number[],
  retry: RetrySnapshot | null,
  now = new Date(),
): DailySyncInfo {
  const { hour, minute } = runTime();
  const lastRun = readLastRun(sqlite);
  const info: DailySyncInfo = {
    enabled: savedEnabled(sqlite),
    forcedOff: dailySyncForcedOff(),
    runTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    lastRun: lastRun && {
      at: lastRun.at,
      transactionsImported: lastRun.transactionsImported,
      connections: lastRun.connections,
      connectionsWithProblems: lastRun.connectionsWithProblems,
    },
    nextRun: null,
  };
  if (!dailySyncOn(sqlite)) return info;

  if (connectionIds.some((id) => inRetry(id, retry))) {
    info.nextRun = retry!.nextAttemptAt === null
      ? { at: targetAt(now, 1).toISOString(), reason: 'gave_up' }
      : { at: new Date(retry!.nextAttemptAt).toISOString(), reason: 'retry' };
  } else {
    const next = scheduledNext(sqlite, retry, now);
    info.nextRun = { at: next.at.toISOString(), reason: next.reason };
  }
  return info;
}
