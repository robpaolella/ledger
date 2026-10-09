/** Plain-words time for a stored ISO timestamp: "today 5:31 am", "yesterday", or a date. '' when unreadable. */
export function plainWhen(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '';
  const then = new Date(iso);
  if (isNaN(then.getTime())) return '';
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(then)) / 86_400_000);
  if (days === 0) {
    const time = then.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?([AP])M/, (_, p) => ` ${p.toLowerCase()}m`);
    return `today ${time}`;
  }
  if (days === 1) return 'yesterday';
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(then.getFullYear() !== now.getFullYear() && { year: 'numeric' }) });
}
