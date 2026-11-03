import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import NotificationDropdown from './NotificationDropdown';

/**
 * Unread-notification count for the bell dot. Refreshes on mount, route
 * change, `notifications-changed` / `reviews-changed` window events (review
 * assignment writes notifications), and a 60s poll. Called once by the
 * Sidebar, which renders a bell in both utility-cluster arrangements.
 */
export function useUnreadNotifications(): number {
  const location = useLocation();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refetch = () => {
      apiFetch<{ data: { count: number; hasError: boolean } }>('/notifications/unread-count')
        .then((r) => { if (!cancelled) setCount(r.data.count); })
        .catch(() => {});
    };
    refetch();
    window.addEventListener('notifications-changed', refetch);
    window.addEventListener('reviews-changed', refetch);
    const poll = setInterval(refetch, 60_000);
    return () => {
      cancelled = true;
      window.removeEventListener('notifications-changed', refetch);
      window.removeEventListener('reviews-changed', refetch);
      clearInterval(poll);
    };
  }, [location.pathname]);

  return count;
}

interface Props {
  unreadCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buttonClassName: string;
  /** Pass -1 for decorative instances (e.g. the collapsed rail stack) so they aren't tab stops. */
  buttonTabIndex?: number;
}

export default function NotificationBell({ unreadCount, open, onOpenChange, buttonClassName, buttonTabIndex }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ right: number; top: number } | null>(null);

  // Capture the anchor when opening, then re-measure once the sidebar's 200ms
  // width animation settles so the popover hugs the bell's final position.
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const r = buttonRef.current?.getBoundingClientRect();
      if (r) setAnchor({ right: r.right, top: r.top });
    };
    measure();
    const t = setTimeout(measure, 220);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => onOpenChange(!open)}
        className={`relative ${buttonClassName}`}
        title="Notifications"
        tabIndex={buttonTabIndex}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        {unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-negative" />}
      </button>
      {open && anchor && <NotificationDropdown anchor={anchor} onClose={() => onOpenChange(false)} />}
    </>
  );
}
