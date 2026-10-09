import { useEffect, useRef, useState } from 'react';
import { VendorAvatar } from './primitives';

export interface MerchantOption {
  id: number;
  name: string;
  logo_url?: string | null;
}

/**
 * Searchable merchant picker (InstitutionPicker structure, Retheme v2 tokens).
 * Merchants are created implicitly server-side (findOrCreateMerchant), so the
 * Create row just returns the typed name — no POST happens here.
 */
export default function MerchantPicker({
  value,
  merchants,
  onSelect,
  placeholder = 'Set merchant…',
  allowClear,
  triggerClassName,
  disabled,
}: {
  value: string; // current merchant NAME ('' = none)
  merchants: MerchantOption[]; // caller-supplied (from GET /api/merchants)
  onSelect: (name: string) => void; // existing pick, Create "{q}", or '' via the None row
  placeholder?: string;
  allowClear?: boolean;
  triggerClassName?: string; // match the host field chrome
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const q = search.trim();
  const ql = q.toLowerCase();
  const filtered = ql ? merchants.filter((m) => m.name.toLowerCase().includes(ql)) : merchants;
  const hasExact = ql !== '' && merchants.some((m) => m.name.toLowerCase() === ql);
  const selected = value ? merchants.find((m) => m.name === value) : undefined;

  const pick = (name: string) => { onSelect(name); setOpen(false); setSearch(''); };

  return (
    // Escape closes the list from any control inside it (search box or an option), not just the search box.
    <div className="relative" ref={ref}
      onKeyDown={(e) => { if (open && e.key === 'Escape') { e.stopPropagation(); setOpen(false); setSearch(''); } }}>
      <button type="button" disabled={disabled} onClick={() => setOpen((v) => !v)}
        className={`${triggerClassName ?? 'w-full h-12 px-3.5 rounded-[11px] bg-surface-2 border border-line text-content text-[15px] outline-none'} flex items-center justify-between gap-2 text-left cursor-pointer disabled:opacity-60`}>
        <span className="flex items-center gap-2.5 min-w-0">
          {value ? (
            <>
              <VendorAvatar name={value} src={selected?.logo_url || undefined} size={22} />
              <span className="truncate">{value}</span>
            </>
          ) : (
            <span className="text-content-3">{placeholder}</span>
          )}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"
          className={`shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-[75] left-0 right-0 mt-1 bg-elevated border border-line-strong rounded-[12px] shadow-md overflow-hidden">
          <div className="p-2 border-b border-line">
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search merchants…"
              className="w-full h-9 px-3 rounded-lg bg-surface-2 border border-line text-content text-sm outline-none" />
          </div>
          <div className="max-h-60 overflow-y-auto p-1.5">
            {q && !hasExact && (
              <button type="button" onClick={() => pick(q)}
                className="block w-full text-left px-3 py-2 rounded-lg text-sm text-primary font-medium hover:bg-surface-2">
                Create “{q}”
              </button>
            )}
            {allowClear && (
              <button type="button" onClick={() => pick('')}
                className="block w-full text-left px-3 py-2 rounded-lg text-sm text-content-3 hover:bg-surface-2">
                None
              </button>
            )}
            {filtered.map((m) => (
              <button key={m.id} type="button" onClick={() => pick(m.name)}
                className={`flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-sm text-content hover:bg-surface-2 ${m.name === value ? 'bg-surface-2' : ''}`}>
                <VendorAvatar name={m.name} src={m.logo_url || undefined} size={24} />
                <span className="truncate">{m.name}</span>
              </button>
            ))}
            {filtered.length === 0 && !q && <div className="px-3 py-2 text-sm text-content-3">No merchants</div>}
          </div>
        </div>
      )}
    </div>
  );
}
