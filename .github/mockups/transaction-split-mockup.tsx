// @ts-nocheck
import { useState, useRef, useEffect } from 'react';

/* ───────────── Sample Data ───────────── */

const CATEGORIES = [
  { id: 1, group: 'Shopping', sub: 'Groceries' },
  { id: 2, group: 'Shopping', sub: 'Household' },
  { id: 3, group: 'Shopping', sub: 'Online Shopping' },
  { id: 4, group: 'Shopping', sub: 'Clothing' },
  { id: 5, group: 'Transportation', sub: 'Fuel' },
  { id: 6, group: 'Transportation', sub: 'Auto Insurance' },
  { id: 7, group: 'Dining', sub: 'Restaurants' },
  { id: 8, group: 'Dining', sub: 'Coffee' },
  { id: 9, group: 'Dining', sub: 'Fast Food' },
  { id: 10, group: 'Entertainment', sub: 'Subscriptions' },
  { id: 11, group: 'Bills & Utilities', sub: 'Electric' },
  { id: 12, group: 'Bills & Utilities', sub: 'Internet' },
  { id: 13, group: 'Personal Care', sub: 'Pharmacy' },
  { id: 14, group: 'Home', sub: 'Home Improvement' },
];

const grouped = CATEGORIES.reduce<Record<string, typeof CATEGORIES>>((acc, c) => {
  (acc[c.group] ??= []).push(c);
  return acc;
}, {});

const SAMPLE_TXNS = [
  { id: 1, date: '2026-02-25', desc: 'Costco Wholesale #482', amount: 156.43, catId: 1, splits: null },
  { id: 2, date: '2026-02-24', desc: 'Target #1892', amount: 89.72, catId: null, splits: [
    { catId: 1, amount: 52.30 },
    { catId: 2, amount: 24.49 },
    { catId: 13, amount: 12.93 },
  ]},
  { id: 3, date: '2026-02-23', desc: 'Amazon Marketplace', amount: 134.97, catId: 3, splits: null },
  { id: 4, date: '2026-02-22', desc: 'Shell Oil #98217', amount: 52.18, catId: 5, splits: null },
  { id: 5, date: '2026-02-21', desc: 'Home Depot #4210', amount: 247.83, catId: null, splits: [
    { catId: 14, amount: 198.26 },
    { catId: 2, amount: 49.57 },
  ]},
];

const IMPORT_ROWS = [
  { date: '2026-02-26', desc: 'COSTCO WHOLESALE', amount: 187.43, catId: 1, note: 'POS PURCHASE' },
  { date: '2026-02-26', desc: 'WALMART SUPERCENTER', amount: 94.27, catId: null, splits: [
    { catId: 1, amount: 62.15 },
    { catId: 13, amount: 18.50 },
    { catId: 2, amount: 13.62 },
  ], note: 'POS PURCHASE' },
  { date: '2026-02-25', desc: 'TARGET #1892', amount: 67.43, catId: 2, note: 'POS PURCHASE' },
  { date: '2026-02-25', desc: 'STARBUCKS #4812', amount: 6.75, catId: 8, note: 'MOBILE ORDER' },
];

