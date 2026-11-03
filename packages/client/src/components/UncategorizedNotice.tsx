import { Link } from 'react-router-dom';
import { uncategorizedNoticeText, type UncategorizedTotals } from '@ledger/shared';
import InlineNotification from './InlineNotification';
import NoticeStrip, { NoticeChevron } from './NoticeStrip';

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
      <NoticeChevron />
    </Link>
  );
  if (strip) {
    return (
      <NoticeStrip className={`items-start pt-2.5 pb-1 ${className ?? ''}`}>
        <div className="flex-1 min-w-0">
          <div><b>{text.lead}</b>{text.amounts && ` ${text.amounts}`}. They're counted in the totals below.</div>
          <div className="-mt-1">{review}</div>
        </div>
      </NoticeStrip>
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
