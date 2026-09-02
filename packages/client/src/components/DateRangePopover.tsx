import { useState } from 'react';
import Calendar from './Calendar';

export interface DatePreset {
  value: string;
  label: string;
}

export interface DateRangeValue {
  preset: string;
  start: string;
  end: string;
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

  const openPop = () => { setDraft(value); setCalOpen(null); onOpen?.(); setOpen(true); };
  const selectPreset = (v: string) => { onApply({ preset: v, start: '', end: '' }); setOpen(false); };

  const invalid = rangeInvalid(draft.start, draft.end);
  const incomplete = requireBoth && !(draft.start && draft.end);
  const error = invalid ? 'End date must be on or after the start date.' : '';

  const applyDraft = () => {
    if (invalid || incomplete) return;
    const hasCustom = !!(draft.start || draft.end);
    onApply({ preset: hasCustom ? 'custom' : draft.preset, start: draft.start, end: draft.end });
    setOpen(false);
  };
  const clear = () => { setDraft(clearValue); onApply(clearValue); };

  return (
    <div className="relative">
      <button onClick={open ? () => setOpen(false) : openPop}
        className={`flex items-center gap-2 h-10 px-3.5 rounded-[11px] bg-surface border-2 ${open || active ? 'border-primary' : 'border-line-strong'} text-content font-semibold text-sm hover:bg-surface-2`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4.5" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
        {label}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Phones: pinned under the app bar, full width. md+: anchored to the button. */}
          <div className="fixed inset-x-4 top-20 md:absolute md:inset-x-auto md:top-12 md:right-0 z-50 md:w-[660px] md:max-w-[calc(100vw-64px)] max-h-[calc(100dvh-184px)] md:max-h-none bg-elevated border border-line-strong rounded-[16px] shadow-md flex flex-col overflow-hidden">
            <div className="flex flex-col md:flex-row min-h-0 flex-1 overflow-y-auto md:overflow-visible">
              <div className="md:w-[212px] shrink-0 border-b md:border-b-0 md:border-r border-line">
                <div className="px-5 pt-[18px] pb-3 text-base font-extrabold tracking-tight border-b border-line">Date Range</div>
                <div className="py-2 flex flex-row md:flex-col overflow-x-auto md:overflow-visible">
                  {presets.map((p) => {
                    const on = value.preset === p.value;
                    return (
                      <div key={p.value} onClick={() => selectPreset(p.value)}
                        className="px-5 py-2.5 text-[15px] font-medium cursor-pointer whitespace-nowrap shrink-0 md:border-l-2"
                        style={{ color: on ? 'var(--primary)' : 'var(--text)', background: on ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent', borderColor: on ? 'var(--primary)' : 'transparent' }}>
                        {p.label}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex-1 p-6">
                {(['start', 'end'] as const).map((f) => {
                  const val = f === 'start' ? draft.start : draft.end;
                  return (
                    <div key={f} className={f === 'start' ? 'mb-[22px]' : ''}>
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-[15px] font-bold">{f === 'start' ? 'Start date' : 'End date'}</span>
                        {val && <button type="button" onClick={() => setDraft((d) => ({ ...d, [f]: '', preset: 'custom' }))} className="text-sm font-semibold text-primary">Clear</button>}
                      </div>
                      <div className="relative">
                        <button type="button" onClick={() => setCalOpen((c) => (c === f ? null : f))}
                          className="w-full flex items-center justify-between h-[50px] px-4 rounded-[12px] bg-surface text-[15px]"
                          style={{ border: `1px solid ${calOpen === f ? 'var(--primary)' : (error && f === 'end' ? 'var(--negative)' : 'var(--line)')}` }}>
                          <span className={val ? 'text-content tabular-nums' : 'text-content-3'}>{val ? new Date(val + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) : 'MM/DD/YYYY'}</span>
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4.5" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
                        </button>
                        {calOpen === f && (
                          <div className="absolute top-[54px] right-0 z-[60] w-[320px] bg-elevated border border-line-strong rounded-[14px] shadow-md p-3">
                            <Calendar value={val} onChange={(d) => { setDraft((prev) => ({ ...prev, preset: 'custom', [f]: d })); setCalOpen(null); }} />
                          </div>
                        )}
                      </div>
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
                <button onClick={applyDraft} disabled={invalid || incomplete} className="h-10 px-5 rounded-[10px] bg-primary text-on-primary font-bold text-sm shadow-sm disabled:opacity-50">Apply</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