const CAT_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16','#6366f1','#d946ef','#0ea5e9','#eab308','#22c55e','#e11d48'];
function catColor(id: number) { return CAT_COLORS[(id - 1) % CAT_COLORS.length]; }
function catName(id: number) { return CATEGORIES.find(c => c.id === id)?.sub ?? '—'; }
function catGroup(id: number) { return CATEGORIES.find(c => c.id === id)?.group ?? ''; }
function fmt(n: number) { return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtPct(n: number) { return (n * 100).toFixed(1) + '%'; }

/* ───────────── Category Select ───────────── */

function CategorySelect({ value, onChange, style }: { value: number | null, onChange: (id: number) => void, style?: any }) {
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(parseInt(e.target.value))}
      style={{
        padding: '6px 8px', borderRadius: 6, fontSize: 13, fontFamily: 'DM Sans, sans-serif',
        border: '1px solid var(--bg-card-border)', background: 'var(--bg-input)',
        color: 'var(--text-primary)', width: '100%', cursor: 'pointer', ...style
      }}
    >
      <option value="">Select category...</option>
      {Object.entries(grouped).map(([group, cats]) => (
        <optgroup key={group} label={group}>
          {cats.map(c => <option key={c.id} value={c.id}>{c.sub}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

/* ───────────── Split Editor ───────────── */

function SplitEditor({
  totalAmount,
  initialSplits,
  onSave,
  onCancel,
  compact = false,
}: {
  totalAmount: number;
  initialSplits?: { catId: number | null; amount: number }[];
  onSave: (splits: { catId: number; amount: number }[]) => void;
  onCancel: () => void;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<'$' | '%'>('$');
  const [splits, setSplits] = useState<{ catId: number | null; amount: number }[]>(
    initialSplits?.length ? initialSplits : [
      { catId: null, amount: totalAmount },
      { catId: null, amount: 0 },
    ]
  );

  const allocated = splits.reduce((s, r) => s + r.amount, 0);
  const remaining = +(totalAmount - allocated).toFixed(2);
  const isValid = remaining === 0 && splits.every(s => s.catId && s.amount !== 0) && splits.length >= 2;

  const updateSplit = (idx: number, field: 'catId' | 'amount', val: any) => {
    setSplits(prev => prev.map((s, i) => i === idx ? { ...s, [field]: field === 'amount' ? +val : val } : s));
  };

  const removeSplit = (idx: number) => {
    if (splits.length <= 2) return;
    setSplits(prev => prev.filter((_, i) => i !== idx));
  };

  const addSplit = () => {
    setSplits(prev => [...prev, { catId: null, amount: remaining > 0 ? remaining : 0 }]);
  };

  const toggleMode = () => {
    if (mode === '$') {
      setMode('%');
    } else {
      setMode('$');
    }
  };

  const handlePctChange = (idx: number, pctStr: string) => {
    const pct = parseFloat(pctStr) || 0;
    const amt = +(totalAmount * pct / 100).toFixed(2);
    updateSplit(idx, 'amount', amt);
  };

  const fs = compact ? 12 : 13;
  const pad = compact ? '6px' : '8px';

  return (
    <div style={{ borderRadius: 8, border: '1px solid var(--bg-card-border)', background: 'var(--bg-hover)', padding: compact ? '8px' : '12px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)' }}>
          Split Transaction — {fmt(totalAmount)}
        </span>
        <button onClick={toggleMode} style={{
          padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
          border: '1px solid var(--bg-card-border)', background: 'var(--bg-card)',
          color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'DM Mono, monospace'
        }}>
          {mode === '$' ? '$ → %' : '% → $'}
        </button>
      </div>

      {/* Split rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {splits.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <CategorySelect value={s.catId} onChange={id => updateSplit(i, 'catId', id)} style={{ fontSize: fs, padding: `4px ${pad}` }} />
            </div>
            <div style={{ width: compact ? 80 : 100, position: 'relative' }}>
              {mode === '$' ? (
                <input
                  type="text"
                  inputMode="decimal"
                  value={s.amount || ''}
                  onChange={e => {
                    const v = e.target.value.replace(/[^0-9.]/g, '');
                    updateSplit(i, 'amount', v);
                  }}
                  placeholder="0.00"
                  style={{
                    width: '100%', padding: `4px ${pad}`, borderRadius: 6, fontSize: fs,
                    fontFamily: 'DM Mono, monospace', textAlign: 'right',
                    border: '1px solid var(--bg-card-border)', background: 'var(--bg-input)',
                    color: 'var(--text-primary)', boxSizing: 'border-box'
                  }}
                />
              ) : (
                <input
                  type="text"
                  inputMode="decimal"
                  value={totalAmount ? ((s.amount / totalAmount) * 100).toFixed(1) : ''}
                  onChange={e => handlePctChange(i, e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="0.0"
                  style={{
                    width: '100%', padding: `4px ${pad}`, paddingRight: 20, borderRadius: 6, fontSize: fs,
                    fontFamily: 'DM Mono, monospace', textAlign: 'right',
                    border: '1px solid var(--bg-card-border)', background: 'var(--bg-input)',
                    color: 'var(--text-primary)', boxSizing: 'border-box'
                  }}
                />
              )}
              {mode === '%' && (
                <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', pointerEvents: 'none' }}>%</span>
              )}
            </div>
            {splits.length > 2 && (
              <button onClick={() => removeSplit(i)} style={{
                width: 24, height: 24, borderRadius: 4, border: 'none',
                background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
                fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0
              }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-negative)'; e.currentTarget.style.background = 'var(--bg-card)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
              >×</button>
            )}
          </div>
        ))}
      </div>

      {/* Add split button */}
      <button onClick={addSplit} style={{
        marginTop: 6, padding: '4px 10px', borderRadius: 6, fontSize: 12,
        border: '1px dashed var(--bg-card-border)', background: 'transparent',
        color: 'var(--color-accent)', cursor: 'pointer', width: '100%', fontFamily: 'DM Sans, sans-serif'
      }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >+ Add Split</button>

      {/* Footer: remaining + actions */}
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)' }}>Allocated: </span>
          <span style={{ color: remaining === 0 ? 'var(--color-positive)' : remaining < 0 ? 'var(--color-negative)' : 'var(--text-primary)', fontWeight: 600 }}>
            {fmt(allocated)}
          </span>
          {remaining !== 0 && (
            <span style={{ color: remaining < 0 ? 'var(--color-negative)' : 'var(--color-warning)', marginLeft: 6, fontSize: 11 }}>
              ({remaining > 0 ? '+' : ''}{fmt(Math.abs(remaining))} {remaining > 0 ? 'remaining' : 'over'})
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onCancel} style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
            border: '1px solid var(--bg-card-border)', background: 'var(--bg-secondary-btn)',
            color: 'var(--text-primary)', cursor: 'pointer'
          }}>Cancel</button>
          <button onClick={() => isValid && onSave(splits as any)} style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            border: 'none', background: isValid ? 'var(--color-accent)' : 'var(--bg-card-border)',
            color: isValid ? '#fff' : 'var(--text-muted)', cursor: isValid ? 'pointer' : 'not-allowed',
            opacity: isValid ? 1 : 0.6
          }}>Apply Split</button>
        </div>
      </div>
    </div>
  );
}

/* ───────────── Split Badge ───────────── */

function SplitBadge({ splits, compact = false }: { splits: { catId: number; amount: number }[]; compact?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ display: 'flex', gap: 0 }}>
        {splits.map((s, i) => (
          <div key={i} style={{
            width: compact ? 8 : 10, height: compact ? 8 : 10, borderRadius: '50%',
            background: catColor(s.catId), border: '1.5px solid var(--bg-card)',
            marginLeft: i > 0 ? -3 : 0, zIndex: splits.length - i
          }} />
        ))}
      </div>
      <span style={{
        fontSize: compact ? 10 : 11, fontWeight: 600, color: 'var(--text-secondary)',
        padding: '1px 6px', borderRadius: 4, background: 'var(--bg-hover)',
        fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap'
      }}>
        Split ({splits.length})
      </span>
    </div>
  );
}

/* ───────────── Split Breakdown (expanded row) ───────────── */

function SplitBreakdown({ splits, totalAmount }: { splits: { catId: number; amount: number }[]; totalAmount: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '4px 0' }}>
      {splits.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: catColor(s.catId), flexShrink: 0 }} />
          <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{catGroup(s.catId)} › {catName(s.catId)}</span>
          <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--text-primary)', fontWeight: 500 }}>{fmt(s.amount)}</span>
          <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', fontSize: 11, width: 42, textAlign: 'right' }}>{fmtPct(s.amount / totalAmount)}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/* ───────────── Scene 1: Desktop Transaction Form ─────────── */
