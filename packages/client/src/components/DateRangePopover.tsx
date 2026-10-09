import { useState } from 'react';
import Calendar from './Calendar';
import Popover from './Popover';

export interface DatePreset {
  value: string;
  label: string;
}

export interface DateRangeValue {
  preset: string;
  start: string;
  end: string;
}

const DATE_ERROR = 'Enter a real date as MM/DD/YYYY.';

/** `YYYY-MM-DD` to the `MM/DD/YYYY` shown in the fields. */
const toText = (iso: string) => (iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : '');

/** Strict `MM/DD/YYYY` to `YYYY-MM-DD`, or null when partial or not a real date. */
function parseText(text: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return null;
  const [mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${m[3]}-${m[1]}-${m[2]}`;
}

const rangeInvalid = (s: string, e: string) => !!(s && e && e < s);

/**
 * Canonical date-range selector (the Transactions popover, extracted so every
 * page shares one look/layout). Left column = preset list (click applies + closes);
 * right column = themed {@link Calendar} start/end fields with per-field clear;
 * footer = Clear / Cancel / Apply. Custom dates go through a draft, presets apply
 * immediately. Use this for any new date-range filter.
 */
export default function DateRangePopover({
  presets,
  value,
  label,
  active,
  requireBoth = false,
  clearValue,
  onApply,
  onOpen,
}: {
  /** Preset rows shown in the left column (custom is entered via the calendar, not here). */
  presets: DatePreset[];
  /** Currently-applied selection. */
  value: DateRangeValue;
  /** Trigger button text. */
  label: string;
  /** Highlight the trigger border (a non-default range is applied). */
  active: boolean;
  /** Require both start+end before Apply is enabled (endpoints that need a bounded range). */
  requireBoth?: boolean;
  /** What the footer Clear resets to (e.g. 'all' for Transactions, the default preset for Reports). */
  clearValue: DateRangeValue;
  onApply: (v: DateRangeValue) => void;
  /** Fired when the popover opens — lets the host close its other popovers. */
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRangeValue>(value);
  const [calOpen, setCalOpen] = useState<'start' | 'end' | null>(null);

  const [text, setText] = useState({ start: toText(value.start), end: toText(value.end) });

  const openPop = () => { setDraft(value); setText({ start: toText(value.start), end: toText(value.end) }); setCalOpen(null); onOpen?.(); setOpen(true); };
  const selectPreset = (v: string) => { onApply({ preset: v, start: '', end: '' }); setOpen(false); };

  const invalid = rangeInvalid(draft.start, draft.end);
  const incomplete = requireBoth && !(draft.start && draft.end);
  const textBad = (f: 'start' | 'end') => text[f].trim() !== '' && parseText(text[f].trim()) === null;
  const typoBlocked = textBad('start') || textBad('end');
  const error = invalid ? 'End date must be on or after the start date.' : '';

  const applyDraft = () => {
    if (invalid || incomplete || typoBlocked) return;
    const hasCustom = !!(draft.start || draft.end);
    onApply({ preset: hasCustom ? 'custom' : draft.preset, start: draft.start, end: draft.end });
    setOpen(false);
  };
  const typeDate = (f: 'start' | 'end', raw: string) => {
    setText((t) => ({ ...t, [f]: raw }));
    const trimmed = raw.trim();
    // Text that isn't a real date clears the stored date, so a stale one can't trip the range check.
    setDraft((d) => ({ ...d, preset: 'custom', [f]: parseText(trimmed) ?? '' }));
  };
  const clear = () => { setDraft(clearValue); setText({ start: toText(clearValue.start), end: toText(clearValue.end) }); onApply(clearValue); };

  return (
    <div className="relative">
      <button onClick={open ? () => setOpen(false) : openPop} aria-haspopup="dialog" aria-expanded={open}
        className={`flex items-center gap-2 h-10 px-3.5 rounded-[11px] bg-surface border-2 ${open || active ? 'border-primary' : 'border-line-strong'} text-content font-semibold text-sm hover:bg-surface-2`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4.5" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
        {label}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <>
          {/* Phones: pinned under the app bar, full width. md+: anchored to the button. */}
          <Popover onClose={() => setOpen(false)} label="Date range" className="fixed inset-x-4 top-20 md:absolute md:inset-x-auto md:top-12 md:right-0 z-50 md:w-[660px] md:max-w-[calc(100vw-64px)] max-h-[calc(100dvh-112px)] md:max-h-[calc(100dvh-8rem)] bg-elevated border border-line-strong rounded-[16px] shadow-md flex flex-col overflow-hidden">
            <div className="flex flex-col md:flex-row min-h-0 flex-1 overflow-y-auto">
              <div className="md:w-[212px] shrink-0 border-b md:border-b-0 md:border-r border-line">
                <div className="px-5 pt-[18px] pb-3 text-base font-extrabold tracking-tight border-b border-line">Date Range</div>
                <div className="py-2 flex flex-row md:flex-col overflow-x-auto md:overflow-visible">
                  {presets.map((p) => {
                    const on = value.preset === p.value;
                    return (
                      <button type="button" key={p.value} onClick={() => selectPreset(p.value)} aria-pressed={on}
                        className="px-5 py-2.5 text-left text-[15px] font-medium whitespace-nowrap shrink-0 md:border-l-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                        style={{ color: on ? 'var(--primary)' : 'var(--text)', background: on ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent', borderColor: on ? 'var(--primary)' : 'transparent' }}>
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex-1 p-3 md:p-6">
                {(['start', 'end'] as const).map((f) => {
                  const val = f === 'start' ? draft.start : draft.end;
                  const fieldError = textBad(f);
                  return (
                    <div key={f} className={f === 'start' ? 'mb-[22px]' : ''}>
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-[15px] font-bold">{f === 'start' ? 'Start date' : 'End date'}</span>
                        {text[f] && <button type="button" onClick={() => typeDate(f, '')} className="text-sm font-semibold text-primary">Clear</button>}
                      </div>
                      <div
                        className="flex items-center h-[50px] pl-4 pr-1 rounded-[12px] bg-surface text-[15px]"
                        style={{ border: `1px solid ${calOpen === f ? 'var(--primary)' : (fieldError || (error && f === 'end') ? 'var(--negative)' : 'var(--line)')}` }}>
                        <input type="text" inputMode="numeric" autoComplete="off" placeholder="MM/DD/YYYY"
                          aria-label={f === 'start' ? 'Start date' : 'End date'} aria-invalid={fieldError}
                          value={text[f]} onChange={(e) => typeDate(f, e.target.value)}
                          className="flex-1 min-w-0 h-full bg-transparent outline-none tabular-nums text-content placeholder:text-content-3" />
                        <button type="button" tabIndex={-1} onClick={() => setCalOpen((c) => (c === f ? null : f))}
                          aria-label={f === 'start' ? 'Open start date calendar' : 'Open end date calendar'} aria-expanded={calOpen === f}
                          className="w-10 h-10 flex items-center justify-center rounded-[10px] hover:bg-surface-2 shrink-0">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4.5" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
                        </button>
                      </div>
                      {fieldError && <div className="text-negative text-[13px] font-semibold mt-1.5">{DATE_ERROR}</div>}
                      {/* In flow (not floating) so the pop-up grows or scrolls instead of clipping it. */}
                      {calOpen === f && (
                        <div className="mt-2 bg-elevated border border-line-strong rounded-[14px] p-2 md:p-3">
                          <Calendar value={val} onChange={(d) => { setDraft((prev) => ({ ...prev, preset: 'custom', [f]: d })); setText((t) => ({ ...t, [f]: toText(d) })); setCalOpen(null); }} />
                        </div>
                      )}
                    </div>
                  );
                })}
                {error && <div className="text-negative text-[13px] font-semibold mt-1">{error}</div>}
              </div>
            </div>
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-line">
              <button onClick={clear} className="h-10 px-[18px] rounded-[10px] border border-line-strong bg-surface-2 text-content font-semibold text-sm">Clear</button>
              <div className="flex gap-2.5">
                <button onClick={() => setOpen(false)} className="h-10 px-[18px] rounded-[10px] border border-line-strong bg-surface-2 text-content font-semibold text-sm">Cancel</button>
                <button onClick={applyDraft} disabled={invalid || incomplete || typoBlocked} className="h-10 px-5 rounded-[10px] bg-primary text-on-primary font-bold text-sm shadow-sm disabled:opacity-50">Apply</button>
              </div>
            </div>
          </Popover>
        </>
      )}
    </div>
  );
}
