import { useState, type KeyboardEvent } from 'react';
import { formatMoney, type ReportContribution } from '@ledger/shared';
import { getCategoryEmoji } from '../../lib/categoryMeta';
import MonthSwitcher from '../MonthSwitcher';

// Contributions: money moved into tracked accounts. A card of its own on Reports,
// kept apart from the Category breakdown because none of it counts in any total.

interface Bucket { label: string }
export interface ContributionsTimeline {
  buckets: Bucket[];
  index: number;
  title: string;
  subtitle: string;
  weekly: boolean;
  colMin: number;
  onPrev: () => void;
  onNext: () => void;
}

// Transfers stay grey; whole dollars like the rest of Reports. Zero is "—" in Summary, "$0" in the Timeline.
const fig = (v: number, showZero = false) => formatMoney(v, { kind: 'balance', precision: 'whole', showZero }).text;
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
const intoText = (c: ReportContribution) => [...c.accounts.map((a) => a.name), ...(c.external ? ['An account not in Ledger'] : [])].join(', ');

type View = 'summary' | 'timeline';

// Drilling in: the clicked row is tinted with a primary bar down its left edge.
const SELECTED_STYLE = { background: 'color-mix(in srgb, var(--primary) 9%, transparent)', boxShadow: 'inset 3px 0 0 var(--primary)' } as const;

interface Pick { selectedId: number | null; onSelect: (c: ReportContribution) => void }
// Click or Enter/Space on the row itself drills in.
const pickProps = (c: ReportContribution, { selectedId, onSelect }: Pick) => ({
  role: 'button' as const,
  tabIndex: 0,
  'aria-pressed': selectedId === c.categoryId,
  onClick: () => onSelect(c),
  onKeyDown: (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    onSelect(c);
  },
});
const rowCls = 'cursor-pointer outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring';
const rowStyle = (c: ReportContribution, pad: string, selectedId: number | null) => ({ padding: pad, ...(selectedId === c.categoryId ? SELECTED_STYLE : {}) });

function Chevron() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="m9 6 6 6-6 6" /></svg>;
}

function NotInTotals() {
  return <span className="flex-none h-[22px] px-[9px] rounded-[6px] bg-surface border border-line text-content-3 text-[11px] font-semibold inline-flex items-center whitespace-nowrap">Not in totals</span>;
}

