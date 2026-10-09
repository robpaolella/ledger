import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../lib/api';
import Spinner from '../components/Spinner';
import { formatMoney } from '@ledger/shared';
import { Money, Change } from '../components/Money';
import { getCategoryEmoji, getCategoryColorHex, useCategoryEmojis } from '../lib/categoryMeta';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { VendorAvatar, SegmentedControl } from '../components/primitives';
import KPICard from '../components/KPICard';
import CurrencyInput from '../components/CurrencyInput';
import ResponsiveModal from '../components/ResponsiveModal';
import ConfirmDeleteButton from '../components/ConfirmDeleteButton';
import PageHeader from '../components/PageHeader';
import { useIsMobile } from '../hooks/useIsMobile';
import MerchantPicker, { type MerchantOption } from '../components/MerchantPicker';

type Kind = 'monthly' | 'semi_monthly' | 'biweekly' | 'weekly' | 'every_n_months' | 'custom_months';

interface RItem {
  id: number; type: 'income' | 'expense'; label: string; merchant_id: number | null;
  category_id: number; account_id: number | null; amount: number | null;
  freq_kind: Kind; day: number | null; days_json: string | null; interval: number | null;
  anchor_date: string | null; months_json: string | null; start_date: string | null;
  status: 'active' | 'paused'; user_id: number | null;
  effective_start: string | null; effective_end: string | null;
  groupName: string; subName: string; displayName: string; categoryType: string;
  merchantName: string | null; merchantLogoUrl: string | null; accountName: string | null; accountLastFour: string | null;
}
interface ROcc {
  itemId: number; label: string; merchantName: string | null; merchantLogoUrl: string | null; date: string; amount: number;
  type: 'income' | 'expense'; categoryId: number; groupName: string; subName: string;
  categoryType: string; accountName: string | null; accountLastFour: string | null;
  frequency: Kind; status: 'paid' | 'due' | 'upcoming';
}
interface Flow { total: number; paid: number; remaining: number }
interface MonthView { month: string; occurrences: ROcc[]; income: Flow; expense: Flow; net: number }
interface Cat { id: number; group_name: string; sub_name: string; type: string; recurring_budget_mode?: string | null }
interface Acct { id: number; name: string; last_four: string | null; owner: string; owners?: { displayName: string }[]; isShared?: boolean }

const DAY_MS = 86_400_000;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const pad2 = (n: number) => String(n).padStart(2, '0');
// Recurring amounts are positive magnitudes plus a type. Shown in stored sign so the
// money rule applies: income is money in (green "+$X"), an expense is money out ("$X").
const flow = (amount: number, type: 'income' | 'expense') => (type === 'income' ? -Math.abs(amount) : Math.abs(amount));
const plain = (n: number) => formatMoney(n, { kind: 'balance' }).text;
function ymOfOffset(offset: number): string {
  const n = new Date();
  const d = new Date(n.getFullYear(), n.getMonth() + offset, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function todayYmd(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
}
function relativeLabel(dateStr: string, today: string): string {
  const [ay, am, ad] = dateStr.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  const days = Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(ty, tm - 1, td)) / DAY_MS);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}
