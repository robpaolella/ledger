/** Today's date as YYYY-MM-DD in the browser's local timezone (not UTC). */
export function todayYmd(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