/* ═══════════════════════════════════════════════════════════ */

function DesktopFormScene() {
  const [splitActive, setSplitActive] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
      {/* Normal state */}
      <div style={{ flex: '1 1 340px', minWidth: 320 }}>
        <h4 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Normal — Single Category</h4>
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--bg-card-border)', padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Edit Transaction</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormField label="Date" value="2026-02-25" />
            <FormField label="Amount" value="$156.43" mono />
            <div style={{ gridColumn: '1 / -1' }}>
              <FormField label="Payee" value="Costco Wholesale #482" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Category</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <CategorySelect value={1} onChange={() => {}} />
                </div>
                <button onClick={() => setSplitActive(true)} style={{
                  padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  border: '1px solid var(--bg-card-border)', background: 'var(--bg-secondary-btn)',
                  color: 'var(--color-accent)', cursor: 'pointer', whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: 4
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>
                  Split
                </button>
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <FormField label="Note" value="" placeholder="Optional note..." />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button style={secondaryBtnStyle}>Cancel</button>
            <button style={primaryBtnStyle}>Save</button>
          </div>
        </div>
      </div>

      {/* Split-active state */}
      <div style={{ flex: '1 1 340px', minWidth: 320 }}>
        <h4 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Split Active — Multiple Categories</h4>
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--bg-card-border)', padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Edit Transaction</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormField label="Date" value="2026-02-25" />
            <FormField label="Amount" value="$156.43" mono />
            <div style={{ gridColumn: '1 / -1' }}>
              <FormField label="Payee" value="Costco Wholesale #482" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Category</label>
              {saved ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <SplitBadge splits={[{ catId: 1, amount: 98.50 }, { catId: 2, amount: 45.00 }, { catId: 13, amount: 12.93 }]} />
                    <button onClick={() => setSaved(false)} style={{
                      fontSize: 11, color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline'
                    }}>Edit Split</button>
                  </div>
                  <SplitBreakdown splits={[{ catId: 1, amount: 98.50 }, { catId: 2, amount: 45.00 }, { catId: 13, amount: 12.93 }]} totalAmount={156.43} />
                </div>
              ) : (
                <SplitEditor
                  totalAmount={156.43}
                  initialSplits={[
                    { catId: 1, amount: 98.50 },
                    { catId: 2, amount: 45.00 },
                    { catId: 13, amount: 12.93 },
                  ]}
                  onSave={() => setSaved(true)}
                  onCancel={() => {}}
                />
              )}
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <FormField label="Note" value="Weekly shopping run" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button style={secondaryBtnStyle}>Cancel</button>
            <button style={primaryBtnStyle}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/* ───────────── Scene 2: Mobile Transaction Form ──────────── */
