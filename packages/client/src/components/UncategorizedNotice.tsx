import { Link } from 'react-router-dom';
import { uncategorizedNoticeText, type UncategorizedTotals } from '@ledger/shared';
import InlineNotification from './InlineNotification';

/**
 * "7 transactions have no category yet ($412 out, +$85 in)…" with a link to Review
 * on the period being looked at (`from`/`to`, inclusive YYYY-MM-DD). Hidden when
 * nothing is uncategorized. `strip` is the phone Budget look: a full-width strip that
 * joins the top of the "Left to budget" band (place it right above the band, no gap).
 */
export default function UncategorizedNotice({ totals, from, to, className, strip }: {
  totals: UncategorizedTotals;
  from: string;
  to: string;
  className?: string;
  strip?: boolean;
}) {
  const text = uncategorizedNoticeText(totals);
  if (!text) return null;
  const review = (
    <Link
      to={`/reviews?from=${from}&to=${to}`}
      className="inline-flex items-center gap-1 min-h-[44px] md:min-h-0 font-bold whitespace-nowrap hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      style={{ color: 'var(--warning)' }}
    >
      Review them
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
    </Link>
  );
  if (strip) {
    return (
      <div
        role="status"
        className={`-mx-4 -mt-5 px-4 pt-2.5 pb-1 flex items-start gap-2.5 border-b text-[13px] font-medium leading-snug ${className ?? ''}`}
        style={{
          background: 'color-mix(in srgb, var(--warning) 12%, var(--surface))',
          borderColor: 'color-mix(in srgb, var(--warning) 30%, transparent)',
          color: 'var(--warning)',
        }}
      >
        <svg className="shrink-0 mt-[1px]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
        <div className="flex-1 min-w-0">
          <div><b>{text.lead}</b>{text.amounts && ` ${text.amounts}`}. They're counted in the totals below.</div>
          <div className="-mt-1">{review}</div>
        </div>
      </div>
    );
  }
  return (
    <InlineNotification
      type="warning"
      className={className}
      message={<><b>{text.lead}</b>{text.amounts && ` ${text.amounts}`}. They're counted in the totals below.</>}
      actionsClassName="max-md:basis-full max-md:pl-[25px] max-md:-mt-2 max-md:-mb-3"
      actions={review}
    />
  );
}
