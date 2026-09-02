import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { apiFetch } from '../lib/api';
import { scopeTxnsToCategory, type ScopeLeg, type CatScope } from '../lib/categoryScope';
import { fmtTransaction } from '../lib/formatters';
import { getCategoryEmoji, getCategoryColorVar, useCategoryEmojis } from '../lib/categoryMeta';
import Spinner from '../components/Spinner';
import { VendorAvatar } from '../components/primitives';
import FilterPopover from '../components/FilterPopover';
import DateRangePopover from '../components/DateRangePopover';
import { type FilterDraft, EMPTY_FILTER, filterDraftCount } from '../components/filterModel';

// ── Types (mirror GET /api/reports/period + GET /api/transactions) ──
interface Bucket { label: string; start: string; end: string }
interface PeriodCat { categoryId: number; groupName: string; subName: string; type: string; sortOrder: number; total: number; buckets: number[] }
interface PeriodKpis { income: number; expenses: number; net: number; savingsRate: number; incomeSourceCount: number }
interface PeriodData { range: { start: string; end: string; months: number }; buckets: Bucket[]; categories: PeriodCat[]; kpis: PeriodKpis }
interface Txn {
  id: number; date: string; description: string | null; amount: number;
  merchant: { id: number; name: string; logoUrl?: string | null } | null;
  account: { id: number; name: string; lastFour: string | null; logoUrl?: string | null; color?: string | null } | null;
  category: { id: number; groupName: string; subName: string; displayName: string; type: string } | null;
  splits?: ScopeLeg[] | null;
}
interface MerchantOpt { id: number; name: string }
interface AccountOpt { id: number; name: string; last_four?: string | null; classification?: string | null }
interface CategoryRow { id: number; group_name: string; sub_name: string; type: string }

type Preset = '1M' | '3M' | '6M' | 'YTD' | 'CY' | '1Y' | 'custom';
type TrendMetric = 'expenses' | 'income';
type ChartMode = 'cumulative' | 'monthly';
type CatView = 'summary' | 'timeline';
type SortId = 'date_desc' | 'date_asc' | 'amt_desc' | 'amt_asc';

const MFULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SUBPAL = ['--c-violet', '--c-blue', '--c-teal', '--c-orange', '--c-green', '--c-fuchsia', '--c-amber', '--c-rose', '--c-indigo'];
const subColor = (i: number) => `var(${SUBPAL[i % SUBPAL.length]})`;

const money0 = (v: number) => { const r = Math.round(v); return `${r < 0 ? '-' : ''}$${Math.abs(r).toLocaleString('en-US')}`; };
const fmtK = (v: number) => { const a = Math.abs(v), sign = v < 0 ? '-' : ''; return a >= 1000 ? `${sign}$${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k` : `${sign}$${Math.round(a)}`; };
const pad2 = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const usDate = (iso: string) => { const [y, m, d] = iso.split('-'); return `${m}/${d}/${y}`; };

const PRESETS: { id: Preset; name: string }[] = [
  { id: '1M', name: 'This month' },
  { id: '3M', name: 'Last 3 months' },
  { id: '6M', name: 'Last 6 months' },
  { id: 'YTD', name: 'Year to date' },
  { id: 'CY', name: 'This year' },
  { id: '1Y', name: 'Last 12 months' },
];

function presetRange(preset: Preset, customStart: string, customEnd: string): { start: string; end: string; label: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const firstOf = (yy: number, mm: number) => ymd(new Date(yy, mm, 1));
  const lastOf = (yy: number, mm: number) => ymd(new Date(yy, mm + 1, 0));
  switch (preset) {
    case '1M': return { start: firstOf(y, m), end: lastOf(y, m), label: 'This month' };
    case '3M': return { start: ymd(new Date(y, m - 2, 1)), end: lastOf(y, m), label: 'Last 3 months' };
    case '6M': return { start: ymd(new Date(y, m - 5, 1)), end: lastOf(y, m), label: 'Last 6 months' };
    case 'YTD': return { start: firstOf(y, 0), end: ymd(now), label: 'Year to date' };
    case 'CY': return { start: firstOf(y, 0), end: lastOf(y, 11), label: 'This year' };
    case '1Y': return { start: ymd(new Date(y, m - 11, 1)), end: lastOf(y, m), label: 'Last 12 months' };
    case 'custom': return { start: customStart, end: customEnd, label: `${usDate(customStart)} – ${usDate(customEnd)}` };
  }
}

// Category tokens (canonical FilterDraft): 'sub:<id>' and 'group:<name>'.
const catIdsOf = (f: FilterDraft) => f.category.filter((c) => c.startsWith('sub:')).map((c) => c.slice(4));
const groupsOf = (f: FilterDraft) => f.category.filter((c) => c.startsWith('group:')).map((c) => c.slice(6));

// Build the querystring the (applied) filter set contributes to /reports/period.
function reportFilterParams(f: FilterDraft): URLSearchParams {
  const p = new URLSearchParams();
  if (f.account.length) p.set('accountIds', f.account.join(','));
  if (f.merchant.length) p.set('merchantIds', f.merchant.join(','));
  const catIds = catIdsOf(f), groups = groupsOf(f);
  if (catIds.length) p.set('categoryIds', catIds.join(','));
  if (groups.length) p.set('groupNames', groups.join(','));
  if (f.op) {
    p.set('amountOp', f.op);
    if (f.op === 'bt') { if (f.min) p.set('amountMin', f.min); if (f.max) p.set('amountMax', f.max); }
    else if (f.val) p.set('amountValue', f.val);
  }
  // Type = Debits/Credits, treated (like Transactions) as category type.
  if (f.type === 'Expense') p.set('catType', 'expense');
  else if (f.type === 'Income') p.set('catType', 'income');
  return p;
}

// ── Derived group/section model from the flat per-category list ──
interface GroupAgg { groupName: string; type: string; total: number; buckets: number[]; subs: PeriodCat[] }
interface Section { key: string; label: string; total: number; groups: GroupAgg[] }

function buildSections(cats: PeriodCat[], nBuckets: number): Record<string, Section> {
  const mk = (key: string, label: string, type: string): Section => {
    const groupMap = new Map<string, GroupAgg>();
    for (const c of cats.filter((x) => x.type === type)) {
      let g = groupMap.get(c.groupName);
      if (!g) { g = { groupName: c.groupName, type, total: 0, buckets: new Array(nBuckets).fill(0), subs: [] }; groupMap.set(c.groupName, g); }
      g.total += c.total;
      c.buckets.forEach((v, i) => { g!.buckets[i] += v; });
      g.subs.push(c);
    }
    const groups = Array.from(groupMap.values()).sort((a, b) => b.total - a.total);
    groups.forEach((g) => g.subs.sort((a, b) => b.total - a.total));
    return { key, label, type, total: groups.reduce((s, g) => s + g.total, 0), groups } as Section;
  };
  return { income: mk('income', 'Income', 'income'), expenses: mk('expenses', 'Expenses', 'expense') };
}

const cum = (arr: number[]) => { let s = 0; return arr.map((v) => (s += v)); };