function Toggle({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  return (
    <div className="flex max-md:min-h-11 bg-surface-2 border border-line rounded-[10px] p-[3px] gap-0.5 shrink-0">
      {(['summary', 'timeline'] as const).map((v) => {
        const on = value === v;
        return <button key={v} onClick={() => onChange(v)} className="relative max-md:inline-flex max-md:items-center max-md:justify-center max-md:after:content-[''] max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-1 px-3.5 py-1.5 rounded-lg text-[13px] font-semibold" style={{ color: on ? 'var(--text)' : 'var(--text-3)', background: on ? 'var(--elevated)' : 'transparent', boxShadow: on ? 'var(--shadow-sm)' : 'none' }}>{v === 'summary' ? 'Summary' : 'Timeline'}</button>;
      })}
    </div>
  );
}

function Total({ label, value, last, isMobile }: { label: string; value: number; last?: boolean; isMobile: boolean }) {
  return (
    <div className={`${isMobile ? 'px-4' : 'px-[26px]'} py-4 ${last ? '' : 'border-r border-line'}`}>
      <div className="font-mono text-[11px] uppercase text-content-3 mb-2" style={{ letterSpacing: '.07em' }}>{label}</div>
      <div className="font-extrabold tabular-nums leading-none text-content-2 text-[24px]" style={{ letterSpacing: '-.02em' }}>{fig(value)}</div>
    </div>
  );
}

function SummaryRows({ items, isMobile, pick }: { items: ReportContribution[]; isMobile: boolean; pick: Pick }) {
  if (isMobile) {
    const figure = (label: string, v: number) => (
      <span className="whitespace-nowrap"><span className="text-content-3">{label}</span> <span className="font-bold text-[15px] text-content-2">{fig(v)}</span></span>
    );
    return (
      <>
        {items.map((c) => (
          <div key={c.categoryId} {...pickProps(c, pick)} className={`flex items-center gap-3 border-b border-line ${rowCls}`} style={rowStyle(c, '14px 16px', pick.selectedId)}>
            <span className="shrink-0 text-base leading-none self-start mt-0.5">{getCategoryEmoji(c.name, c.groupName)}</span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[15px] line-clamp-2 break-words">{c.name}</div>
              <div className="text-[12.5px] text-content-3 truncate mt-0.5">into {intoText(c)}</div>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px] tabular-nums mt-1.5">{figure('Put in', c.totalPutIn)}{figure('Taken out', c.totalTakenOut)}</div>
            </div>
            <Chevron />
          </div>
        ))}
      </>
    );
  }
  return (
    <>
      <div className="flex items-center gap-3 bg-surface-2 border-b border-line font-mono text-[11px] uppercase text-content-3" style={{ padding: '11px 26px', letterSpacing: '.06em' }}>
        <span className="flex-1">Category</span><span className="flex-1">Pays into</span>
        <span className="shrink-0 w-[120px] text-right">Put in</span><span className="shrink-0 w-[120px] text-right">Taken out</span><span className="shrink-0 w-4" />
      </div>
      {items.map((c) => (
        <div key={c.categoryId} {...pickProps(c, pick)} className={`flex items-center gap-3 border-b border-line ${rowCls}`} style={rowStyle(c, '15px 26px', pick.selectedId)}>
          <span className="flex-1 min-w-0 flex items-center gap-3"><span className="shrink-0 text-base leading-none">{getCategoryEmoji(c.name, c.groupName)}</span><span className="font-semibold text-[15px] truncate" title={c.name}>{c.name}</span></span>
          <span className="flex-1 min-w-0 text-[13px] text-content-3 truncate" title={intoText(c)}>{intoText(c)}</span>
          <span className="shrink-0 w-[120px] text-right font-bold text-[15px] tabular-nums text-content-2">{fig(c.totalPutIn)}</span>
          <span className="shrink-0 w-[120px] text-right font-bold text-[15px] tabular-nums text-content-2">{fig(c.totalTakenOut)}</span>
          <Chevron />
        </div>
      ))}
    </>
  );
}