/* ═══════════════════════════════════════════════════════════ */

function MobileFormScene() {
  const [splitActive, setSplitActive] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
      {/* Normal */}
      <div>
        <h4 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, textAlign: 'center' }}>Normal</h4>
        <PhoneFrame>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>Edit Transaction</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}><FormField label="Date" value="2026-02-25" /></div>
                <div style={{ flex: 1 }}><FormField label="Amount" value="$156.43" mono /></div>
              </div>
              <FormField label="Payee" value="Costco Wholesale" />
              <div>
                <label style={labelStyle}>Category</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}><CategorySelect value={1} onChange={() => {}} /></div>
                  <button onClick={() => setSplitActive(true)} style={{
                    padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    border: '1px solid var(--bg-card-border)', background: 'var(--bg-secondary-btn)',
                    color: 'var(--color-accent)', cursor: 'pointer', whiteSpace: 'nowrap'
                  }}>Split</button>
                </div>
              </div>
              <FormField label="Note" value="" placeholder="Optional note..." />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button style={{ ...secondaryBtnStyle, flex: 1 }}>Cancel</button>
              <button style={{ ...primaryBtnStyle, flex: 1 }}>Save</button>
            </div>
          </div>
        </PhoneFrame>
      </div>

      {/* Split active */}
      <div>
        <h4 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, textAlign: 'center' }}>Split Active</h4>
        <PhoneFrame>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>Edit Transaction</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}><FormField label="Date" value="2026-02-25" /></div>
                <div style={{ flex: 1 }}><FormField label="Amount" value="$156.43" mono /></div>
              </div>
              <FormField label="Payee" value="Costco Wholesale" />
              <div>
                <label style={labelStyle}>Category</label>
                {saved ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <SplitBadge splits={[{ catId: 1, amount: 98.50 }, { catId: 2, amount: 45.00 }, { catId: 13, amount: 12.93 }]} compact />
                      <button onClick={() => setSaved(false)} style={{
                        fontSize: 11, color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline'
                      }}>Edit</button>
                    </div>
                    <SplitBreakdown splits={[{ catId: 1, amount: 98.50 }, { catId: 2, amount: 45.00 }, { catId: 13, amount: 12.93 }]} totalAmount={156.43} />
                  </div>
                ) : (
                  <SplitEditor
                    totalAmount={156.43}
                    initialSplits={[
                      { catId: 1, amount: 98.50 },
                      { catId: 2, amount: 45.00 },
                      { catId: 13, amount: 12.93 },
                    ]}
                    onSave={() => setSaved(true)}
                    onCancel={() => setSplitActive(false)}
                    compact
                  />
                )}
              </div>
              <FormField label="Note" value="Weekly shopping" />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button style={{ ...secondaryBtnStyle, flex: 1 }}>Cancel</button>
              <button style={{ ...primaryBtnStyle, flex: 1 }}>Save</button>
            </div>
          </div>
        </PhoneFrame>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/* ───────────── Scene 3: Transaction List ─────────────────── */
/* ═══════════════════════════════════════════════════════════ */

