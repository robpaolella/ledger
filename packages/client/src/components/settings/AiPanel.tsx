import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../lib/api';
import { timeAgo } from '../../lib/formatters';
import { useToast } from '../../context/ToastContext';
import { Switch } from '../primitives';
import Spinner from '../Spinner';
import { Card, Field, LoadError, PanelHeader, inputCls, btnPrimary, btnSecondary } from './ui';

interface LlmConfig { enabled: boolean; baseUrl: string; model: string }

function OllamaCard({ config }: { config: LlmConfig }) {
  const { addToast } = useToast();
  const [enabled, setEnabled] = useState(config.enabled);
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [model, setModel] = useState(config.model);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ reachable: boolean; modelAvailable: boolean; latencyMs?: number; error?: string } | null>(null);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch('/llm/config', { method: 'PUT', body: JSON.stringify({ baseUrl, model }) });
      addToast('AI settings saved');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to save AI settings', 'error');
    } finally { setSaving(false); }
  };

  const toggle = async (next: boolean) => {
    setEnabled(next);
    try {
      await apiFetch('/llm/config', { method: 'PUT', body: JSON.stringify({ enabled: next }) });
      addToast(next ? 'AI categorization enabled' : 'AI categorization disabled');
    } catch {
      setEnabled(!next);
      addToast('Failed to update setting', 'error');
    }
  };

  const test = async () => {
    setTesting(true); setStatus(null);
    try {
      await apiFetch('/llm/config', { method: 'PUT', body: JSON.stringify({ baseUrl, model }) });
      const res = await apiFetch<{ data: { reachable: boolean; modelAvailable: boolean; latencyMs?: number; error?: string } }>('/llm/status');
      setStatus(res.data);
    } catch (err) {
      setStatus({ reachable: false, modelAvailable: false, error: err instanceof Error ? err.message : 'Failed' });
    } finally { setTesting(false); }
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-4 px-6 py-[18px] border-b border-line">
        <div className="min-w-0">
          <div className="text-[17px] font-extrabold tracking-tight text-content">AI categorization</div>
          <div className="text-[13px] text-content-3 mt-1 leading-snug max-w-[640px]">
            A local LLM reviews every transaction the rules aren&apos;t certain about — bank sync and CSV import — and learns from your corrections.
          </div>
        </div>
        <Switch checked={enabled} onChange={toggle} title="Enable AI categorization" />
      </div>
      <div className="px-6 py-5 flex flex-col gap-4 max-w-[560px]">
        <Field label="Ollama base URL">
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://192.168.1.50:11434"  className={`${inputCls} font-mono`} />
        </Field>
        <Field label="Model" hint="Any chat model Ollama has pulled, e.g. qwen3:4b.">
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="qwen3:4b"  className={`${inputCls} font-mono`} />
        </Field>
        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" onClick={save} disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={test} disabled={testing || !baseUrl} className={btnSecondary}>{testing ? 'Testing…' : 'Test connection'}</button>
          {status && (
            <span className={`text-[13px] font-semibold ${status.reachable && status.modelAvailable ? 'text-positive' : 'text-negative'}`}>
              {status.reachable
                ? status.modelAvailable ? `Connected · ${status.latencyMs}ms` : `Reachable, but model "${model}" not found`
                : `Unreachable${status.error ? ` — ${status.error}` : ''}`}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

interface AmazonStatus {
  enabled: boolean;
  lastIngestAt: string | null;
  dataDir: string;
  sidecar: { lastRun: string; ok: boolean; errorKind: string | null; message: string; sessionOk: boolean } | null;
  counts: { orders: number; charges: number; matched: number; enriched: number };
}

function AmazonCard() {
  const { addToast } = useToast();
  const [status, setStatus] = useState<AmazonStatus | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(() => {
    apiFetch<{ data: AmazonStatus }>('/amazon/status').then((res) => setStatus(res.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (next: boolean) => {
    setStatus((s) => s ? { ...s, enabled: next } : s);
    try {
      await apiFetch('/amazon/config', { method: 'PUT', body: JSON.stringify({ enabled: next }) });
      addToast(next ? 'Amazon integration enabled' : 'Amazon integration disabled');
    } catch {
      setStatus((s) => s ? { ...s, enabled: !next } : s);
      addToast('Failed to update setting', 'error');
    }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await apiFetch<{ data: { match?: { matched: number; ambiguous: number }; enrich?: { enriched: number; split: number } } }>('/amazon/run', { method: 'POST' });
      const m = res.data.match, e = res.data.enrich;
      addToast(`Amazon run complete — ${m?.matched ?? 0} matched, ${e?.enriched ?? 0} enriched (${e?.split ?? 0} split)`);
      load();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Amazon run failed', 'error');
    } finally { setRunning(false); }
  };

  const sessionExpired = status?.sidecar?.errorKind === 'auth';

  return (
    <Card>
      <div className="flex items-start justify-between gap-4 px-6 py-[18px] border-b border-line">
        <div className="min-w-0">
          <div className="text-[17px] font-extrabold tracking-tight text-content">Amazon orders</div>
          <div className="text-[13px] text-content-3 mt-1 leading-snug max-w-[640px]">
            Matches Amazon charges to your transactions and categorizes them from the actual items — splitting mixed orders by category.
          </div>
        </div>
        <Switch checked={status?.enabled ?? false} onChange={toggle} disabled={!status} title="Enable Amazon integration" />
      </div>
      <div className="px-6 py-5 flex flex-col gap-4">
        {status && (
          <div className="flex items-center gap-4 flex-wrap text-[13px]">
            <span className={`font-semibold ${status.sidecar ? (status.sidecar.sessionOk ? 'text-positive' : 'text-negative') : 'text-content-3'}`}>
              {status.sidecar ? (status.sidecar.sessionOk ? 'Scraper session OK' : 'Session expired') : 'Scraper has not run yet'}
            </span>
            {status.sidecar && <span className="text-content-3">Last scrape {timeAgo(status.sidecar.lastRun)}</span>}
            <span className="font-mono text-[12px] text-content-3">{status.counts.orders} orders · {status.counts.matched} matched · {status.counts.enriched} enriched</span>
          </div>
        )}
        {sessionExpired && (
          <div className="text-[13px] text-content-2 bg-surface-2 border border-line rounded-[12px] px-4 py-3 leading-relaxed">
            Re-login on the server: <code className="font-mono text-[12px]">~/.venvs/amazon/bin/amazon-orders login</code> — see <code className="font-mono text-[12px]">scripts/amazon/README.md</code>.
          </div>
        )}
        {status && !status.sidecar && (
          <div className="text-[13px] text-content-2 bg-surface-2 border border-line rounded-[12px] px-4 py-3 leading-relaxed">
            One-time setup lives in <code className="font-mono text-[12px]">scripts/amazon/README.md</code>; the scraper drops files into <code className="font-mono text-[12px] break-all">{status.dataDir}</code>.
          </div>
        )}
        <div>
          <button type="button" onClick={runNow} disabled={running || !status?.enabled} className={btnSecondary}>{running ? 'Running…' : 'Run now'}</button>
        </div>
      </div>
    </Card>
  );
}

/** Settings → AI (admins): the local-LLM categorizer and the Amazon order enrichment. */
export default function AiPanel() {
  const [config, setConfig] = useState<LlmConfig | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try { setConfig((await apiFetch<{ data: LlmConfig }>('/llm/config')).data); }
    catch { setLoadFailed(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-[22px]">
      <PanelHeader title="Optional extras" description="Optional helpers that run on your own hardware. Nothing leaves your network." />
      {loadFailed ? <LoadError onRetry={load} /> : !config ? <Card><Spinner /></Card> : (
        <>
          <OllamaCard config={config} />
          <AmazonCard />
        </>
      )}
    </div>
  );
}