function TimelineRows({ items, tl, isMobile, pick }: { items: ReportContribution[]; tl: ContributionsTimeline; isMobile: boolean; pick: Pick }) {
  const nameCol = isMobile ? 'flex-1 min-w-0' : 'w-[214px] shrink-0';
  const cellCls = isMobile ? 'w-[80px] shrink-0 text-right' : 'text-right';
  const cellStyle = isMobile ? undefined : { flex: '1 1 0', minWidth: tl.colMin };
  const totCls = isMobile ? 'w-[88px] shrink-0 text-right' : 'w-[104px] shrink-0 text-right';
  const pad = isMobile ? '11px 16px' : '11px 26px';
  const shown = (a: number[]) => (isMobile ? a.slice(tl.index, tl.index + 1) : a);
  const noun = tl.weekly ? 'week' : 'month';

  const figures = (label: string, values: number[], total: number) => {
    const peak = Math.max(...values, 0);
    return (
      <div className="flex items-center border-b border-line bg-surface-2/40" style={{ padding: isMobile ? '10px 16px' : '10px 26px' }}>
        <span className={`${nameCol} ${isMobile ? 'text-[15px]' : 'text-[13px]'} text-content-2`} style={{ paddingLeft: isMobile ? 30 : 28 }}>{label}</span>
        {shown(values).map((v, i) => <span key={i} className={`${cellCls} ${isMobile ? 'text-[15px]' : 'text-[13px]'} tabular-nums`} style={{ ...cellStyle, color: v === peak && v > 0 ? 'var(--text)' : 'var(--text-3)', fontWeight: v === peak && v > 0 ? 700 : 500 }}>{fig(v, true)}</span>)}
        <span className={`${totCls} font-semibold ${isMobile ? 'text-[15px]' : 'text-[13px]'} tabular-nums text-content-2`}>{fig(total, true)}</span>
      </div>
    );
  };

  return (
    <>
      {isMobile && tl.buckets.length > 0 && (
        <MonthSwitcher title={tl.title} subtitle={tl.subtitle}
          prevLabel={`Previous ${noun}`} nextLabel={`Next ${noun}`}
          onPrev={tl.onPrev} onNext={tl.onNext}
          prevDisabled={tl.index === 0} nextDisabled={tl.index === tl.buckets.length - 1} />
      )}
      <div className={isMobile ? '' : 'overflow-x-auto'}>
        <div style={isMobile ? undefined : { minWidth: 'max-content' }}>
          <div className="flex items-center bg-surface-2 border-b border-line font-mono text-[11px] uppercase text-content-3" style={{ padding: pad, letterSpacing: '.06em' }}>
            <span className={nameCol}>Category</span>
            {(isMobile ? tl.buckets.slice(tl.index, tl.index + 1) : tl.buckets).map((b, i) => <span key={i} className={isMobile ? `${cellCls} font-bold` : 'text-right'} style={isMobile ? { color: 'var(--primary)' } : cellStyle}>{b.label}</span>)}
            <span className={`${totCls} text-content-2`}>Total</span>
          </div>
          {items.map((c) => (
            <div key={c.categoryId}>
              <div {...pickProps(c, pick)} className={`flex items-center gap-2.5 bg-surface-2 border-b border-line ${rowCls}`} style={rowStyle(c, isMobile ? '12px 16px' : '12px 26px', pick.selectedId)}>
                <span className="shrink-0 text-[15px] leading-none">{getCategoryEmoji(c.name, c.groupName)}</span>
                {isMobile ? (
                  <span className="min-w-0 flex flex-col"><span className="line-clamp-2 break-words text-sm font-bold text-content">{c.name}</span><span className="truncate font-medium text-[12px] text-content-3">into {intoText(c)}</span></span>
                ) : (
                  <span className="min-w-0 truncate text-sm font-bold text-content" title={`${c.name} into ${intoText(c)}`}>{c.name} <span className="font-medium text-[12px] text-content-3">into {intoText(c)}</span></span>
                )}
              </div>
              {c.totalPutIn > 0 && figures('Put in', c.putIn, c.totalPutIn)}
              {c.totalTakenOut > 0 && figures('Taken out', c.takenOut, c.totalTakenOut)}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default function ContributionsCard({ contributions, isMobile, timeline, selectedId, onSelect }: { contributions: ReportContribution[]; isMobile: boolean; timeline: ContributionsTimeline; selectedId: number | null; onSelect: (c: ReportContribution) => void }) {
  const [view, setView] = useState<View>('summary');
  if (contributions.length === 0) return null;
  const putIn = sum(contributions.map((c) => c.totalPutIn));
  const takenOut = sum(contributions.map((c) => c.totalTakenOut));
  const pick = { selectedId, onSelect };
  return (
    <div className="mt-[22px] border border-line rounded-card bg-surface overflow-hidden shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 px-4 sm:px-[26px] pt-4 sm:pt-[18px] pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5"><span className="text-[17px] font-extrabold">Contributions</span><NotInTotals /></div>
          <div className="text-[13px] text-content-3 mt-0.5">Money moved into the accounts you track. It isn’t counted in income, spending or any total.</div>
        </div>
        <div className="flex items-center gap-3 shrink-0"><Toggle value={view} onChange={setView} /></div>
      </div>
      <div className="grid grid-cols-2 border-t border-line">
        <Total label="Put in" value={putIn} isMobile={isMobile} />
        <Total label="Taken out" value={takenOut} last isMobile={isMobile} />
      </div>
      <div className="border-t border-line">
        {view === 'summary' ? <SummaryRows items={contributions} isMobile={isMobile} pick={pick} /> : <TimelineRows items={contributions} tl={timeline} isMobile={isMobile} pick={pick} />}
      </div>
    </div>
  );
}
