import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { formatMoney } from '@ledger/shared';
import { Change } from '../components/Money';
import Spinner from '../components/Spinner';
import { getCategoryEmoji, useCategoryEmojis } from '../lib/categoryMeta';
import { SegmentedControl, BudgetBar } from '../components/primitives';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../hooks/useIsMobile';
import PageHeader from '../components/PageHeader';
import ResponsiveModal from '../components/ResponsiveModal';
import Button from '../components/Button';
import BudgetHistory from '../components/budget/BudgetHistory';
import { useToast } from '../context/ToastContext';

// Recurring overlay meta on a budget row (null when no recurring items apply).
interface RecMeta { amount: number; itemCount: number; items: { label: string; cadence: string }[] }

interface IncomeRow {
  categoryId: number;
  subName: string;
  budgeted: number; // effective (recurring folded in)
  manual: number;   // raw stored amount (for editing)
  recurring: RecMeta | null;
  overridden: boolean; // per-month sub-floor override active
  budgetId: number | null;
  actual: number;
}

interface ExpenseSub {
  categoryId: number;
  subName: string;
  budgeted: number; // effective (recurring folded in)
  manual: number;   // raw stored amount (for editing)
  recurring: RecMeta | null;
  overridden: boolean; // per-month sub-floor override active
  budgetId: number | null;
  actual: number;
}

interface ExpenseGroup {
  groupName: string;
  subs: ExpenseSub[];
}

interface Totals {
  budgetedIncome: number;
  actualIncome: number;
  budgetedExpenses: number;
  actualExpenses: number;
  leftToBudget: number;
}

interface BudgetSummary {
  income: IncomeRow[];
  expenseGroups: ExpenseGroup[];
  totals: Totals;
}

interface AnnualRow {
  categoryId: number;
  subName: string;
  planned: number[]; // 12 months, effective (recurring folded in)
  manual: number[]; // 12 months, raw stored
  overridden: boolean[]; // 12 months
  recurring: (RecMeta | null)[]; // 12 months
}
interface AnnualGroup {
  groupName: string;
  subs: AnnualRow[];
}
interface AnnualSummary {
  income: AnnualRow[];
  expenseGroups: AnnualGroup[];
}

// Planned, actual and monthly cells are plain balances; remaining figures are totals.
const whole = (n: number) => formatMoney(n, { kind: 'balance', precision: 'whole' }).text;
const full = (n: number) => formatMoney(n, { kind: 'balance' }).text;
// Over plan as displayed: a remaining that rounds to "—" is not over, so colour and text agree.
const isOver = (rem: number) => formatMoney(rem, { kind: 'total', precision: 'whole' }).tone === 'negative';

// A remaining figure: real minus and bad colour when negative, otherwise good (zero included).
function Remaining({ value, className }: { value: number; className?: string }) {
  return <Change value={value} precision="whole" zeroTone="positive" className={className} />;
}

// Remaining for a row or total. Income past its plan is good news ("+$X over plan"),
// so it reads positive; `long` spells out "over plan" (the phone pill is too narrow).
function RemainingCell({ value, income, long, className }: { value: number; income: boolean; long?: boolean; className?: string }) {
  if (income && isOver(value)) {
    return <span className={`tabular-nums text-positive ${className ?? ''}`}>+{whole(-value)}{long ? ' over plan' : ''}</span>;
  }
  return <Remaining value={value} className={className} />;
}

// Left-to-budget band colour: good when zero or positive, bad when negative.
const leftTint = (v: number) =>
  formatMoney(v, { kind: 'total', precision: 'whole', zeroTone: 'positive' }).tone === 'negative' ? 'var(--negative)' : 'var(--positive)';

function monthStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(d: Date): string {
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function shortMonth(d: Date): string {
  return d.toLocaleString('en-US', { month: 'short' });
}

function prevMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

function nextMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export default function BudgetPage() {
  const { hasPermission } = useAuth();
  const { addToast } = useToast();
  const isMobile = useIsMobile();
  useCategoryEmojis(); // re-render when stored category emojis load/change
  const navigate = useNavigate();
  const canEditBudgets = hasPermission('budgets.edit');
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [view, setView] = useState<'month' | 'year'>('month');
  const [data, setData] = useState<BudgetSummary | null>(null);
  const [annualData, setAnnualData] = useState<AnnualSummary | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [showUnbudgeted, setShowUnbudgeted] = useState<Record<string, boolean>>({});
  const [editModal, setEditModal] = useState<{ categoryId: number; groupName: string; subName: string; emoji: string; planned: number; targetMonth: string; recurring: RecMeta | null; manual: number; income: boolean } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [applyFuture, setApplyFuture] = useState(false);
  const [editOverride, setEditOverride] = useState(false); // per-month sub-floor override

  const loadData = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: BudgetSummary }>(
        `/budgets/summary?month=${monthStr(month)}`
      );
      setData(res.data);
    } catch (e) { addToast(e instanceof Error ? e.message : 'Failed to load budget', 'error'); }
  }, [month, addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadAnnual = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: AnnualSummary }>(`/budgets/annual?year=${month.getFullYear()}`);
      setAnnualData(res.data);
    } catch (e) { addToast(e instanceof Error ? e.message : 'Failed to load annual budget', 'error'); }
  }, [month, addToast]);

  useEffect(() => { if (view === 'year') loadAnnual(); }, [view, loadAnnual]);

  const openEdit = (categoryId: number, groupName: string, subName: string, planned: number, targetMonth: string = monthStr(month), recurring: RecMeta | null = null, manual?: number, overridden = false, income = false) => {
    // Input edits the TOTAL monthly budget (recurring floor + extra). Seed with the
    // current effective total (planned). On save we back out the stored manual per
    // fold mode so the floor stays applied per-month; an override bypasses the floor.
    setEditModal({ categoryId, groupName, subName, emoji: getCategoryEmoji(subName.split(' · ')[0]), planned, targetMonth, recurring, manual: manual ?? planned, income });
    setEditValue(planned ? String(planned) : '');
    setApplyFuture(false);
    setEditOverride(overridden);
  };

  const closeEdit = () => setEditModal(null);

  const saveEdit = async () => {
    if (!editModal) return;
    const val = parseFloat(editValue || '0');
    if (isNaN(val) || val < 0) { closeEdit(); return; }
    const rec = editModal.recurring;
    const floor = rec?.amount ?? 0;
    const below = !!rec && val < floor;
    const overriding = below && editOverride;

    // Floor-only model. Store the total budget the overlay will floor at recurring:
    // - overriding: save the raw sub-floor value + override=1; THIS MONTH ONLY.
    // - below (not overriding): clamp up to the floor.
    // - at/above: store the entered total.
    let stored: number; let override = 0; let applyForward = applyFuture;
    if (overriding) {
      stored = val; override = 1; applyForward = false;
    } else {
      stored = below ? floor : val;
    }

    const [by, bm] = editModal.targetMonth.split('-').map(Number); // year, month (1-12)
    const months: string[] = [editModal.targetMonth];
    if (applyForward) {
      for (let m = bm; m <= 11; m++) months.push(`${by}-${String(m + 1).padStart(2, '0')}`);
    }
    try {
      await Promise.all(months.map((mo) =>
        apiFetch('/budgets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Override is this-month-only; future months (apply-forward) reset to non-override.
          body: JSON.stringify({ categoryId: editModal.categoryId, month: mo, amount: stored, override: mo === editModal.targetMonth ? override : 0 }),
        })
      ));
    } catch (e) { addToast(e instanceof Error ? e.message : 'Failed to save budget', 'error'); return; }
    closeEdit();
    await loadData();
    if (view === 'year') await loadAnnual();
  };

  if (!data) {
    return <Spinner />;
  }

  const { income, expenseGroups, totals } = data;

  const isMonth = view === 'month';
  const now = new Date();
  const periodLabel = isMonth ? `${shortMonth(month)} ${month.getFullYear()}` : String(month.getFullYear());
  const subtitle = isMonth ? monthLabel(month) : String(month.getFullYear());
  const goPrev = () => setMonth(isMonth ? prevMonth(month) : new Date(month.getFullYear() - 1, month.getMonth(), 1));
  const goNext = () => setMonth(isMonth ? nextMonth(month) : new Date(month.getFullYear() + 1, month.getMonth(), 1));
  const goToday = () => setMonth(new Date(now.getFullYear(), now.getMonth(), 1));

  // Drill into a category detail page. Section keys are plural ('expenses'),
  // but the categories.type column is singular ('expense').
  const dbType = (key: string) => (key === 'expenses' ? 'expense' : key);
  const drillGroup = (groupName: string, sectionKey: string) =>
    navigate(`/budget/category?group=${encodeURIComponent(groupName)}&type=${encodeURIComponent(dbType(sectionKey))}`);
  const drillSub = (categoryId: number) => navigate(`/budget/category?categoryId=${categoryId}`);

  // Two sections built from the summary (income is a single 'Income' group).
  const sections = [
    { key: 'income', label: 'Income', groups: [{ groupName: 'Income', subs: income }], planned: totals.budgetedIncome, actual: totals.actualIncome },
    { key: 'expenses', label: 'Expenses', groups: expenseGroups, planned: totals.budgetedExpenses, actual: totals.actualExpenses },
  ];

  // Year view helpers
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const yr = month.getFullYear();
  const isCurYear = yr === now.getFullYear();
  const curMi = now.getMonth();
  const colTint = (m: number) => (isCurYear && m === curMi) ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent';
  const sumCols = (subs: AnnualRow[]) => {
    const t = new Array(12).fill(0);
    for (const s of subs) for (let m = 0; m < 12; m++) t[m] += s.planned[m] || 0;
    return t;
  };
  const annualSections = annualData ? [
    { key: 'income', label: 'Income', groups: [{ groupName: 'Income', subs: annualData.income }] },
    { key: 'expenses', label: 'Expenses', groups: annualData.expenseGroups },
  ] : [];

  return (
    <div>
      {/* Top bar */}
      <PageHeader title="Budget" subtitle={subtitle} mobileTitle={subtitle}
        mobileActions={<>
          <button onClick={goPrev} aria-label="Previous"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
          <button onClick={goNext} aria-label="Next"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
        </>}
        right={<>
          <button onClick={goToday} className="h-10 px-4 rounded-[11px] bg-surface border border-line-strong text-content font-semibold text-sm hover:bg-surface-2">Today</button>
          {!isMobile && <div className="flex items-center gap-0.5 h-10 px-1 bg-surface border border-line-strong rounded-[11px]">
            <button onClick={goPrev} className="w-8 h-8 flex items-center justify-center rounded-lg text-content-2 hover:bg-surface-2" aria-label="Previous">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <span className="px-2.5 text-sm font-bold tabular-nums text-content text-center" style={{ minWidth: 74 }}>{periodLabel}</span>
            <button onClick={goNext} className="w-8 h-8 flex items-center justify-center rounded-lg text-content-2 hover:bg-surface-2" aria-label="Next">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>}
          <SegmentedControl value={view} onChange={setView}
            options={[{ value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} />
        </>} />

      {/* ===== MONTH VIEW ===== */}
      {isMonth && isMobile ? (
      /* ===== MONTH VIEW · PHONE ===== planned / remaining grid, one card per group */
      <div>
        <div className="-mx-4 -mt-5 mb-4 px-4 py-3 flex items-center justify-between" style={{ background: `color-mix(in srgb, ${leftTint(totals.leftToBudget)} 14%, transparent)` }}>
          <span className="text-[15px] font-extrabold">Left to budget</span>
          <Remaining value={totals.leftToBudget} className="text-[17px] font-extrabold" />
        </div>
        {sections.map((sec) => (
          <div key={sec.key} className="mb-6">
            <div className="flex items-end justify-between px-3 mb-2">
              <span className="text-[17px] font-bold">{sec.label}</span>
              <div className="flex gap-2 font-mono text-[11px] uppercase tracking-wide text-content-3">
                <span className="w-[76px] text-right">Planned</span><span className="w-[82px] text-right">Remaining</span>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {sec.groups.map((g) => {
                const groupKey = sec.key + '|' + g.groupName;
                const gCollapsed = collapsedGroups[groupKey];
                const gPlanned = g.subs.reduce((s, r) => s + r.budgeted, 0);
                const gActual = g.subs.reduce((s, r) => s + r.actual, 0);
                const gRem = gPlanned - gActual;
                const showUn = showUnbudgeted[groupKey];
                const unbudgeted = g.subs.filter((r) => r.budgeted === 0 && r.actual === 0);
                const rows = showUn ? g.subs : g.subs.filter((r) => r.budgeted !== 0 || r.actual !== 0);
                // Over plan is bad for expenses only; earning past the plan stays good.
                const pillTint = (over: boolean) => { const bad = over && sec.key !== 'income'; return { background: `color-mix(in srgb, ${bad ? 'var(--negative)' : 'var(--positive)'} 12%, transparent)`, color: bad ? 'var(--negative)' : 'var(--positive)' }; };
                return (
                  <div key={groupKey} className="bg-surface border border-line rounded-card shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-3">
                      <button type="button" onClick={() => setCollapsedGroups((s) => ({ ...s, [groupKey]: !s[groupKey] }))}
                        aria-label={gCollapsed ? 'Expand' : 'Collapse'} className="shrink-0 w-8 h-8 rounded-full border border-line-strong flex items-center justify-center text-content-2 active:bg-surface-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: gCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' }}><path d="m6 9 6 6 6-6"/></svg>
                      </button>
                      <button type="button" onClick={() => drillGroup(g.groupName, sec.key)} className="flex-1 min-w-0 text-left font-bold text-[15px] truncate">{g.groupName}</button>
                      <span className="w-[76px] text-right font-bold text-[15px] tabular-nums">{whole(gPlanned)}</span>
                      <RemainingCell value={gRem} income={sec.key === 'income'} className="w-[82px] text-right font-bold text-[15px]" />
                    </div>
                    {!gCollapsed && rows.map((r) => {
                      const rem = r.budgeted - r.actual;
                      return (
                        <div key={r.categoryId} className="flex items-center gap-2 px-3 py-2.5 border-t border-line">
                          <span className="w-7 shrink-0 text-center text-[16px] leading-none">{getCategoryEmoji(r.subName)}</span>
                          <button type="button" onClick={() => drillSub(r.categoryId)} className="flex-1 min-w-0 text-left text-[15px] font-medium truncate">{r.subName}</button>
                          <button onClick={() => { if (canEditBudgets) openEdit(r.categoryId, g.groupName, r.subName, r.budgeted, undefined, r.recurring, r.manual, r.overridden, sec.key === 'income'); }}
                            disabled={!canEditBudgets}
                            className="w-[76px] h-9 shrink-0 rounded-[10px] border border-line-strong bg-surface text-[14px] font-semibold tabular-nums text-content disabled:cursor-default">
                            {whole(r.budgeted)}
                          </button>
                          <span className="w-[82px] h-9 shrink-0 rounded-[10px] inline-flex items-center justify-center gap-1 text-[14px] font-bold tabular-nums" style={pillTint(isOver(rem))}
                            title={r.recurring ? `Recurring (minimum): ${r.recurring.items.map((i) => i.label).join(', ')}` : undefined}>
                            {r.recurring && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="opacity-80"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>}
                            {sec.key === 'income' && isOver(rem) ? `+${whole(-rem)}` : formatMoney(rem, { kind: 'total', precision: 'whole' }).text}
                          </span>
                        </div>
                      );
                    })}
                    {!gCollapsed && unbudgeted.length > 0 && (
                      <button type="button" onClick={() => setShowUnbudgeted((s) => ({ ...s, [groupKey]: !s[groupKey] }))}
                        className="w-full flex items-center gap-2.5 px-3 py-3 border-t border-line text-content-3 text-left active:bg-surface-2">
                        <span className="w-7 shrink-0 flex justify-center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg></span>
                        <span className="text-[13px] font-semibold">{showUn ? 'Hide' : 'Show'} {unbudgeted.length} unbudgeted</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      ) : isMonth ? (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_316px] gap-5 items-start">
        {/* Budget table */}
        <div className="bg-surface rounded-card border border-line shadow-sm overflow-hidden">
          <div className="grid gap-3 px-6 py-3.5 border-b border-line font-mono text-[11px] uppercase tracking-wide text-content-3" style={{ gridTemplateColumns: 'minmax(0,1fr) 82px 82px 128px' }}>
            <span>Category</span><span className="text-right">Planned</span><span className="text-right">Actual</span><span className="text-right">Remaining</span>
          </div>
          {sections.map((sec) => {
            const secCollapsed = collapsedSections[sec.key];
            const secRem = sec.planned - sec.actual;
            return (
              <div key={sec.key}>
                <div onClick={() => setCollapsedSections((s) => ({ ...s, [sec.key]: !s[sec.key] }))}
                  className="grid gap-3 px-6 py-2.5 bg-surface-2 border-t border-b border-line text-[13px] font-bold uppercase tracking-wide text-content-2 cursor-pointer items-center"
                  style={{ gridTemplateColumns: 'minmax(0,1fr) 82px 82px 128px' }}>
                  <span className="flex items-center gap-2.5">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-content-3" style={{ transform: secCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform .15s' }}><path d="m9 6 6 6-6 6"/></svg>
                    {sec.label}
                  </span>
                  <span className="text-right tabular-nums">{whole(sec.planned)}</span>
                  <span className="text-right tabular-nums">{whole(sec.actual)}</span>
                  <RemainingCell value={secRem} income={sec.key === 'income'} long className="text-right normal-case" />
                </div>
                {!secCollapsed && sec.groups.map((g) => {
                  const groupKey = sec.key + '|' + g.groupName;
                  const gCollapsed = collapsedGroups[groupKey];
                  const gPlanned = g.subs.reduce((s, r) => s + r.budgeted, 0);
                  const gActual = g.subs.reduce((s, r) => s + r.actual, 0);
                  const gRem = gPlanned - gActual;
                  const showUn = showUnbudgeted[groupKey];
                  const unbudgeted = g.subs.filter((r) => r.budgeted === 0 && r.actual === 0);
                  const rows = showUn ? g.subs : g.subs.filter((r) => r.budgeted !== 0 || r.actual !== 0);
                  return (
                    <div key={groupKey}>
                      <div className="grid gap-3 px-6 py-3.5 border-b border-line items-center"
                        style={{ gridTemplateColumns: 'minmax(0,1fr) 82px 82px 128px' }}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button type="button" onClick={() => setCollapsedGroups((s) => ({ ...s, [groupKey]: !s[groupKey] }))}
                            aria-label={gCollapsed ? 'Expand' : 'Collapse'} className="shrink-0 w-7 h-7 -m-1 flex items-center justify-center rounded-full text-content-3 hover:text-content hover:bg-surface-2 transition-colors">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: gCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform .15s' }}><path d="m9 6 6 6-6 6"/></svg>
                          </button>
                          <button type="button" onClick={() => drillGroup(g.groupName, sec.key)} className="flex items-center gap-2.5 min-w-0 text-left group/drill">
                            <span className="font-bold text-[15px] truncate group-hover/drill:underline">{g.groupName}</span>
                          </button>
                        </div>
                        <span className="text-right font-bold text-[15px] tabular-nums">{whole(gPlanned)}</span>
                        <span className="text-right text-[15px] text-content-2 tabular-nums">{whole(gActual)}</span>
                        <RemainingCell value={gRem} income={sec.key === 'income'} long className="text-right font-bold text-[15px]" />
                      </div>
                      {!gCollapsed && (
                        <div>
                          {rows.map((r) => {
                            const rem = r.budgeted - r.actual;
                            return (
                              <div key={r.categoryId} className="grid gap-3 pr-6 py-3 border-b border-line items-center" style={{ gridTemplateColumns: 'minmax(0,1fr) 82px 82px 128px', paddingLeft: 52 }}>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
                                    <span className="shrink-0 text-[15px] leading-none">{getCategoryEmoji(r.subName)}</span>
                                    <button type="button" onClick={() => drillSub(r.categoryId)}
                                      className="text-sm font-medium truncate text-left hover:underline">{r.subName}</button>
                                    {r.recurring && (
                                      <span title={`Recurring (minimum): ${r.recurring.items.map((i) => i.label).join(', ')}`}
                                        className="shrink-0 inline-flex items-center gap-1 px-1.5 h-[18px] rounded-md text-[10px] font-bold tabular-nums"
                                        style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary)' }}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>
                                        {full(r.recurring.amount)}
                                      </span>
                                    )}
                                  </div>
                                  <BudgetBar value={r.actual} max={r.budgeted} positive={sec.key === 'income'} />
                                </div>
                                <div className="flex justify-end">
                                  <button onClick={(e) => { e.stopPropagation(); if (canEditBudgets) openEdit(r.categoryId, g.groupName, r.subName, r.budgeted, undefined, r.recurring, r.manual, r.overridden, sec.key === 'income'); }}
                                    disabled={!canEditBudgets}
                                    className="min-w-16 text-right text-sm font-semibold text-content tabular-nums px-2.5 py-1.5 rounded-lg border border-line-strong bg-surface-2 enabled:hover:border-primary disabled:cursor-default">
                                    {whole(r.budgeted)}
                                  </button>
                                </div>
                                <span className="text-right text-sm text-content-2 tabular-nums self-center">{whole(r.actual)}</span>
                                <RemainingCell value={rem} income={sec.key === 'income'} long className="text-right text-sm font-semibold self-center" />
                              </div>
                            );
                          })}
                          {unbudgeted.length > 0 && (
                            <div onClick={() => setShowUnbudgeted((s) => ({ ...s, [groupKey]: !s[groupKey] }))}
                              className="flex items-center gap-2.5 pl-11 md:pl-[52px] pr-4 md:pr-6 py-3 border-b border-line cursor-pointer text-content-3">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
                              <span className="text-[13px] font-semibold">{showUn ? 'Hide' : 'Show'} {unbudgeted.length} unbudgeted</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
          <div className="flex items-center justify-between px-4 md:px-6 py-4" style={{ background: `color-mix(in srgb, ${leftTint(totals.leftToBudget)} 14%, transparent)` }}>
            <span className="text-base font-extrabold">Left to budget</span>
            <Remaining value={totals.leftToBudget} className="text-lg font-extrabold" />
          </div>
        </div>

        {/* Summary rail */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-[88px]">
          <div className="rounded-card border shadow-sm p-6 text-center" style={{ borderColor: `color-mix(in srgb, ${leftTint(totals.leftToBudget)} 35%, var(--line))`, background: `color-mix(in srgb, ${leftTint(totals.leftToBudget)} 12%, var(--surface))` }}>
            <Remaining value={totals.leftToBudget} className="block text-[34px] font-extrabold tracking-tight" />
            <div className="text-sm text-content-2 mt-1">Left to budget</div>
          </div>
          <div className="rounded-card border border-line bg-surface shadow-sm p-6">
            {([
              { label: 'Income', planned: totals.budgetedIncome, actual: totals.actualIncome, verb: 'earned' },
              { label: 'Expenses', planned: totals.budgetedExpenses, actual: totals.actualExpenses, verb: 'spent' },
            ]).map((b, i) => {
              const pct = b.planned > 0 ? Math.min(100, (b.actual / b.planned) * 100) : 0;
              const rem = b.planned - b.actual;
              return (
                <div key={b.label}>
                  {i > 0 && <div className="h-px bg-line my-[18px]" />}
                  <div className="flex items-center justify-between mb-2.5"><span className="text-[15px] font-bold">{b.label}</span><span className="text-[13px] text-content-3 tabular-nums">{whole(b.planned)} planned</span></div>
                  <div className="h-[7px] rounded-full bg-surface-2 overflow-hidden mb-2"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--positive)' }} /></div>
                  <div className="flex items-center justify-between text-sm"><span className="font-semibold">{whole(b.actual)} {b.verb}</span>
                    {!isOver(rem)
                      ? <span className="text-content-3"><Remaining value={rem} className="font-bold" /> remaining</span>
                      /* Exceeding plan is only bad for expenses — earning past it stays green (mirrors the dashboard BudgetCard). */
                      : b.label === 'Income'
                        ? <RemainingCell value={rem} income long className="font-bold" />
                        : <span className="text-content-3"><span className="font-bold tabular-nums text-negative">{whole(-rem)}</span> over</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      ) : annualData ? (
      /* ===== YEAR VIEW ===== */
      <div className="bg-surface rounded-card border border-line shadow-sm overflow-x-auto">
        <div>
          {/* month header */}
          <div className="flex items-center border-b border-line bg-surface-2">
            <div className="w-[250px] shrink-0 px-6 py-3 font-mono text-[11px] uppercase tracking-wide text-content-3 sticky left-0 bg-surface-2 z-[2]">Category</div>
            {MONTHS.map((mn, m) => (
              <button key={m} type="button" title={`View ${mn} ${yr}`}
                onClick={() => { setMonth(new Date(yr, m, 1)); setView('month'); }}
                className="flex-1 min-w-0 px-3 py-3 text-right font-mono text-[11px] uppercase tracking-wide cursor-pointer hover:underline"
                style={{ color: (isCurYear && m === curMi) ? 'var(--primary)' : 'var(--text-3)', background: colTint(m), fontWeight: (isCurYear && m === curMi) ? 800 : 600 }}>{mn} {yr}</button>
            ))}
          </div>
          {annualSections.map((sec) => {
            const secTotals = sec.groups.reduce<number[]>((acc, g) => { const gt = sumCols(g.subs); return acc.map((v, m) => v + gt[m]); }, new Array(12).fill(0));
            return (
              <div key={sec.key}>
                <div className="flex items-center border-t border-b border-line bg-surface-2">
                  <div className="w-[250px] shrink-0 px-6 py-2.5 text-xs font-bold uppercase tracking-wide text-content-2 sticky left-0 bg-surface-2 z-[2]">{sec.label}</div>
                  {secTotals.map((v, m) => (
                    <div key={m} className="flex-1 min-w-0 px-3 py-2.5 text-right text-xs font-bold text-content-2 tabular-nums" style={{ background: colTint(m) }}>{whole(v)}</div>
                  ))}
                </div>
                {sec.groups.map((g) => {
                  const groupKey = 'y|' + sec.key + '|' + g.groupName;
                  const gCollapsed = collapsedGroups[groupKey];
                  const gTotals = sumCols(g.subs);
                  return (
                    <div key={groupKey}>
                      <div className="flex items-center border-b border-line">
                        <div className="w-[250px] shrink-0 px-6 py-3 flex items-center gap-2.5 sticky left-0 bg-surface z-[1]">
                          <button type="button" onClick={() => setCollapsedGroups((s) => ({ ...s, [groupKey]: !s[groupKey] }))}
                            aria-label={gCollapsed ? 'Expand' : 'Collapse'} className="shrink-0 w-7 h-7 -m-1 flex items-center justify-center rounded-full text-content-3 hover:text-content hover:bg-surface-2 transition-colors">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: gCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform .15s' }}><path d="m9 6 6 6-6 6"/></svg>
                          </button>
                          <button type="button" onClick={() => drillGroup(g.groupName, sec.key)} className="flex items-center gap-2.5 min-w-0 text-left group/drill">
                            <span className="font-bold text-sm truncate group-hover/drill:underline">{g.groupName}</span>
                          </button>
                        </div>
                        {gTotals.map((v, m) => (
                          <div key={m} className="flex-1 min-w-0 px-3 py-3 text-right text-sm font-semibold tabular-nums" style={{ background: colTint(m) }}>{whole(v)}</div>
                        ))}
                      </div>
                      {!gCollapsed && g.subs.map((sub) => (
                        <div key={sub.categoryId} className="flex items-center border-b border-line">
                          <div className="w-[250px] shrink-0 px-6 py-2.5 text-sm text-content-2 sticky left-0 bg-surface z-[1] flex items-center gap-1.5" style={{ paddingLeft: 52 }}>
                            <span className="shrink-0 text-[15px] leading-none">{getCategoryEmoji(sub.subName)}</span>
                            <button type="button" onClick={() => drillSub(sub.categoryId)} className="truncate text-left hover:underline">{sub.subName}</button>
                          </div>
                          {sub.planned.map((v, m) => {
                            const past = isCurYear && m < curMi;
                            const targetMonth = `${yr}-${String(m + 1).padStart(2, '0')}`;
                            return (
                              <div key={m} className="flex-1 min-w-0 px-2.5 py-1.5 flex justify-end" style={{ background: colTint(m) }}>
                                <button onClick={() => { if (canEditBudgets && !past) openEdit(sub.categoryId, g.groupName, `${sub.subName} · ${MONTHS[m]} ${yr}`, v, targetMonth, sub.recurring[m], sub.manual[m], sub.overridden[m], sec.key === 'income'); }}
                                  disabled={!canEditBudgets || past}
                                  className="min-w-16 text-right text-sm tabular-nums px-2.5 py-1.5 rounded-lg enabled:hover:border-primary"
                                  style={{ border: past ? '1px solid transparent' : '1px solid var(--line-strong)', color: past ? 'var(--text-3)' : 'var(--text)' }}>
                                  {whole(v)}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      ) : (
      <div className="bg-surface rounded-card border border-line shadow-sm p-10 flex justify-center"><Spinner /></div>
      )}

      {/* ===== Edit budget popup ===== */}
      {editModal && (() => {
        const rec = editModal.recurring;
        const floor = rec?.amount ?? 0;
        const val = parseFloat(editValue) || 0;
        const below = !!rec && val < floor;
        const overriding = below && editOverride;
        const extra = Math.max(0, +(val - floor).toFixed(2));
        let helper = ''; let helperColor = 'var(--text-3)';
        if (overriding) { helper = `Overriding for this month only — budgeting ${full(floor - val)} below the recurring floor (e.g. a month with no paycheck). The floor returns next month.`; helperColor = 'var(--text-2)'; }
        else if (below) { helper = `Below the ${full(floor)} recurring minimum. Set it to the minimum, or override this one month.`; helperColor = 'var(--warning)'; }
        else if (rec && extra === 0) { helper = `Covers the ${full(floor)} recurring exactly — no extra room.`; helperColor = 'var(--text-3)'; }
        else if (rec) { helper = `${full(floor)} recurring + ${full(extra)} extra`; helperColor = 'var(--text-2)'; }
        const clearToFloor = () => { setEditValue(String(floor)); setEditOverride(false); };
        return (
        <ResponsiveModal isOpen onClose={closeEdit} title={editModal.subName} icon={editModal.emoji} maxWidth="35rem"
          footer={<div className="flex items-center justify-end gap-2.5">
            <Button variant="secondary" onClick={closeEdit}>Cancel</Button>
            <Button onClick={saveEdit}>Save</Button>
          </div>}>
          <div className="text-[12px] font-bold uppercase tracking-[0.05em] text-content-3 mb-[9px]">Monthly budget</div>
          <div className={`flex items-center gap-0.5 h-16 px-[18px] rounded-[14px] bg-surface border-2 transition-colors ${below && !overriding ? 'border-warning focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--warning)_20%,transparent)]' : 'border-line-strong focus-within:border-primary focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_20%,transparent)]'}`}>
            <span className="text-[26px] text-content-3 font-semibold">$</span>
            <input autoFocus value={editValue} onChange={(e) => { setEditValue(e.target.value.replace(/[^0-9.]/g, '')); setEditOverride(false); }} inputMode="decimal"
              aria-label="Monthly budget"
              onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); }}
              className="no-focus-ring flex-1 min-w-0 h-full bg-transparent border-none outline-none text-content text-[30px] font-extrabold tracking-[-0.01em] tabular-nums px-2" />
          </div>
          {rec && (
            <div className="mt-2.5 min-h-[20px]">
              <div className="text-[13px] leading-[1.45]" style={{ color: helperColor }}>{helper}</div>
              {below && (
                <div className="flex items-center gap-[18px] mt-[9px] text-[12.5px] font-bold">
                  {!overriding && <button type="button" onClick={clearToFloor} style={{ color: 'var(--primary)' }}>Set to minimum</button>}
                  {!overriding && <button type="button" onClick={() => setEditOverride(true)} style={{ color: 'var(--text-2)' }}>Override for this month</button>}
                  {overriding && <button type="button" onClick={clearToFloor} style={{ color: 'var(--primary)' }}>Undo override</button>}
                </div>
              )}
            </div>
          )}
          {rec && (
            <div className="mt-[18px] rounded-[14px] border p-4" style={{ borderColor: 'color-mix(in srgb, var(--primary) 32%, var(--line))', background: 'color-mix(in srgb, var(--primary) 9%, var(--surface))' }}>
              <div className="flex items-center gap-2.5" style={{ color: 'var(--primary)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>
                <span className="text-[15px] font-extrabold tabular-nums">{full(floor)} recurring this month</span>
                {overriding && <span className="text-[11px] font-bold uppercase tracking-[0.04em] px-2 py-[3px] rounded-md" style={{ color: 'var(--warning)', background: 'color-mix(in srgb, var(--warning) 16%, transparent)' }}>Overridden</span>}
              </div>
              <div className="mt-2 flex flex-col gap-1.5" style={{ marginLeft: 27 }}>
                {rec.items.map((it, i) => (
                  <div key={i} className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--text-2)' }}>
                    <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: 'var(--text-3)' }} />
                    <span className="truncate">{it.label} · {it.cadence}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3.5 pt-3 border-t text-[13px] leading-[1.5]" style={{ marginLeft: 27, borderColor: 'color-mix(in srgb, var(--primary) 20%, var(--line))', color: 'var(--text-3)' }}>
                {overriding
                  ? 'Overridden this month, so recurring is not fully covered by the budget. The minimum returns automatically next month.'
                  : 'This is the minimum budget for the category — recurring is always covered, and anything above it is extra spending room.'}
              </div>
            </div>
          )}
          <BudgetHistory categoryId={editModal.categoryId} targetMonth={editModal.targetMonth} income={editModal.income} />
          <label onClick={() => setApplyFuture((v) => !v)} className="flex items-center gap-3 mt-5 cursor-pointer select-none">
            <span className="w-[22px] h-[22px] shrink-0 rounded-[7px] flex items-center justify-center" style={{ border: `2px solid ${applyFuture ? 'var(--primary)' : 'var(--line-strong)'}`, background: applyFuture ? 'var(--primary)' : 'transparent', transition: '.12s' }}>
              {applyFuture && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--on-primary)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 6"/></svg>}
            </span>
            <span className="text-[15px] font-semibold">Apply to the rest of {month.getFullYear()}</span>
          </label>
        </ResponsiveModal>
        );
      })()}
    </div>
  );
}
