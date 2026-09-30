// @ts-nocheck
import { useState, useRef, useEffect } from 'react';

/* ══════════════════════════════════════════════════════════════════════════
   PAY CYCLES — dynamic take-home-pay budgeting
   Covers 3 surfaces (switch with the tabs at top):
     1. Budget toolbar  — [Import Budget] + [Manage ▾] consolidated menu
     2. Pay Cycles      — management modal (list + frequency-conditional form)
     3. Import step      — the new "Expected Income" wizard step
   Schedule math is REAL (UTC-ms), so 3-paycheck months are actually computed.
   ══════════════════════════════════════════════════════════════════════════ */

/* ─── Reference data ─── */
const USERS = [
  { id: 1, name: 'Robert' },
  { id: 2, name: 'Sarah' },
];
const ownerName = (id) => USERS.find((u) => u.id === id)?.name ?? 'Household';

const CATEGORIES = [
  { id: 100, group_name: 'Income', sub_name: 'Take Home Pay', type: 'income' },
  { id: 101, group_name: 'Income', sub_name: 'Other Income', type: 'income' },
  { id: 102, group_name: 'Income', sub_name: 'Interest Income', type: 'income' },
];
const incomeCats = CATEGORIES.filter((c) => c.type === 'income');
const catSub = (id) => CATEGORIES.find((c) => c.id === id)?.sub_name ?? 'Unknown';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* frequency label helpers */
const FREQ_LABEL = { weekly: 'Weekly', biweekly: 'Biweekly', semi_monthly: 'Semi-monthly', monthly: 'Monthly' };
const FREQ_HELP = {
  weekly: 'Every week from an anchor payday. 4 or 5 checks per month.',
  biweekly: 'Every 2 weeks from an anchor payday. 2 or 3 checks per month.',
  semi_monthly: 'Two fixed days each month. Always 2 checks.',
  monthly: 'One fixed day each month. Always 1 check.',
};

/* Sample pay cycles — two earners, all four frequencies, two income categories */
const INITIAL_CYCLES = [
  { id: 1, label: 'ABC Fitness — Payroll', user_id: 1, category_id: 100, frequency: 'biweekly', amount: 1750, anchor_date: '2026-01-02', day_of_month_1: null, day_of_month_2: null, day_of_month: null, effective_start: '2026-01-02', effective_end: null, is_active: 1 },
  { id: 2, label: 'Metro Health — Payroll', user_id: 2, category_id: 100, frequency: 'biweekly', amount: 1600, anchor_date: '2026-01-09', day_of_month_1: null, day_of_month_2: null, day_of_month: null, effective_start: null, effective_end: null, is_active: 1 },
  { id: 3, label: 'Weekend Gig', user_id: 1, category_id: 100, frequency: 'weekly', amount: 300, anchor_date: '2026-01-02', day_of_month_1: null, day_of_month_2: null, day_of_month: null, effective_start: null, effective_end: null, is_active: 1 },
  { id: 4, label: 'Consulting', user_id: 2, category_id: 101, frequency: 'semi_monthly', amount: 500, anchor_date: null, day_of_month_1: 15, day_of_month_2: 0, day_of_month: null, effective_start: null, effective_end: null, is_active: 1 },
  { id: 5, label: 'Rental Property', user_id: 1, category_id: 101, frequency: 'monthly', amount: 450, anchor_date: null, day_of_month_1: null, day_of_month_2: null, day_of_month: 1, effective_start: null, effective_end: null, is_active: 1 },
];

/* An existing manual budget row to demonstrate the import conflict UX */
const EXISTING_BUDGET = { 100: 7000 }; // Take Home Pay already has a manual $7,000

/* ─── Schedule math (mirrors server payCycleMath.ts; UTC-ms, no tz drift) ─── */
const DAY = 86_400_000;
const ymdToMs = (y, m, d) => Date.UTC(y, m - 1, d);
const lastDayOfMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; };
const msToYmd = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };
const resolveDay = (day, ld) => (day === 0 ? ld : Math.min(day, ld));