function dateChip(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}`;
}
function annualOccurrences(it: { freq_kind: Kind; interval: number | null; months_json: string | null }): number {
  switch (it.freq_kind) {
    case 'monthly': return 12;
    case 'semi_monthly': return 24;
    case 'weekly': return 52;
    case 'biweekly': return 26;
    case 'every_n_months': return it.interval && it.interval > 0 ? 12 / it.interval : 12;
    case 'custom_months': { try { return (JSON.parse(it.months_json ?? '[]') as number[]).length; } catch { return 0; } }
  }
}
function cadenceLabel(it: { freq_kind: Kind; interval: number | null; months_json: string | null }): string {
  switch (it.freq_kind) {
    case 'monthly': return 'Every month';
    case 'semi_monthly': return 'Twice a month';
    case 'weekly': return 'Every week';
    case 'biweekly': return 'Every 2 weeks';
    case 'every_n_months': return it.interval === 1 ? 'Every month' : `Every ${it.interval ?? '?'} months`;
    case 'custom_months': { const n = annualOccurrences(it); return n === 1 ? 'Once a year' : `${n}× a year`; }
  }
}

export default function RecurringPage() {
  const isMobile = useIsMobile();
  const { addToast } = useToast();
  const { hasPermission } = useAuth();
  useCategoryEmojis(); // re-render when stored category emojis load/change
  const canEdit = hasPermission('budgets.edit');

  const [tab, setTab] = useState<'month' | 'all'>('month');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [monthOffset, setMonthOffset] = useState(0);
  const month = ymOfOffset(monthOffset);
  const today = todayYmd();

  const [items, setItems] = useState<RItem[]>([]);
  const [monthView, setMonthView] = useState<MonthView | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [accts, setAccts] = useState<Acct[]>([]);
  const [merchants, setMerchants] = useState<MerchantOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [panel, setPanel] = useState<RItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const loadItems = useCallback(async () => {
    try { const r = await apiFetch<{ data: RItem[] }>('/recurring'); setItems(r.data); }
    catch { addToast('Failed to load recurring items', 'error'); }
  }, [addToast]);
  const loadMonth = useCallback(async (alive: () => boolean = () => true) => {
    try { const r = await apiFetch<{ data: MonthView }>(`/recurring/occurrences?month=${month}`); if (alive()) setMonthView(r.data); }
    catch { if (alive()) addToast('Failed to load occurrences', 'error'); }
  }, [month, addToast]);
  const loadMeta = useCallback(async () => {
    try {
      const [c, a, m] = await Promise.all([
        apiFetch<{ data: Cat[] }>('/categories'),
        apiFetch<{ data: Acct[] }>('/accounts'),
        apiFetch<{ data: MerchantOption[] }>('/merchants'),
      ]);
      setCats(c.data); setAccts(a.data); setMerchants(m.data);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { loadItems(); }, [loadItems]);
  // Clear the prior month's data on change so the summary strip never shows stale
  // numbers under the new month's header while the fetch is in flight.
  // A stale response from a quickly-skipped month is dropped via the `alive` probe.
  useEffect(() => {
    let cancelled = false;
    const alive = () => !cancelled;
    setLoading(true); setMonthView(null);
    loadMonth(alive).finally(() => { if (alive()) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadMonth]);

  const refresh = async () => { await Promise.all([loadItems(), loadMonth()]); };

  // ----- summary strip -----
  const inc = monthView?.income ?? { total: 0, paid: 0, remaining: 0 };
  const exp = monthView?.expense ?? { total: 0, paid: 0, remaining: 0 };
  const net = monthView?.net ?? 0;

  const occByDay = useMemo(() => {
    const map = new Map<number, ROcc[]>();
    for (const o of monthView?.occurrences ?? []) {
      const d = Number(o.date.split('-')[2]);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(o);
    }
    return map;
  }, [monthView]);

  const groups = useMemo(() => {
    const occ = monthView?.occurrences ?? [];
    const of = (s: ROcc['status']) => occ.filter((o) => o.status === s);
    const netOf = (list: ROcc[]) => list.reduce((sum, o) => sum + (o.type === 'income' ? o.amount : -o.amount), 0);
    return [
      { key: 'due', title: 'Due soon', dot: 'var(--warning)', list: of('due') },
      { key: 'upcoming', title: 'Upcoming', dot: 'var(--primary)', list: of('upcoming') },
      { key: 'paid', title: 'Paid', dot: 'var(--positive)', list: of('paid') },
    ].filter((g) => g.list.length > 0).map((g) => ({ ...g, net: netOf(g.list) }));
  }, [monthView]);

  const annual = useMemo(() => {
    const active = items.filter((i) => i.status === 'active');
    const sum = (t: 'income' | 'expense') => active.filter((i) => i.type === t)
      .reduce((s, i) => s + (i.amount ?? 0) * annualOccurrences(i), 0);
    return { income: sum('income'), expense: sum('expense'), count: active.length };
  }, [items]);

  // ---------- render helpers ----------
  const occRow = (o: ROcc) => {
    const color = getCategoryColorHex(o.groupName);
    return (
      <button key={`${o.itemId}-${o.date}`} onClick={() => { const it = items.find((i) => i.id === o.itemId); if (it) setPanel(it); }}
        className="w-full flex items-center gap-3 md:gap-4 px-4 md:px-5 min-h-16 md:min-h-0 md:h-[58px] py-2 md:py-0 border-b border-line text-left hover:bg-surface-2/40 active:bg-surface-2">
        <VendorAvatar name={o.merchantName ?? o.label} src={o.merchantLogoUrl || undefined} size={34} color={color} />
        <div className="min-w-0 flex-[1.3]">
          <div className="font-semibold text-[15px] truncate">{o.label}</div>
          <div className="text-[12px] text-content-3 truncate">
            {cadenceLabel(items.find((i) => i.id === o.itemId) ?? { freq_kind: o.frequency, interval: null, months_json: null })}
            <span className="md:hidden">{o.accountName ? ` · ${o.accountName}` : ''}</span>
          </div>
        </div>
        <div className="hidden md:block w-[92px] shrink-0">
          <div className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--warning)' }}>{dateChip(o.date)}</div>
          <div className="text-[11px] text-content-3">{relativeLabel(o.date, today)}</div>
        </div>
        <div className="flex-1 min-w-0 text-[13px] text-content-3 truncate hidden md:block">{o.accountName ?? '—'}{o.accountLastFour ? ` (…${o.accountLastFour})` : ''}</div>
        <div className="flex-1 min-w-0 hidden md:flex items-center gap-1.5 text-[13px] text-content-2">
          <span className="text-[15px] leading-none">{getCategoryEmoji(o.subName)}</span>
          <span className="truncate">{o.subName}</span>
        </div>
        <div className="md:w-[110px] shrink-0 text-right">
          <div className="font-bold text-[15px]"><Money amount={flow(o.amount, o.type)} /></div>
          <div className="md:hidden text-[11.5px] tabular-nums mt-0.5"><span className="font-semibold" style={{ color: 'var(--warning)' }}>{dateChip(o.date)}</span><span className="text-content-3"> · {relativeLabel(o.date, today)}</span></div>
        </div>
      </button>
    );
  };

  const bar = (paid: number, total: number, color: string) => {
    const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
    return (
      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mt-2 mb-1.5">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    );
  };

  return (
    <div>
      {/* Header */}
      <PageHeader stackRight={false} title="Recurring"
        mobileActions={canEdit && (
          <button onClick={() => { setPanel(null); setModalOpen(true); }} aria-label="Add recurring">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        )}
        left={<>
          <div className="flex items-center gap-4 md:gap-5 text-[15px] font-semibold whitespace-nowrap">
            <button onClick={() => setTab('month')} className={tab === 'month' ? 'text-primary border-b-2 border-primary pb-0.5' : 'text-content-3 hover:text-content pb-0.5'}>This month</button>
            <button onClick={() => setTab('all')} className={tab === 'all' ? 'text-primary border-b-2 border-primary pb-0.5' : 'text-content-3 hover:text-content pb-0.5'}>All recurring</button>
          </div>
        </>} right={canEdit && !isMobile && (
          <button onClick={() => { setPanel(null); setModalOpen(true); }} className="inline-flex items-center gap-2 h-10 px-4 rounded-[11px] bg-primary text-on-primary font-bold text-sm shadow-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>Add recurring
          </button>
        )} />

      {tab === 'month' ? (
        <>
          {/* Summary + view toggle card */}
          <div className="bg-surface rounded-card border border-line shadow-sm mb-4">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3 px-4 md:px-6 pt-4 md:pt-5 pb-4">
              <span className="text-lg font-extrabold tracking-tight whitespace-nowrap">{monthLabel(month)}</span>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center">
                  <button onClick={() => setMonthOffset((o) => o - 1)} className="w-8 h-8 flex items-center justify-center rounded-l-[9px] border border-line text-content-2 hover:bg-surface-2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg></button>
                  <button onClick={() => setMonthOffset((o) => o + 1)} className="w-8 h-8 flex items-center justify-center rounded-r-[9px] border-y border-r border-line text-content-2 hover:bg-surface-2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg></button>
                </div>
                <button onClick={() => setMonthOffset(0)} className="h-8 px-3 flex items-center rounded-[9px] border border-line text-content-2 font-semibold text-[13px] hover:bg-surface-2">Today</button>
                <SegmentedControl value={view} onChange={(v) => setView(v as 'list' | 'calendar')}
                  options={[{ value: 'list', label: 'List' }, { value: 'calendar', label: 'Calendar' }]} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 border-t border-line">
              <div className="px-4 md:px-6 py-4 sm:border-r border-line">
                <div className="flex items-center justify-between"><span className="text-[13px] font-semibold text-content-2">Income</span><Money amount={-inc.total} className="text-[15px] font-extrabold" /></div>
                {bar(inc.paid, inc.total, 'var(--positive)')}
                <div className="flex justify-between text-[12px] text-content-3"><span>{plain(inc.paid)} received</span><span>{plain(inc.remaining)} remaining</span></div>
              </div>
              <div className="px-4 md:px-6 py-4 sm:border-r border-line border-t sm:border-t-0">
                <div className="flex items-center justify-between"><span className="text-[13px] font-semibold text-content-2">Expenses</span><Money amount={exp.total} className="text-[15px] font-extrabold" /></div>
                {bar(exp.paid, exp.total, 'var(--primary)')}
                <div className="flex justify-between text-[12px] text-content-3"><span>{plain(exp.paid)} paid</span><span>{plain(exp.remaining)} remaining</span></div>
              </div>
              <div className="px-4 md:px-6 py-4 border-t sm:border-t-0">
                <div className="flex items-center justify-between"><span className="text-[13px] font-semibold text-content-2">Net</span><Change value={net} className="text-[15px] font-extrabold" /></div>
                {bar(net >= 0 ? net : 0, Math.max(inc.total, 1), 'var(--positive)')}
                <div className="flex justify-between text-[12px] text-content-3"><span>{plain(inc.total)} in</span><span>{plain(exp.total)} out</span></div>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="bg-surface rounded-card border border-line shadow-sm"><Spinner /></div>
          ) : view === 'list' ? (
            groups.length === 0 ? (
              <div className="bg-surface rounded-card border border-line shadow-sm p-10 text-center text-content-3 text-sm">No recurring items this month.</div>
            ) : (
              <div className="flex flex-col gap-4">
                {groups.map((g) => (
                  <div key={g.key} className="bg-surface rounded-card border border-line shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-4 md:px-5 py-3 border-b border-line">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: g.dot }} />
                        <span className="font-bold text-sm">{g.title}</span>
                        <span className="text-[12px] text-content-3">{g.list.length} item{g.list.length !== 1 ? 's' : ''}</span>
                      </div>
                      <Money amount={-g.net} className="font-bold text-sm" />
                    </div>
                    {g.list.map(occRow)}
                  </div>
                ))}
              </div>
            )
          ) : (
            <CalendarGrid month={month} today={today} occByDay={occByDay} onOcc={(o) => { const it = items.find((i) => i.id === o.itemId); if (it) setPanel(it); }} />
          )}
        </>
      ) : (
        <AllRecurring items={items} annual={annual} onOpen={setPanel} />
      )}

      {panel && (
        <DetailPanel item={panel} monthOcc={(monthView?.occurrences ?? []).filter((o) => o.itemId === panel.id)} today={today}
          canEdit={canEdit} onClose={() => setPanel(null)} onEdit={() => setModalOpen(true)}
          onDeleted={async () => { setPanel(null); await refresh(); }} />
      )}

      {modalOpen && (
        <RecurringModal item={panel} cats={cats} accts={accts} merchants={merchants}
          onClose={() => setModalOpen(false)}
          onSaved={async () => { setModalOpen(false); setPanel(null); await refresh(); }} />
      )}
    </div>
  );
}

// ============================ Calendar grid ============================
function CalendarGrid({ month, today, occByDay, onOcc }: {
  month: string; today: string; occByDay: Map<number, ROcc[]>; onOcc: (o: ROcc) => void;
}) {
  const [y, m] = month.split('-').map(Number);
  const firstDow = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const todayDay = today.startsWith(month) ? Number(today.split('-')[2]) : -1;

  return (
    <div className="bg-surface rounded-card border border-line shadow-sm overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line">
        {WEEKDAYS.map((w) => <div key={w} className="px-3 py-2 text-[11px] font-semibold tracking-[0.06em] text-content-3">{w}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => (
          <div key={i} className="min-h-[104px] border-b border-r border-line p-1.5 last:border-r-0" style={{ borderRightWidth: (i + 1) % 7 === 0 ? 0 : undefined }}>
            {d !== null && (
              <>
                <div className="flex justify-start mb-1">
                  <span className={`text-[13px] font-semibold w-6 h-6 flex items-center justify-center rounded-full ${d === todayDay ? 'bg-primary text-on-primary' : 'text-content-2'}`}>{d}</span>
                </div>
                <div className="flex flex-col gap-1">
                  {(occByDay.get(d) ?? []).map((o) => {
                    const color = getCategoryColorHex(o.groupName);
                    return (
                      <button key={`${o.itemId}-${o.date}`} onClick={() => onOcc(o)} title={`${o.label} · ${o.subName}`}
                        className="flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-semibold text-left truncate"
                        style={{ background: o.type === 'income' ? 'color-mix(in srgb, var(--positive) 18%, transparent)' : `color-mix(in srgb, ${color} 16%, transparent)`, color: o.type === 'income' ? 'var(--positive)' : 'var(--text)' }}>
                        <span className="leading-none">{o.type === 'income' ? '💵' : getCategoryEmoji(o.subName)}</span>
                        <Money amount={flow(o.amount, o.type)} className="truncate" />
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================ All recurring ============================
function AllRecurring({ items, annual, onOpen }: {
  items: RItem[]; annual: { income: number; expense: number; count: number }; onOpen: (i: RItem) => void;
}) {
  const sorted = [...items].sort((a, b) => a.label.localeCompare(b.label));
  const annualIncome = formatMoney(-annual.income);
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <KPICard label="Annual recurring expenses" value={formatMoney(annual.expense).text} />
        <KPICard label="Annual recurring income" value={annualIncome.text} valueColor={annualIncome.tone === 'positive' ? 'var(--positive)' : undefined} />
        <KPICard label="Active recurring items" value={String(annual.count)} />
      </div>
      <div className="bg-surface rounded-card border border-line shadow-sm overflow-hidden">
        <div className="hidden md:grid grid-cols-[1.6fr_1.3fr_0.9fr_1fr] px-5 py-3 border-b border-line text-[11px] font-semibold uppercase tracking-[0.05em] text-content-3">
          <span>Label</span><span>Category</span><span className="text-right">Amount</span><span>Cadence</span>
        </div>
        {sorted.length === 0 && <div className="p-10 text-center text-content-3 text-sm">No recurring items yet.</div>}
        {sorted.map((it) => {
          const paused = it.status === 'paused';
          const months = (() => { try { return JSON.parse(it.months_json ?? '[]') as number[]; } catch { return []; } })();
          return (
            <button key={it.id} onClick={() => onOpen(it)}
              className={`w-full grid grid-cols-[1.6fr_1.3fr_0.9fr_1fr] items-center px-5 py-3 border-b border-line text-left hover:bg-surface-2/40 ${paused ? 'opacity-55' : ''}`}>
              <div className="flex items-center gap-3 min-w-0">
                <VendorAvatar name={it.merchantName ?? it.label} src={it.merchantLogoUrl || undefined} size={30} color={getCategoryColorHex(it.groupName)} />
                <div className="min-w-0">
                  <div className="font-semibold text-[14px] truncate">{it.label}</div>
                  {paused && <div className="text-[11px] text-content-3">Paused</div>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[13px] text-content-2 min-w-0"><span className="text-[15px] leading-none">{getCategoryEmoji(it.subName)}</span><span className="truncate">{it.subName}</span></div>
              <div className="text-right font-bold text-[14px]"><Money amount={flow(it.amount ?? 0, it.type)} /></div>
              <div className="text-[13px] text-content-2">
                {it.freq_kind === 'custom_months'
                  ? <div className="flex flex-wrap gap-1">{months.map((mo) => <span key={mo} className="px-1.5 py-0.5 rounded-md bg-surface-2 border border-line text-[11px] font-semibold">{MONTH_NAMES[mo - 1]}</span>)}</div>
                  : cadenceLabel(it)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================ Detail panel ============================
function DetailPanel({ item, monthOcc, today, canEdit, onClose, onEdit, onDeleted }: {
  item: RItem; monthOcc: ROcc[]; today: string; canEdit: boolean;
  onClose: () => void; onEdit: () => void; onDeleted: () => void;
}) {
  const { addToast } = useToast();
  const color = getCategoryColorHex(item.groupName);
  // Only the genuinely-upcoming occurrence this month counts as "Next" — never a
  // past one (which would render "Next: … · N days ago").
  const next = monthOcc.filter((o) => o.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
  const del = async () => {
    try { await apiFetch(`/recurring/${item.id}`, { method: 'DELETE' }); addToast('Recurring item deleted'); onDeleted(); }
    catch { addToast('Failed to delete', 'error'); }
  };
  const row = (label: string, val: React.ReactNode) => (
    <div className="flex items-center justify-between py-3 border-b border-line"><span className="text-[13px] text-content-3">{label}</span><span className="text-[14px] font-semibold text-content text-right">{val}</span></div>
  );
  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[70]" style={{ background: 'var(--bg-modal)' }} />
      <div className="fixed top-0 right-0 bottom-0 z-[71] w-[420px] max-w-full bg-surface border-l border-line-strong shadow-md flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <span className="text-[15px] font-extrabold tracking-tight">Recurring item</span>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-[9px] text-content-2 hover:bg-surface-2"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="flex items-center gap-3 mb-5">
            <VendorAvatar name={item.merchantName ?? item.label} src={item.merchantLogoUrl || undefined} size={48} color={color} />
            <div className="min-w-0">
              <div className="text-lg font-extrabold truncate">{item.label}</div>
              <div className="text-[13px] text-content-3 truncate">
                {item.merchantName && item.merchantName !== item.label ? `${item.merchantName} · ` : ''}{cadenceLabel(item)}
              </div>
            </div>
          </div>
          <div className="text-[30px] font-extrabold tracking-tight mb-1"><Money amount={flow(item.amount ?? 0, item.type)} /></div>
          {next && <div className="text-[13px] text-content-3 mb-6">Next: {dateChip(next.date)} · {relativeLabel(next.date, today)}</div>}
          {row('Vendor', item.merchantName ?? '—')}
          {row('Account', item.accountName ? `${item.accountName}${item.accountLastFour ? ` (…${item.accountLastFour})` : ''}` : '—')}
          {row('Category', <span className="inline-flex items-center gap-1.5">{getCategoryEmoji(item.subName)} {item.subName}</span>)}
          {row('Frequency', cadenceLabel(item))}
          {row('Status', <span className={item.status === 'active' ? 'text-positive' : 'text-content-3'}>{item.status === 'active' ? 'Active' : 'Paused'}</span>)}
          {canEdit && (
            <div className="mt-6 flex flex-col gap-2.5">
              <button onClick={onEdit} className="w-full h-11 rounded-[11px] bg-primary text-on-primary font-bold text-sm shadow-sm">Edit recurring</button>
              <ConfirmDeleteButton onConfirm={del} variant="block" />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ============================ Add / Edit modal ============================
const FREQ_CHIPS: { value: Kind; label: string }[] = [
  { value: 'monthly', label: 'Monthly' }, { value: 'semi_monthly', label: 'Semi-monthly' },
  { value: 'biweekly', label: 'Bi-weekly' }, { value: 'weekly', label: 'Weekly' },
  { value: 'every_n_months', label: 'Every N months' }, { value: 'custom_months', label: 'Custom months' },
];

function RecurringModal({ item, cats, accts, merchants, onClose, onSaved }: {
  item: RItem | null; cats: Cat[]; accts: Acct[]; merchants: MerchantOption[]; onClose: () => void; onSaved: () => void;
}) {
  const { addToast } = useToast();
  const editing = !!item;
  const [type, setType] = useState<'income' | 'expense'>(item?.type ?? 'expense');
  const [label, setLabel] = useState(item?.label ?? '');
  // Seed empty when the merchant was derived from the label — otherwise saving would send it
  // explicitly and pin it, so renaming the label later would stop re-deriving the vendor.
  const [merchantName, setMerchantName] = useState(item && item.merchantName && item.merchantName !== item.label ? item.merchantName : '');
  const [amount, setAmount] = useState(item?.amount != null ? String(item.amount) : '');
  const [categoryId, setCategoryId] = useState<number | ''>(item?.category_id ?? '');
  const [accountId, setAccountId] = useState<number | ''>(item?.account_id ?? '');
  const [freqKind, setFreqKind] = useState<Kind>(item?.freq_kind ?? 'monthly');
  const initDays = (() => { try { return JSON.parse(item?.days_json ?? '[]') as number[]; } catch { return []; } })();
  const [day, setDay] = useState<number>(item?.day ?? 1);
  const [day1, setDay1] = useState<number>(initDays[0] ?? 1);
  const [day2, setDay2] = useState<number>(initDays[1] ?? 15);
  const [interval, setIntervalN] = useState<number>(item?.interval ?? 3);
  const [months, setMonths] = useState<number[]>((() => { try { return JSON.parse(item?.months_json ?? '[]') as number[]; } catch { return []; } })());
  const [startDate, setStartDate] = useState<string>(item?.start_date ?? todayYmd());
  const [status, setStatus] = useState<'active' | 'paused'>(item?.status ?? 'active');
  const [saving, setSaving] = useState(false);

  const catOptions = useMemo(() => {
    const wanted = type === 'income' ? ['income'] : ['expense'];
    const filtered = cats.filter((c) => wanted.includes(c.type));
    const groups = new Map<string, Cat[]>();
    for (const c of filtered) { if (!groups.has(c.group_name)) groups.set(c.group_name, []); groups.get(c.group_name)!.push(c); }
    return [...groups.entries()];
  }, [cats, type]);

  const acctGroups = useMemo(() => {
    const m = new Map<string, Acct[]>();
    for (const a of accts) { const k = a.isShared ? 'Shared' : (a.owners?.[0]?.displayName || a.owner); if (!m.has(k)) m.set(k, []); m.get(k)!.push(a); }
    return [...m.entries()];
  }, [accts]);

  // When switching type, keep the category only if it still matches.
  const onTypeChange = (t: 'income' | 'expense') => {
    setType(t);
    const stillValid = cats.find((c) => c.id === categoryId && (t === 'income' ? c.type === 'income' : c.type !== 'income'));
    if (!stillValid) setCategoryId('');
  };

  const parsedAmount = parseFloat(amount);
  const valid = !!label.trim() && categoryId !== '' && parsedAmount > 0 && !!startDate
    && (freqKind !== 'custom_months' || months.length > 0)
    && (freqKind !== 'semi_monthly' || day1 !== day2)
    && (freqKind !== 'every_n_months' || interval >= 1);

  const dayField = (val: number, set: (n: number) => void, label2: string) => (
    <div>
      <div className="text-[12px] font-semibold text-content-2 mb-1.5">{label2}</div>
      <select value={val} onChange={(e) => set(Number(e.target.value))} className="w-full h-11 px-3 rounded-[10px] bg-surface-2 border border-line text-content text-sm outline-none">
        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
        <option value={0}>Last day</option>
      </select>
    </div>
  );

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    const body: Record<string, unknown> = {
      label: label.trim(), categoryId, accountId: accountId === '' ? null : accountId,
      amount: parsedAmount, freqKind, startDate, status,
      // Empty = omit the key so the server derives the merchant from the label.
      ...(merchantName.trim() ? { merchant: merchantName.trim() } : {}),
    };
    if (freqKind === 'monthly' || freqKind === 'every_n_months' || freqKind === 'custom_months') body.day = day;
    if (freqKind === 'semi_monthly') { body.dayOfMonth1 = day1; body.dayOfMonth2 = day2; }
    if (freqKind === 'every_n_months') body.interval = interval;
    if (freqKind === 'custom_months') body.months = months;
    try {
      if (editing) {
        await apiFetch(`/recurring/${item!.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        addToast('Recurring item updated');
      } else {
        await apiFetch('/recurring', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        addToast('Recurring item added');
      }
      onSaved();
    } catch (e) { addToast(e instanceof Error ? e.message : 'Failed to save', 'error'); setSaving(false); }
  };

  const fieldCls = 'w-full h-11 px-3 rounded-[10px] bg-surface-2 border border-line text-content text-sm outline-none';
  const labelCls = 'text-[12px] font-semibold uppercase tracking-[0.04em] text-content-2 mb-1.5';

  return (
    <ResponsiveModal isOpen onClose={onClose} title={editing ? 'Edit recurring' : 'Add recurring'} maxWidth="540px">
      <div className="flex flex-col gap-4">
        <div>
          <div className={labelCls}>Type</div>
          <SegmentedControl value={type} onChange={(v) => onTypeChange(v as 'income' | 'expense')} className="w-full"
            options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} />
        </div>
        <div>
          <div className={labelCls}>Label</div>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Netflix" className={fieldCls} />
        </div>
        <div>
          <div className={labelCls}>Vendor (optional)</div>
          <MerchantPicker value={merchantName} merchants={merchants} onSelect={setMerchantName}
            allowClear placeholder="Same as label" triggerClassName={fieldCls} />
          <div className="mt-1.5 text-[11px] text-content-3">Used for the logo and merchant matching. Leave empty to use the label.</div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className={labelCls}>Amount</div>
            <CurrencyInput value={amount} onChange={setAmount} className={fieldCls} />
          </div>
          <div>
            <div className={labelCls}>Category</div>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')} className={fieldCls}>
              <option value="">Select…</option>
              {catOptions.map(([g, list]) => <optgroup key={g} label={g}>{list.map((c) => <option key={c.id} value={c.id}>{c.sub_name}</option>)}</optgroup>)}
            </select>
          </div>
        </div>

        <div>
          <div className={labelCls}>Frequency</div>
          <div className="flex flex-wrap gap-2">
            {FREQ_CHIPS.map((f) => (
              <button key={f.value} onClick={() => setFreqKind(f.value)}
                className={`px-3 h-9 rounded-[10px] text-[13px] font-semibold border ${freqKind === f.value ? 'bg-primary text-on-primary border-primary' : 'bg-surface-2 text-content-2 border-line'}`}>{f.label}</button>
            ))}
          </div>
        </div>

        {/* Contextual frequency controls */}
        {freqKind === 'monthly' && <div className="grid grid-cols-2 gap-4">{dayField(day, setDay, 'Day of month')}</div>}
        {freqKind === 'semi_monthly' && <div className="grid grid-cols-2 gap-4">{dayField(day1, setDay1, 'First day')}{dayField(day2, setDay2, 'Second day')}</div>}
        {freqKind === 'every_n_months' && (
          <div className="grid grid-cols-2 gap-4">
            <div><div className="text-[12px] font-semibold text-content-2 mb-1.5">Repeat every (months)</div><input type="number" min={1} value={interval} onChange={(e) => setIntervalN(Math.max(1, Number(e.target.value) || 1))} className={fieldCls} /></div>
            {dayField(day, setDay, 'Day of month')}
          </div>
        )}
        {freqKind === 'custom_months' && (
          <div>
            <div className="text-[12px] font-semibold text-content-2 mb-1.5">Occurs in</div>
            <div className="grid grid-cols-6 gap-1.5 mb-3">
              {MONTH_NAMES.map((mn, i) => {
                const mo = i + 1; const on = months.includes(mo);
                return <button key={mo} onClick={() => setMonths((prev) => on ? prev.filter((x) => x !== mo) : [...prev, mo])}
                  className={`h-9 rounded-[8px] text-[12px] font-semibold border ${on ? 'bg-primary text-on-primary border-primary' : 'bg-surface-2 text-content-2 border-line'}`}>{mn}</button>;
              })}
            </div>
            {dayField(day, setDay, 'Day of month')}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className={labelCls}>Start date</div>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`${fieldCls} font-mono`} />
          </div>
          <div>
            <div className={labelCls}>Account (optional)</div>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')} className={fieldCls}>
              <option value="">None</option>
              {acctGroups.map(([g, list]) => <optgroup key={g} label={g}>{list.map((a) => <option key={a.id} value={a.id}>{a.name}{a.last_four ? ` (…${a.last_four})` : ''}</option>)}</optgroup>)}
            </select>
          </div>
        </div>
        <div>
          <div className={labelCls}>Status</div>
          <SegmentedControl value={status} onChange={(v) => setStatus(v as 'active' | 'paused')} className="w-full"
            options={[{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }]} />
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button onClick={onClose} className="h-11 px-4 rounded-[11px] border border-line-strong bg-surface-2 text-content font-semibold text-sm">Cancel</button>
          <button onClick={save} disabled={!valid || saving} className="h-11 px-5 rounded-[11px] bg-primary text-on-primary font-bold text-sm shadow-sm disabled:opacity-50">{editing ? 'Save' : 'Add recurring'}</button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
