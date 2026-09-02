import LedgerLogo from './LedgerLogo';
import { useUnreadNotifications } from './NotificationBell';
import { useNavigate } from 'react-router-dom';

/** Phone top bar: brand lockup + a shortcut to the review queue. Pages carry
 *  their own titles in the hero header, so the bar doesn't repeat them. */
export default function MobileHeader() {
  const unread = useUnreadNotifications();
  const navigate = useNavigate();
  return (
    <div className="mobile-only sticky top-0 z-40 flex items-center justify-between bg-surface border-b border-line px-5 py-2.5">
      <div className="flex items-center gap-2">
        <LedgerLogo size={24} />
        <span className="text-[17px] font-extrabold tracking-tight text-content">Ledger</span>
      </div>
      <button type="button" onClick={() => navigate('/reviews')} aria-label="Notifications" className="relative w-9 h-9 rounded-[9px] flex items-center justify-center text-content-3 hover:bg-surface-2">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg>
        {unread > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-negative" />}
      </button>
    </div>
  );
}
