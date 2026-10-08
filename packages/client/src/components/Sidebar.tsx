import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import LedgerLogo from './LedgerLogo';
import Popover from './Popover';
import NotificationBell, { useUnreadNotifications } from './NotificationBell';
import { NAV_ITEMS, icons } from '../lib/navItems';
import { useOpenReviewCount } from '../hooks/useOpenReviewCount';

const RAIL = 64;   // collapsed rail width
const FULL = 236;  // expanded width

const UTIL_BTN = 'w-8 h-8 rounded-lg flex items-center justify-center bg-transparent border-none text-content-3 hover:text-content hover:bg-surface-2 cursor-pointer transition-colors';

// Labels are ALWAYS mounted at their final position and only FADE — no
// translate, so nothing visibly travels while the rail width animates.
const fadeStyle = (expanded: boolean): CSSProperties => ({
  opacity: expanded ? 1 : 0,
  transition: 'opacity 150ms ease',
});

const crossfadeStyle = (visible: boolean): CSSProperties => ({
  opacity: visible ? 1 : 0,
  pointerEvents: visible ? 'auto' : 'none',
  transition: 'opacity 150ms ease',
});

const moonIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
);
const sunIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
);
const collapseIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/><line x1="4" y1="4" x2="4" y2="20"/></svg>
);
const expandIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/><line x1="20" y1="4" x2="20" y2="20"/></svg>
);

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const [pinnedCollapsed, setPinnedCollapsed] = useState(() => localStorage.getItem('ledger-sidebar-collapsed') === 'true');
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const reviewCount = useOpenReviewCount();
  const unreadCount = useUnreadNotifications();
  const leaveTimer = useRef<number | null>(null);

  // Open popovers keep the rail expanded even after the pointer leaves.
  const expanded = !pinnedCollapsed || hovered || focusWithin || bellOpen || accountMenuOpen;

  const onEnter = () => {
    if (leaveTimer.current != null) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
    setHovered(true);
  };
  const onLeave = () => {
    if (leaveTimer.current != null) clearTimeout(leaveTimer.current);
    // 120ms grace so grazing the rail edge doesn't flicker the panel
    leaveTimer.current = window.setTimeout(() => setHovered(false), 120);
  };
  useEffect(() => () => { if (leaveTimer.current != null) clearTimeout(leaveTimer.current); }, []);

  const togglePin = () => {
    setPinnedCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('ledger-sidebar-collapsed', String(next));
      if (next) {
        // Collapsing: also drop the hover/focus holds so the overlay shrinks
        // WITH the layout placeholder — otherwise (the pointer is on this very
        // button) the still-expanded overlay covers the reflowed content.
        // Hover re-arms after the pointer leaves and re-enters the rail.
        if (leaveTimer.current != null) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
        setHovered(false);
        setFocusWithin(false);
      }
      return next;
    });
  };

  return (
    <>
      {/* Flow placeholder — reserves layout width. It only animates when the
          pin toggles; hover-expansion is a fixed overlay, so page content
          never reflows. */}
      <div
        className="shrink-0 desktop-only"
        style={{ width: pinnedCollapsed ? RAIL : FULL, transition: 'width 200ms ease' }}
      />

      {/* Only KEYBOARD focus (:focus-visible) holds the rail open — mouse
          clicks also focus (e.g. a NavLink) and would otherwise stick the
          rail expanded after the pointer leaves. */}
      <aside
        className="fixed left-0 top-0 h-full z-40 bg-surface border-r border-line flex flex-col overflow-hidden desktop-only"
        style={{ width: expanded ? FULL : RAIL, transition: 'width 200ms ease' }}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocusCapture={(e) => { if (e.target.matches(':focus-visible')) setFocusWithin(true); }}
        onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocusWithin(false); }}
      >
        {/* Header — logo at a fixed x in every state (no wordmark); when
            expanded the utility icons sit beside it: [theme][cog][bell][pin] */}
        <div className="relative shrink-0" style={{ padding: '20px 0 8px 18px' }}>
          <span className="relative inline-block">
            <LedgerLogo size={28} className="shrink-0 block" />
            {/* Unread indicator while the bell is hidden (collapsed rail) */}
            {unreadCount > 0 && (
              <span
                className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-negative"
                style={crossfadeStyle(!expanded)}
              />
            )}
          </span>
          {/* Hard-fixed LEFT offset (not right-anchored): the cluster must not
              travel with the animating right edge — it fades in place and the
              growing rail simply unclips it. left = FULL − cluster(140) − 12. */}
          <div
            className="absolute flex items-center gap-1"
            style={{ left: FULL - 152, top: 18, ...crossfadeStyle(expanded) }}
          >
            <button className={UTIL_BTN} onClick={toggleTheme} title={theme === 'light' ? 'Dark mode' : 'Light mode'}>
              {theme === 'light' ? moonIcon : sunIcon}
            </button>
            <button className={UTIL_BTN} onClick={() => navigate('/settings')} title="Settings">
              {icons.settings}
            </button>
            <NotificationBell unreadCount={unreadCount} open={bellOpen} onOpenChange={setBellOpen} buttonClassName={UTIL_BTN} />
            <button className={UTIL_BTN} onClick={togglePin} title={pinnedCollapsed ? 'Pin sidebar open' : 'Collapse sidebar'}>
              {pinnedCollapsed ? expandIcon : collapseIcon}
            </button>
          </div>
        </div>

        {/* Collapsed rail shows no utilities — they fade in with the header
            row on hover-expand. */}

        {/* Navigation — constant item padding keeps every icon at x=23 */}
        <nav className="flex-1 min-h-0 flex flex-col gap-0.5" style={{ padding: '12px 10px' }}>
          {NAV_ITEMS.map((item) => {
            const isActive = item.to === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.to);

            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={!expanded ? item.label : undefined}
                className={`flex items-center gap-2.5 rounded-[11px] text-sm no-underline transition-colors ${
                  isActive
                    ? 'bg-primary/15 text-primary font-semibold'
                    : 'text-content-2 font-medium hover:bg-surface-2 hover:text-content'
                }`}
                style={{ padding: '0 13px', height: 40 }}
              >
                <span className="shrink-0 flex relative">
                  {item.icon}
                  {item.to === '/reviews' && reviewCount > 0 && (
                    <span
                      className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary"
                      style={{ opacity: expanded ? 0 : 1, transition: 'opacity 150ms ease' }}
                    />
                  )}
                </span>
                <span className="flex-1 flex items-center gap-2.5 whitespace-nowrap" style={fadeStyle(expanded)}>
                  {item.label}
                  {item.to === '/reviews' && reviewCount > 0 && (
                    <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-on-primary text-[11px] font-bold inline-flex items-center justify-center">
                      {reviewCount}
                    </span>
                  )}
                </span>
              </NavLink>
            );
          })}
        </nav>

        {/* Account row — avatar center x=32 matches the nav icon column */}
        <div className="shrink-0" style={{ padding: '0 8px 12px' }}>
          <button
            onClick={() => setAccountMenuOpen((o) => !o)}
            className="flex items-center w-full rounded-[11px] cursor-pointer bg-transparent border-none hover:bg-surface-2 transition-colors"
            style={{ padding: 8, gap: 10 }}
            title={!expanded ? (user?.displayName ?? 'Account') : undefined}
            aria-haspopup="menu"
            aria-expanded={accountMenuOpen}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-[13px]"
              style={{ background: 'color-mix(in srgb, var(--primary) 16%, transparent)', color: 'var(--primary)' }}
            >
              {user?.displayName?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <span
              className="flex-1 min-w-0 text-left text-sm font-semibold text-content leading-tight whitespace-nowrap overflow-hidden text-ellipsis"
              style={fadeStyle(expanded)}
            >
              {user?.displayName}
            </span>
            <svg className="shrink-0 text-content-3" style={fadeStyle(expanded)} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
        </div>
      </aside>

      {/* Account menu popover — fixed so it escapes the sidebar's overflow.
          Slimmed to name header + Sign out (theme/settings live in the rail). */}
      {accountMenuOpen && (
        <div className="desktop-only">
          <Popover
            onClose={() => setAccountMenuOpen(false)}
            label="Account"
            role="menu"
            className="fixed z-50 bg-elevated border border-line rounded-[12px] shadow-md p-1.5"
            style={{ left: 12, bottom: 68, width: 216 }}
          >
            <div className="px-2.5 py-2 text-sm font-semibold text-content whitespace-nowrap overflow-hidden text-ellipsis">
              {user?.displayName}
            </div>
            <button
              onClick={() => { setAccountMenuOpen(false); logout(); }}
              className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm font-semibold text-negative hover:bg-negative/10 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary"
              role="menuitem"
            >
              <span className="shrink-0 flex">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </span>
              Sign out
            </button>
          </Popover>
        </div>
      )}
    </>
  );
}
