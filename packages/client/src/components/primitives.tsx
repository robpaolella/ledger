/**
 * Retheme v2 shared primitives (design system §4). Token-driven; consumed by the
 * Wave 3 product screens. See docs/design_handoff_ledger_platform/VISUAL_RETHEME.md.
 */
import type { ReactNode } from 'react';

/* ------ VendorAvatar ------
 * 40px circle, tinted fill (color-mix of the category hue) + merchant initial.
 * Falls back to a monogram when no real logo `src` is available. */
export function VendorAvatar({
  name, color = 'var(--c-blue)', size = 40, src,
}: { name: string; color?: string; size?: number; src?: string }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center rounded-full font-bold shrink-0 select-none"
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        color,
        fontSize: Math.round(size * 0.4),
      }}
    >
      {initial}
    </span>
  );
}

/* ------ AccountChip ------
 * Mono account label with a leading card icon + optional trailing owner tag. */
export function AccountChip({
  label, owner,
}: { label: string; owner?: { name: string; color?: string } }) {
  return (
    <span className="inline-flex items-center gap-1.5 h-8 pl-3 pr-1.5 rounded-[9px] bg-surface-2 border border-line font-mono text-xs text-content-2 max-w-full">
      <svg
        className="text-c-blue shrink-0"
        width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      >
        <rect x="1" y="4" width="22" height="16" rx="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
      <span className="truncate">{label}</span>
      {owner && (
        <span
          className="inline-flex items-center h-5 px-2 rounded-md text-[11px] font-semibold shrink-0"
          style={{
            background: `color-mix(in srgb, ${owner.color ?? 'var(--owner-shared)'} 16%, transparent)`,
            color: owner.color ?? 'var(--owner-shared)',
          }}
        >
          {owner.name}
        </span>
      )}
    </span>
  );
}

/* ------ SegmentedControl ------
 * Month/Year-style toggle: inset track, elevated active pill. */
export function SegmentedControl<T extends string>({
  options, value, onChange, className = '',
}: {
  options: Array<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-1 bg-surface-2 border border-line rounded-[12px] p-1 ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`px-4 py-1.5 rounded-[9px] text-sm font-semibold transition-colors ${
              active ? 'bg-elevated shadow-sm text-content' : 'text-content-2 hover:text-content'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------ Switch ------
 * 44×26 pill toggle (design system): `--primary` on, `--line-strong` off. */
export function Switch({
  checked, onChange, disabled = false, title, className = '',
}: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; title?: string; className?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={title}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-[26px] rounded-full border-none cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 ${className}`}
      style={{ background: checked ? 'var(--primary)' : 'var(--line-strong)' }}
    >
      <span className="absolute top-[3px] w-5 h-5 rounded-full bg-white shadow-sm transition-all" style={{ left: checked ? 21 : 3 }} />
    </button>
  );
}

/* ------ BudgetBar ------
 * Tri-state progress: under → positive, ≥80% → warning, over → negative. */
export function BudgetBar({
  value, max, className = '', positive = false,
}: { value: number; max: number; className?: string; positive?: boolean }) {
  const ratio = max > 0 ? value / max : 0;
  const pct = Math.min(Math.max(ratio, 0), 1) * 100;
  // `positive` forces green regardless of ratio — income progress is never a
  // warning/over state the way expense overspend is.
  const color =
    positive ? 'var(--positive)' :
    ratio > 1 ? 'var(--negative)' :
    ratio >= 0.8 ? 'var(--warning)' :
    'var(--positive)';
  return (
    <div className={`h-2 rounded-full bg-surface-2 overflow-hidden ${className}`}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