function TransactionListScene() {
  const [expandedId, setExpandedId] = useState<number | null>(2);

  return (
    <div>
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--bg-card-border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--bg-card-border)' }}>
              {['Date', 'Payee', 'Category', 'Amount'].map(h => (
                <th key={h} style={{
                  padding: '8px 12px', textAlign: h === 'Amount' ? 'right' : 'left',
                  fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                  color: 'var(--text-muted)'
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SAMPLE_TXNS.map(t => (
              <>
                <tr key={t.id}
                  onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                  style={{ borderBottom: '1px solid var(--bg-card-border)', cursor: t.splits ? 'pointer' : 'default' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '8px 12px', fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', fontSize: 12 }}>{t.date.slice(5)}</td>
                  <td style={{ padding: '8px 12px' }}>{t.desc}</td>
                  <td style={{ padding: '8px 12px' }}>
                    {t.splits ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <SplitBadge splits={t.splits} />
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ transform: expandedId === t.id ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 150ms' }}><polyline points="6 9 12 15 18 9"/></svg>
                      </div>
                    ) : (
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: catColor(t.catId!) + '18', color: catColor(t.catId!)
                      }}>{catName(t.catId!)}</span>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'DM Mono, monospace', fontWeight: 500 }}>{fmt(t.amount)}</td>
                </tr>
                {t.splits && expandedId === t.id && (
                  <tr key={t.id + '-splits'}>
                    <td colSpan={4} style={{ padding: '4px 12px 12px 50px', background: 'var(--bg-hover)', borderBottom: '1px solid var(--bg-card-border)' }}>
                      <SplitBreakdown splits={t.splits} totalAmount={t.amount} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <h4 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '24px 0 8px', textAlign: 'center' }}>Mobile Card View</h4>
      <div style={{ maxWidth: 390, margin: '0 auto' }}>
        <PhoneFrame>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {SAMPLE_TXNS.slice(0, 3).map(t => (
              <div key={t.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--bg-card-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 3 }}>{t.desc}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                      <span style={{ fontFamily: 'DM Mono, monospace' }}>{t.date.slice(5)}</span>
                      <span>·</span>
                      {t.splits ? (
                        <SplitBadge splits={t.splits} compact />
                      ) : (
                        <span style={{
                          padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                          background: catColor(t.catId!) + '18', color: catColor(t.catId!)
                        }}>{catName(t.catId!)}</span>
                      )}
                    </div>
                    {t.splits && (
                      <div style={{ marginTop: 6, paddingLeft: 4 }}>
                        <SplitBreakdown splits={t.splits} totalAmount={t.amount} />
                      </div>
                    )}
                  </div>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, fontSize: 14, flexShrink: 0, marginLeft: 12 }}>{fmt(t.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </PhoneFrame>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/* ───────────── Scene 4: Import / Bank Sync Row ───────────── */
/* ═══════════════════════════════════════════════════════════ */

function ImportScene() {
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [splitRow, setSplitRow] = useState<number | null>(null);
  const [rows, setRows] = useState(IMPORT_ROWS);

  const openSplit = (idx: number) => {
    setSplitRow(idx);
    setSplitModalOpen(true);
  };

  return (
    <div>
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--bg-card-border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--bg-card-border)' }}>
              {['', 'Date', 'Payee', 'Amount', 'Category', ''].map((h, i) => (
                <th key={i} style={{
                  padding: '8px 10px', textAlign: h === 'Amount' ? 'right' : 'left',
                  fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                  color: 'var(--text-muted)', width: i === 0 ? 36 : i === 5 ? 40 : undefined
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--bg-card-border)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                  <input type="checkbox" defaultChecked={!!r.catId || !!r.splits} />
                </td>
                <td style={{ padding: '8px 10px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--text-muted)' }}>{r.date.slice(5)}</td>
                <td style={{ padding: '8px 10px' }}>{r.desc}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'DM Mono, monospace', fontWeight: 500 }}>{fmt(r.amount)}</td>
                <td style={{ padding: '8px 10px' }}>
                  {r.splits ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <SplitBadge splits={r.splits} />
                      <button onClick={() => openSplit(i)} style={{
                        fontSize: 11, color: 'var(--color-accent)', background: 'none',
                        border: 'none', cursor: 'pointer', textDecoration: 'underline'
                      }}>Edit</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1 }}><CategorySelect value={r.catId} onChange={() => {}} style={{ fontSize: 12, padding: '4px 6px' }} /></div>
                    </div>
                  )}
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                  {!r.splits && (
                    <button onClick={() => openSplit(i)} title="Split" style={{
                      width: 28, height: 28, borderRadius: 6, border: '1px solid var(--bg-card-border)',
                      background: 'var(--bg-secondary-btn)', color: 'var(--text-muted)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12
                    }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-accent)'; e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--bg-card-border)'; }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Split modal overlay */}
      {splitModalOpen && splitRow !== null && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }} onClick={() => setSplitModalOpen(false)}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--bg-card-border)',
            padding: 20, width: '90%', maxWidth: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>Split Transaction</h3>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>
              {rows[splitRow].desc} — {fmt(rows[splitRow].amount)}
            </p>
            <SplitEditor
              totalAmount={rows[splitRow].amount}
              initialSplits={rows[splitRow].splits || [
                { catId: rows[splitRow].catId, amount: rows[splitRow].amount },
                { catId: null, amount: 0 },
              ]}
              onSave={(splits) => {
                const updated = [...rows];
                updated[splitRow] = { ...updated[splitRow], splits, catId: null };
                setRows(updated);
                setSplitModalOpen(false);
              }}
              onCancel={() => setSplitModalOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Note about bank sync */}
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12, fontStyle: 'italic' }}>
        ↑ Same pattern applies to Bank Sync review — split icon in each row, modal for editing splits.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/* ───────────── Shared Components ─────────────────────────── */
/* ═══════════════════════════════════════════════════════════ */

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const,
  letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 4
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
  border: 'none', background: 'var(--bg-primary-btn)', color: 'var(--text-on-primary-btn)',
  cursor: 'pointer'
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500,
  border: '1px solid var(--bg-card-border)', background: 'var(--bg-secondary-btn)',
  color: 'var(--text-primary)', cursor: 'pointer'
};

function FormField({ label, value, placeholder, mono }: { label: string; value: string; placeholder?: string; mono?: boolean }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type="text"
        defaultValue={value}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 13, boxSizing: 'border-box',
          fontFamily: mono ? 'DM Mono, monospace' : 'DM Sans, sans-serif',
          border: '1px solid var(--bg-card-border)', background: 'var(--bg-input)',
          color: 'var(--text-primary)'
        }}
      />
    </div>
  );
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      width: 390, background: 'var(--bg-main)', borderRadius: 24,
      boxShadow: '0 4px 24px rgba(0,0,0,0.15)', overflow: 'hidden',
      border: '1px solid var(--bg-card-border)'
    }}>
      {/* Status bar */}
      <div style={{ padding: '8px 20px', display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
        <span>9:41</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <span>📶</span><span>🔋</span>
        </div>
      </div>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/* ───────────── Main Page ─────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════ */

const SCENES = ['Transaction Form', 'Mobile Form', 'Transaction List', 'Import / Bank Sync'] as const;

export default function TransactionSplitMockup() {
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'));
  const [scene, setScene] = useState<typeof SCENES[number]>('Transaction Form');

  const toggleTheme = () => {
    setDark(!dark);
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('ledger-theme', dark ? 'light' : 'dark');
  };

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)]" style={{ padding: '24px 32px' }}>
      {/* Theme toggle */}
      <button onClick={toggleTheme}
        className="fixed bottom-6 right-6 z-50 w-11 h-11 rounded-full flex items-center justify-center text-lg"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-card-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', color: dark ? '#fbbf24' : '#64748b' }}>
        {dark ? '☀' : '☾'}
      </button>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Transaction Splitting — Mockup</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
          Split a single transaction across multiple categories with dollar amounts or percentages.
        </p>
      </div>

      {/* Scene switcher */}
      <div style={{ display: 'flex', gap: 0, background: 'var(--bg-hover)', borderRadius: 8, padding: 3, marginBottom: 24, width: 'fit-content' }}>
        {SCENES.map(s => (
          <button key={s} onClick={() => setScene(s)} style={{
            padding: '7px 16px', borderRadius: 6, fontSize: 13, fontWeight: scene === s ? 600 : 400,
            border: 'none', cursor: 'pointer',
            background: scene === s ? 'var(--bg-card)' : 'transparent',
            color: scene === s ? 'var(--text-primary)' : 'var(--text-secondary)',
            boxShadow: scene === s ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 150ms ease'
          }}>{s}</button>
        ))}
      </div>

      {/* Active scene */}
      {scene === 'Transaction Form' && <DesktopFormScene />}
      {scene === 'Mobile Form' && <MobileFormScene />}
      {scene === 'Transaction List' && <TransactionListScene />}
      {scene === 'Import / Bank Sync' && <ImportScene />}
    </div>
  );
}
