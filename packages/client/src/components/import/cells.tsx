/**
 * Shared building blocks for the redesigned Import flow (docs/Import Flow).
 * Token-driven (Retheme v2). Used by both Bank Sync and CSV review tables.
 */
import { useState, useRef, useEffect, type ReactNode } from 'react';
import { VendorAvatar } from '../primitives';
import { getCategoryEmoji, useCategoryEmojis } from '../../lib/categoryMeta';

/** Absolute-value currency string (never collapses 0 to an em-dash). */
export function money(n: number): string {
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Sign glyph + direction for a ledger amount (money-out positive). 0 → no sign. */
export function amountParts(n: number): { sign: string; moneyIn: boolean } {
  if (n < 0) return { sign: '+', moneyIn: true };
  if (n > 0) return { sign: '−', moneyIn: false };
  return { sign: '', moneyIn: false };
}

// ── Amount — money-in (stored negative) shows green "+"; money-out shows "−". ──
export function AmountText({ amount }: { amount: number }) {
  const { sign, moneyIn } = amountParts(amount);
  return (
    <span className="w-[110px] flex-none text-right font-mono font-bold text-sm tabular-nums" style={{ color: moneyIn ? 'var(--positive)' : 'var(--text)' }}>
      {sign}{money(amount)}
    </span>
  );
}

// ── Unreadable amount — shown in place of the amount; the row is never imported. ──
export function UnreadableAmount({ className = 'w-[110px]' }: { className?: string }) {
  return (
    <span className={`${className} flex-none text-right text-xs font-semibold`} style={{ color: 'var(--negative)' }}>
      Amount unreadable
    </span>
  );
}

// ── Vendor monogram palette (matches the design: 8 hues hashed by first char) ──
const VENDOR_PALETTE = [
  '--c-teal', '--c-green', '--c-blue', '--c-indigo',
  '--c-violet', '--c-fuchsia', '--c-rose', '--c-orange',
];
export function vendorColor(name: string): string {
  const ch = name?.trim()?.charCodeAt(0) || 0;
  return `var(${VENDOR_PALETTE[ch % VENDOR_PALETTE.length]})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tri-state checkbox — 20px rounded square, primary fill when on/mixed.
// ─────────────────────────────────────────────────────────────────────────────
export function ImpCheckbox({
  checked, indeterminate = false, onClick, title, size = 20, disabled = false,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onClick: (e: React.MouseEvent | React.KeyboardEvent) => void;
  title?: string;
  size?: number;
  disabled?: boolean;
}) {
  const on = checked || indeterminate;
  return (
    <span
      onClick={disabled ? undefined : onClick}
      onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(e); } }}
      title={title}
      role="checkbox"
      tabIndex={disabled ? -1 : 0}
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-disabled={disabled || undefined}
      className={`flex-none inline-flex items-center justify-center rounded-[6px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary ${disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'}`}
      style={{
        width: size,
        height: size,
        background: on ? 'var(--primary)' : 'var(--surface)',
        border: `1.5px solid ${on ? 'var(--primary)' : 'var(--line-strong)'}`,
      }}
    >
      {checked && !indeterminate && (
        <svg width={size * 0.65} height={size * 0.65} viewBox="0 0 24 24" fill="none" stroke="var(--on-primary)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      )}
      {indeterminate && (
        <svg width={size * 0.65} height={size * 0.65} viewBox="0 0 24 24" fill="none" stroke="var(--on-primary)" strokeWidth="3.2" strokeLinecap="round"><path d="M5 12h14" /></svg>
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Adaptive stepper — 4px track + primary fill, numbered circles + labels.
// ─────────────────────────────────────────────────────────────────────────────
export function Stepper({ labels, activeIndex }: { labels: string[]; activeIndex: number }) {
  const progressW = `${((activeIndex + 1) / labels.length) * 100}%`;
  return (
    <div className="mb-6">
      <div className="h-1 rounded-full bg-surface-2 overflow-hidden mb-3">
        <div className="h-full rounded-full bg-primary" style={{ width: progressW, transition: 'width .3s' }} />
      </div>
      <div className="flex">
        {labels.map((label, i) => {
          const done = i <= activeIndex;
          const justify = i === 0 ? 'flex-start' : i === labels.length - 1 ? 'flex-end' : 'center';
          return (
            <div key={label} className="flex-1 flex items-center gap-2.5" style={{ justifyContent: justify }}>
              <span
                className="w-[22px] h-[22px] flex-none rounded-full flex items-center justify-center text-xs font-extrabold"
                style={{
                  background: done ? 'var(--primary)' : 'var(--surface-2)',
                  color: done ? 'var(--on-primary)' : 'var(--text-3)',
                  border: `1.5px solid ${done ? 'var(--primary)' : 'var(--line-strong)'}`,
                }}
              >
                {i + 1}
              </span>
              {/* phones only have room for the current step's label */}
              <span className={`font-bold text-sm ${i === activeIndex ? '' : 'hidden md:inline'}`} style={{ color: done ? 'var(--primary)' : 'var(--text-3)' }}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Match-confidence value (0–1 input) — colored by threshold.
// ─────────────────────────────────────────────────────────────────────────────
export function ConfidenceLabel({ confidence, variant }: { confidence: number; variant: 'sync' | 'csv' }) {
  const pct = Math.round((confidence || 0) * 100);
  let color: string;
  if (pct === 0) color = 'var(--text-3)';
  else if (variant === 'sync') color = pct >= 95 ? 'var(--positive)' : pct >= 80 ? 'var(--c-blue)' : 'var(--warning)';
  else color = pct >= 95 ? 'var(--positive)' : pct >= 70 ? 'var(--c-blue)' : pct >= 50 ? 'var(--warning)' : 'var(--negative)';
  return (
    <span
      title="Match confidence"
      className="w-[34px] flex-none text-right font-mono text-[11px] font-semibold"
      style={{ color }}
    >
      {pct === 0 ? '—' : `${pct}%`}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Popover shell — full-screen overlay for outside-click + anchored menu.
// Rendered inside a `position:relative` cell.
// ─────────────────────────────────────────────────────────────────────────────
function PopoverMenu({
  onClose, width = 264, top = 40, left = 0, children,
}: { onClose: () => void; width?: number; top?: number; left?: number; children: ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 z-[55]" onClick={(e) => { e.stopPropagation(); onClose(); }} />
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute z-[60] bg-elevated border border-line-strong rounded-[12px] shadow-md overflow-hidden cursor-default"
        style={{ width, top, left }}
      >
        {children}
      </div>
    </>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="p-2 border-b border-line">
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 px-3 rounded-[10px] bg-surface-2 border border-line text-content font-sans text-sm outline-none"
      />
    </div>
  );
}

// ── Editable vendor / description cell ──────────────────────────────────────
export function VendorCell({
  value, note, options, onSelect, logoSrc, dupIcon,
}: {
  value: string;
  note?: string | null;
  options: string[];
  onSelect: (v: string) => void;
  logoSrc?: string;
  dupIcon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const opts = value && !options.includes(value) ? [value, ...options] : options;
  const filtered = opts.filter((o) => !q || o.toLowerCase().includes(q.trim().toLowerCase()));
  const color = vendorColor(value);
  return (
    <div className="flex-1 min-w-0 flex items-center gap-[11px] relative">
      <VendorAvatar name={value} src={logoSrc} color={color} size={30} />
      <div
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); setQ(''); }}
        className="group/imp flex-1 min-w-0 cursor-pointer relative rounded-[8px] border border-transparent hover:border-line-strong hover:bg-surface-2 transition-colors"
        style={{ padding: '4px 26px 4px 8px', marginLeft: -8 }}
      >
        <div className="font-semibold text-sm truncate text-content">{value}</div>
        {note ? <div className="font-mono text-[11px] text-content-3 truncate">{note}</div> : null}
        <svg className="opacity-0 group-hover/imp:opacity-100 transition-opacity absolute right-2 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
        {open && (
          <PopoverMenu onClose={() => setOpen(false)} width={264} top={note ? 46 : 36} left={0}>
            <SearchBox value={q} onChange={setQ} placeholder="Search vendors…" />
            <div className="imp-scroll max-h-[240px] overflow-y-auto p-1.5">
              {filtered.map((o) => {
                const sel = o === value;
                return (
                  <div
                    key={o}
                    onClick={(e) => { e.stopPropagation(); onSelect(o); setOpen(false); }}
                    className="px-[11px] py-[9px] rounded-[8px] text-sm font-medium cursor-pointer truncate"
                    style={{ color: sel ? 'var(--primary)' : 'var(--text)', background: sel ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent' }}
                  >
                    {o}
                  </div>
                );
              })}
              {filtered.length === 0 && <div className="px-[11px] py-2.5 text-[13px] text-content-3">No matches</div>}
            </div>
          </PopoverMenu>
        )}
      </div>
      {dupIcon}
    </div>
  );
}

// ── Duplicate warning icon (CSV) ────────────────────────────────────────────
export function DuplicateIcon({ status }: { status: 'exact' | 'possible' }) {
  const likely = status === 'exact';
  const c = likely ? 'var(--negative)' : 'var(--warning)';
  return (
    <span
      title={likely ? 'Likely Duplicate' : 'Possible Duplicate'}
      className="w-[22px] h-[22px] flex-none inline-flex items-center justify-center rounded-[6px]"
      style={{ background: `color-mix(in srgb, ${c} 12%, transparent)`, color: c, border: `1px solid color-mix(in srgb, ${c} 30%, transparent)` }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
    </span>
  );
}

// ── Editable category cell ──────────────────────────────────────────────────
export interface ImpCategory {
  id: number;
  group_name: string;
  sub_name: string;
  display_name: string;
  type: string;
}

export function CategoryCell({
  categoryId, categories, grouped, onSelect,
}: {
  categoryId: number | null;
  categories: ImpCategory[];
  grouped: boolean;
  onSelect: (catId: number) => void;
}) {
  useCategoryEmojis(); // re-render when stored emoji overrides load
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = categoryId != null ? categories.find((c) => c.id === categoryId) : undefined;
  const has = !!current;

  const emoji = has ? getCategoryEmoji(current!.sub_name) : '＋';
  const label = has ? current!.sub_name : 'Select…';

  const ql = q.trim().toLowerCase();
  const match = (c: ImpCategory) => !ql || c.display_name.toLowerCase().includes(ql) || c.sub_name.toLowerCase().includes(ql) || c.group_name.toLowerCase().includes(ql);

  // Ordered groups for the grouped popover: income → expense, then group name.
  const typeRank: Record<string, number> = { income: 0, expense: 1 };
  const groups: { group: string; items: ImpCategory[] }[] = [];
  if (grouped) {
    const byGroup = new Map<string, ImpCategory[]>();
    for (const c of categories) {
      if (!match(c)) continue;
      if (!byGroup.has(c.group_name)) byGroup.set(c.group_name, []);
      byGroup.get(c.group_name)!.push(c);
    }
    for (const [group, items] of byGroup.entries()) groups.push({ group, items });
    groups.sort((a, b) => {
      const ra = typeRank[a.items[0].type] ?? 3, rb = typeRank[b.items[0].type] ?? 3;
      return ra !== rb ? ra - rb : a.group.localeCompare(b.group);
    });
  }
  const flat = categories.filter(match);
  const noResults = grouped ? groups.length === 0 : flat.length === 0;

  const OptionRow = ({ c, labelText }: { c: ImpCategory; labelText: string }) => {
    const sel = c.id === categoryId;
    return (
      <div
        onClick={(e) => { e.stopPropagation(); onSelect(c.id); setOpen(false); }}
        className="flex items-center gap-2.5 px-[11px] py-[9px] rounded-[8px] text-sm font-medium cursor-pointer"
        style={{ color: sel ? 'var(--primary)' : 'var(--text)', background: sel ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent' }}
      >
        <span className="text-[15px] leading-none flex-none">{getCategoryEmoji(c.sub_name)}</span>
        <span className="truncate">{labelText}</span>
      </div>
    );
  };

  return (
    <div
      onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); setQ(''); }}
      className="group/imp flex-1 min-w-0 cursor-pointer relative flex items-center gap-2.5 h-[34px] rounded-[8px] border border-transparent hover:border-line-strong hover:bg-surface-2 transition-colors"
      style={{ padding: '0 26px 0 10px' }}
    >
      <span className="flex-none text-[15px] leading-none" style={{ color: has ? undefined : 'var(--text-3)' }}>{emoji}</span>
      <span className="truncate text-[13px] font-semibold" style={{ color: has ? 'var(--text)' : 'var(--text-3)' }}>{label}</span>
      <svg className="opacity-0 group-hover/imp:opacity-100 transition-opacity absolute right-2 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
      {open && (
        <PopoverMenu onClose={() => setOpen(false)} width={grouped ? 264 : 248} top={38} left={0}>
          <SearchBox value={q} onChange={setQ} placeholder="Search categories…" />
          <div className="imp-scroll max-h-[260px] overflow-y-auto p-1.5">
            {grouped
              ? groups.map((g) => (
                <div key={g.group}>
                  <div className="px-[11px] pt-2 pb-1 font-mono text-[10px] tracking-[0.06em] uppercase text-content-3">{g.group}</div>
                  {g.items.map((c) => <OptionRow key={c.id} c={c} labelText={c.sub_name} />)}
                </div>
              ))
              : flat.map((c) => <OptionRow key={c.id} c={c} labelText={c.display_name} />)}
            {noResults && <div className="px-[11px] py-2.5 text-[13px] text-content-3">No matches</div>}
          </div>
        </PopoverMenu>
      )}
    </div>
  );
}
