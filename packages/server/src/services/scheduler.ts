import { sqlite } from '../db/index.js';
import {
  runSyncPipeline,
  commitSync,
  withSyncLock,
  isSyncInFlight,
  type ConnectionFailure,
} from './simplefinSync.js';
import { notifySyncFailure } from './notifications.js';
import { syncBenchmarkPrices } from './benchmarks.js';
import { checkBudgetExceeded } from './budgetAlerts.js';

/**
 * Daily SimpleFIN auto-pull with an at-least-once guarantee.
 *
 * Durable state: app_config key 'daily_sync.last_success' = local YYYY-MM-DD
 * of the last fully-successful run. A minute tick fires the run once the
 * local target time (DAILY_SYNC_HOUR:DAILY_SYNC_MINUTE, default 05:30)
 * passes and today hasn't succeeded — so a server booted at 9pm with a stale
 * marker catches up within seconds of start (boot tick at 15s).
 *
 * Failures retry with backoff [15m, 1h, 3h, 6h], re-fetching ONLY the failed
 * connections (protects the ~24 req/day/connection SimpleFIN budget — worst
 * case 5 scheduler requests per connection per day). Auth failures don't
 * retry (a retry can't fix expired auth) and notify immediately; other kinds
 * notify after the 2nd consecutive failure, and again when retries exhaust.
 * A missed day widens the next run's fetch window, so data is never lost —
 * "at least once per day the server is up".
 */

const BACKOFF_MS = [15 * 60_000, 60 * 60_000, 3 * 60 * 60_000, 6 * 60 * 60_000];
const LAST_SUCCESS_KEY = 'daily_sync.last_success';

const localDate = (d = new Date()): string => d.toLocaleDateString('en-CA'); // YYYY-MM-DD

