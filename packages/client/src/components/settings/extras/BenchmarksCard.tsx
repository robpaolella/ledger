import { useState } from 'react';
import { apiFetch } from '../../../lib/api';
import { useToast } from '../../../context/ToastContext';
import ExtraCard from './ExtraCard';
import { plainWhen } from './when';

export interface BenchmarksStatus { configured: boolean; enabled: boolean; lastUpdatedAt: string | null }

export default function BenchmarksCard({ initial }: { initial: BenchmarksStatus }) {
  const { addToast } = useToast();
  const [enabled, setEnabled] = useState(initial.enabled);

  const description = 'Compares your investments with market indexes on the Investments page.';
  if (!initial.configured) return <ExtraCard title="Investment benchmarks" description={description} notSetUp />;

  const toggle = async (next: boolean) => {
    setEnabled(next);
    try {
      await apiFetch('/benchmarks/config', { method: 'PUT', body: JSON.stringify({ enabled: next }) });
      addToast(next ? 'Investment benchmarks are on' : 'Investment benchmarks are off');
    } catch {
      setEnabled(!next);
      addToast('Couldn’t change investment benchmarks. Try again.', 'error');
    }
  };

  const when = plainWhen(initial.lastUpdatedAt);
  const line = !enabled ? 'Off. Turn it on to run it each morning.' : when ? `Prices last updated ${when}` : 'Prices not updated yet';

  return (
    <ExtraCard title="Investment benchmarks" description={description} switchProps={{ checked: enabled, onChange: toggle }}>
      <div className="px-4 md:px-6 py-4 text-[13px] text-content-2">{line}</div>
    </ExtraCard>
  );
}
