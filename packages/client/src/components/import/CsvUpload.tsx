/** CSV Import · Step 1 — Upload File (docs/Import Flow §CSV IMPORT step 1). */
import { useRef, useState } from 'react';

interface AccountOpt { id: number; name: string; last_four: string | null }

export default function CsvUpload({
  accounts, accountId, onAccountChange, onFile,
}: {
  accounts: AccountOpt[];
  accountId: number | '';
  onAccountChange: (id: number | '') => void;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div>
      <div className="font-mono text-[11px] tracking-[0.08em] uppercase text-content-3 mb-2">Import to account</div>
      <div className="relative max-w-[360px] mb-[22px]">
        <select
          value={accountId}
          onChange={(e) => onAccountChange(e.target.value ? parseInt(e.target.value, 10) : '')}
          className="w-full h-11 pl-4 pr-10 bg-surface border border-line-strong rounded-[11px] font-sans font-semibold text-[15px] cursor-pointer appearance-none"
          style={{ color: accountId === '' ? 'var(--text-3)' : 'var(--text)' }}
        >
          <option value="">Select an account…</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.last_four ? ` ····${a.last_four}` : ''}</option>)}
        </select>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" className="absolute right-[15px] top-1/2 -translate-y-1/2 pointer-events-none"><path d="m6 9 6 6 6-6" /></svg>
      </div>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
        className={`rounded-[18px] flex flex-col items-center gap-1.5 cursor-pointer transition-colors border-[1.5px] border-dashed ${dragOver ? 'border-primary bg-surface-2' : 'border-line-strong bg-surface hover:border-primary'}`}
        style={{ padding: '56px 24px' }}
      >
        <span className="w-16 h-16 rounded-[16px] bg-surface-2 flex items-center justify-center mb-2">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
        </span>
        <div className="text-[17px] font-bold text-content">Drop your CSV file here</div>
        <div className="text-sm text-content-3">or <span className="text-primary font-semibold">browse files</span></div>
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
        {/* Format hints — the exporter is detected from the file, so these are not choices. */}
        <div className="flex items-center gap-2 mt-3.5" aria-hidden="true">
          <span className="text-xs text-content-3">Works with</span>
          {['Chase', 'Venmo', 'Generic CSV'].map((f) => (
            <span key={f} className="h-7 px-[13px] rounded-full flex items-center text-xs font-semibold bg-surface-2 border border-line text-content-2">{f}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