function paydaysInMonth(cycle, year, mon) {
  const ld = lastDayOfMonth(year, mon);
  let startMs = ymdToMs(year, mon, 1);
  let endMs = ymdToMs(year, mon, ld);
  if (cycle.effective_start) { const s = parseYmd(cycle.effective_start); startMs = Math.max(startMs, ymdToMs(s.y, s.m, s.d)); }
  if (cycle.effective_end) { const e = parseYmd(cycle.effective_end); endMs = Math.min(endMs, ymdToMs(e.y, e.m, e.d)); }
  if (startMs > endMs) return [];
  const out = [];
  if (cycle.frequency === 'weekly' || cycle.frequency === 'biweekly') {
    if (!cycle.anchor_date) return [];
    const step = (cycle.frequency === 'weekly' ? 7 : 14) * DAY;
    const a = parseYmd(cycle.anchor_date);
    const anchorMs = ymdToMs(a.y, a.m, a.d);
    // Anchor is a PHASE reference — the cadence extends both directions.
    // k may be negative (extrapolate backward). effective_start/end bound activation.
    const k = Math.ceil((startMs - anchorMs) / step);
    let p = anchorMs + k * step;
    while (p <= endMs) { if (p >= startMs) out.push(p); p += step; }
  } else if (cycle.frequency === 'semi_monthly') {
    const days = [...new Set([resolveDay(cycle.day_of_month_1 ?? 1, ld), resolveDay(cycle.day_of_month_2 ?? 15, ld)])].sort((a, b) => a - b);
    for (const d of days) { const p = ymdToMs(year, mon, d); if (p >= startMs && p <= endMs) out.push(p); }
  } else if (cycle.frequency === 'monthly') {
    const d = resolveDay(cycle.day_of_month ?? 1, ld);
    const p = ymdToMs(year, mon, d);
    if (p >= startMs && p <= endMs) out.push(p);
  }
  return out.map(msToYmd);
}

function computeYear(cycle, year) {
  const perMonth = [];
  for (let m = 1; m <= 12; m++) perMonth.push({ mon: m, count: paydaysInMonth(cycle, year, m).length });
  const positive = perMonth.map((x) => x.count).filter((c) => c > 0);
  const baseline = positive.length ? Math.min(...positive) : 0;
  const totalChecks = perMonth.reduce((s, x) => s + x.count, 0);
  const extraMonths = perMonth.filter((x) => x.count > baseline).map((x) => MONTH_NAMES[x.mon - 1]);
  return { perMonth, baseline, totalChecks, extraMonths, annual: totalChecks * (cycle.amount || 0) };
}

function projectAll(cycles, year, mon) {
  const byCat = new Map();
  const cycleRows = [];
  for (const c of cycles) {
    if (!c.is_active) continue;
    const count = paydaysInMonth(c, year, mon).length;
    if (count === 0) continue;
    const contribution = count * c.amount;
    cycleRows.push({ ...c, count, contribution });
    const cur = byCat.get(c.category_id) || { categoryId: c.category_id, total: 0, maxBaselineExceeded: false, cycles: [] };
    cur.total += contribution;
    cur.cycles.push({ label: c.label, owner: ownerName(c.user_id), count, amount: c.amount, contribution, frequency: c.frequency });
    // extra-check flag: does this cycle exceed its own yearly baseline this month?
    const cy = computeYear(c, year);
    if (count > cy.baseline) cur.maxBaselineExceeded = true;
    byCat.set(c.category_id, cur);
  }
  return { cycleRows, categoryTotals: [...byCat.values()] };
}

const fmt = (n) => '$' + (n < 0 ? '-' : '') + Math.abs(Math.round(n)).toLocaleString('en-US');

