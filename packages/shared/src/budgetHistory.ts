export interface HistoryPoint { month: string; actual: number }
export interface HistoryMonth { month: string; label: string; value: number; height: number }
export interface HistoryModel {
  months: HistoryMonth[];
  lastMonth: number;
  average: number;
  empty: boolean;
}

/**
 * The six months before the one being edited, oldest to newest. `series` is the
 * category-detail series ending at the month before the edited one.
 * Bars scale to the largest of the six; a negative month (refunds exceed
 * spending) has no bar but keeps its value. The average covers months with
 * activity (non-zero), rounded to whole dollars.
 */
export function buildHistory(series: HistoryPoint[]): HistoryModel {
  const six = series.slice(-6);
  const max = Math.max(0, ...six.map((p) => p.actual));
  const months = six.map((p) => {
    const [y, m] = p.month.split('-').map(Number);
    return {
      month: p.month,
      label: new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short' }).toUpperCase(),
      value: p.actual,
      height: max > 0 && p.actual > 0 ? p.actual / max : 0,
    };
  });
  const active = six.filter((p) => p.actual !== 0);
  return {
    months,
    lastMonth: six.length ? six[six.length - 1].actual : 0,
    average: active.length ? Math.round(active.reduce((s, p) => s + p.actual, 0) / active.length) : 0,
    empty: active.length === 0,
  };
}

/** The month before `ym` ("2026-03" → "2026-02"). */
export function monthBefore(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
