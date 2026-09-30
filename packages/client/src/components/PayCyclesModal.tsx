import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { fmt } from '../lib/formatters';
import ResponsiveModal from './ResponsiveModal';
import CurrencyInput from './CurrencyInput';
import ConfirmDeleteButton from './ConfirmDeleteButton';
import InlineNotification from './InlineNotification';
import { useToast } from '../context/ToastContext';
import { computeYearPreview, type PayFrequency, type PreviewCycle } from '../lib/payCyclePreview';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FREQ_LABEL: Record<PayFrequency, string> = { weekly: 'Weekly', biweekly: 'Biweekly', semi_monthly: 'Semi-monthly', monthly: 'Monthly' };
const FREQ_HELP: Record<PayFrequency, string> = {
  weekly: 'Every week from an anchor payday. 4 or 5 checks per month.',
  biweekly: 'Every 2 weeks from an anchor payday. 2 or 3 checks per month.',
  semi_monthly: 'Two fixed days each month. Always 2 checks.',
  monthly: 'One fixed day each month. Always 1 check.',
};

interface PayCycleRow {
  id: number;
  label: string;
  category_id: number;
  user_id: number | null;
  frequency: PayFrequency;
  amount: number;
  anchor_date: string | null;
  day_of_month_1: number | null;
  day_of_month_2: number | null;
  day_of_month: number | null;
  effective_start: string | null;
  effective_end: string | null;
  is_active: number;
  sub_name: string;
  group_name: string;
  ownerName: string | null;
}

interface FormState {
  id: number | null;
  label: string;
  userId: number | null;
  categoryId: number;
  frequency: PayFrequency;
  amount: string;
  anchorDate: string;
  dayOfMonth1: number;
  dayOfMonth2: number;
  dayOfMonth: number;
  effectiveStart: string;
  effectiveEnd: string;
  isActive: boolean;
}

interface PayCyclesModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: { id: number; displayName: string }[];
  incomeCategories: { id: number; subName: string }[];
  onChange?: () => void;
}

const inputCls = 'w-full px-3 py-2 rounded-lg text-[13px] border border-[var(--bg-input-border)] bg-[var(--bg-input)] text-[var(--text-primary)] outline-none box-border';
const labelCls = 'block text-[12px] font-semibold text-[var(--text-secondary)] mb-1';
function ord(n: number): string {
  if (n === 0) return 'Last day';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function toPreview(c: { frequency: PayFrequency; amount: number; anchor_date: string | null; day_of_month_1: number | null; day_of_month_2: number | null; day_of_month: number | null; effective_start: string | null; effective_end: string | null }): PreviewCycle {
  return {
    frequency: c.frequency, amount: c.amount, anchor_date: c.anchor_date,
    day_of_month_1: c.day_of_month_1, day_of_month_2: c.day_of_month_2, day_of_month: c.day_of_month,
    effective_start: c.effective_start, effective_end: c.effective_end,
  };
}

function DaySelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} className={inputCls}>
      <option value={0}>Last day of month</option>
      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{ord(d)}</option>)}
    </select>
  );
}

