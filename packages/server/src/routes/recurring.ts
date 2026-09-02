import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { recurringItems, categories, merchants, accounts, users } from '../db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { requirePermission } from '../middleware/permissions.js';
import { sanitizeString } from '../utils/sanitize.js';
import { findOrCreateMerchant } from '../db/merchants.js';
import { computePaydaysInMonth, type PayCycleForMath } from '../utils/payCycleMath.js';
import { getRecurringFloors } from '../services/recurringBudget.js';
import type {
  RecurrenceKind, RecurringOccurrence, RecurringMonthView, RecurringBudgetFloor,
} from '@ledger/shared/src/types.js';

const router = Router();

const KINDS: RecurrenceKind[] = ['monthly', 'semi_monthly', 'biweekly', 'weekly', 'every_n_months', 'custom_months'];
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function isValidYmd(s: unknown): boolean {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function parseIntArray(json: string | null): number[] {
  if (!json) return [];
  try { const v = JSON.parse(json); return Array.isArray(v) ? v.map(Number).filter((n) => Number.isFinite(n)) : []; }
  catch { return []; }
}

/** Enriched select used by the catalog, occurrence expansion, and single-row fetch. */
function baseSelect() {
  return db.select({
    id: recurringItems.id,
    type: recurringItems.type,
    label: recurringItems.label,
    merchant_id: recurringItems.merchant_id,
    category_id: recurringItems.category_id,
    account_id: recurringItems.account_id,
    amount: recurringItems.amount,
    freq_kind: recurringItems.freq_kind,
    day: recurringItems.day,
    days_json: recurringItems.days_json,
    interval: recurringItems.interval,
    anchor_date: recurringItems.anchor_date,
    months_json: recurringItems.months_json,
    start_date: recurringItems.start_date,
    status: recurringItems.status,
    user_id: recurringItems.user_id,
    effective_start: recurringItems.effective_start,
    effective_end: recurringItems.effective_end,
    created_at: recurringItems.created_at,
    updated_at: recurringItems.updated_at,
    groupName: categories.group_name,
    subName: categories.sub_name,
    displayName: categories.display_name,
    categoryType: categories.type,
    merchantName: merchants.name,
    merchantLogoUrl: merchants.logo_url,
    accountName: accounts.name,
    accountLastFour: accounts.last_four,
  })
    .from(recurringItems)
    .innerJoin(categories, eq(recurringItems.category_id, categories.id))
    .leftJoin(merchants, eq(recurringItems.merchant_id, merchants.id))
    .leftJoin(accounts, eq(recurringItems.account_id, accounts.id));
}

type Row = ReturnType<typeof baseSelect> extends { all(): (infer R)[] } ? R : never;

/** Map an item row to the occurrence-engine shape (start_date anchors + bounds). */
function toMath(r: {
  id: number; label: string; user_id: number | null; category_id: number; subName: string; groupName: string;
  freq_kind: string; amount: number | null; anchor_date: string | null; days_json: string | null;
  day: number | null; interval: number | null; months_json: string | null; start_date: string | null;
  status: string; effective_start: string | null; effective_end: string | null;
}): PayCycleForMath {
  const days = parseIntArray(r.days_json);
  return {
    id: r.id, label: r.label, user_id: r.user_id, ownerName: null,
    category_id: r.category_id, sub_name: r.subName, group_name: r.groupName,
    frequency: r.freq_kind as PayCycleForMath['frequency'],
    amount: r.amount ?? 0,
    // start_date both anchors phase kinds (weekly/biweekly/every-N) and bounds the schedule.
    anchor_date: r.anchor_date ?? r.start_date,
    day_of_month_1: days[0] ?? null,
    day_of_month_2: days[1] ?? null,
    day_of_month: r.day,
    interval: r.interval,
    months: parseIntArray(r.months_json),
    effective_start: r.effective_start ?? r.start_date,
    effective_end: r.effective_end,
    is_active: r.status === 'active' ? 1 : 0,
  };
}

interface ValidatedItem {
  type: string; label: string; merchant_id: number | null; category_id: number; account_id: number | null;
  amount: number; freq_kind: string; day: number | null; days_json: string | null; interval: number | null;
  anchor_date: string | null; months_json: string | null; start_date: string | null; status: string;
  user_id: number | null; effective_start: string | null; effective_end: string | null;
}

/**
 * Full-object validation (PUT sends every field, so create/update validate
 * identically — no partial update can desync freq_kind and its day/anchor fields).
 * `type` is DERIVED from the category (income→income; everything else→expense),
 * never trusted from a divergent body value; `amount` is a positive magnitude.
 */
function validate(body: Record<string, unknown>): { error: string } | { value: ValidatedItem } {
  const label = typeof body.label === 'string' ? sanitizeString(body.label) : '';
  if (!label) return { error: 'label is required' };

  const categoryId = body.categoryId;
  if (!Number.isInteger(categoryId)) return { error: 'categoryId is required' };
  const cat = db.select().from(categories).where(eq(categories.id, categoryId as number)).get();
  if (!cat) return { error: 'category not found' };
  const type = cat.type === 'income' ? 'income' : 'expense';

  const freq_kind = body.freqKind as string;
  if (!KINDS.includes(freq_kind as RecurrenceKind)) return { error: 'invalid freqKind' };

  const amount = Number(body.amount);
  if (!(amount > 0)) return { error: 'amount must be greater than 0' };

  let account_id: number | null = null;
  if (body.accountId !== undefined && body.accountId !== null) {
    if (!Number.isInteger(body.accountId)) return { error: 'invalid accountId' };
    const a = db.select().from(accounts).where(eq(accounts.id, body.accountId as number)).get();
    if (!a) return { error: 'account not found' };
    account_id = body.accountId as number;
  }

  let day: number | null = null;
  let days_json: string | null = null;
  let interval: number | null = null;
  let anchor_date: string | null = null;
  let months_json: string | null = null;

  const validDay = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 31;
  const start_date = body.startDate ? String(body.startDate) : null;
  if (start_date && !isValidYmd(start_date)) return { error: 'startDate must be a valid YYYY-MM-DD date' };

  if (freq_kind === 'weekly' || freq_kind === 'biweekly') {
    // Start date is the phase anchor for weekly/biweekly cadences.
    if (!start_date) return { error: 'a start date is required for weekly/bi-weekly' };
    anchor_date = start_date;
  } else if (freq_kind === 'semi_monthly') {
    const d1 = Number(body.dayOfMonth1), d2 = Number(body.dayOfMonth2);
    if (!validDay(d1) || !validDay(d2)) return { error: 'two day-of-month values 0-31 (0 = last day) are required' };
    // 0 (last day) and 31 both resolve to the last day in every month, so reject
    // pairs that would collapse to a single occurrence (would pay once but be
    // annualized as twice).
    const norm = (d: number) => (d === 0 ? 31 : d);
    if (norm(d1) === norm(d2)) return { error: 'the two semi-monthly days must resolve to different days' };
    days_json = JSON.stringify([d1, d2]);
  } else if (freq_kind === 'every_n_months') {
    interval = Number(body.interval);
    if (!Number.isInteger(interval) || interval < 1) return { error: 'interval must be a whole number ≥ 1' };
    if (!validDay(body.day)) return { error: 'day (0-31, 0 = last day) is required' };
    day = Number(body.day);
    // Start date anchors the every-N phase (used via effective_start in the engine).
    if (!start_date) return { error: 'a start date is required for every-N-months' };
  } else if (freq_kind === 'custom_months') {
    const months = Array.isArray(body.months) ? (body.months as unknown[]).map(Number) : [];
    const valid = months.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
    if (valid.length === 0) return { error: 'at least one month (1-12) is required for custom months' };
    months_json = JSON.stringify([...new Set(valid)].sort((a, b) => a - b));
    if (!validDay(body.day)) return { error: 'day (0-31, 0 = last day) is required' };
    day = Number(body.day);
  } else { // monthly
    if (!validDay(body.day)) return { error: 'day (0-31, 0 = last day) is required' };
    day = Number(body.day);
  }

  const effective_end = body.effectiveEnd ? String(body.effectiveEnd) : null;
  if (effective_end && !isValidYmd(effective_end)) return { error: 'effectiveEnd must be a valid YYYY-MM-DD date' };
  if (start_date && effective_end && start_date > effective_end) return { error: 'startDate must be on or before effectiveEnd' };

  const status = body.status === 'paused' ? 'paused' : 'active';

  // Resolve a merchant from an explicit name or the label, so avatars/logos dedupe
  // with transaction merchants (findOrCreateMerchant returns null for blank).
  let user_id: number | null = null;
  if (body.userId !== undefined && body.userId !== null) {
    if (!Number.isInteger(body.userId)) return { error: 'invalid userId' };
    const u = db.select().from(users).where(eq(users.id, body.userId as number)).get();
    if (!u) return { error: 'user not found' };
    user_id = body.userId as number;
  }

  // Last, after every validation, so a rejected body can't leave a merchant behind.
  const merchantName = typeof body.merchant === 'string' && body.merchant.trim() ? body.merchant : label;
  const merchant_id = findOrCreateMerchant(merchantName);

  return { value: {
    type, label, merchant_id, category_id: categoryId as number, account_id, amount,
    freq_kind, day, days_json, interval, anchor_date, months_json, start_date, status,
    user_id, effective_start: start_date, effective_end,
  } };
}

// GET /api/recurring — full catalog with category/merchant/account metadata
router.get('/', (_req: Request, res: Response) => {
  try {
    res.json({ data: baseSelect().orderBy(asc(recurringItems.label)).all() });
  } catch (err) {
    console.error('GET /recurring error:', err);
    res.status(500).json({ error: 'Failed to fetch recurring items' });
  }
});

/** today's date as 'YYYY-MM-DD' and +7 days, for occurrence status. */
function todayWindow(): { today: string; dueEnd: string } {
  const now = new Date();
  const t = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const due = new Date(t.getTime() + 7 * 86_400_000);
  return { today: fmt(t), dueEnd: fmt(due) };
}

// GET /api/recurring/occurrences?month=YYYY-MM — dated occurrences + summary strips
router.get('/occurrences', (req: Request, res: Response) => {
  try {
    const month = req.query.month as string;
    if (!month || !MONTH_RE.test(month)) return res.status(400).json({ error: 'month (YYYY-MM) is required' });
    const [year, mon] = month.split('-').map(Number);
    const { today, dueEnd } = todayWindow();
    const rows = baseSelect().all() as Row[];

    const occurrences: RecurringOccurrence[] = [];
    for (const r of rows) {
      if (r.status !== 'active') continue;
      const dates = computePaydaysInMonth(toMath(r), year, mon);
      for (const date of dates) {
        const status: RecurringOccurrence['status'] =
          date < today ? 'paid' : (date <= dueEnd ? 'due' : 'upcoming');
        occurrences.push({
          itemId: r.id, label: r.label, merchantName: r.merchantName ?? null, merchantLogoUrl: r.merchantLogoUrl ?? null, date,
          amount: r.amount ?? 0, type: r.type as 'income' | 'expense',
          categoryId: r.category_id, groupName: r.groupName, subName: r.subName,
          categoryType: r.categoryType as RecurringOccurrence['categoryType'],
          accountName: r.accountName ?? null, accountLastFour: r.accountLastFour ?? null,
          frequency: r.freq_kind as RecurrenceKind, status,
        });
      }
    }
    occurrences.sort((a, b) => a.date.localeCompare(b.date));

    const flow = (t: 'income' | 'expense') => {
      const os = occurrences.filter((o) => o.type === t);
      const total = os.reduce((s, o) => s + o.amount, 0);
      const paid = os.filter((o) => o.status === 'paid').reduce((s, o) => s + o.amount, 0);
      return { total, paid, remaining: +(total - paid).toFixed(2) };
    };
    const income = flow('income'), expense = flow('expense');
    const view: RecurringMonthView = { month, occurrences, income, expense, net: +(income.total - expense.total).toFixed(2) };
    res.json({ data: view });
  } catch (err) {
    console.error('GET /recurring/occurrences error:', err);
    res.status(500).json({ error: 'Failed to compute occurrences' });
  }
});

// GET /api/recurring/budget-floors?month=YYYY-MM — per-category recurring totals
router.get('/budget-floors', (req: Request, res: Response) => {
  try {
    const month = req.query.month as string;
    if (!month || !MONTH_RE.test(month)) return res.status(400).json({ error: 'month (YYYY-MM) is required' });
    const floors = getRecurringFloors(month);
    const data: RecurringBudgetFloor[] = [...floors.entries()].map(([categoryId, f]) => ({ categoryId, ...f }));
    res.json({ data });
  } catch (err) {
    console.error('GET /recurring/budget-floors error:', err);
    res.status(500).json({ error: 'Failed to compute budget floors' });
  }
});

// POST /api/recurring
router.post('/', requirePermission('budgets.edit'), (req: Request, res: Response) => {
  try {
    const result = validate(req.body);
    if ('error' in result) return res.status(400).json({ error: result.error });
    const now = new Date().toISOString();
    const inserted = db.insert(recurringItems).values({ ...result.value, created_at: now, updated_at: now }).run();
    res.status(201).json({ data: baseSelect().where(eq(recurringItems.id, Number(inserted.lastInsertRowid))).get() });
  } catch (err) {
    console.error('POST /recurring error:', err);
    res.status(500).json({ error: 'Failed to create recurring item' });
  }
});

// PUT /api/recurring/:id
router.put('/:id', requirePermission('budgets.edit'), (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
    const existing = db.select().from(recurringItems).where(eq(recurringItems.id, id)).get();
    if (!existing) return res.status(404).json({ error: 'Recurring item not found' });
    const result = validate(req.body);
    if ('error' in result) return res.status(400).json({ error: result.error });
    db.update(recurringItems).set({ ...result.value, updated_at: new Date().toISOString() }).where(eq(recurringItems.id, id)).run();
    res.json({ data: baseSelect().where(eq(recurringItems.id, id)).get() });
  } catch (err) {
    console.error('PUT /recurring/:id error:', err);
    res.status(500).json({ error: 'Failed to update recurring item' });
  }
});

// DELETE /api/recurring/:id
router.delete('/:id', requirePermission('budgets.edit'), (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const existing = db.select().from(recurringItems).where(eq(recurringItems.id, id)).get();
    if (!existing) return res.status(404).json({ error: 'Recurring item not found' });
    db.delete(recurringItems).where(eq(recurringItems.id, id)).run();
    res.json({ data: { success: true } });
  } catch (err) {
    console.error('DELETE /recurring/:id error:', err);
    res.status(500).json({ error: 'Failed to delete recurring item' });
  }
});

export default router;
