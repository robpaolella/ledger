import LedgerLogo from './LedgerLogo';
import { useNavigate } from 'react-router-dom';
import { icons } from '../lib/navItems';
import { useOpenReviewCount } from '../hooks/useOpenReviewCount';

/** Phone top bar: brand lockup + a shortcut to the review queue. Pages carry
 *  their own titles in the hero header, so the bar doesn't repeat them. The
 *  badge is the open-review count (same source as the sidebar's Review badge). */
export default function MobileHeader() {
  const open = useOpenReviewCount();
  const navigate = useNavigate();
  return (
    <div className="mobile-only sticky top-0 z-40 flex items-center justify-between bg-surface border-b border-line px-5 py-2.5">
      <div className="flex items-center gap-2">
        <LedgerLogo size={24} />
        <span className="text-[17px] font-extrabold tracking-tight text-content">Ledger</span>
      </div>
      <button type="button" onClick={() => navigate('/reviews')} aria-label={open > 0 ? `Review queue, ${open} open` : 'Review queue'}
        className="relative w-9 h-9 rounded-[9px] flex items-center justify-center text-content-3 hover:bg-surface-2 [&>svg]:w-[18px] [&>svg]:h-[18px]">
        {icons.reviews}
        {open > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-on-primary text-[10px] font-bold flex items-center justify-center tabular-nums">
            {open > 99 ? '99+' : open}
          </span>
        )}
      </button>
    </div>
  );
}