export default function PayCyclesModal({ isOpen, onClose, users, incomeCategories, onChange }: PayCyclesModalProps) {
  const { addToast } = useToast();
  const [cycles, setCycles] = useState<PayCycleRow[]>([]);
  const [view, setView] = useState<'list' | 'form'>('list');
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const year = new Date().getFullYear();

  const load = useCallback(async () => {
    const res = await apiFetch<{ data: PayCycleRow[] }>('/pay-cycles');
    setCycles(res.data);
  }, []);

  useEffect(() => {
    if (isOpen) { setView('list'); setError(''); load().catch(() => addToast('Failed to load pay cycles', 'error')); }
  }, [isOpen, load, addToast]);

  const defaultCategoryId = (incomeCategories.find((c) => c.subName === 'Take Home Pay') ?? incomeCategories[0])?.id ?? 0;
  const newForm = (): FormState => ({
    id: null, label: '', userId: users[0]?.id ?? null, categoryId: defaultCategoryId,
    frequency: 'biweekly', amount: '', anchorDate: '', dayOfMonth1: 15, dayOfMonth2: 0, dayOfMonth: 1,
    effectiveStart: '', effectiveEnd: '', isActive: true,
  });

  const editForm = (c: PayCycleRow): FormState => ({
    id: c.id, label: c.label, userId: c.user_id, categoryId: c.category_id, frequency: c.frequency,
    amount: String(c.amount), anchorDate: c.anchor_date ?? '', dayOfMonth1: c.day_of_month_1 ?? 15,
    dayOfMonth2: c.day_of_month_2 ?? 0, dayOfMonth: c.day_of_month ?? 1,
    effectiveStart: c.effective_start ?? '', effectiveEnd: c.effective_end ?? '', isActive: c.is_active === 1,
  });

  const openAdd = () => { setForm(newForm()); setError(''); setView('form'); };
  const openEdit = (c: PayCycleRow) => { setForm(editForm(c)); setError(''); setView('form'); };
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => { setForm((p) => (p ? { ...p, [k]: v } : p)); setError(''); };

  const variable = form ? form.frequency === 'weekly' || form.frequency === 'biweekly' : false;
  const preview = form ? computeYearPreview(toPreview({
    frequency: form.frequency, amount: parseFloat(form.amount) || 0, anchor_date: form.anchorDate || null,
    day_of_month_1: form.dayOfMonth1, day_of_month_2: form.dayOfMonth2, day_of_month: form.dayOfMonth,
    effective_start: form.effectiveStart || null, effective_end: form.effectiveEnd || null,
  }), year) : null;

  const save = async () => {
    if (!form) return;
    if (!form.label.trim()) { setError('Label is required'); return; }
    if (!(parseFloat(form.amount) > 0)) { setError('Per-paycheck amount must be greater than 0'); return; }
    if (variable && !form.anchorDate) { setError('Anchor date is required for weekly/biweekly cycles'); return; }
    const body = {
      label: form.label.trim(),
      categoryId: form.categoryId,
      userId: form.userId,
      frequency: form.frequency,
      amount: parseFloat(form.amount),
      anchorDate: variable ? form.anchorDate : null,
      dayOfMonth1: form.frequency === 'semi_monthly' ? form.dayOfMonth1 : null,
      dayOfMonth2: form.frequency === 'semi_monthly' ? form.dayOfMonth2 : null,
      dayOfMonth: form.frequency === 'monthly' ? form.dayOfMonth : null,
      effectiveStart: form.effectiveStart || null,
      effectiveEnd: form.effectiveEnd || null,
      isActive: form.isActive,
    };
    setSaving(true);
    try {
      await apiFetch(`/pay-cycles${form.id ? `/${form.id}` : ''}`, { method: form.id ? 'PUT' : 'POST', body: JSON.stringify(body) });
      addToast(form.id ? 'Pay cycle updated' : 'Pay cycle added', 'success');
      await load();
      onChange?.();
      setView('list');
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Failed to save pay cycle', 'error');
    } finally {
      setSaving(false);
    }
  };

  const del = async (c: PayCycleRow) => {
    try {
      await apiFetch(`/pay-cycles/${c.id}`, { method: 'DELETE' });
      addToast('Pay cycle deleted', 'success');
      await load();
      onChange?.();
    } catch {
      addToast('Failed to delete pay cycle', 'error');
    }
  };

  const scheduleSummary = (c: PayCycleRow): string => {
    if (c.frequency === 'weekly' || c.frequency === 'biweekly') {
      const p = computeYearPreview(toPreview(c), year);
      return `${fmt(c.amount)}/check${p.extraMonths.length ? ` · extra in ${p.extraMonths.map((m) => MONTH_NAMES[m - 1]).join(', ')}` : ''}`;
    }
    if (c.frequency === 'semi_monthly') return `${fmt(c.amount)}/check · ${ord(c.day_of_month_1 ?? 0)} & ${ord(c.day_of_month_2 ?? 0)}`;
    return `${fmt(c.amount)}/check · ${ord(c.day_of_month ?? 0)}`;
  };

  // group cycles by owner
  const grouped: { owner: string; list: PayCycleRow[] }[] = [];
  for (const c of cycles) {
    const owner = c.ownerName ?? 'Unassigned';
    let g = grouped.find((x) => x.owner === owner);
    if (!g) { g = { owner, list: [] }; grouped.push(g); }
    g.list.push(c);
  }
  // Owners alphabetical, with the "Unassigned" group pinned last.
  grouped.sort((a, b) => {
    if (a.owner === 'Unassigned') return 1;
    if (b.owner === 'Unassigned') return -1;
    return a.owner.localeCompare(b.owner);
  });

  return (
    <ResponsiveModal title={view === 'form' ? (form?.id ? 'Edit Pay Cycle' : 'Add Pay Cycle') : 'Pay Cycles'} isOpen={isOpen} onClose={onClose} maxWidth="560px">
      {view === 'list' ? (
        <div>
          <p className="text-[12px] text-[var(--text-secondary)] mt-0 mb-4">
            Track each earner's paychecks. The budget import wizard sums these into your monthly budget — including the months with an extra paycheck.
          </p>

          {grouped.length === 0 ? (
            <div className="text-center py-8 text-[13px] text-[var(--text-muted)]">No pay cycles yet. Add one to project take-home income.</div>
          ) : (
            grouped.map((g) => (
              <div key={g.owner} className="mb-4">
                <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.04em] mb-1.5">{g.owner}</div>
                <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--bg-card-border)] overflow-hidden">
                  {g.list.map((c, i) => (
                    <div key={c.id} className="px-3.5 py-2.5" style={{ borderTop: i > 0 ? '1px solid var(--table-row-border)' : 'none' }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-semibold text-[var(--text-primary)]">{c.label}</span>
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md" style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--color-accent)' }}>{FREQ_LABEL[c.frequency]}</span>
                            {c.is_active !== 1 && <span className="text-[11px] text-[var(--text-muted)]">(inactive)</span>}
                          </div>
                          <div className="text-[12px] text-[var(--text-muted)] mt-0.5">{c.sub_name} · {scheduleSummary(c)}</div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button onClick={() => openEdit(c)} className="text-[11px] font-semibold text-[var(--btn-secondary-text)] bg-[var(--btn-secondary-bg)] border-none rounded-md px-2.5 py-1 cursor-pointer btn-secondary">Edit</button>
                          <ConfirmDeleteButton onConfirm={() => del(c)} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}

          <button onClick={openAdd} className="w-full text-[13px] font-semibold text-[var(--btn-primary-text)] bg-[var(--btn-primary-bg)] border-none rounded-lg px-4 py-2.5 cursor-pointer btn-primary min-h-[44px] mt-1">
            + Add Pay Cycle
          </button>
        </div>
      ) : form ? (
        <div>
          {error && <InlineNotification type="error" message={error} className="mb-3" />}

          <div className="mb-3.5">
            <label className={labelCls}>Label</label>
            <input value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="e.g., ABC Fitness — Payroll" className={inputCls} />
          </div>

          <div className="flex gap-2.5 mb-3.5">
            <div className="flex-1">
              <label className={labelCls}>Earner</label>
              <select value={form.userId ?? ''} onChange={(e) => set('userId', e.target.value === '' ? null : Number(e.target.value))} className={inputCls}>
                <option value="">— Household —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className={labelCls}>Income category</label>
              <select value={form.categoryId} onChange={(e) => set('categoryId', Number(e.target.value))} className={inputCls}>
                {incomeCategories.map((c) => <option key={c.id} value={c.id}>{c.subName}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-2.5 mb-1.5">
            <div className="flex-1">
              <label className={labelCls}>Frequency</label>
              <select value={form.frequency} onChange={(e) => set('frequency', e.target.value as PayFrequency)} className={inputCls}>
                {(Object.keys(FREQ_LABEL) as PayFrequency[]).map((k) => <option key={k} value={k}>{FREQ_LABEL[k]}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className={labelCls}>Per-paycheck amount</label>
              <CurrencyInput value={form.amount} onChange={(v) => set('amount', v)} className={inputCls} />
            </div>
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mb-3.5 mt-0">{FREQ_HELP[form.frequency]}</p>

          {variable && (
            <div className="mb-3.5">
              <label className={labelCls}>Anchor date <span className="font-normal text-[var(--text-muted)]">(any known payday — sets the cadence)</span></label>
              <input type="date" value={form.anchorDate} onChange={(e) => set('anchorDate', e.target.value)} className={inputCls} />
            </div>
          )}
          {form.frequency === 'semi_monthly' && (
            <div className="flex gap-2.5 mb-3.5">
              <div className="flex-1"><label className={labelCls}>First payday</label><DaySelect value={form.dayOfMonth1} onChange={(v) => set('dayOfMonth1', v)} /></div>
              <div className="flex-1"><label className={labelCls}>Second payday</label><DaySelect value={form.dayOfMonth2} onChange={(v) => set('dayOfMonth2', v)} /></div>
            </div>
          )}
          {form.frequency === 'monthly' && (
            <div className="mb-3.5"><label className={labelCls}>Payday</label><DaySelect value={form.dayOfMonth} onChange={(v) => set('dayOfMonth', v)} /></div>
          )}

          <div className="flex gap-2.5 mb-3.5">
            <div className="flex-1"><label className={labelCls}>Starts <span className="font-normal text-[var(--text-muted)]">(optional)</span></label><input type="date" value={form.effectiveStart} onChange={(e) => set('effectiveStart', e.target.value)} className={inputCls} /></div>
            <div className="flex-1"><label className={labelCls}>Ends <span className="font-normal text-[var(--text-muted)]">(optional)</span></label><input type="date" value={form.effectiveEnd} onChange={(e) => set('effectiveEnd', e.target.value)} className={inputCls} /></div>
          </div>

          <label className="flex items-center gap-2 mb-4 cursor-pointer">
            <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} className="w-4 h-4 cursor-pointer" />
            <span className="text-[12px] text-[var(--text-secondary)]">Active (include in budget projections)</span>
          </label>

          {/* Live year preview */}
          {preview && (
            <div className="mb-4 px-3.5 py-3 rounded-lg bg-[var(--bg-hover)] border border-[var(--bg-card-border)]">
              <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.04em] mb-2">{year} preview</div>
              <div className="flex justify-between text-[13px] mb-2">
                <span className="text-[var(--text-secondary)]">{preview.totalChecks} paychecks/yr</span>
                <span className="font-bold font-mono text-[var(--text-primary)]">{fmt(preview.annual)}/yr</span>
              </div>
              <div className="flex gap-[3px] mb-2">
                {preview.perMonth.map((c, i) => {
                  const extra = c > preview.baseline && preview.baseline > 0;
                  return (
                    <div key={i} className="flex-1 text-center" title={`${MONTH_NAMES[i]}: ${c}`}>
                      <div className="h-[22px] rounded flex items-end justify-center text-[10px] font-bold text-white pb-0.5"
                        style={{ background: extra ? 'var(--color-warning)' : c > 0 ? 'var(--color-accent)' : 'var(--bg-card-border)', opacity: c > 0 ? 1 : 0.4 }}>
                        {c || ''}
                      </div>
                      <div className="text-[8px] text-[var(--text-muted)] mt-0.5">{MONTH_NAMES[i][0]}</div>
                    </div>
                  );
                })}
              </div>
              {!variable ? (
                <div className="text-[12px] text-[var(--text-muted)]">Same number of paychecks every month.</div>
              ) : preview.totalChecks === 0 ? (
                <div className="text-[12px] text-[var(--text-muted)]">Enter an anchor date to preview the schedule.</div>
              ) : preview.extraMonths.length > 0 ? (
                <div className="text-[12px] font-semibold text-[var(--color-warning)]">⚡ Extra paycheck in {preview.extraMonths.map((m) => MONTH_NAMES[m - 1]).join(', ')}</div>
              ) : (
                <div className="text-[12px] text-[var(--text-muted)]">Consistent paychecks across the active months.</div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--bg-card-border)]">
            <button onClick={() => setView('list')} className="text-[12px] font-semibold text-[var(--btn-secondary-text)] bg-[var(--btn-secondary-bg)] border-none rounded-lg px-4 py-2 cursor-pointer btn-secondary">Cancel</button>
            <button onClick={save} disabled={saving} className="text-[12px] font-semibold text-[var(--btn-primary-text)] bg-[var(--btn-primary-bg)] border-none rounded-lg px-4 py-2 cursor-pointer btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? 'Saving…' : form.id ? 'Save Changes' : 'Add Pay Cycle'}
            </button>
          </div>
        </div>
      ) : null}
    </ResponsiveModal>
  );
}
