/** Bank Sync · Step 1 — Select & Fetch (docs/Import Flow §BANK SYNC step 1). */
import { useMemo, useState } from 'react';
import { VendorAvatar } from '../primitives';
import { todayYmd } from '../../lib/formatters';
import { ImpCheckbox } from './cells';
import { BUCKETS, type SyncAccount } from './types';
import { ownerColor } from '../badges';

const RANGE_OPTIONS = [
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last14', label: 'Last 14 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'last60', label: 'Last 60 days' },
  { value: 'thismonth', label: 'This month' },
  { value: 'lastmonth', label: 'Last month' },
];

function iso(d: Date): string { return todayYmd(d); }
function daysAgo(n: number): Date { const d = new Date(); d.setDate(d.getDate() - n); return d; }

export function computeRange(preset: string): { startDate: string; endDate: string } {
  const today = new Date();
  switch (preset) {
    case 'last7': return { startDate: iso(daysAgo(7)), endDate: iso(today) };
    case 'last14': return { startDate: iso(daysAgo(14)), endDate: iso(today) };
    case 'last60': return { startDate: iso(daysAgo(60)), endDate: iso(today) };
    case 'thismonth': return { startDate: iso(new Date(today.getFullYear(), today.getMonth(), 1)), endDate: iso(today) };
    case 'lastmonth': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { startDate: iso(start), endDate: iso(end) };
    }
    case 'last30':
    default: return { startDate: iso(daysAgo(30)), endDate: iso(today) };
  }
}

