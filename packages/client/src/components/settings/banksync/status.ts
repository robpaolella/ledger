import type { DailySyncInfo } from '@ledger/shared';
import { plainWhen } from '../extras/when';
import type { Connection } from '../simplefin';

export type ConnStatus = 'working' | 'failed' | 'reconnect' | 'paused';

/** Display order of "worst": Reconnect needed, then Sync failed, then Paused, then Working. */
const RANK: Record<ConnStatus, number> = { working: 0, paused: 1, failed: 2, reconnect: 3 };

export const STATUS_META: Record<ConnStatus, { color: string; label: string }> = {
  working: { color: 'var(--positive)', label: 'Working' },
  failed: { color: 'var(--warning)', label: 'Sync failed' },
  reconnect: { color: 'var(--negative)', label: 'Reconnect needed' },
  paused: { color: 'var(--text-3)', label: 'Paused' },
};

export const SUMMARY: Record<ConnStatus, string> = {
  working: 'All connections are working.',
  paused: 'Connections are working. Daily sync is off.',
  failed: 'A connection couldn’t sync this morning.',
  reconnect: 'A connection needs to be reconnected.',
};

/** "5:31 am" from a stored ISO time. */
export function clock(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?([AP])M/, (_, p) => ` ${p.toLowerCase()}m`);
}

/** "5:30 am" from the server's HH:MM run time. */
export function runClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return '';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** Daily sync is off when the saved switch is off or the server forces it off. Unknown (not loaded) counts as on. */
export const dailyIsOff = (daily: DailySyncInfo | null) => !!daily && (!daily.enabled || daily.forcedOff);

export function statusOf(c: Connection, off: boolean): ConnStatus {
  const s = c.syncState?.status;
  if (s === 'reconnect_needed') return 'reconnect';
  if (s === 'failed') return 'failed';
  return off ? 'paused' : 'working';
}

export function worstStatus(conns: Connection[], off: boolean): ConnStatus {
  return conns.reduce<ConnStatus>((w, c) => (RANK[statusOf(c, off)] > RANK[w] ? statusOf(c, off) : w), off ? 'paused' : 'working');
}

/** The one plain line under a connection's name. Times and counts come from the server's sync state. */
export function statusLine(c: Connection, off: boolean, canManage: boolean, daily: DailySyncInfo | null): string {
  const st = c.syncState;
  const status = statusOf(c, off);
  if (status === 'reconnect') return `SimpleFIN didn’t accept the sign-in. ${canManage ? 'Paste a new setup token to reconnect.' : 'Ask an admin to reconnect.'}`;
  if (status === 'paused') return 'Daily sync is off. Sync now still works.';
  if (status === 'failed') {
    if (off) return 'Sync failed. Daily sync is off, so Ledger won’t retry on its own. Use Sync now.';
    if (st.gaveUp) {
      const next = daily?.runTime ? `tomorrow at ${runClock(daily.runTime)}` : 'tomorrow';
      return `Couldn’t reach SimpleFIN after ${st.triesToday} ${st.triesToday === 1 ? 'try' : 'tries'} today. Next try ${next}.`;
    }
    const what = st.kind === 'rate_limit' ? 'SimpleFIN’s daily request limit was reached.' : 'Couldn’t reach SimpleFIN.';
    return st.nextRetryAt ? `${what} Trying again at ${clock(st.nextRetryAt)}` : what;
  }
  const when = c.lastSyncedAt ? plainWhen(c.lastSyncedAt) : '';
  return when ? `Last synced ${when}` : 'Not synced yet';
}
