import { useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import LedgerLogo from './LedgerLogo';
import { NAV_ITEMS, icons } from '../lib/navItems';
import { useOpenReviewCount } from '../hooks/useOpenReviewCount';

const moonIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
const sunIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>;

/**
 * Phone navigation: the desktop side rail as a slide-in drawer. Same items,
 * same active treatment, same account row — opened from the hamburger in the
 * phone header and dismissed by the scrim, Escape, or navigating.
 */
export default function MobileNavDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const reviewCount = useOpenReviewCount();

  // Close after any navigation and on Escape.
  useEffect(() => { onClose(); }, [location.pathname, location.search, onClose]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isActive = (to: string) => (to === '/' ? location.pathname === '/' : location.pathname.startsWith(to));
  const rowCls = (active: boolean) => `flex items-center gap-3 h-11 px-3 rounded-[11px] text-[15px] no-underline transition-colors ${
    active ? 'bg-primary/15 text-primary font-semibold' : 'text-content-2 font-medium active:bg-surface-2'
  }`;

  return (
    <div className="mobile-only fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Navigation">
      <div className="absolute inset-0" style={{ background: 'var(--bg-modal)' }} onClick={onClose} />
      <aside className="absolute left-0 top-0 h-full w-[288px] max-w-[85vw] bg-surface border-r border-line shadow-md flex flex-col drawer-in">
        {/* header: brand + close */}
        <div className="flex items-center justify-between pl-5 pr-3 h-14 shrink-0">
          <div className="flex items-center gap-2">
            <LedgerLogo size={26} />
            <span className="text-[17px] font-extrabold tracking-tight text-content">Ledger</span>
          </div>
          <NavLink to="/settings" aria-label="Settings" title="Settings" className="w-10 h-10 rounded-[10px] flex items-center justify-center text-content-3 active:bg-surface-2 [&>svg]:w-5 [&>svg]:h-5">
            {icons.settings}
          </NavLink>
        </div>

        {/* navigation */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-2 flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.to);
            return (
              <NavLink key={item.to} to={item.to} className={rowCls(active)}>
                <span className="shrink-0 flex [&>svg]:w-5 [&>svg]:h-5">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.to === '/reviews' && reviewCount > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-on-primary text-[11px] font-bold inline-flex items-center justify-center">{reviewCount}</span>
                )}
              </NavLink>
            );
          })}
          <div className="h-px bg-line my-2 mx-1" />
          <button type="button" onClick={toggleTheme} className={rowCls(false)}>
            <span className="shrink-0 flex">{theme === 'light' ? moonIcon : sunIcon}</span>
            <span className="flex-1 text-left">{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
          </button>
        </nav>

        {/* account row */}
        <div className="shrink-0 border-t border-line p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-3 px-2 py-1.5">
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-bold text-[14px]"
              style={{ background: 'color-mix(in srgb, var(--primary) 16%, transparent)', color: 'var(--primary)' }}>
              {user?.displayName?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-content truncate">{user?.displayName}</div>
              <div className="text-[12px] text-content-3 capitalize">{user?.role}</div>
            </div>
            <button type="button" onClick={() => { onClose(); logout(); navigate('/login'); }} title="Sign out" aria-label="Sign out"
              className="w-10 h-10 rounded-[10px] flex items-center justify-center text-negative active:bg-negative/10">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
