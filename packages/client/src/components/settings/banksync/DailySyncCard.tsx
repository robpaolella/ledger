import { useState } from 'react';
import type { DailySyncInfo } from '@ledger/shared';
import { apiFetch } from '../../../lib/api';
import { useToast } from '../../../context/ToastContext';
import { Switch } from '../../primitives';
import { Card, CardHeader, Pill } from '../ui';
import { clockTime } from '../extras/when';
import { STATUS_META, runClock } from './status';

/** "Today 5:31 am" / "Yesterday 5:30 am" / "Oct 3 5:30 am". */
function dayTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(at)) / 86_400_000);
  const clock = clockTime(iso);
  if (days === 0) return `Today ${clock}`;
  if (days === 1) return `Yesterday ${clock}`;
  if (days === -1) return `Tomorrow ${clock}`;
  return `${at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${clock}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function lastSyncText(last: DailySyncInfo['lastRun']): string {
  if (!last) return 'Not run yet';
  const result = last.connectionsWithProblems > 0
    ? `${last.connectionsWithProblems} of ${plural(last.connections, 'connection', 'connections')} had problems`
    : `${plural(last.transactionsImported, 'new transaction', 'new transactions')}`;
  return `${dayTime(last.at)} · ${result}`;
}

/** Null when nothing will run (off) or the server has no next run to report. */
function nextSyncText(daily: DailySyncInfo): string | null {
  if (!daily.enabled) return 'Off. Switch daily sync on to sync each morning.';
  const next = daily.nextRun;
  if (!next) return null;
  const tomorrow = `tomorrow ${runClock(daily.runTime)}`;
  if (next.reason === 'retry') return `Trying again at ${clockTime(next.at)}, then ${tomorrow}`;
  if (next.reason === 'gave_up') return `${dayTime(next.at)} (today’s retries ran out)`;
  return dayTime(next.at);
}

/** Settings → Bank sync: when daily sync runs, how the last run went, and the on/off switch for managers. */
export default function DailySyncCard({ daily, hasConnections, canManage, onReload }: {
  daily: DailySyncInfo | null;
  hasConnections: boolean;
  canManage: boolean;
  onReload: () => Promise<void>;
}) {
  const { addToast } = useToast();
  const [saving, setSaving] = useState(false);

  if (!hasConnections) {
    return (
      <Card>
        <CardHeader title="Daily sync" divider />
        <div className="px-4 md:px-6 py-5 text-[13px] text-content-3">Daily sync starts once a bank connection is added.</div>
      </Card>
    );
  }
  if (!daily) return null;

  const off = !daily.enabled || daily.forcedOff;
  const next = daily.forcedOff ? null : nextSyncText(daily);
  const rows: [string, string][] = [
    ['Runs', `Every day at ${runClock(daily.runTime)}, server time`],
    ['Last sync', lastSyncText(daily.lastRun)],
    ...(next ? [['Next sync', next] as [string, string]] : []),
  ];

  // Not `disabled` while saving: a disabled button drops keyboard focus.
  const toggle = async (value: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      await apiFetch('/simplefin/daily-sync', { method: 'PUT', body: JSON.stringify({ enabled: value }) });
      await onReload();
      addToast(value ? 'Daily sync is on' : 'Daily sync is off');
    } catch {
      addToast('Couldn’t change daily sync. Try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-4 px-4 md:px-6 py-4 md:py-[18px] border-b border-line">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-[17px] font-extrabold tracking-tight text-content">Daily sync</span>
            {off && <Pill color={STATUS_META.paused.color}><span className="w-[7px] h-[7px] rounded-full" style={{ background: 'currentColor' }} />{STATUS_META.paused.label}</Pill>}
          </div>
          <div className="text-[13px] text-content-3 mt-1 leading-snug max-w-[620px]">
            Each morning Ledger pulls new transactions and balances from every connection.
            {off && ' Daily sync is off. Sync now still works.'}
            {daily.forcedOff && ' Daily sync is turned off in the server’s settings.'}
          </div>
        </div>
        {canManage && !daily.forcedOff && <Switch checked={daily.enabled} onChange={toggle} title="Daily sync" />}
      </div>
      <dl className="m-0 px-4 md:px-6 py-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-4 py-2">
            <dt className="font-mono text-[11px] tracking-[0.1em] uppercase text-content-3 sm:w-[110px] shrink-0">{k}</dt>
            <dd className="m-0 text-sm text-content tabular">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="px-4 md:px-6 py-3.5 border-t border-line text-[12.5px] text-content-3 leading-snug">
        The morning run also refreshes investment benchmark prices and checks budgets for over-budget alerts.
        {!canManage && ' An admin manages connections and daily sync.'}
      </div>
    </Card>
  );
}
