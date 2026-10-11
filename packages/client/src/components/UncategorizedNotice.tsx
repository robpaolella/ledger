import { Link } from 'react-router-dom';
import { uncategorizedNoticeText, type UncategorizedTotals } from '@ledger/shared';
import InlineNotification from './InlineNotification';

/**
 * "7 transactions have no category yet ($412 out, +$85 in)…" with a link to Review
 * on the period being looked at (`from`/`to`, inclusive YYYY-MM-DD). Hidden when
 * nothing is uncategorized.
 */
export default function UncategorizedNotice({ totals, from, to, className }: {
  totals: UncategorizedTotals;
  from: string;
  to: string;
  className?: string;
}) {
  const text = uncategorizedNoticeText(totals);
  if (!text) return null;
  return (
    <InlineNotification
      type="warning"
      className={className}
      message={<><b>{text.lead}</b>{text.amounts && ` ${text.amounts}`}. They're counted in the totals below.</>}
      actionsClassName="max-md:basis-full max-md:pl-[25px] max-md:-mt-2 max-md:-mb-3"
      actions={
        <Link
          to={`/reviews?from=${from}&to=${to}`}
          className="inline-flex items-center gap-1 min-h-[44px] md:min-h-0 font-bold whitespace-nowrap hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          style={{ color: 'var(--warning)' }}
        >
          Review them
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </Link>
      }
    />
  );
}
