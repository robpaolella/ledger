import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../lib/api';
import Spinner from '../Spinner';
import { Card, LoadError, PanelHeader } from './ui';
import OllamaCard, { type LlmConfig } from './extras/OllamaCard';
import AmazonCard, { type AmazonStatus } from './extras/AmazonCard';
import BenchmarksCard, { type BenchmarksStatus } from './extras/BenchmarksCard';

interface Loaded { llm: LlmConfig; amazon: AmazonStatus; benchmarks: BenchmarksStatus }

const readAmazon = async () => (await apiFetch<{ data: AmazonStatus }>('/amazon/status')).data;

/** Settings → Optional extras (owners and admins): AI categorizing, Amazon order matching, Investment benchmarks. */
export default function AiPanel() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const [llm, amazon, benchmarks] = await Promise.all([
        apiFetch<{ data: LlmConfig }>('/llm/config').then((r) => r.data),
        readAmazon(),
        apiFetch<{ data: BenchmarksStatus }>('/benchmarks/status').then((r) => r.data),
      ]);
      setLoaded({ llm, amazon, benchmarks });
    } catch { setLoadFailed(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const reloadAmazon = useCallback(() => readAmazon().catch(() => null), []);

  return (
    <div className="flex flex-col gap-[22px]">
      <PanelHeader title="Optional extras" description="Helpers the owner or an admin can turn on. Setup steps are in Ledger’s documentation." />
      {loadFailed ? <LoadError onRetry={load} /> : !loaded ? <Card><Spinner /></Card> : (
        <>
          <OllamaCard config={loaded.llm} />
          <AmazonCard initial={loaded.amazon} reload={reloadAmazon} />
          <BenchmarksCard initial={loaded.benchmarks} />
        </>
      )}
    </div>
  );
}
