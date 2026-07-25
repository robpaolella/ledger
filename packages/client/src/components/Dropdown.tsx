import { useState } from 'react';

/** Small custom dropdown (button + menu). Shared by AccountsPage + AccountDetailPage. */
export default function Dropdown({ value, options, onChange, minWidth = 130 }: { value: string; options: { key: string; label: string }[]; onChange: (k: string) => void; minWidth?: number }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.key === value)?.label ?? value;
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} style={{ minWidth }}
        className="flex items-center justify-between gap-2 h-10 px-3.5 rounded-[11px] bg-surface-2 border border-line text-sm font-semibold text-content hover:border-line-strong">
        <span>{current}</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-11 right-0 z-50 min-w-full py-1 rounded-[11px] bg-elevated border border-line-strong shadow-md">
            {options.map((o) => (
              <button key={o.key} onClick={() => { onChange(o.key); setOpen(false); }}
                className={`block w-full text-left px-3.5 py-2 text-sm whitespace-nowrap hover:bg-surface-2 ${o.key === value ? 'text-primary font-semibold' : 'text-content'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