function syncedLabel(at: string | null): string {
  if (!at) return 'never';
  const d = new Date(at);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'today';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const fieldCls = 'h-11 bg-surface border border-line rounded-[11px] text-content font-sans';

export default function BankSyncSelect({
  accounts, fetching, onFetch,
}: {
  accounts: SyncAccount[];
  fetching: boolean;
  onFetch: (args: { accountIds: number[]; startDate: string; endDate: string }) => void;
}) {
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | SyncAccount['bucket']>('all');
  const [range, setRange] = useState('last30');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ liquid: true, investment: false, liability: true });
  // selection: absence = selected (default all on); presence of false = deselected.
  const [deselected, setDeselected] = useState<Set<number>>(new Set());
  // Accounts with auto-import off never sync transactions (server enforces the
  // same rule) — show them, but never let them be selected.
  const gated = useMemo(() => new Set(accounts.filter((a) => !a.autoImport).map((a) => a.id)), [accounts]);
  const isSel = (id: number) => !gated.has(id) && !deselected.has(id);

  const ownerOptions = useMemo(() => {
    const map = new Map<number, string>();
    let anyShared = false;
    for (const a of accounts) {
      if (a.isShared) anyShared = true;
      for (const o of a.owners) map.set(o.id, o.displayName);
    }
    const opts = [{ value: 'all', label: 'All owners' }, ...[...map.entries()].map(([id, name]) => ({ value: `u${id}`, label: name }))];
    if (anyShared) opts.push({ value: 'shared', label: 'Shared' });
    return opts;
  }, [accounts]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) =>
      (typeFilter === 'all' || a.bucket === typeFilter) &&
      (ownerFilter === 'all'
        || (ownerFilter === 'shared' ? a.isShared : a.owners.some((o) => `u${o.id}` === ownerFilter))) &&
      (!q || `${a.name} ${a.sfinName} ${a.institutionName}`.toLowerCase().includes(q)),
    );
  }, [accounts, search, ownerFilter, typeFilter]);

  const setSel = (ids: number[], on: boolean) => setDeselected((prev) => {
    const next = new Set(prev);
    for (const id of ids) { if (gated.has(id)) continue; if (on) next.delete(id); else next.add(id); }
    return next;
  });
  const toggleAcct = (id: number) => { if (!gated.has(id)) setSel([id], !isSel(id)); };

  const selectedAll = accounts.filter((a) => isSel(a.id));
  const selectedTotal = selectedAll.length;

  // type chips
  const chips: { key: 'all' | SyncAccount['bucket']; label: string; dot: string; count: number }[] = [
    { key: 'all', label: 'All types', dot: 'var(--text-3)', count: accounts.length },
    ...BUCKETS.map((b) => ({ key: b.key, label: b.label, dot: b.color, count: accounts.filter((a) => a.bucket === b.key).length })),
  ];

  // master (over visible, excluding accounts that can never sync transactions)
  const selectable = visible.filter((a) => !gated.has(a.id));
  const visSel = selectable.filter((a) => isSel(a.id)).length;
  const masterAll = selectable.length > 0 && visSel === selectable.length;
  const masterSome = visSel > 0 && visSel < selectable.length;

  const groups = BUCKETS.filter((b) => typeFilter === 'all' || typeFilter === b.key).map((b) => {
    const rows = visible.filter((a) => a.bucket === b.key);
    const selRows = rows.filter((a) => !gated.has(a.id));
    const sel = selRows.filter((a) => isSel(a.id)).length;
    return { ...b, rows, sel, selCount: selRows.length, all: selRows.length > 0 && sel === selRows.length, some: sel > 0 && sel < selRows.length };
  }).filter((g) => g.rows.length > 0);

  const doFetch = () => {
    if (selectedTotal === 0) return;
    onFetch({ accountIds: selectedAll.map((a) => a.id), ...computeRange(range) });
  };

  return (
    <div className="flex flex-col lg:flex-row gap-[26px] items-start">
      {/* LEFT */}
      <div className="flex-1 min-w-0 w-full">
        {/* toolbar */}
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <div className={`flex items-center gap-2.5 px-3.5 flex-1 min-w-[220px] ${fieldCls}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" className="flex-none"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search accounts or institutions…" className="flex-1 min-w-0 bg-transparent border-none outline-none text-content font-sans text-sm" />
          </div>
          <div className="relative flex-none">
            <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} className={`appearance-none pl-3.5 pr-[38px] font-semibold text-[13px] cursor-pointer ${fieldCls}`}>
              {ownerOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" className="absolute right-[13px] top-1/2 -translate-y-1/2 pointer-events-none"><path d="m6 9 6 6 6-6" /></svg>
          </div>
        </div>

        {/* type chips */}
        <div className="flex items-center gap-2 flex-wrap mb-[18px]">
          {chips.map((c) => {
            const on = typeFilter === c.key;
            return (
              <div key={c.key} onClick={() => setTypeFilter(c.key)}
                className="flex items-center gap-[7px] h-[34px] px-3.5 rounded-full cursor-pointer text-[13px] font-semibold"
                style={{
                  background: on ? 'color-mix(in srgb, var(--primary) 15%, transparent)' : 'var(--surface)',
                  color: on ? 'var(--primary)' : 'var(--text-2)',
                  border: `1px solid ${on ? 'color-mix(in srgb, var(--primary) 40%, transparent)' : 'var(--line)'}`,
                }}>
                <span className="w-2 h-2 rounded-full" style={{ background: c.dot }} />
                {c.label}
                <span className="font-mono text-[11px] opacity-70">{c.count}</span>
              </div>
            );
          })}
        </div>

        {/* master select */}
        <div className="flex items-center justify-between px-1 pb-3">
          <div onClick={() => setSel(selectable.map((a) => a.id), !masterAll)} className="flex items-center gap-2.5 cursor-pointer text-[13px] font-semibold text-content-2">
            <ImpCheckbox checked={masterAll} indeterminate={masterSome} onClick={(e) => { e.stopPropagation(); setSel(selectable.map((a) => a.id), !masterAll); }} />
            Select all visible
          </div>
          <span className="text-xs text-content-3 font-mono">{visSel} / {selectable.length} shown</span>
        </div>

        {/* groups */}
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <div key={g.key} className="border border-line rounded-[16px] bg-surface overflow-hidden shadow-sm">
              <div className="flex items-center gap-3.5 px-[18px] py-3.5 bg-surface-2">
                <ImpCheckbox checked={g.all} indeterminate={g.some} disabled={g.selCount === 0} onClick={(e) => { e.stopPropagation(); setSel(g.rows.map((a) => a.id), !g.all); }} />
                <span className="w-[34px] h-[34px] flex-none rounded-[10px] flex items-center justify-center" style={{ background: `color-mix(in srgb, ${g.color} 16%, transparent)`, color: g.color }}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{g.paths.map((d, i) => <path key={i} d={d} />)}</svg>
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[15px] tracking-[-0.01em] text-content">{g.label}</div>
                  <div className="text-xs text-content-3 mt-px">{g.sel} of {g.selCount} selected{g.selCount < g.rows.length ? ` · ${g.rows.length - g.selCount} import off` : ''}</div>
                </div>
                <span onClick={() => setExpanded((e) => ({ ...e, [g.key]: !e[g.key] }))} className="w-[30px] h-[30px] flex-none rounded-[8px] flex items-center justify-center cursor-pointer text-content-3">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded[g.key] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s' }}><path d="m6 9 6 6 6-6" /></svg>
                </span>
              </div>
              {expanded[g.key] && (
                <div>
                  {g.rows.map((a) => {
                    const off = gated.has(a.id);
                    const on = isSel(a.id);
                    const oColor = a.isShared ? 'var(--owner-shared)' : ownerColor(a.owners[0]?.id ?? 0);
                    const oLabel = a.isShared ? 'Shared' : (a.owners[0]?.displayName ?? '—');
                    return (
                      <div key={a.id} onClick={() => toggleAcct(a.id)}
                        title={off ? 'Transaction import is off for this account — turn it on in Settings ▸ Your accounts ▸ Bank Sync' : undefined}
                        className={`flex items-center gap-3.5 px-[18px] py-3.5 border-t border-line ${off ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                        style={{ background: on ? 'color-mix(in srgb, var(--primary) 6%, transparent)' : 'transparent', opacity: off ? 0.55 : 1 }}>
                        <ImpCheckbox checked={on} disabled={off} onClick={(e) => { e.stopPropagation(); toggleAcct(a.id); }} />
                        <VendorAvatar name={a.institutionName || a.name} src={a.logoSrc} color={a.color} size={32} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2.5">
                            <span className="font-semibold text-sm truncate text-content">{a.name}</span>
                            <span className="h-[19px] px-[7px] flex-none rounded-[5px] flex items-center font-semibold text-[10.5px]" style={{ background: `color-mix(in srgb, ${oColor} 20%, transparent)`, color: oColor }}>{oLabel}</span>
                            {off && <span className="h-[19px] px-[7px] flex-none rounded-[5px] flex items-center font-semibold text-[10.5px] text-content-3 bg-surface-2 border border-line">Import off</span>}
                          </div>
                          <div className="font-mono text-[11.5px] text-content-3 mt-0.5 truncate">{a.sfinName}{a.institutionName ? ` · ${a.institutionName}` : ''}</div>
                        </div>
                        <div className="flex-none text-right">
                          {a.lastFour && <div className="font-mono text-xs text-content-2">••{a.lastFour}</div>}
                          <div className="text-[11px] text-content-3 mt-0.5">Synced {syncedLabel(a.syncedAt)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          {visible.length === 0 && (
            <div className="p-10 text-center text-content-3 text-sm border border-dashed border-line-strong rounded-[16px]">
              {accounts.length === 0 ? 'No linked accounts. Connect a bank in Settings first.' : 'No accounts match your filters.'}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT rail */}
      <div className="w-full lg:w-[328px] flex-none lg:sticky lg:top-6 flex flex-col gap-3.5">
        <div className="border border-line rounded-[16px] bg-surface p-5 shadow-sm">
          <div className="font-mono text-[11px] tracking-[0.08em] uppercase text-content-3 mb-3">Fetch window</div>
          <div className="relative">
            <select value={range} onChange={(e) => setRange(e.target.value)} className="w-full h-11 pl-4 pr-10 bg-surface-2 border border-line-strong rounded-[11px] text-content font-sans font-semibold text-[15px] cursor-pointer appearance-none">
              {RANGE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" className="absolute right-[15px] top-1/2 -translate-y-1/2 pointer-events-none"><path d="m6 9 6 6 6-6" /></svg>
          </div>
          <div className="flex gap-2 mt-3 px-[13px] py-[11px] rounded-[10px]" style={{ background: 'color-mix(in srgb, var(--primary) 9%, transparent)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" className="flex-none mt-px"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
            <span className="text-xs leading-relaxed text-content-2">SimpleFIN refreshes once per day. Requests are capped at 60 days.</span>
          </div>
        </div>

        <div className="border border-line rounded-[16px] bg-surface p-5 shadow-sm">
          <div className="flex items-baseline gap-2.5">
            <span className="text-[34px] font-extrabold tracking-[-0.02em] tabular-nums leading-none text-content">{selectedTotal}</span>
            <span className="text-[13px] text-content-3">of {accounts.length - gated.size} accounts</span>
          </div>
          <div className="text-[12.5px] text-content-3 mt-[5px]">selected for import</div>
          <div className="flex flex-col gap-2 mt-4">
            {BUCKETS.map((b) => ({ b, count: selectedAll.filter((a) => a.bucket === b.key).length })).filter((x) => x.count > 0).map(({ b, count }) => (
              <div key={b.key} className="flex items-center gap-2.5 text-[13px]">
                <span className="w-[9px] h-[9px] rounded-full flex-none" style={{ background: b.color }} />
                <span className="flex-1 text-content-2">{b.label}</span>
                <span className="font-mono font-semibold text-content">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <button onClick={doFetch} disabled={selectedTotal === 0 || fetching}
          className="h-12 rounded-[11px] text-on-primary font-sans font-bold text-[15px] shadow-sm flex items-center justify-center gap-2.5 transition-opacity"
          style={{ background: selectedTotal === 0 ? 'var(--surface-2)' : 'var(--primary)', cursor: selectedTotal === 0 ? 'not-allowed' : 'pointer', opacity: selectedTotal === 0 ? 0.6 : fetching ? 0.7 : 1 }}>
          {fetching ? 'Fetching…' : selectedTotal === 0 ? 'Select accounts to fetch' : `Fetch transactions (${selectedTotal})`}
          {!fetching && selectedTotal > 0 && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>}
        </button>
      </div>
    </div>
  );
}
