/**
 * Settings building blocks — the form/card recipes in `DESIGN.md` used by every
 * Settings panel and modal (docs/Settings handoff): 13/700 labels, h-11 inputs
 * on `--surface-2` with `--line-strong`, radius 11, h-[42px] footer buttons,
 * 18px-radius cards, square 19px checkboxes.
 */
import type { ReactNode } from 'react';
import { buttonClasses } from '../Button';

export const inputCls =
  'w-full h-11 px-3.5 rounded-[11px] bg-surface-2 border border-line-strong text-content text-sm outline-none placeholder:text-content-3 disabled:opacity-60 disabled:cursor-default';
export const selectCls = `${inputCls} pr-10 appearance-none cursor-pointer`;
export const textareaCls =
  'w-full px-3.5 py-3 rounded-[11px] bg-surface-2 border border-line-strong text-content text-sm outline-none placeholder:text-content-3 resize-none';

export const btnPrimary = buttonClasses({ variant: 'primary' });
export const btnSecondary = buttonClasses({ variant: 'secondary' });
/** Outlined destructive (single-click) — pair with a confirm step where the action is irreversible. */
export const btnDanger = buttonClasses({ variant: 'danger' });
/** Toolbar-sized variants (h-10) for panel headers. */
export const btnPrimarySm = buttonClasses({ variant: 'primary', size: 'sm' });
export const btnSecondarySm = buttonClasses({ variant: 'secondary', size: 'sm' });
/** Row-level action (h-[34px]). */
export const btnRow = buttonClasses({ variant: 'secondary', size: 'row' });

export const chevronIcon = (
  <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-content-3" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
);

/** Labeled form field. */
export function Field({ label, hint, children, className = '' }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[13px] font-bold text-content mb-[7px]">{label}</div>
      {children}
      {hint && <div className="text-[12px] text-content-3 mt-1.5 leading-snug">{hint}</div>}
    </div>
  );
}

/** Native select in the design chrome (custom chevron). */
export function SelectShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`relative ${className}`}>{children}{chevronIcon}</div>;
}

/** Square 19px checkbox (house rule: never circular). */
export function CheckBox({ checked, className = '' }: { checked: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`w-[19px] h-[19px] flex-none rounded-[6px] border-[1.5px] flex items-center justify-center transition-colors ${className}`}
      style={{ borderColor: checked ? 'var(--primary)' : 'var(--line-strong)', background: checked ? 'var(--primary)' : 'var(--surface)' }}
    >
      {checked && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--on-primary)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6" /></svg>}
    </span>
  );
}

/** Panel title block: 22/800 title + description + right-aligned actions. */
export function PanelHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
      <div className="flex-1 min-w-0">
        <h2 className="hidden md:block text-[22px] font-extrabold tracking-tight text-content m-0 leading-tight">{title}</h2>
        {description && <p className="text-sm text-content-3 mt-1.5 m-0 max-w-[640px] leading-snug">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2.5 shrink-0 flex-wrap">{actions}</div>}
    </div>
  );
}

/** Settings card (18px radius, surface, shadow-sm). */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-surface border border-line rounded-[18px] shadow-sm overflow-hidden ${className}`}>{children}</div>;
}

/** Card header row: 17/800 title (+ optional trailing meta / actions). */
export function CardHeader({ title, meta, actions, divider = false, className = '' }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode; divider?: boolean; className?: string }) {
  return (
    <div className={`flex items-center justify-between gap-3 md:gap-4 px-4 md:px-6 py-4 md:py-[18px] ${divider ? 'border-b border-line' : ''} ${className}`}>
      <div className="flex items-baseline gap-2.5 min-w-0">
        <span className="text-[17px] font-extrabold tracking-tight text-content truncate">{title}</span>
        {meta && <span className="font-mono text-[13px] text-content-3 shrink-0">{meta}</span>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/** Mono uppercase section caption (design "11px mono .1em"). */
export function Caption({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`font-mono text-[11px] tracking-[0.1em] uppercase text-content-3 ${className}`}>{children}</div>;
}

/** Tinted pill: h-[26px] px-3 rounded-lg 12px/600. */
export function Pill({ color, children, className = '', title }: { color: string; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 h-[26px] px-3 rounded-lg text-[12px] font-semibold whitespace-nowrap ${className}`}
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
      {children}
    </span>
  );
}

/* Colored-initials avatar (design: two-letter initials on a `--c-*` tint). */
const PALETTE = ['--c-teal', '--c-green', '--c-blue', '--c-indigo', '--c-violet', '--c-fuchsia', '--c-rose', '--c-orange', '--c-amber'];
export function paletteColor(seed: number | string): string {
  const n = typeof seed === 'number' ? seed : [...seed].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return `var(${PALETTE[Math.abs(n) % PALETTE.length]})`;
}
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
export function InitialsAvatar({ name, color, size = 40, className = '' }: { name: string; color: string; size?: number; className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-flex items-center justify-center rounded-full font-bold shrink-0 select-none ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.375), background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
      {initials(name)}
    </span>
  );
}

export const ICON = {
  plus: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  refresh: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" /></svg>,
  pencil: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>,
  link: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>,
  unlink: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.8 13.2 21 11a5 5 0 0 0-7-7l-2.2 2.2M5.2 10.8 3 13a5 5 0 0 0 7 7l2.2-2.2M8 2v3M2 8h3M16 22v-3M22 16h-3" /></svg>,
  chevron: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>,
  search: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  shield: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" /></svg>,
  lock: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>,
  wifi: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.6a11 11 0 0 1 14 0M8.5 16a6 6 0 0 1 7 0M2 9a15 15 0 0 1 20 0" /><circle cx="12" cy="19.5" r="1" fill="currentColor" /></svg>,
  check: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6" /></svg>,
  x: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>,
};
