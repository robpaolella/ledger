import { useCallback, useState } from 'react';
import LedgerLogo from './LedgerLogo';
import MobileNavDrawer from './MobileNavDrawer';
import NotificationBell, { useUnreadNotifications } from './NotificationBell';
import { MOBILE_BAR_SLOTS } from './PageHeader';

const ICON_BTN = 'relative w-10 h-10 rounded-[10px] flex items-center justify-center text-content-2 active:bg-surface-2';

/**
 * Phone app bar: [menu][bell] · page title · contextual actions. Pages fill the
 * title/actions/back slots through <MobileBar> (see PageHeader). A page that
 * supplies a back route replaces menu + bell with a back chevron; a page with
 * no title shows the brand lockup.
 */
export default function MobileHeader() {
  const [navOpen, setNavOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const unread = useUnreadNotifications();
  const closeNav = useCallback(() => setNavOpen(false), []);
  return (
    <>
      <div className="mobile-only sticky top-0 z-40 flex items-center gap-1 bg-surface border-b border-line px-2 h-14">
        {/* back slot (filled by detail pages) — hides the menu/bell cluster when present */}
        <div id={MOBILE_BAR_SLOTS.back} className="peer/back flex items-center shrink-0 empty:hidden" />
        <div className="flex items-center shrink-0 peer-[:not(:empty)]/back:hidden">
          <button type="button" onClick={() => setNavOpen(true)} aria-label="Open menu" className={ICON_BTN}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <NotificationBell unreadCount={unread} open={bellOpen} onOpenChange={setBellOpen} buttonClassName={ICON_BTN} />
        </div>

        {/* title slot, centred; brand lockup when a page sets no title */}
        <div className="flex-1 min-w-0 flex items-center justify-center px-1">
          <div id={MOBILE_BAR_SLOTS.title} className="peer/title min-w-0 max-w-full text-center empty:hidden" />
          <div className="flex items-center gap-2 peer-[:not(:empty)]/title:hidden">
            <LedgerLogo size={22} />
            <span className="text-[17px] font-extrabold tracking-tight text-content">Ledger</span>
          </div>
        </div>

        {/* actions slot: pages drop their contextual buttons here; they render as bare 40px icon
            buttons. Only direct children (or one wrapper deep, e.g. PermissionGate / popover anchors)
            are restyled, so popovers opened from here keep their own chrome. */}
        <div id={MOBILE_BAR_SLOTS.actions}
          className="flex items-center justify-end gap-0.5 shrink-0 min-w-[84px] [&>button]:!h-10 [&>button]:!w-10 [&>button]:!min-w-0 [&>button]:!px-0 [&>button]:!border-0 [&>button]:!bg-transparent [&>button]:!text-content-2 [&>button]:!shadow-none [&>button]:!rounded-[10px] [&>button]:justify-center [&>*>button]:!h-10 [&>*>button]:!w-10 [&>*>button]:!min-w-0 [&>*>button]:!px-0 [&>*>button]:!border-0 [&>*>button]:!bg-transparent [&>*>button]:!text-content-2 [&>*>button]:!shadow-none [&>*>button]:!rounded-[10px] [&>*>button]:justify-center [&>a]:!h-10 [&>a]:!w-10 [&>a]:!px-0 [&>a]:!border-0 [&>a]:!bg-transparent [&>a]:!text-content-2 [&>a]:justify-center" />
      </div>
      <MobileNavDrawer open={navOpen} onClose={closeNav} />
    </>
  );
}