export default function ReportsPage() {
  useCategoryEmojis(); // re-render when stored category emojis load/change
  // ── period ──
  const [preset, setPreset] = useState<Preset>('YTD');
  const [customStart, setCustomStart] = useState(ymd(new Date(new Date().getFullYear(), 0, 1)));
  const [customEnd, setCustomEnd] = useState(ymd(new Date()));
  const range = useMemo(() => presetRange(preset, customStart, customEnd), [preset, customStart, customEnd]);

  // ── filters (draft in popover, applied drives fetch) ──
  const [filters, setFilters] = useState<FilterDraft>(EMPTY_FILTER);
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterTab, setFilterTab] = useState('Categories');
  const [filterSearch, setFilterSearch] = useState('');

  // ── view state ──
  const [view, setView] = useState<'breakdown' | 'trends'>('breakdown');
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('expenses');
  const [chartMode, setChartMode] = useState<ChartMode>('cumulative');
  const [catView, setCatView] = useState<CatView>('summary');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({}); // per-group inline expand (key = `${section}|${group}`)
  const [focusGroup, setFocusGroup] = useState<string | null>(null);
  const [isolate, setIsolate] = useState<string | null>(null);
  const [hoverLine, setHoverLine] = useState<string | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [flowHover, setFlowHover] = useState<number | null>(null);

  // Measure the flow-bar so segments can take integer-pixel widths — fixed gap
  // + fractional widths otherwise anti-aliases each gap to a different device px.
  const [barW, setBarW] = useState(0);
  const roRef = useRef<ResizeObserver | null>(null);
  const flowBarRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    if (el) {
      const ro = new ResizeObserver((entries) => setBarW(entries[0]?.contentRect.width ?? 0));
      ro.observe(el);
      roRef.current = ro;
      setBarW(el.getBoundingClientRect().width);
    }
  }, []);
  const [showAll, setShowAll] = useState(false);
  const [txnSort, setTxnSort] = useState<SortId>('date_desc');
  const [sortOpen, setSortOpen] = useState(false);

  // ── data ──
  const [report, setReport] = useState<PeriodData | null>(null);
  const [loading, setLoading] = useState(true);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [txnTotal, setTxnTotal] = useState(0);
  const [merchants, setMerchants] = useState<MerchantOpt[]>([]);
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [groupMeta, setGroupMeta] = useState<{ name: string; type: string; color: string | null }[]>([]);

  const TXN_LIMIT = 1000;
  const appliedKey = useMemo(() => JSON.stringify(filters), [filters]);

  // Load filter option lists once.
  useEffect(() => {
    apiFetch<{ data: MerchantOpt[] }>('/merchants').then((r) => setMerchants(r.data)).catch(() => {});
    apiFetch<{ data: AccountOpt[] }>('/accounts').then((r) => setAccounts(r.data)).catch(() => {});
    apiFetch<{ data: CategoryRow[] }>('/categories').then((r) => setCategories(r.data)).catch(() => {});
    apiFetch<{ data: { name: string; type: string; color: string | null }[] }>('/categories/groups').then((r) => setGroupMeta(r.data)).catch(() => {});
  }, []);

  // Owner-chosen group swatch colors, keyed by `${type}:${name}` (DB type: income/expense).
  const groupColorMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const g of groupMeta) if (g.color) m[`${g.type}:${g.name}`] = g.color;
    return m;
  }, [groupMeta]);
  // Section keys are plural (expenses); DB type is singular (expense).
  const typeOfSection = (sk: string) => (sk === 'expenses' ? 'expense' : sk);
  const groupColorVar = (type: string, name: string) => {
    const c = groupColorMap[`${type}:${name}`];
    return c ? `var(--${c})` : getCategoryColorVar(name);
  };

  // Load the period report.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const p = reportFilterParams(filters);
    p.set('start', range.start); p.set('end', range.end);
    apiFetch<{ data: PeriodData }>(`/reports/period?${p.toString()}`)
      .then((r) => { if (!cancelled) setReport(r.data); })
      .catch(() => { if (!cancelled) setReport(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range.start, range.end, appliedKey, filters]);

  // Load transactions for the bottom card (range + applied filters + focus).
  useEffect(() => {
    let cancelled = false;
    const p = new URLSearchParams();
    p.set('startDate', range.start); p.set('endDate', range.end); p.set('limit', String(TXN_LIMIT));
    p.set('sortBy', 'date'); p.set('sortOrder', 'desc');
    let scope: CatScope = {};
    if (focusGroup) { p.set('groupName', focusGroup); scope = { groupNames: [focusGroup] }; }
    else {
      const groups = groupsOf(filters), catIds = catIdsOf(filters);
      if (groups.length) p.set('groupNames', groups.join(','));
      if (catIds.length) p.set('categoryIds', catIds.join(','));
      scope = { groupNames: groups, categoryIds: catIds.map(Number) };
    }
    if (filters.merchant.length) p.set('merchantIds', filters.merchant.join(','));
    if (filters.account.length) p.set('accountIds', filters.account.join(','));
    if (filters.op) {
      p.set('amountOp', filters.op);
      if (filters.op === 'bt') { if (filters.min) p.set('amountMin', filters.min); if (filters.max) p.set('amountMax', filters.max); }
      else if (filters.val) p.set('amountValue', filters.val);
    }
    if (filters.type === 'Expense') p.set('type', 'expense');
    else if (filters.type === 'Income') p.set('type', 'income');
    apiFetch<{ data: Txn[]; total: number }>(`/transactions?${p.toString()}`)
      .then((r) => { if (!cancelled) { setTxns(scopeTxnsToCategory(r.data, scope)); setTxnTotal(r.total ?? r.data.length); } })
      .catch(() => { if (!cancelled) { setTxns([]); setTxnTotal(0); } });
    return () => { cancelled = true; };
  }, [range.start, range.end, appliedKey, filters, focusGroup]);

  const buckets = report?.buckets ?? [];
  const nB = buckets.length;
  const sections = useMemo(() => (report ? buildSections(report.categories, nB) : null), [report, nB]);

  // Focused group object (drill target).
  const focusObj = (() => {
    if (!focusGroup || !sections) return null;
    for (const s of Object.values(sections)) { const g = s.groups.find((x) => x.groupName === focusGroup); if (g) return { section: s, group: g }; }
    return null;
  })();

  const drillTo = useCallback((groupName: string) => {
    setFocusGroup(groupName); setIsolate(null); setShowAll(false); setHoverIdx(null); setHoverLine(null);
  }, []);
  const clearFocus = useCallback(() => { setFocusGroup(null); setIsolate(null); }, []);

  // If the focused group vanishes after a period/filter change, drop the focus so
  // the transactions card and the rest of the page stay in sync.
  useEffect(() => { if (focusGroup && report && !focusObj) clearFocus(); }, [focusGroup, report, focusObj, clearFocus]);

  const applyFilters = () => { setFilters(draft); setFilterOpen(false); };
  const openFilters = () => { setDraft(filters); setFilterTab('Categories'); setFilterSearch(''); setFilterOpen(true); };
  const clearDraft = () => setDraft(EMPTY_FILTER);

  if (loading && !report) return <div className="flex justify-center py-24"><Spinner /></div>;
  if (!report || !sections) return <div className="pb-16"><div className="text-center py-24 text-content-3">Failed to load reports.</div></div>;

  const k = report.kpis;
  const months = Math.max(1, report.range.months);
  const kpis = [
    { label: 'Income', value: money0(k.income), sub: `${k.incomeSourceCount} income source${k.incomeSourceCount === 1 ? '' : 's'}`, color: 'text-content', subColor: 'text-content-3' },
    { label: 'Expenses', value: money0(k.expenses), sub: `${money0(k.expenses / months)} avg / mo`, color: 'text-content', subColor: 'text-content-3' },
    { label: 'Net', value: money0(k.net), sub: k.net >= 0 ? '▲ money kept' : '▼ over income', color: k.net >= 0 ? 'text-positive' : 'text-negative', subColor: k.net >= 0 ? 'text-positive' : 'text-negative' },
    { label: 'Savings rate', value: `${Math.round(k.savingsRate * 100)}%`, sub: `${money0(k.net / months)} avg / mo`, color: 'text-content', subColor: k.net >= 0 ? 'text-positive' : 'text-negative' },
  ];

  // ── FLOW BAR (where the money that went out went: top expense groups + Other) ──
  const expGroups = sections.expenses.groups;
  const flowSegs: { name: string; color: string; emoji: string; amount: number; pct: number; drill: string | null }[] = [];
  // Focused: shares of the group total. Unfocused: allocation of money that went OUT
  // — expenses only (no income / no "unspent"), so it fills the bar.
  const flowDenom = focusObj ? focusObj.group.total : k.expenses;
  const showFlow = flowDenom > 0;
  if (showFlow) {
    if (focusObj) {
      focusObj.group.subs.forEach((s, i) => flowSegs.push({ name: s.subName, color: subColor(i), emoji: getCategoryEmoji(s.subName), amount: s.total, pct: s.total / flowDenom, drill: null }));
    } else {
      const top = expGroups.slice(0, 6);
      top.forEach((g) => flowSegs.push({ name: g.groupName, color: groupColorVar('expense', g.groupName), emoji: getCategoryEmoji(g.groupName), amount: g.total, pct: g.total / flowDenom, drill: g.groupName }));
      const otherAmt = expGroups.slice(6).reduce((s, g) => s + g.total, 0);
      if (otherAmt > 0) flowSegs.push({ name: 'Other', color: 'var(--text-3)', emoji: '📦', amount: otherAmt, pct: otherAmt / flowDenom, drill: null });
    }
  }
  const flowDenomLabel = focusObj ? focusObj.group.groupName : `Spent ${money0(k.expenses)}`;
  // Lay the bar out in whole DEVICE pixels so the gap AND every segment edge land
  // on the device grid — then all gaps render at an identical device-pixel width
  // at any DPR (fractional CSS px otherwise anti-aliases gaps to 2 vs 3 px).
  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  const flowGapDev = Math.max(1, Math.round(2 * dpr)); // ≈ 2 CSS px, whole device px
  const flowGapCss = flowGapDev / dpr;
  const flowWidthsCss: number[] = (() => {
    if (!(barW > 0) || flowSegs.length === 0) return [];
    const deviceW = Math.round(barW * dpr);
    const availDev = Math.max(0, deviceW - flowGapDev * (flowSegs.length - 1));
    const wDev = flowSegs.map((s) => Math.round(Math.max(0, s.pct) * availDev));
    let mi = 0;
    for (let i = 1; i < wDev.length; i++) if (wDev[i] > wDev[mi]) mi = i;
    wDev[mi] = Math.max(0, wDev[mi] + (availDev - wDev.reduce((a, b) => a + b, 0))); // absorb drift
    return wDev.map((d) => d / dpr);
  })();

  // ── TRENDS (multi-line) ──
  const trendType = trendMetric === 'income' ? 'income' : 'expense';
  const trendGroups: { key: string; name: string; color: string; buckets: number[] }[] = focusObj
    ? focusObj.group.subs.map((s, i) => ({ key: `s${s.categoryId}`, name: s.subName, color: subColor(i), buckets: s.buckets }))
    : (trendType === 'income' ? sections.income.groups : sections.expenses.groups).map((g) => ({ key: g.groupName, name: g.groupName, color: groupColorVar(trendType === 'income' ? 'income' : 'expense', g.groupName), buckets: g.buckets }));
  const totalName = focusObj ? focusObj.group.groupName : (trendType === 'income' ? 'Total income' : 'Total expenses');
  const isCum = chartMode === 'cumulative';
  const seriesOf = (arr: number[]) => (isCum ? cum(arr) : arr);
  const withTotal = trendGroups.map((g) => ({ ...g, total: g.buckets.reduce((a, b) => a + b, 0), vals: seriesOf(g.buckets) })).sort((a, b) => b.total - a.total);
  const totalRaw = buckets.map((_, i) => trendGroups.reduce((s, g) => s + (g.buckets[i] || 0), 0));
  const totalVals = seriesOf(totalRaw);
  const grandTotal = totalRaw.reduce((a, b) => a + b, 0);
  const TOPN = 4;
  const rest = focusObj ? [] : withTotal.slice(TOPN);
  const visible = (focusObj || showAll) ? withTotal : withTotal.slice(0, TOPN);

  // chart geometry (viewBox 1200x380)
  const PX0 = 110, PX1 = 1180, PY0 = 24, PY1 = 336, PW = PX1 - PX0, PH = PY1 - PY0;
  const nP = Math.max(1, nB);
  const xOf = (i: number) => (nP === 1 ? (PX0 + PW / 2) : PX0 + PW * i / (nP - 1));
  const vmax = Math.max(1, ...totalVals) * 1.06;
  const yOf = (v: number) => PY1 - (v / vmax) * PH;
  const ptsOf = (vals: number[]) => vals.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
  const emph = hoverLine || isolate;
  const chartTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => { const v = vmax * f; const y = yOf(v); return { label: fmtK(v), y: y.toFixed(1), topPct: `${(y / 380 * 100).toFixed(2)}%` }; });
  const hovering = hoverIdx != null && hoverIdx >= 0 && hoverIdx < nB;
  const hoverX = hovering ? xOf(hoverIdx!).toFixed(1) : '0';

  const onChartMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - r.left) / r.width;
    let idx = Math.round(((f * 1200) - PX0) / PW * (nP - 1));
    idx = Math.max(0, Math.min(nP - 1, idx));
    if (idx !== hoverIdx) setHoverIdx(idx);
  };

  // legend chips
  const chip = (key: string, name: string, color: string, total: number, isTot: boolean) => {
    const active = isTot ? !isolate : isolate === key;
    const accent = isTot ? 'var(--text-3)' : color;
    const muted = !!emph && emph !== key;
    return { key, name, color, total: money0(total), active, muted,
      bg: active ? `color-mix(in srgb, ${accent} 22%, var(--surface-2))` : 'var(--surface-2)',
      border: (active || emph === key) ? accent : 'var(--line)',
      weight: (emph === key || active) ? 700 : 600 };
  };
  const legendChips = [chip('__total', totalName, 'var(--text)', grandTotal, true), ...visible.map((c) => chip(c.key, c.name, c.color, c.total, false))];
  const isoToggle = (key: string, isTot: boolean) => () => { if (isTot) setIsolate(null); else setIsolate((cur) => (cur === key ? null : key)); };

  // ── CATEGORY BREAKDOWN sections (focus-aware) ──
  const secMeta = (label: string) => ({ collapsed: !!collapsed[label], toggle: () => setCollapsed((s) => ({ ...s, [label]: !s[label] })) });
  const gkeyOf = (secLabel: string, group: string) => `${secLabel}|${group}`;
  interface SumSub { key: string; name: string; emoji: string; amount: number; pct: number; color: string }
  interface SumRow { key: string; gkey: string; name: string; emoji: string; color: string; leaf: boolean; amount: number; pct: number; drill: string | null; subs: SumSub[] }
  interface SumSec { label: string; total: number; collapsed: boolean; toggle: () => void; rows: SumRow[] }
  let summarySecs: SumSec[];
  if (focusObj) {
    const g = focusObj.group; const meta = secMeta(g.groupName);
    summarySecs = [{ label: g.groupName, total: g.total, ...meta, rows: g.subs.map((s, i) => ({ key: `s${s.categoryId}`, gkey: '', name: s.subName, emoji: getCategoryEmoji(s.subName), color: subColor(i), leaf: true, amount: s.total, pct: g.total > 0 ? s.total / g.total : 0, drill: null, subs: [] })) }];
  } else {
    summarySecs = (['income', 'expenses'] as const).map((sk) => {
      const sec = sections[sk]; const meta = secMeta(sec.label);
      return { label: sec.label, total: sec.total, ...meta, rows: sec.groups.map((g) => ({
        key: g.groupName, gkey: gkeyOf(sec.label, g.groupName), name: g.groupName, emoji: getCategoryEmoji(g.groupName), color: groupColorVar(typeOfSection(sk), g.groupName), leaf: false, amount: g.total, pct: sec.total > 0 ? g.total / sec.total : 0,
        drill: g.subs.length > 0 ? g.groupName : null,
        subs: g.subs.length > 0 ? g.subs.map((s, i) => ({ key: `s${s.categoryId}`, name: s.subName, emoji: getCategoryEmoji(s.subName), amount: s.total, pct: g.total > 0 ? s.total / g.total : 0, color: subColor(i) })) : [],
      })) };
    });
  }

  // Timeline sections
  interface TLSub { key: string; name: string; emoji: string; cells: number[]; peak: number; total: number }
  interface TLRowIn { key: string; gkey: string; name: string; emoji: string; color: string; leaf: boolean; buckets: number[]; total: number; drill: string | null; subs: TLSub[] }
  interface TLRow { key: string; gkey: string; name: string; emoji: string; color: string; leaf: boolean; cells: number[]; peak: number; total: number; drill: string | null; subs: TLSub[] }
  interface TLSec { label: string; total: number; collapsed: boolean; toggle: () => void; subtotals: number[]; rows: TLRow[] }
  const buildTL = (label: string, total: number, rows: TLRowIn[]): TLSec => {
    const meta = secMeta(label);
    const subtotals = new Array(nB).fill(0);
    rows.forEach((r) => r.buckets.forEach((v, i) => { subtotals[i] += v; }));
    return { label, total, ...meta, subtotals, rows: rows.map((r) => ({ key: r.key, gkey: r.gkey, name: r.name, emoji: r.emoji, color: r.color, leaf: r.leaf, cells: r.buckets, peak: Math.max(...r.buckets, 0), total: r.total, drill: r.drill, subs: r.subs })) };
  };
  let timelineSecs: TLSec[];
  if (focusObj) {
    const g = focusObj.group;
    timelineSecs = [buildTL(g.groupName, g.total, g.subs.map((s, i) => ({ key: `s${s.categoryId}`, gkey: '', name: s.subName, emoji: getCategoryEmoji(s.subName), color: subColor(i), leaf: true, buckets: s.buckets, total: s.total, drill: null, subs: [] })))];
  } else {
    timelineSecs = (['income', 'expenses'] as const).map((sk) => {
      const sec = sections[sk];
      return buildTL(sec.label, sec.total, sec.groups.map((g) => ({
        key: g.groupName, gkey: gkeyOf(sec.label, g.groupName), name: g.groupName, emoji: getCategoryEmoji(g.groupName), color: groupColorVar(typeOfSection(sk), g.groupName), leaf: false, buckets: g.buckets, total: g.total,
        drill: g.subs.length > 0 ? g.groupName : null,
        subs: g.subs.length > 0 ? g.subs.map((s) => ({ key: `s${s.categoryId}`, name: s.subName, emoji: getCategoryEmoji(s.subName), cells: s.buckets, peak: Math.max(...s.buckets, 0), total: s.total })) : [],
      })));
    });
  }
  const trendColMin = nB > 8 ? 62 : 78;

  // Per-group inline expand + expand-all/collapse-all (only meaningful when not focused).
  const toggleGroup = (gkey: string) => setExpandedGroups((s) => ({ ...s, [gkey]: !s[gkey] }));
  const allGroupKeys = focusObj ? [] : Object.values(sections).flatMap((sec) => sec.groups.filter((g) => g.subs.length > 0).map((g) => gkeyOf(sec.label, g.groupName)));
  const allGroupsExpanded = allGroupKeys.length > 0 && allGroupKeys.every((kk) => expandedGroups[kk]);
  const toggleAllGroups = () => { const next: Record<string, boolean> = {}; if (!allGroupsExpanded) allGroupKeys.forEach((kk) => { next[kk] = true; }); setExpandedGroups(next); };

  // ── TRANSACTIONS card (client group-by-day + sort) ──
  const dayGroups = (() => {
    const type = focusObj ? focusObj.group.type : filters.type === 'Income' ? 'income' : 'expense';
    const rowSort = txnSort === 'amt_desc' ? (a: Txn, b: Txn) => Math.abs(b.amount) - Math.abs(a.amount)
      : txnSort === 'amt_asc' ? (a: Txn, b: Txn) => Math.abs(a.amount) - Math.abs(b.amount) : null;
    const dateAsc = txnSort === 'date_asc';
    const byDay = new Map<string, Txn[]>();
    for (const t of txns) { if (!byDay.has(t.date)) byDay.set(t.date, []); byDay.get(t.date)!.push(t); }
    const keys = Array.from(byDay.keys()).sort((a, b) => (dateAsc ? a.localeCompare(b) : b.localeCompare(a)));
    return keys.map((key) => {
      let rows = byDay.get(key)!;
      if (rowSort) rows = rows.slice().sort(rowSort);
      const [yy, mm, dd] = key.split('-').map(Number);
      const net = rows.reduce((s, t) => s + t.amount, 0);
      return { key, label: `${MFULL[mm - 1]} ${dd}, ${yy}`, total: fmtTransaction(net, type), rows };
    });
  })();

  const sortLabelMap: Record<SortId, string> = { date_desc: 'Newest', date_asc: 'Oldest', amt_desc: 'Highest', amt_asc: 'Lowest' };
  const sortOptions: { id: SortId; label: string }[] = [
    { id: 'date_desc', label: 'Date · new to old' }, { id: 'date_asc', label: 'Date · old to new' },
    { id: 'amt_desc', label: 'Amount · high to low' }, { id: 'amt_asc', label: 'Amount · low to high' },
  ];

  // CSV export of the current (filtered) transactions.
  const exportCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = ['Date', 'Merchant', 'Category', 'Account', 'Amount'];
    const lines = [header.join(',')];
    for (const t of txns) {
      lines.push([t.date, esc(t.merchant?.name || t.description || ''), esc(t.category?.displayName || ''), esc(t.account ? `${t.account.name}${t.account.lastFour ? ` (…${t.account.lastFour})` : ''}` : ''), t.amount.toFixed(2)].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `reports-${range.start}_to_${range.end}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const fCount = filterDraftCount(filters);
  const catHint = focusObj ? `Sub-categories of ${focusObj.group.groupName}` : (catView === 'timeline' ? `Totals by ${nB > 0 && buckets[0].label.startsWith('Wk') ? 'week' : 'month'} · click a category to drill in` : 'Click a category to drill into sub-categories');
  const txnHint = focusGroup ? `Activity in ${focusGroup} · ${txnTotal} transaction${txnTotal === 1 ? '' : 's'}` : 'Recent activity across all categories';

  // Category groups for the shared filter popover.
  const categoryGroups = (() => {
    const groups: { group: string; subs: { id: number; sub: string }[] }[] = [];
    const seen = new Set<string>();
    for (const c of categories) {
      if (!seen.has(c.group_name)) { seen.add(c.group_name); groups.push({ group: c.group_name, subs: categories.filter((x) => x.group_name === c.group_name).map((x) => ({ id: x.id, sub: x.sub_name })) }); }
    }
    return groups;
  })();

  return (
    <div className="pb-16">
      {/* Hero */}
      <div className="sticky top-0 z-20 -mt-4 md:-mt-7 -mx-4 md:-mx-8 px-4 md:px-8 py-4 mb-6 flex items-center justify-between gap-4 flex-wrap bg-bg border-b border-line">
        <div className="flex items-baseline gap-2.5">
          <h1 className="page-title text-[22px] font-extrabold text-content tracking-tight leading-tight m-0">Reports</h1>
          <p className="text-[13px] text-content-3 m-0">{range.label}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Clear all — far left; shows whenever any filter is applied (matches Transactions). */}
          {(fCount > 0 || preset !== 'YTD') && (
            <button onClick={() => {
              setFilters(EMPTY_FILTER); setDraft(EMPTY_FILTER);
              setPreset('YTD');
              setCustomStart(ymd(new Date(new Date().getFullYear(), 0, 1)));
              setCustomEnd(ymd(new Date()));
            }} className="h-10 px-2.5 text-primary hover:text-primary-hover font-semibold text-sm">Clear</button>
          )}
          {/* Date range (shared DateRangePopover) */}
          <DateRangePopover
            presets={PRESETS.map((p) => ({ value: p.id, label: p.name }))}
            value={{ preset, start: preset === 'custom' ? customStart : '', end: preset === 'custom' ? customEnd : '' }}
            label={range.label}
            active={preset !== 'YTD'}
            requireBoth
            clearValue={{ preset: 'YTD', start: '', end: '' }}
            onOpen={() => setFilterOpen(false)}
            onApply={(v) => { setPreset(v.preset as Preset); setCustomStart(v.start); setCustomEnd(v.end); }}
          />
          {/* Filters */}
          <div className="relative">
            <button onClick={() => (filterOpen ? setFilterOpen(false) : openFilters())} className="flex items-center gap-2 h-10 px-3.5 rounded-[11px] bg-surface text-sm font-semibold text-content" style={{ border: `2px solid ${filterOpen ? 'var(--primary)' : 'var(--line-strong)'}` }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
              Filters
              {fCount > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center">{fCount}</span>}
            </button>
            {filterOpen && (
              <FilterPopover
                draft={draft} setDraft={setDraft}
                categoryGroups={categoryGroups} accounts={accounts} merchants={merchants} categories={categories}
                search={filterSearch} setSearch={setFilterSearch} tab={filterTab} setTab={setFilterTab}
                onClear={clearDraft} onCancel={() => setFilterOpen(false)} onApply={applyFilters}
              />
            )}
          </div>
          <button onClick={exportCsv} title="Export CSV" className="w-10 h-10 shrink-0 flex items-center justify-center bg-surface border border-line-strong rounded-[11px] text-content-2 hover:bg-surface-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>
          </button>
        </div>
      </div>

      {/* KPI ROW */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-[22px]">
        {kpis.map((kp) => (
          <div key={kp.label} className="border border-line rounded-card bg-surface shadow-sm" style={{ padding: '20px 22px' }}>
            <div className="font-mono text-[11px] uppercase text-content-3 mb-3" style={{ letterSpacing: '.07em' }}>{kp.label}</div>
            <div className={`text-[28px] font-extrabold tabular-nums leading-none ${kp.color}`} style={{ letterSpacing: '-.02em' }}>{kp.value}</div>
            <div className={`mt-2.5 text-[13px] font-semibold ${kp.subColor}`}>{kp.sub}</div>
          </div>
        ))}
      </div>

      {/* REPORT AREA */}
      <div className="border border-line rounded-card bg-surface shadow-sm mb-[22px]" style={{ padding: '20px 26px 22px' }}>
        <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
          <div className="flex items-center gap-6">
            <button onClick={() => setView('breakdown')} className="text-[17px] font-extrabold pb-[3px]" style={{ color: view === 'breakdown' ? 'var(--text)' : 'var(--text-3)', borderBottom: `2px solid ${view === 'breakdown' ? 'var(--primary)' : 'transparent'}` }}>Breakdown</button>
            <button onClick={() => setView('trends')} className="text-[17px] font-extrabold pb-[3px]" style={{ color: view === 'trends' ? 'var(--text)' : 'var(--text-3)', borderBottom: `2px solid ${view === 'trends' ? 'var(--primary)' : 'transparent'}` }}>Trends</button>
          </div>
          {view === 'breakdown' ? (
            <span className="text-[13px] text-content-3">{flowDenomLabel} · {range.label}</span>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <MiniToggle value={trendMetric} onChange={(v) => { setTrendMetric(v as TrendMetric); setIsolate(null); setShowAll(false); if (v === 'income') clearFocus(); }} options={[{ v: 'expenses', l: 'Expenses' }, { v: 'income', l: 'Income' }]} />
              <MiniToggle value={chartMode} onChange={(v) => setChartMode(v as ChartMode)} options={[{ v: 'cumulative', l: 'Cumulative' }, { v: 'monthly', l: 'Monthly' }]} />
            </div>
          )}
        </div>

        {view === 'breakdown' ? (
          !showFlow ? (
            <div className="text-center text-content-3 text-sm" style={{ padding: '28px 0' }}>No spending in this period.</div>
          ) : (
          <div>
            {/* Widths + gap are whole device pixels (see flowWidthsCss) so every gap
                renders at an identical device-pixel width — no anti-alias unevenness. */}
            <div ref={flowBarRef} className="relative flex mb-4" style={{ height: 22, columnGap: flowGapCss }}>
              {flowSegs.map((s, i) => (
                <div key={i} onClick={() => s.drill && drillTo(s.drill)} onMouseEnter={() => setFlowHover(i)} onMouseLeave={() => setFlowHover((h) => (h === i ? null : h))} className="relative"
                  style={{ ...(flowWidthsCss.length ? { width: flowWidthsCss[i], flex: 'none' } : { flexGrow: Math.max(0, s.pct), flexBasis: 0, minWidth: 0 }), background: s.color, borderRadius: i === 0 ? '6px 0 0 6px' : i === flowSegs.length - 1 ? '0 6px 6px 0' : '0', cursor: s.drill ? 'pointer' : 'default', filter: flowHover === i ? 'brightness(1.12)' : 'none', transform: flowHover === i ? 'scaleY(1.28)' : 'scaleY(1)', zIndex: flowHover === i ? 3 : 1, transition: 'transform .12s ease, filter .12s ease' }}>
                  {flowHover === i && (
                    <div className="absolute whitespace-nowrap bg-elevated border border-line-strong rounded-[10px] shadow-md" style={{ bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%) scaleY(0.781)', transformOrigin: 'bottom center', pointerEvents: 'none', padding: '8px 11px', zIndex: 10 }}>
                      <div className="flex items-center gap-2 text-[13px] font-bold mb-0.5">{focusObj ? <span className="text-sm leading-none">{s.emoji}</span> : <span className="shrink-0 w-3 h-3 rounded-[3px]" style={{ background: s.color }} />}{s.name}</div>
                      <div className="text-[13px] text-content-2 tabular-nums">{money0(s.amount)} · {(s.pct * 100).toFixed(1)}%</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-[22px] gap-y-3.5">
              {flowSegs.map((s, i) => (
                <div key={i} onClick={() => s.drill && drillTo(s.drill)} className="flex items-center gap-2 text-[13px]" style={{ cursor: s.drill ? 'pointer' : 'default' }}>
                  {focusObj
                    ? <span className="text-sm leading-none">{s.emoji}</span>
                    : <span className="shrink-0 w-3 h-3 rounded-[3px]" style={{ background: s.color }} />}
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-content-3 tabular-nums">{money0(s.amount)} · {(s.pct * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
          )
        ) : (
          <div>
            <div className="relative">
              <svg viewBox="0 0 1200 380" onMouseMove={onChartMove} onMouseLeave={() => setHoverIdx(null)} style={{ width: '100%', height: 'auto', display: 'block', cursor: 'crosshair' }}>
                {chartTicks.map((g, i) => <line key={i} x1="120" y1={g.y} x2="1188" y2={g.y} stroke="var(--line)" strokeWidth="1" />)}
                <line x1="120" y1="24" x2="120" y2="330" stroke="var(--line-strong)" strokeWidth="1" />
                {hovering && <line x1={hoverX} y1="24" x2={hoverX} y2="330" stroke="var(--line-strong)" strokeWidth="1.5" strokeDasharray="5 4" />}
                {visible.map((c) => { const dim = !!emph && emph !== c.key; return (
                  <g key={c.key}>
                    <polyline points={ptsOf(c.vals)} fill="none" stroke={c.color} strokeWidth={emph === c.key ? 4 : 2} opacity={dim ? 0.1 : 1} strokeLinecap="round" strokeLinejoin="round" />
                    <polyline points={ptsOf(c.vals)} onClick={() => (focusObj ? isoToggle(c.key, false)() : drillTo(c.name))} onMouseEnter={() => setHoverLine(c.key)} onMouseLeave={() => setHoverLine(null)} fill="none" stroke="transparent" strokeWidth="16" style={{ cursor: 'pointer' }} />
                  </g>
                ); })}
                <polyline points={ptsOf(totalVals)} fill="none" stroke="var(--text)" strokeWidth="3.5" opacity={emph && emph !== '__total' ? 0.25 : 1} strokeLinecap="round" strokeLinejoin="round" />
                <polyline points={ptsOf(totalVals)} onClick={() => setIsolate(null)} onMouseEnter={() => setHoverLine('__total')} onMouseLeave={() => setHoverLine(null)} fill="none" stroke="transparent" strokeWidth="16" style={{ cursor: 'pointer' }} />
                {hovering && [{ y: yOf(totalVals[hoverIdx!]), color: 'var(--text)' }, ...visible.filter((c) => !(emph && emph !== c.key)).map((c) => ({ y: yOf(c.vals[hoverIdx!]), color: c.color }))].map((d, i) => (
                  <circle key={i} cx={hoverX} cy={d.y.toFixed(1)} r="4" fill={d.color} stroke="var(--surface)" strokeWidth="2" />
                ))}
                {/* A polyline with a single point draws nothing — mark each series with a dot. */}
                {nP === 1 && (
                  <>
                    {visible.filter((c) => !(emph && emph !== c.key)).map((c) => <circle key={c.key} cx={xOf(0).toFixed(1)} cy={yOf(c.vals[0]).toFixed(1)} r="4" fill={c.color} stroke="var(--surface)" strokeWidth="2" />)}
                    <circle cx={xOf(0).toFixed(1)} cy={yOf(totalVals[0]).toFixed(1)} r="5" fill="var(--text)" stroke="var(--surface)" strokeWidth="2" opacity={emph && emph !== '__total' ? 0.25 : 1} />
                  </>
                )}
              </svg>
              {chartTicks.map((g, i) => <div key={i} className="absolute text-[13px] font-semibold text-content-2 tabular-nums text-right" style={{ left: 0, top: g.topPct, transform: 'translateY(-50%)', width: '8.2%', pointerEvents: 'none' }}>{g.label}</div>)}
              {buckets.map((b, i) => <div key={i} className="absolute text-[13px] font-semibold text-content-2" style={{ top: '90%', left: `${(xOf(i) / 1200 * 100).toFixed(2)}%`, transform: 'translateX(-50%)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>{b.label}</div>)}
              {hovering && (
                <div className="absolute bg-elevated border border-line-strong rounded-[11px] shadow-md" style={{ top: 6, left: `${(xOf(hoverIdx!) / 1200 * 100).toFixed(2)}%`, transform: 'translateX(-50%)', pointerEvents: 'none', padding: '11px 13px', minWidth: 168, zIndex: 5 }}>
                  <div className="text-[12px] font-bold text-content-2 mb-2">{buckets[hoverIdx!].label}</div>
                  {[{ name: totalName, color: 'var(--text)', value: totalVals[hoverIdx!], weight: 700 }, ...visible.filter((c) => !(emph && emph !== c.key)).map((c) => ({ name: c.name, color: c.color, value: c.vals[hoverIdx!], weight: 500 }))].map((r, i) => (
                    <div key={i} className="flex items-center gap-2.5 py-0.5 text-[13px]">
                      <span className="w-2.5 h-2.5 shrink-0 rounded-[2px]" style={{ background: r.color }} />
                      <span className="flex-1 text-content-2 truncate" style={{ fontWeight: r.weight }}>{r.name}</span>
                      <span className="font-bold tabular-nums">{money0(r.value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="text-center text-[12px] font-semibold text-content-3 mt-2" style={{ letterSpacing: '.04em' }}>{buckets[0]?.label.startsWith('Wk') ? 'Weeks' : `Month · ${range.start.slice(0, 4)}`}</div>
            <div className="mt-4 border-t border-line pt-4 flex flex-wrap gap-2 items-center">
              {legendChips.map((l) => (
                <div key={l.key} onClick={l.key === '__total' ? () => setIsolate(null) : isoToggle(l.key, false)} onMouseEnter={() => setHoverLine(l.key)} onMouseLeave={() => setHoverLine(null)} className="inline-flex items-center gap-2 h-[34px] px-3 rounded-full cursor-pointer" style={{ border: `1px solid ${l.border}`, background: l.bg, opacity: l.muted ? 0.4 : 1 }}>
                  <span className="w-2.5 h-2.5 shrink-0 rounded-[3px]" style={{ background: l.color }} />
                  <span className="text-[13px]" style={{ fontWeight: l.weight }}>{l.name}</span>
                  <span className="text-[13px] font-bold text-content-3 tabular-nums">{l.total}</span>
                </div>
              ))}
              {rest.length > 0 && (
                <button onClick={() => { if (showAll) setIsolate(null); setShowAll((s) => !s); }} className="inline-flex items-center gap-1.5 h-[34px] px-3.5 rounded-full text-[13px] font-bold text-primary" style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
                  {showAll ? 'Show fewer' : `+${rest.length} more`}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showAll ? 'rotate(90deg)' : 'rotate(0deg)' }}><path d="m9 6 6 6-6 6" /></svg>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* CATEGORY BREAKDOWN */}
      <div className="border border-line rounded-card bg-surface overflow-hidden shadow-sm">
        <div className="flex items-center justify-between gap-4" style={{ padding: '18px 26px 16px' }}>
          <div className="min-w-0">
            <div className="text-[17px] font-extrabold">Category breakdown</div>
            <div className="text-[13px] text-content-3 mt-0.5">{catHint}</div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {allGroupKeys.length > 0 && (
              <button onClick={toggleAllGroups} className="text-[13px] font-semibold text-primary hover:text-primary-hover">{allGroupsExpanded ? 'Collapse all' : 'Expand all'}</button>
            )}
            <MiniToggle value={catView} onChange={(v) => setCatView(v as CatView)} options={[{ v: 'summary', l: 'Summary' }, { v: 'timeline', l: 'Timeline' }]} />
          </div>
        </div>

        {catView === 'summary' ? (
          <div className="border-t border-line">
            {summarySecs.map((sec) => (
              <div key={sec.label}>
                <div onClick={sec.toggle} className="flex items-center gap-2.5 bg-surface-2 border-b border-line cursor-pointer" style={{ padding: '12px 26px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: sec.collapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform .15s' }}><path d="m9 6 6 6-6 6" /></svg>
                  <span className="flex-1 text-xs font-bold uppercase text-content-2" style={{ letterSpacing: '.05em' }}>{sec.label}</span>
                  <span className="text-[15px] font-extrabold tabular-nums">{money0(sec.total)}</span>
                </div>
                {!sec.collapsed && sec.rows.map((r) => {
                  const canExpand = r.subs.length > 0;
                  const open = canExpand && !!expandedGroups[r.gkey];
                  return (
                  <div key={r.key}>
                    <div onClick={() => r.drill && drillTo(r.drill)} className="flex items-center gap-3 border-b border-line" style={{ padding: '15px 26px', cursor: r.drill ? 'pointer' : 'default' }}>
                      {canExpand ? (
                        <button type="button" onClick={(e) => { e.stopPropagation(); toggleGroup(r.gkey); }} aria-label={open ? 'Collapse' : 'Expand'} className="shrink-0 w-6 h-6 -ml-1 flex items-center justify-center rounded-full text-content-3 hover:text-content hover:bg-surface-2">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}><path d="m9 6 6 6-6 6" /></svg>
                        </button>
                      ) : <span className="shrink-0 w-6 -ml-1" />}
                      {r.leaf
                        ? <span className="shrink-0 text-base leading-none">{r.emoji}</span>
                        : <span className="shrink-0 w-3.5 h-3.5 rounded-[4px]" style={{ background: r.color }} />}
                      <span className="w-[172px] shrink-0 font-semibold text-[15px] truncate">{r.name}</span>
                      <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(r.pct * 100).toFixed(1)}%`, background: r.color }} /></div>
                      <span className="w-14 shrink-0 text-right text-[13px] text-content-3 tabular-nums">{(r.pct * 100).toFixed(0)}%</span>
                      <span className="w-24 shrink-0 text-right font-bold text-[15px] tabular-nums">{money0(r.amount)}</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={r.drill ? 'var(--text-3)' : 'transparent'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="m9 6 6 6-6 6" /></svg>
                    </div>
                    {open && r.subs.map((sub) => (
                      <div key={sub.key} className="flex items-center gap-3 border-b border-line bg-surface-2/40" style={{ padding: '11px 26px 11px 64px' }}>
                        <span className="shrink-0 text-sm leading-none">{sub.emoji}</span>
                        <span className="w-[150px] shrink-0 text-sm text-content-2 truncate">{sub.name}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(sub.pct * 100).toFixed(1)}%`, background: sub.color }} /></div>
                        <span className="w-14 shrink-0 text-right text-[13px] text-content-3 tabular-nums">{(sub.pct * 100).toFixed(0)}%</span>
                        <span className="w-24 shrink-0 text-right font-semibold text-sm tabular-nums">{money0(sub.amount)}</span>
                        <span className="shrink-0 w-4" />
                      </div>
                    ))}
                  </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className="border-t border-line overflow-x-auto">
            <div style={{ minWidth: 'max-content' }}>
              <div className="flex items-center bg-surface-2 border-b border-line font-mono text-[11px] uppercase text-content-3" style={{ padding: '11px 26px', letterSpacing: '.06em' }}>
                <span className="w-[214px] shrink-0">Category</span>
                {buckets.map((b, i) => <span key={i} className="text-right" style={{ flex: '1 1 0', minWidth: trendColMin }}>{b.label}</span>)}
                <span className="w-[104px] shrink-0 text-right text-content-2">Total</span>
              </div>
              {timelineSecs.map((sec) => (
                <div key={sec.label}>
                  <div onClick={sec.toggle} className="flex items-center bg-surface-2 border-b border-line cursor-pointer" style={{ padding: '11px 26px' }}>
                    <span className="w-[214px] shrink-0 flex items-center gap-2.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: sec.collapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform .15s' }}><path d="m9 6 6 6-6 6" /></svg>
                      <span className="text-xs font-bold uppercase text-content-2" style={{ letterSpacing: '.05em' }}>{sec.label}</span>
                    </span>
                    {sec.subtotals.map((t, i) => <span key={i} className="text-right text-[13px] font-bold text-content-2 tabular-nums" style={{ flex: '1 1 0', minWidth: trendColMin }}>{money0(t)}</span>)}
                    <span className="w-[104px] shrink-0 text-right text-[13px] font-extrabold tabular-nums">{money0(sec.total)}</span>
                  </div>
                  {!sec.collapsed && sec.rows.map((r) => {
                    const canExpand = r.subs.length > 0;
                    const open = canExpand && !!expandedGroups[r.gkey];
                    return (
                    <div key={r.key}>
                      <div onClick={() => r.drill && drillTo(r.drill)} className="flex items-center border-b border-line" style={{ padding: '13px 26px', cursor: r.drill ? 'pointer' : 'default' }}>
                        <span className="w-[214px] shrink-0 flex items-center gap-2 min-w-0">
                          {canExpand ? (
                            <button type="button" onClick={(e) => { e.stopPropagation(); toggleGroup(r.gkey); }} aria-label={open ? 'Collapse' : 'Expand'} className="shrink-0 w-5 h-5 -ml-0.5 flex items-center justify-center rounded-full text-content-3 hover:text-content hover:bg-surface">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}><path d="m9 6 6 6-6 6" /></svg>
                            </button>
                          ) : <span className="shrink-0 w-5 -ml-0.5" />}
                          {r.leaf
                            ? <span className="shrink-0 text-[15px] leading-none">{r.emoji}</span>
                            : <span className="shrink-0 w-3.5 h-3.5 rounded-[4px]" style={{ background: r.color }} />}
                          <span className="font-semibold text-sm truncate">{r.name}</span>
                        </span>
                        {r.cells.map((v, i) => <span key={i} className="text-right text-sm tabular-nums" style={{ flex: '1 1 0', minWidth: trendColMin, color: (v === r.peak && v > 0) ? 'var(--text)' : 'var(--text-2)', fontWeight: (v === r.peak && v > 0) ? 700 : 500 }}>{money0(v)}</span>)}
                        <span className="w-[104px] shrink-0 text-right font-bold text-sm tabular-nums">{money0(r.total)}</span>
                      </div>
                      {open && r.subs.map((sub) => (
                        <div key={sub.key} className="flex items-center border-b border-line bg-surface-2/40" style={{ padding: '10px 26px' }}>
                          <span className="w-[214px] shrink-0 flex items-center gap-2 min-w-0" style={{ paddingLeft: 34 }}>
                            <span className="shrink-0 text-sm leading-none">{sub.emoji}</span>
                            <span className="text-sm text-content-2 truncate">{sub.name}</span>
                          </span>
                          {sub.cells.map((v, i) => <span key={i} className="text-right text-[13px] tabular-nums" style={{ flex: '1 1 0', minWidth: trendColMin, color: (v === sub.peak && v > 0) ? 'var(--text)' : 'var(--text-3)', fontWeight: (v === sub.peak && v > 0) ? 700 : 500 }}>{money0(v)}</span>)}
                          <span className="w-[104px] shrink-0 text-right font-semibold text-[13px] tabular-nums">{money0(sub.total)}</span>
                        </div>
                      ))}
                    </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* TRANSACTIONS */}
      <div className="mt-[22px] border border-line rounded-card bg-surface overflow-hidden shadow-sm">
        <div className="flex items-center justify-between gap-4" style={{ padding: '18px 26px 16px' }}>
          <div className="min-w-0">
            <div className="text-[17px] font-extrabold">Transactions</div>
            <div className="text-[13px] text-content-3 mt-0.5">{txnHint}</div>
          </div>
          <div className="relative shrink-0">
            <button onClick={() => setSortOpen((o) => !o)} className="flex items-center gap-2 h-[38px] px-3.5 bg-surface-2 rounded-[10px] text-[13px] font-semibold" style={{ border: `1px solid ${sortOpen ? 'var(--primary)' : 'var(--line)'}` }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4v16M7 20l-3-3M7 4l3 3M17 20V4M17 4l3 3M17 20l-3-3" /></svg>
              {sortLabelMap[txnSort]}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                <div className="absolute top-11 right-0 z-50 w-[236px] bg-elevated border border-line-strong rounded-[12px] shadow-md p-1.5">
                  {sortOptions.map((o) => (
                    <div key={o.id} onClick={() => { setTxnSort(o.id); setSortOpen(false); }} className="flex items-center gap-2.5 px-3 py-2.5 rounded-[9px] text-sm cursor-pointer" style={{ color: txnSort === o.id ? 'var(--text)' : 'var(--text-2)', background: txnSort === o.id ? 'var(--surface-2)' : 'transparent' }}>
                      <span className="w-4 shrink-0 flex items-center justify-center">{txnSort === o.id && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6" /></svg>}</span>
                      {o.label}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="border-t border-line">
          {txns.length < txnTotal && (
            <div className="text-[13px] text-content-2" style={{ padding: '10px 26px', background: 'color-mix(in srgb, var(--warning) 12%, var(--surface-2))' }}>Showing the {txns.length.toLocaleString()} most recent of {txnTotal.toLocaleString()} transactions.</div>
          )}
          {dayGroups.length === 0 ? (
            <div className="text-center text-content-3 text-sm" style={{ padding: '36px' }}>No transactions in this {focusGroup ? 'category' : 'period'}.</div>
          ) : dayGroups.map((g) => (
            <div key={g.key}>
              <div className="flex items-center justify-between bg-surface-2 border-b border-line" style={{ padding: '9px 26px' }}>
                <span className="text-[13px] font-semibold text-content-2">{g.label}</span>
                <span className={`font-mono text-[12px] tabular-nums ${g.total.className}`}>{g.total.text}</span>
              </div>
              {g.rows.map((t) => {
                const vendor = t.merchant?.name || t.description || '—';
                const hue = subColor((vendor.charCodeAt(0) || 0));
                const amt = fmtTransaction(t.amount, t.category?.type ?? 'expense');
                return (
                  <div key={t.id} className="flex items-center gap-3.5 border-b border-line" style={{ padding: '0 26px', height: 44 }}>
                    <VendorAvatar name={vendor} src={t.merchant?.logoUrl || undefined} color={t.merchant?.logoUrl ? undefined : hue} size={26} />
                    <div className="min-w-0 font-semibold text-[15px] truncate" style={{ flex: 1.4 }}>{vendor}</div>
                    <div className="flex-1 min-w-0 flex items-center gap-2.5 text-[13px] text-content-2">
                      <span className="shrink-0 text-[15px] leading-none">{getCategoryEmoji(t.category?.subName ?? t.category?.groupName)}</span>
                      <span className="truncate">{t.category?.subName ?? 'Uncategorized'}</span>
                    </div>
                    <div className="flex-1 min-w-0 text-[13px] text-content-3 hidden md:flex items-center gap-1.5">
                      {t.account && <VendorAvatar name={t.account.name} src={t.account.logoUrl || undefined} color={t.account.color || 'var(--c-blue)'} size={16} />}
                      <span className="truncate">{t.account ? `${t.account.name}${t.account.lastFour ? ` (…${t.account.lastFour})` : ''}` : '—'}</span>
                    </div>
                    <div className={`w-[118px] shrink-0 text-right font-bold text-[15px] tabular-nums ${amt.className}`}>{amt.text}</div>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" className="shrink-0"><path d="m9 6 6 6-6 6" /></svg>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* DRILL-DOWN STICKY PILL */}
      {focusObj && (
        <div className="fixed left-1/2 bottom-7 z-[60] flex items-center gap-3 rounded-full bg-elevated" style={{ transform: 'translateX(-50%)', padding: '9px 10px 9px 18px', border: '2px solid var(--primary)', boxShadow: '0 10px 34px rgba(0,0,0,.5), 0 0 0 4px color-mix(in srgb, var(--primary) 22%, transparent)', maxWidth: 'calc(100vw - 48px)' }}>
          <span className="w-2.5 h-2.5 shrink-0 rounded-[3px]" style={{ background: focusObj.group.type === 'income' ? 'var(--positive)' : groupColorVar(focusObj.group.type, focusObj.group.groupName) }} />
          <span className="text-[13px] text-content-3 font-semibold">{focusObj.section.label}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="m9 6 6 6-6 6" /></svg>
          <span className="text-sm font-extrabold truncate">{focusObj.group.groupName}</span>
          <span className="text-[13px] text-content-2 tabular-nums">{money0(focusObj.group.total)} · {focusObj.section.total > 0 ? Math.round(focusObj.group.total / focusObj.section.total * 100) : 0}% of {focusObj.section.label.toLowerCase()}</span>
          <button onClick={clearFocus} title="Clear drill-down" className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full" style={{ border: '1px solid var(--negative)', color: 'var(--negative)', background: 'color-mix(in srgb, var(--negative) 12%, transparent)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Small segmented toggle (design's inline pill toggle) ──
function MiniToggle({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <div className="flex bg-surface-2 border border-line rounded-[10px] p-[3px] gap-0.5 shrink-0">
      {options.map((o) => {
        const on = value === o.v;
        return <button key={o.v} onClick={() => onChange(o.v)} className="px-3.5 py-1.5 rounded-lg text-[13px] font-semibold" style={{ color: on ? 'var(--text)' : 'var(--text-3)', background: on ? 'var(--elevated)' : 'transparent', boxShadow: on ? 'var(--shadow-sm)' : 'none' }}>{o.l}</button>;
      })}
    </div>
  );
}
