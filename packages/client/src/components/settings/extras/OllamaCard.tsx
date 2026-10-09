import { useState } from 'react';
import { apiFetch } from '../../../lib/api';
import { useToast } from '../../../context/ToastContext';
import { Field, inputCls, btnPrimary, btnSecondary } from '../ui';
import ExtraCard from './ExtraCard';

export interface LlmConfig { enabled: boolean; baseUrl: string; model: string }
interface LlmStatus { reachable: boolean; modelAvailable: boolean; latencyMs?: number; saveError?: string }

const save = (body: object) => apiFetch('/llm/config', { method: 'PUT', body: JSON.stringify(body) });

export default function OllamaCard({ config }: { config: LlmConfig }) {
  const { addToast } = useToast();
  const [enabled, setEnabled] = useState(config.enabled);
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [model, setModel] = useState(config.model);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<LlmStatus | null>(null);

  const onSave = async () => {
    setSaving(true);
    try {
      await save({ baseUrl, model });
      addToast('AI categorizing settings saved');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Couldn’t save the AI categorizing settings', 'error');
    } finally { setSaving(false); }
  };

  const toggle = async (next: boolean) => {
    setEnabled(next);
    try {
      await save({ enabled: next });
      addToast(next ? 'AI categorizing is on' : 'AI categorizing is off');
    } catch {
      setEnabled(!next);
      addToast('Couldn’t change AI categorizing. Try again.', 'error');
    }
  };

  const test = async () => {
    setTesting(true); setStatus(null);
    try {
      await save({ baseUrl, model });
      setStatus((await apiFetch<{ data: LlmStatus }>('/llm/status')).data);
    } catch (err) {
      setStatus({ reachable: false, modelAvailable: false, saveError: err instanceof Error ? err.message : undefined });
    } finally { setTesting(false); }
  };

  const ok = status?.reachable && status.modelAvailable;
  const result = !status ? null
    : ok ? `Connected · ${status.latencyMs} ms`
    : status.reachable ? `Connected, but the Ollama server doesn’t have “${model}”.`
    : status.saveError ?? 'Couldn’t reach the Ollama server at that address.';

  return (
    <ExtraCard
      title="AI categorizing"
      description="A local AI model on your own network suggests a category when the rules aren’t sure, for bank sync and CSV imports."
      switchProps={{ checked: enabled, onChange: toggle }}
    >
      <div className="px-4 md:px-6 py-5 flex flex-col gap-4 max-w-[560px]">
        <Field label="Ollama address">
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://192.168.1.50:11434" className={`${inputCls} font-mono`} />
        </Field>
        <Field label="Model" hint="Any chat model the Ollama server has downloaded.">
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="qwen3:4b" className={`${inputCls} font-mono`} />
        </Field>
        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" onClick={onSave} disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={test} disabled={testing || !baseUrl} className={btnSecondary}>{testing ? 'Testing…' : 'Test connection'}</button>
          {result && <span className={`text-[13px] font-semibold ${ok ? 'text-positive' : 'text-negative'}`}>{result}</span>}
        </div>
      </div>
    </ExtraCard>
  );
}
