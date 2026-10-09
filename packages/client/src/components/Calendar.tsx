import { useState } from 'react';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/**
 * Themed single-date calendar picker (replaces the browser's native date input).
 * `value`/`onChange` use `YYYY-MM-DD` strings. Matches the Ledger design tokens.
 */
export default function Calendar({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  const today = new Date();
  const seed = value ? new Date(value + 'T00:00:00') : today;
  const [vm, setVm] = useState(seed.getMonth());
  const [vy, setVy] = useState(seed.getFullYear());
  // Follow a changed value (e.g. a date typed in the field) to its month.
  const [seenValue, setSeenValue] = useState(value);
  if (value !== seenValue) {
    setSeenValue(value);
    if (value) { setVm(seed.getMonth()); setVy(seed.getFullYear()); }
  }

  const startWd = new Date(vy, vm, 1).getDay();
  const daysInMonth = new Date(vy, vm + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWd; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const dayStr = (d: number) => `${vy}-${String(vm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const isToday = (d: number) => today.getFullYear() === vy && today.getMonth() === vm && today.getDate() === d;
  const isSel = (d: number) => value === dayStr(d);

  const prev = () => { if (vm === 0) { setVm(11); setVy(vy - 1); } else setVm(vm - 1); };
  const next = () => { if (vm === 11) { setVm(0); setVy(vy + 1); } else setVm(vm + 1); };
  const years: number[] = [];
  const firstYear = Math.min(today.getFullYear() - 12, vy);
  const lastYear = Math.max(today.getFullYear() + 3, vy);
  for (let y = firstYear; y <= lastYear; y++) years.push(y);

  const navBtn = 'w-10 h-10 flex items-center justify-center rounded-[10px] text-content-2 hover:bg-surface-2 shrink-0';
  const selectCls = 'h-10 px-3 pr-8 rounded-[10px] bg-surface-2 border border-line text-content text-sm font-semibold outline-none appearance-none cursor-pointer';

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button type="button" onClick={prev} className={navBtn}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
        <div className="relative flex-1">
          <select value={vm} onChange={(e) => setVm(Number(e.target.value))} className={`w-full ${selectCls}`}>
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" className="absolute right-2.5 top-2.5 pointer-events-none"><path d="m6 9 6 6 6-6"/></svg>
        </div>
        <div className="relative w-[92px]">
          <select value={vy} onChange={(e) => setVy(Number(e.target.value))} className={`w-full ${selectCls}`}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" className="absolute right-2.5 top-2.5 pointer-events-none"><path d="m6 9 6 6 6-6"/></svg>
        </div>
        <button type="button" onClick={next} className={navBtn}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((w) => <div key={w} className="text-center font-mono text-[11px] font-semibold uppercase tracking-wide text-content-3 py-1">{w}</div>)}
      </div>

      <div className="grid grid-cols-7 border-t border-l border-line rounded-[8px] overflow-hidden">
        {cells.map((d, i) => (
          d === null
            ? <div key={i} className="border-r border-b border-line aspect-square" />
            : (
              <button
                key={i}
                type="button"
                onClick={() => onChange(dayStr(d))}
                className={`border-r border-b border-line aspect-square flex items-center justify-center text-sm font-medium relative ${isSel(d) ? '' : 'hover:bg-surface-2'}`}
                style={isSel(d) ? { background: 'var(--primary)', color: 'var(--on-primary)' } : undefined}
              >
                {d}
                {isToday(d) && !isSel(d) && <span className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />}
              </button>
            )
        ))}
      </div>
    </div>
  );
}
