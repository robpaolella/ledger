import { useState } from 'react';
import { apiFetch } from '../../../lib/api';
import { useToast } from '../../../context/ToastContext';
import { btnSecondary } from '../ui';
import ExtraCard from './ExtraCard';
import { plainWhen } from './when';

export interface AmazonStatus {
  enabled: boolean;
  lastMatchAt: string | null;
  lastMatchCount: number | null;
  sidecar: { errorKind: string | null } | null;
}

const code = 'font-mono text-[12px]';

export default function AmazonCard({ initial, reload }: { initial: AmazonStatus; reload: () => Promise<AmazonStatus | null> }) {
  const { addToast } = useToast();
  const [status, setStatus] = useState(initial);
  const [running, setRunning] = useState(false);

  const description = 'Matches Amazon orders to your transactions and categorizes them from the items bought.';
  if (!status.sidecar) return <ExtraCard title="Amazon order matching" description={description} notSetUp />;

  const toggle = async (next: boolean) => {
    setStatus((s) => ({ ...s, enabled: next }));
    try {
      await apiFetch('/amazon/config', { method: 'PUT', body: JSON.stringify({ enabled: next }) });
      addToast(next ? 'Amazon order matching is on' : 'Amazon order matching is off');
    } catch {
      setStatus((s) => ({ ...s, enabled: !next }));
      addToast('Couldn’t change Amazon order matching. Try again.', 'error');
    }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await apiFetch<{ data: { match?: { matched: number }; enrich?: { enriched: number; split: number } } }>('/amazon/run', { method: 'POST' });
      const m = res.data.match?.matched ?? 0, e = res.data.enrich;
      addToast(`Amazon run complete — ${m} matched, ${e?.enriched ?? 0} enriched (${e?.split ?? 0} split)`);
      const fresh = await reload();
      if (fresh) setStatus(fresh);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'The Amazon run failed', 'error');
    } finally { setRunning(false); }
  };

  const when = plainWhen(status.lastMatchAt);
  const line = !status.enabled ? 'Off. Turn it on to run it each morning.'
    : !when ? 'Not matched yet'
    : `Last matched ${when}${status.lastMatchCount == null ? '' : ` · ${status.lastMatchCount} ${status.lastMatchCount === 1 ? 'order' : 'orders'} matched`}`;

  return (
    <ExtraCard title="Amazon order matching" description={description} switchProps={{ checked: status.enabled, onChange: toggle }}>
      <div className="px-4 md:px-6 py-4 flex flex-col gap-3">
        <div className="text-[13px] text-content-2">{line}</div>
        {status.sidecar.errorKind === 'auth' && (
          <div className="text-[13px] text-content-2 bg-surface-2 border border-line rounded-[12px] px-4 py-3 leading-relaxed">
            <span className="font-semibold text-negative">Session expired.</span> Re-login on the server: <code className={code}>~/.venvs/amazon/bin/amazon-orders login</code> — see <code className={code}>scripts/amazon/README.md</code>.
          </div>
        )}
        <div>
          <button type="button" onClick={runNow} disabled={running || !status.enabled} className={btnSecondary}>{running ? 'Running…' : 'Run now'}</button>
        </div>
      </div>
    </ExtraCard>
  );
}