/* ─── Shared chrome ─── */
function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  return (
    <button onClick={() => { const next = !dark; setDark(next); document.documentElement.classList.toggle('dark', next); localStorage.setItem('ledger-theme', next ? 'dark' : 'light'); }}
      style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 300, width: 40, height: 40, borderRadius: 20, background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
      {dark ? '☀' : '🌙'}
    </button>
  );
}
function PhoneFrame({ children }) {
  return (
    <div style={{ width: 390, margin: '0 auto', borderRadius: 24, border: '3px solid var(--bg-card-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', overflow: 'hidden', background: 'var(--bg-main)', height: 780, overflowY: 'auto' }} className="hide-scrollbar">
      {children}
    </div>
  );
}
function FreqBadge({ frequency }) {
  return (
    <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(59,130,246,0.1)', color: 'var(--color-accent)', whiteSpace: 'nowrap' }}>
      {FREQ_LABEL[frequency]}
    </span>
  );
}
const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, border: '1px solid var(--bg-input-border)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' };
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };
const btnPrimary = { padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' };
const btnSecondary = { padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'var(--btn-secondary-bg)', color: 'var(--btn-secondary-text)', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' };

/* ═══════════════ SCENE 1 — Budget toolbar + Manage menu ═══════════════ */
function ManageMenu({ mobile, onPayCycles }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const items = [
    { icon: '📋', label: 'Budget Template', desc: 'Monthly template & recurring items', onClick: () => alert('Opens the existing Budget Template modal') },
    { icon: '💸', label: 'Pay Cycles', desc: 'Biweekly & recurring paychecks', onClick: onPayCycles },
  ];

  const trigger = (
    <button onClick={() => setOpen((o) => !o)} style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: 6 }}>
      Manage
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transition: 'transform 150ms', transform: open ? 'rotate(180deg)' : 'none' }}>
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );

  if (mobile) {
    return (
      <>
        {trigger}
        {open && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'var(--bg-modal, rgba(0,0,0,0.4))', display: 'flex', alignItems: 'flex-end' }} onClick={() => setOpen(false)}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', background: 'var(--bg-card)', borderRadius: '16px 16px 0 0', padding: '8px 0 20px', boxShadow: '0 -4px 24px rgba(0,0,0,0.2)' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--bg-card-border)', margin: '8px auto 12px' }} />
              <div style={{ padding: '0 8px' }}>
                {items.map((it) => (
                  <button key={it.label} onClick={() => { setOpen(false); it.onClick(); }} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 12px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', minHeight: 44 }}>
                    <span style={{ fontSize: 22 }}>{it.icon}</span>
                    <span>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{it.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{it.desc}</div>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      {trigger}
      {open && (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 50, minWidth: 260, background: 'var(--bg-card)', border: '1px solid var(--bg-card-border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.16)', overflow: 'hidden' }}>
          {items.map((it, i) => (
            <button key={it.label} onClick={() => { setOpen(false); it.onClick(); }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 14px', background: 'transparent', border: 'none', borderTop: i > 0 ? '1px solid var(--table-row-border)' : 'none', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
              <span style={{ fontSize: 18 }}>{it.icon}</span>
              <span>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{it.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{it.desc}</div>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolbarScene({ mobile, onPayCycles, onImport }) {
  const [owner, setOwner] = useState('All');
  const ownerOpts = ['All', ...USERS.map((u) => u.name)];

  const ownerFilter = (
    <div style={{ display: 'flex', gap: mobile ? 6 : 4, background: 'var(--toggle-container-bg)', borderRadius: 8, padding: 3, ...(mobile ? { overflowX: 'auto' } : {}) }}>
      {ownerOpts.map((o) => (
        <button key={o} onClick={() => setOwner(o)} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', background: owner === o ? 'var(--toggle-active-bg)' : 'transparent', color: owner === o ? 'var(--toggle-active-text)' : 'var(--toggle-inactive-text)', boxShadow: owner === o ? 'var(--toggle-active-shadow)' : 'none' }}>
          {o}
        </button>
      ))}
    </div>
  );
  const monthNav = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button style={{ ...btnSecondary, padding: '6px 10px' }}>← Jun</button>
      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: 'var(--text-primary)', minWidth: 72, textAlign: 'center' }}>Jul 2026</span>
      <button style={{ ...btnSecondary, padding: '6px 10px' }}>Aug →</button>
    </div>
  );

  return (
    <div style={{ padding: mobile ? 16 : '28px 36px', fontFamily: "'DM Sans', sans-serif", minHeight: '100%', background: 'var(--bg-main)' }}>
      {/* header */}
      {mobile ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginBottom: 12 }}>{monthNav}</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button onClick={onImport} style={{ ...btnPrimary, flex: 1, minHeight: 44 }}>Import Budget</button>
            <div style={{ flex: 1, display: 'flex' }}><div style={{ flex: 1 }}><ManageMenu mobile onPayCycles={onPayCycles} /></div></div>
          </div>
          {ownerFilter}
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Monthly Budget</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>July 2026</p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button onClick={onImport} style={btnPrimary}>Import Budget</button>
            <ManageMenu mobile={false} onPayCycles={onPayCycles} />
            {ownerFilter}
            {monthNav}
          </div>
        </div>
      )}

      {/* Callout explaining the redesign */}
      <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', color: 'var(--text-secondary)', fontSize: 12.5, marginBottom: 20 }}>
        <b style={{ color: 'var(--color-accent)' }}>Toolbar redesign:</b> management features collapse into a single <b>Manage ▾</b> menu (Budget Template, Pay Cycles, + future) so the toolbar never grows a new button. <b>Import Budget</b> stays a primary action. Tap Manage → Pay Cycles to continue.
      </div>

      {/* Stub KPI + income rows for context */}
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: mobile ? 10 : 16, marginBottom: 20 }}>
        {[['Budgeted Income', '$11,400'], ['Actual Income', '$11,400'], ['Budgeted Expenses', '$6,200'], ['Actual Expenses', '$5,840']].map(([l, v]) => (
          <div key={l} style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--bg-card-border)', boxShadow: 'var(--bg-card-shadow)', padding: '12px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{l}</div>
            <div style={{ fontSize: mobile ? 20 : 22, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: 'var(--text-primary)', marginTop: 4 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--bg-card-border)', boxShadow: 'var(--bg-card-shadow)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--table-border)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Income</div>
        {[['Take Home Pay', '$9,950', 'Jul: 3-paycheck month for Robert'], ['Other Income', '$1,450', '']].map(([n, v, note], i) => (
          <div key={n} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderTop: i > 0 ? '1px solid var(--table-row-border)' : 'none' }}>
            <span><span style={{ fontSize: 13, color: 'var(--text-body)' }}>{n}</span>{note && <span style={{ fontSize: 11, color: 'var(--color-warning)', marginLeft: 8 }}>⚡ {note}</span>}</span>
            <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: 'var(--color-positive)' }}>+{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════ SCENE 2 — Pay Cycles management modal ═══════════════ */
function DayPicker({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} style={inputStyle}>
      <option value={0}>Last day of month</option>
      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}{d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : d > 3 && d < 21 ? 'th' : [1, 2, 3].includes(d % 10) ? ['st', 'nd', 'rd'][(d % 10) - 1] : 'th'}</option>)}
    </select>
  );
}

function CycleForm({ cycle, onSave, onCancel }) {
  const [f, setF] = useState(() => cycle ? { ...cycle } : {
    label: '', user_id: USERS[0].id, category_id: 100, frequency: 'biweekly', amount: '',
    anchor_date: '2026-01-02', day_of_month_1: 15, day_of_month_2: 0, day_of_month: 1,
    effective_start: '', effective_end: '', is_active: 1,
  });
  const [error, setError] = useState('');
  const set = (k, v) => { setF((p) => ({ ...p, [k]: v })); setError(''); };

  // Live year preview from current form state
  const preview = computeYear({ ...f, amount: parseFloat(f.amount) || 0 }, 2026);
  const variable = f.frequency === 'weekly' || f.frequency === 'biweekly';

  const submit = () => {
    if (!f.label.trim()) return setError('Label is required');
    if (!(parseFloat(f.amount) > 0)) return setError('Per-paycheck amount must be greater than 0');
    if (variable && !f.anchor_date) return setError('Anchor date is required for weekly/biweekly');
    onSave({ ...f, amount: parseFloat(f.amount) });
  };

  return (
    <div style={{ padding: 4 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>{cycle ? 'Edit Pay Cycle' : 'Add Pay Cycle'}</h3>
      {error && <div style={{ padding: '8px 12px', borderRadius: 8, marginBottom: 12, background: 'var(--bg-inline-error)', border: '1px solid var(--bg-inline-error-border)', color: 'var(--text-inline-error)', fontSize: 13 }}>{error}</div>}

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Label</label>
        <input value={f.label} onChange={(e) => set('label', e.target.value)} placeholder="e.g., ABC Fitness — Payroll" style={inputStyle} />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Earner</label>
          <select value={f.user_id} onChange={(e) => set('user_id', Number(e.target.value))} style={inputStyle}>
            {USERS.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Income category</label>
          <select value={f.category_id} onChange={(e) => set('category_id', Number(e.target.value))} style={inputStyle}>
            {incomeCats.map((c) => <option key={c.id} value={c.id}>{c.sub_name}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Frequency</label>
          <select value={f.frequency} onChange={(e) => set('frequency', e.target.value)} style={inputStyle}>
            {Object.keys(FREQ_LABEL).map((k) => <option key={k} value={k}>{FREQ_LABEL[k]}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Per-paycheck amount</label>
          <input value={f.amount} inputMode="decimal" onChange={(e) => set('amount', e.target.value.replace(/[^0-9.]/g, ''))} placeholder="$0.00" style={{ ...inputStyle, fontFamily: "'DM Mono', monospace" }} />
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '-6px 0 14px' }}>{FREQ_HELP[f.frequency]}</p>

      {/* Frequency-conditional schedule fields */}
      {variable && (
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Anchor date <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(any known payday — sets the cadence)</span></label>
          <input type="date" value={f.anchor_date || ''} onChange={(e) => set('anchor_date', e.target.value)} style={{ ...inputStyle, fontFamily: "'DM Mono', monospace" }} />
        </div>
      )}
      {f.frequency === 'semi_monthly' && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>First payday</label><DayPicker value={f.day_of_month_1} onChange={(v) => set('day_of_month_1', v)} /></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>Second payday</label><DayPicker value={f.day_of_month_2} onChange={(v) => set('day_of_month_2', v)} /></div>
        </div>
      )}
      {f.frequency === 'monthly' && (
        <div style={{ marginBottom: 14 }}><label style={labelStyle}>Payday</label><DayPicker value={f.day_of_month} onChange={(v) => set('day_of_month', v)} /></div>
      )}

      {/* Effective range */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}><label style={labelStyle}>Starts <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label><input type="date" value={f.effective_start || ''} onChange={(e) => set('effective_start', e.target.value)} style={{ ...inputStyle, fontFamily: "'DM Mono', monospace" }} /></div>
        <div style={{ flex: 1 }}><label style={labelStyle}>Ends <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label><input type="date" value={f.effective_end || ''} onChange={(e) => set('effective_end', e.target.value)} style={{ ...inputStyle, fontFamily: "'DM Mono', monospace" }} /></div>
      </div>

      {/* Live year preview */}
      <div style={{ marginBottom: 18, padding: '12px 14px', borderRadius: 10, background: 'var(--bg-hover)', border: '1px solid var(--bg-card-border)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 8 }}>2026 preview</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
          <span style={{ color: 'var(--text-secondary)' }}>{preview.totalChecks} paychecks/yr</span>
          <span style={{ fontWeight: 700, fontFamily: "'DM Mono', monospace", color: 'var(--text-primary)' }}>{fmt(preview.annual)}/yr</span>
        </div>
        <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
          {preview.perMonth.map((m) => {
            const extra = m.count > preview.baseline && preview.baseline > 0;
            return (
              <div key={m.mon} title={`${MONTH_NAMES[m.mon - 1]}: ${m.count}`} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ height: 24, borderRadius: 4, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: extra ? 'var(--color-warning)' : m.count > 0 ? 'var(--color-accent)' : 'var(--bg-card-border)', color: '#fff', fontSize: 10, fontWeight: 700, paddingBottom: 2, opacity: m.count > 0 ? 1 : 0.4 }}>{m.count || ''}</div>
                <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 2 }}>{MONTH_NAMES[m.mon - 1][0]}</div>
              </div>
            );
          })}
        </div>
        {!variable ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Same number of paychecks every month.</div>
        ) : preview.totalChecks === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Enter an anchor date to preview the schedule.</div>
        ) : preview.extraMonths.length > 0 ? (
          <div style={{ fontSize: 12, color: 'var(--color-warning)', fontWeight: 600 }}>⚡ Extra paycheck in {preview.extraMonths.join(', ')}</div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Consistent paychecks across the active months.</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={btnSecondary}>Cancel</button>
        <button onClick={submit} style={btnPrimary}>{cycle ? 'Save Changes' : 'Add Pay Cycle'}</button>
      </div>
    </div>
  );
}

function PayCyclesScene({ mobile, cycles, setCycles, onClose }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const nextId = useRef(Math.max(...INITIAL_CYCLES.map((c) => c.id)) + 1);

  const save = (data) => {
    if (editing) setCycles((p) => p.map((c) => (c.id === editing.id ? { ...c, ...data } : c)));
    else setCycles((p) => [...p, { id: nextId.current++, ...data }]);
    setFormOpen(false); setEditing(null);
  };
  const del = (id) => setCycles((p) => p.filter((c) => c.id !== id));

  const scheduleSummary = (c) => {
    if (c.frequency === 'biweekly' || c.frequency === 'weekly') { const y = computeYear(c, 2026); return `${fmt(c.amount)}/check${y.extraMonths.length ? ` · extra in ${y.extraMonths.join(', ')}` : ''}`; }
    if (c.frequency === 'semi_monthly') return `${fmt(c.amount)}/check · ${c.day_of_month_1 === 0 ? 'last' : c.day_of_month_1}${c.day_of_month_1 === 0 ? '' : 'th'} & ${c.day_of_month_2 === 0 ? 'last day' : c.day_of_month_2 + 'th'}`;
    return `${fmt(c.amount)}/check · ${c.day_of_month === 0 ? 'last day' : 'day ' + c.day_of_month}`;
  };

  const byOwner = USERS.map((u) => ({ user: u, list: cycles.filter((c) => c.user_id === u.id) })).filter((g) => g.list.length);

  const modalBody = (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h2 style={{ fontSize: mobile ? 18 : 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Pay Cycles</h2>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', lineHeight: 1 }}>×</button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>Track each earner's paychecks. The import wizard sums these into your monthly budget — including the 2 months a year with an extra biweekly check.</p>

      {byOwner.map((g) => (
        <div key={g.user.id} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 8 }}>{g.user.name}</div>
          <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--bg-card-border)', overflow: 'hidden' }}>
            {g.list.map((c, i) => (
              <div key={c.id} style={{ padding: '12px 14px', borderTop: i > 0 ? '1px solid var(--table-row-border)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{c.label}</span>
                      <FreqBadge frequency={c.frequency} />
                      {!c.is_active && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(inactive)</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{catSub(c.category_id)} · {scheduleSummary(c)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => { setEditing(c); setFormOpen(true); }} style={{ ...btnSecondary, padding: '4px 10px', fontSize: 11 }}>Edit</button>
                    <button onClick={() => del(c.id)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'var(--btn-destructive-light-bg)', color: 'var(--btn-destructive-light-text)', border: 'none', cursor: 'pointer' }}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {cycles.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--bg-card-border)', marginBottom: 12 }}>No pay cycles yet.</div>}

      <button onClick={() => { setEditing(null); setFormOpen(true); }} style={{ ...btnPrimary, width: '100%', minHeight: 44 }}>+ Add Pay Cycle</button>
    </div>
  );

  return (
    <div style={{ padding: mobile ? 0 : '24px 0', minHeight: '100%', background: 'var(--bg-main)', display: 'flex', justifyContent: 'center', alignItems: mobile ? 'stretch' : 'flex-start' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: mobile ? 0 : 14, border: mobile ? 'none' : '1px solid var(--bg-card-border)', boxShadow: mobile ? 'none' : '0 8px 32px rgba(0,0,0,0.16)', padding: mobile ? 16 : 24, width: mobile ? '100%' : 560, maxWidth: '94%' }}>
        {formOpen ? <CycleForm cycle={editing} onSave={save} onCancel={() => { setFormOpen(false); setEditing(null); }} /> : modalBody}
      </div>
    </div>
  );
}

/* ═══════════════ SCENE 3 — Import wizard "Expected Income" step ═══════════════ */
function ImportIncomeScene({ mobile, cycles, onClose }) {
  const [monthIdx, setMonthIdx] = useState(6); // Jul (0-based 6)
  const [empty, setEmpty] = useState(false);
  const year = 2026;
  const proj = projectAll(empty ? [] : cycles, year, monthIdx + 1);

  // build editable rows (one per category total)
  const [rows, setRows] = useState({});
  const rowState = (catId, projected, hasConflict) => {
    const k = `${monthIdx}-${catId}`;
    return rows[k] ?? { amount: String(Math.round(projected)), action: hasConflict ? 'overwrite' : 'overwrite', included: true };
  };
  const setRow = (catId, patch) => { const k = `${monthIdx}-${catId}`; setRows((p) => ({ ...p, [k]: { ...rowState(catId, 0, false), ...(p[k] || {}), ...patch } })); };

  const anyExtra = proj.categoryTotals.some((c) => c.maxBaselineExceeded);

  return (
    <div style={{ padding: mobile ? 0 : '24px 0', minHeight: '100%', background: 'var(--bg-main)', display: 'flex', justifyContent: 'center', alignItems: mobile ? 'stretch' : 'flex-start' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: mobile ? 0 : 14, border: mobile ? 'none' : '1px solid var(--bg-card-border)', boxShadow: mobile ? 'none' : '0 8px 32px rgba(0,0,0,0.16)', padding: mobile ? 16 : 24, width: mobile ? '100%' : 600, maxWidth: '94%', fontFamily: "'DM Sans', sans-serif" }}>
        {/* Wizard header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-accent)' }}>Step 3 of 4 · Expected Income</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', lineHeight: 1 }}>×</button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 14px' }}>Projected take-home from your pay cycles. Adjust any amount before it's saved to the budget.</p>

        {/* month + empty toggles (mockup controls) */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Preview month:</span>
          <select value={monthIdx} onChange={(e) => setMonthIdx(Number(e.target.value))} style={{ ...inputStyle, width: 'auto', padding: '6px 10px' }}>
            {MONTH_FULL.map((m, i) => <option key={m} value={i}>{m} {year}</option>)}
          </select>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={empty} onChange={(e) => setEmpty(e.target.checked)} /> show empty state
          </label>
        </div>

        {anyExtra && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--text-secondary)', fontSize: 12.5, marginBottom: 14 }}>
            ⚡ <b>{MONTH_FULL[monthIdx]}</b> has an extra paycheck for at least one cycle — expected income is higher this month.
          </div>
        )}

        {proj.categoryTotals.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', background: 'var(--bg-hover)', borderRadius: 12, border: '1px dashed var(--bg-card-border)', marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>No pay cycles project income for {MONTH_FULL[monthIdx]}.</div>
            <button onClick={onClose} style={{ ...btnSecondary }}>Set up pay cycles →</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {proj.categoryTotals.map((ct) => {
              const hasConflict = EXISTING_BUDGET[ct.categoryId] != null;
              const st = rowState(ct.categoryId, ct.total, hasConflict);
              return (
                <div key={ct.categoryId} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg-hover)', border: '1px solid var(--bg-card-border)', opacity: st.included ? 1 : 0.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input type="checkbox" checked={st.included} onChange={(e) => setRow(ct.categoryId, { included: e.target.checked })} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{catSub(ct.categoryId)}</span>
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>$</span>
                      <input value={st.amount} inputMode="decimal" onChange={(e) => setRow(ct.categoryId, { amount: e.target.value.replace(/[^0-9.]/g, '') })}
                        style={{ ...inputStyle, width: 100, textAlign: 'right', fontFamily: "'DM Mono', monospace", padding: '6px 10px' }} />
                    </div>
                  </div>
                  {/* per-cycle breakdown */}
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8, paddingLeft: 26, lineHeight: 1.7 }}>
                    {ct.cycles.map((cy, i) => (
                      <span key={i}>
                        {i > 0 && <span style={{ opacity: 0.5 }}> · </span>}
                        {cy.owner} ({cy.label.replace(/ —.*/, '')}) <b style={{ color: cy.count > 2 && cy.frequency === 'biweekly' ? 'var(--color-warning)' : 'var(--text-secondary)' }}>{cy.count}×{fmt(cy.amount)}</b> = {fmt(cy.contribution)}
                      </span>
                    ))}
                  </div>
                  {/* conflict */}
                  {hasConflict && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingLeft: 26 }}>
                      <span style={{ fontSize: 11.5, color: 'var(--color-warning)' }}>Existing budget {fmt(EXISTING_BUDGET[ct.categoryId])} —</span>
                      <select value={st.action} onChange={(e) => setRow(ct.categoryId, { action: e.target.value })} style={{ ...inputStyle, width: 'auto', padding: '4px 8px', fontSize: 11.5 }}>
                        <option value="overwrite">Overwrite</option>
                        <option value="add">Add to it</option>
                        <option value="skip">Skip</option>
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* footer nav */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--table-row-border)' }}>
          <button style={btnSecondary}>← Back</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Template → Recurring → <b style={{ color: 'var(--text-secondary)' }}>Income</b> → Review</span>
          <button style={btnPrimary}>Next →</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ Root ═══════════════ */
export default function PayCyclesMockup() {
  const [viewMode, setViewMode] = useState('desktop');
  const [scene, setScene] = useState('toolbar');
  const [cycles, setCycles] = useState(INITIAL_CYCLES);

  const scenes = [
    { id: 'toolbar', label: 'Budget Toolbar' },
    { id: 'paycycles', label: 'Pay Cycles' },
    { id: 'import', label: 'Import Step' },
  ];

  const content = (mobile) => {
    if (scene === 'paycycles') return <PayCyclesScene mobile={mobile} cycles={cycles} setCycles={setCycles} onClose={() => setScene('toolbar')} />;
    if (scene === 'import') return <ImportIncomeScene mobile={mobile} cycles={cycles} onClose={() => setScene('paycycles')} />;
    return <ToolbarScene mobile={mobile} onPayCycles={() => setScene('paycycles')} onImport={() => setScene('import')} />;
  };

  return (
    <div style={{ background: 'var(--bg-main)', minHeight: '100vh', paddingBottom: 70 }}>
      {/* scene + view toggles */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '16px 0 12px' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--toggle-container-bg)', borderRadius: 8, padding: 3 }}>
          {scenes.map((s) => (
            <button key={s.id} onClick={() => setScene(s.id)} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: scene === s.id ? 'var(--toggle-active-bg)' : 'transparent', color: scene === s.id ? 'var(--toggle-active-text)' : 'var(--toggle-inactive-text)', boxShadow: scene === s.id ? 'var(--toggle-active-shadow)' : 'none' }}>{s.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['desktop', 'mobile'].map((m) => (
            <button key={m} onClick={() => setViewMode(m)} style={{ padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid var(--bg-card-border)', cursor: 'pointer', background: viewMode === m ? 'var(--toggle-active-bg)' : 'transparent', color: viewMode === m ? 'var(--toggle-active-text)' : 'var(--toggle-inactive-text)', boxShadow: viewMode === m ? 'var(--toggle-active-shadow)' : 'none' }}>{m === 'desktop' ? '🖥 Desktop' : '📱 Mobile'}</button>
          ))}
        </div>
      </div>

      {viewMode === 'desktop' ? <div style={{ maxWidth: 1000, margin: '0 auto' }}>{content(false)}</div> : <PhoneFrame>{content(true)}</PhoneFrame>}
      <ThemeToggle />
    </div>
  );
}
