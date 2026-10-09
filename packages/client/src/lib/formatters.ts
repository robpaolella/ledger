/** Today's date as YYYY-MM-DD in the browser's local timezone (not UTC). */
export function todayYmd(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Format a number as full currency: $1,234.56
 * Returns "—" for zero values.
 */
export function fmt(n: number): string {
  if (n === 0) return '—';
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}$${formatted}`;
}

/**
 * Format a number abbreviated: $1.2k for values >= 1000
 * Returns "—" for zero values.
 */
export function fmtShort(n: number): string {
  if (n === 0) return '—';
  const abs = Math.abs(n);
  if (abs >= 1000) {
    return `${n < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}k`;
  }
  return fmt(n);
}

/**
 * Format a number as whole currency: $1,235
 * Returns "—" for zero values.
 */
export function fmtWhole(n: number): string {
  if (n === 0) return '—';
  const abs = Math.abs(Math.round(n));
  return `${n < 0 ? '-' : ''}$${abs.toLocaleString()}`;
}

/**
 * Relative timestamp: "Just now", "5m ago", "3h ago", "2d ago".
 * Accepts ISO strings and bare SQLite CURRENT_TIMESTAMP values
 * ("YYYY-MM-DD HH:MM:SS"), which are UTC despite lacking a zone marker.
 */
export function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(iso)
    ? `${iso.replace(' ', 'T')}Z`
    : iso;
  const then = new Date(normalized).getTime();
  if (isNaN(then)) return '';
  const s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

