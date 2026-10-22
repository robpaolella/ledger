import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** The "›" after a notice's link. */
export function NoticeChevron() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>;
}

/**
 * The phone's full-width warning strip (Budget's "no category yet", Transactions' "need review"):
 * warning tint, a bottom border and the warning icon. Place it right under the pinned header or
 * the band above it, with no gap. With `to` the whole strip is one link; otherwise a status line.
 */
export default function NoticeStrip({ to, label, className = '', children }: {
  to?: string;
  /** Accessible name when it should differ from the visible text. */
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  const cls = `-mx-4 -mt-5 px-4 flex gap-2.5 border-b text-[13px] font-medium leading-snug ${className}`;
  const style = {
    background: 'color-mix(in srgb, var(--warning) 12%, var(--surface))',
    borderColor: 'color-mix(in srgb, var(--warning) 30%, transparent)',
    color: 'var(--warning)',
  };
  const icon = <svg className="shrink-0 mt-[1px]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>;
  return to ? (
    <Link to={to} aria-label={label} className={`${cls} focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring`} style={style}>{icon}{children}</Link>
  ) : (
    <div role="status" className={cls} style={style}>{icon}{children}</div>
  );
}