function getConfig(key: string): string | null {
  const row = sqlite.prepare('SELECT value FROM app_config WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setConfig(key: string, value: string): void {
  sqlite.prepare(
    'INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value);
}

interface DayState {
  day: string;
  attempts: number;
  nextAttemptAt: number;            // epoch ms gate for the next try
  failedConnectionIds: number[] | null; // null = full run (first attempt)
  failureCounts: Map<number, number>;   // consecutive failures per connection today
  authFailed: Set<number>;              // no more retries today
  ancillaryRan: boolean;                // benchmarks + budget sweep once per day
}

let state: DayState | null = null;
let running = false;

function freshState(day: string): DayState {
  return {
    day,
    attempts: 0,
    nextAttemptAt: 0,
    failedConnectionIds: null,
    failureCounts: new Map(),
    authFailed: new Set(),
    ancillaryRan: false,
  };
}

function computeWindow(today: string): { startDate: string; endDate: string } {
  const last = getConfig(LAST_SUCCESS_KEY);
  const t = new Date(`${today}T00:00:00`);
  const minus = (days: number) => {
    const d = new Date(t);
    d.setDate(d.getDate() - days);
    return localDate(d);
  };
  // Default window one week; a stale last-success widens it (5-day grace
  // behind the marker for late-posting transactions), floored at 90 days.
  let start = minus(7);
  if (last) {
    const lastDate = new Date(`${last}T00:00:00`);
    lastDate.setDate(lastDate.getDate() - 5);
    const graced = localDate(lastDate);
    if (graced < start) start = graced;
  } else {
    start = minus(30); // first ever run: backfill a month
  }
  const floor = minus(90);
  if (start < floor) start = floor;
  return { startDate: start, endDate: today };
}

function handleFailures(failures: ConnectionFailure[], exhausted: boolean): void {
  if (!state) return;
  for (const f of failures) {
    const count = (state.failureCounts.get(f.connectionId) ?? 0) + 1;
    state.failureCounts.set(f.connectionId, count);
    if (f.kind === 'auth') state.authFailed.add(f.connectionId);
    // Anti-noise: transient blips get one silent retry. Auth is immediately
    // actionable; everything else notifies on the 2nd consecutive failure or
    // when today's retries are spent.
    if (f.kind === 'auth' || count >= 2 || exhausted) {
      try {
        notifySyncFailure(sqlite, f);
      } catch (err) {
        console.error('[daily-sync] failed to write sync_failure notification:', err);
      }
    }
  }
}

async function runOnce(): Promise<void> {
  if (!state) return;
  const today = state.day;
  const { startDate, endDate } = computeWindow(today);
  state.attempts += 1;

  const retryScope = state.failedConnectionIds?.filter((id) => !state!.authFailed.has(id));
  const result = await withSyncLock(() =>
    runSyncPipeline({
      userId: null, // system scope: every connection (shared + personal)
      connectionIds: retryScope && retryScope.length > 0 ? retryScope : undefined,
      respectAutoImport: true, // per-link toggle gates transactions; balances always sync
      startDate,
      endDate,
    }),
  );

  // Auto-commit mirrors the ManualImportModal quick path: everything except
  // exact duplicates; uncategorized/low-confidence rows land in the review queue.
  const txns = result.transactions
    .filter((t) => t.duplicateStatus !== 'exact')
    .map((t) => ({
      simplefinId: t.simplefinId,
      accountId: t.accountId,
      date: t.date,
      description: t.description,
      rawDescription: t.rawDescription,
      amount: t.amount,
      categoryId: t.suggestedCategoryId ?? undefined,
      confidence: t.confidence,
    }));
  const commit = commitSync({
    transactions: txns,
    balanceUpdates: result.balanceUpdates.map((b) => ({
      accountId: b.accountId,
      balance: b.currentBalance,
      date: b.balanceDate,
    })),
    holdingsUpdates: result.holdingsUpdates,
  });

  // Ancillary daily work — never fails the sync.
  if (!state.ancillaryRan) {
    state.ancillaryRan = true;
    try {
      await syncBenchmarkPrices(sqlite);
    } catch (err) {
      console.error('[daily-sync] benchmark sync failed:', err);
    }
    try {
      checkBudgetExceeded(sqlite, { month: today.slice(0, 7) });
    } catch (err) {
      console.error('[daily-sync] budget sweep failed:', err);
    }
  }

  const stillFailing = result.failures.map((f) => f.connectionId);
  if (result.failures.length === 0) {
    setConfig(LAST_SUCCESS_KEY, today);
    state.failedConnectionIds = null;
    console.log(
      `[daily-sync] ${today} ok — ${commit.transactionsImported} txns, ` +
      `${commit.balancesUpdated} balances, ${commit.holdingsUpdated} holdings (window ${startDate}..${endDate})`,
    );
    return;
  }

  // Partial: succeeded connections' data is already committed. Schedule a
  // retry for the failures (auth excluded — it can't self-heal today).
  const retryable = result.failures.filter((f) => f.kind !== 'auth');
  const exhausted = state.attempts > BACKOFF_MS.length || retryable.length === 0;
  handleFailures(result.failures, exhausted);
  state.failedConnectionIds = stillFailing;

  if (exhausted) {
    // Give up until tomorrow's target; the stale marker widens that window.
    state.nextAttemptAt = Number.MAX_SAFE_INTEGER;
    console.error(`[daily-sync] ${today} gave up after ${state.attempts} attempt(s); failed connections: ${stillFailing.join(', ')}`);
  } else {
    const delay = BACKOFF_MS[Math.min(state.attempts - 1, BACKOFF_MS.length - 1)];
    state.nextAttemptAt = Date.now() + delay;
    console.warn(`[daily-sync] ${today} attempt ${state.attempts} had ${result.failures.length} failure(s); retrying in ${Math.round(delay / 60000)}m`);
  }
}

async function tick(): Promise<void> {
  if (running || isSyncInFlight()) return; // a manual sync is running — next minute
  const today = localDate();
  if (!state || state.day !== today) state = freshState(today);
  if (getConfig(LAST_SUCCESS_KEY) === today) return; // done for the day

  const hour = Number(process.env.DAILY_SYNC_HOUR ?? 5);
  const minute = Number(process.env.DAILY_SYNC_MINUTE ?? 30);
  const target = new Date();
  target.setHours(hour, minute, 0, 0);
  if (Date.now() < target.getTime() || Date.now() < state.nextAttemptAt) return;

  running = true;
  try {
    await runOnce();
  } catch (err) {
    // Unexpected top-level failure (not a per-connection error): back off too.
    console.error('[daily-sync] run failed:', err);
    state.nextAttemptAt = Date.now() + BACKOFF_MS[Math.min(state.attempts - 1, BACKOFF_MS.length - 1)];
  } finally {
    running = false;
  }
}

/** Force a run now (testing/dev) regardless of target time or success marker. */
export async function runDailySyncNow(): Promise<void> {
  const today = localDate();
  if (!state || state.day !== today) state = freshState(today);
  state.nextAttemptAt = 0;
  running = true;
  try {
    await runOnce();
  } finally {
    running = false;
  }
}

export function startDailyScheduler(): void {
  if (process.env.DISABLE_DAILY_SYNC === '1') {
    console.log('[daily-sync] disabled via DISABLE_DAILY_SYNC=1');
    return;
  }
  const interval = setInterval(() => { void tick(); }, 60_000);
  interval.unref();
  const boot = setTimeout(() => { void tick(); }, 15_000);
  boot.unref();
  console.log(
    `[daily-sync] scheduler armed — daily at ${String(process.env.DAILY_SYNC_HOUR ?? 5).padStart(2, '0')}:` +
    `${String(process.env.DAILY_SYNC_MINUTE ?? 30).padStart(2, '0')} local, boot catch-up in 15s`,
  );
}
