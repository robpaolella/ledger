import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { timeAgo } from '../lib/formatters';

export interface NotificationRow {
  id: number;
  type: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  title: string;
  body: string | null;
  actionLabel: string | null;
  actionTarget: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationsData {
  unread: NotificationRow[];
  read: NotificationRow[];
  unreadCount: number;
}

const SEVERITY_COLOR: Record<NotificationRow['severity'], string> = {
  info: 'var(--primary)',
  success: 'var(--positive)',
  warning: 'var(--warning)',
  error: 'var(--negative)',
};

// Glyph by notification type; unknown types fall back to the info circle.
const NOTIF_ICONS: Record<string, ReactNode> = {
  needs_review: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
  ),
  sync_failure: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
  ),
  budget_exceeded: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6.5v11"/><path d="M14.7 9c-.5-.75-1.5-1.2-2.7-1.2-1.6 0-2.7.8-2.7 1.95 0 2.55 5.4 1.35 5.4 3.9 0 1.15-1.1 1.95-2.7 1.95-1.2 0-2.2-.45-2.7-1.2"/></svg>
  ),
};

const fallbackIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
);

const notifyChanged = () => window.dispatchEvent(new CustomEvent('notifications-changed'));

interface Props {
  anchor: { right: number; top: number };
  onClose: () => void;
}

export default function NotificationDropdown({ anchor, onClose }: Props) {
  const navigate = useNavigate();
  const [data, setData] = useState<NotificationsData | null>(null);

  useEffect(() => {
    apiFetch<{ data: NotificationsData }>('/notifications?readLimit=30')
      .then((r) => setData(r.data))
      .catch(() => setData({ unread: [], read: [], unreadCount: 0 }));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Optimistic-mutation failure recovery: re-sync from the server; if even the
  // refetch fails (e.g. network down), restore the pre-mutation snapshot.
  const resyncOrRestore = (prev: NotificationsData | null) =>
    apiFetch<{ data: NotificationsData }>('/notifications?readLimit=30')
      .then((r) => setData(r.data))
      .catch(() => setData(prev));

  const markAllRead = () => {
    const prev = data;
    setData((d) => d && ({
      unread: [],
      read: [...d.unread.map((r) => ({ ...r, isRead: true })), ...d.read],
      unreadCount: 0,
    }));
    apiFetch('/notifications/read-all', { method: 'POST' })
      .catch(() => resyncOrRestore(prev))
      .finally(notifyChanged);
  };

  const clearAll = () => {
    const prev = data;
    setData({ unread: [], read: [], unreadCount: 0 });
    apiFetch('/notifications', { method: 'DELETE' })
      .catch(() => resyncOrRestore(prev))
      .finally(notifyChanged);
  };

  const clearOne = (id: number) => {
    const prev = data;
    setData((d) => d && ({
      unread: d.unread.filter((r) => r.id !== id),
      read: d.read.filter((r) => r.id !== id),
      unreadCount: d.unread.some((r) => r.id === id) ? d.unreadCount - 1 : d.unreadCount,
    }));
    apiFetch(`/notifications/${id}`, { method: 'DELETE' })
      .catch((err) => {
        // 404 ("Notification not found") = row already gone server-side — the
        // optimistic removal stands; apiFetch surfaces the server's error string.
        if (err instanceof Error && err.message === 'Notification not found') return;
        return resyncOrRestore(prev);
      })
      .finally(notifyChanged);
  };

  const runAction = (row: NotificationRow) => {
    // Extensible: only `/`-prefixed targets (in-app routes) are handled today.
    if (row.actionTarget?.startsWith('/')) {
      navigate(row.actionTarget);
      onClose();
    }
  };

  const hasRows = !!data && data.unread.length + data.read.length > 0;

  const renderRow = (row: NotificationRow) => {
    const color = SEVERITY_COLOR[row.severity] ?? SEVERITY_COLOR.info;
    return (
      <div key={row.id} className="group relative flex gap-3 px-4 py-3 hover:bg-surface-2 transition-colors">
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
        >
          {NOTIF_ICONS[row.type] ?? fallbackIcon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 pr-5">
            {!row.isRead && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
            <span className="text-[13.5px] font-bold text-content truncate">{row.title}</span>
          </div>
          {row.body && <div className="text-[12.5px] text-content-2 line-clamp-2 mt-0.5">{row.body}</div>}
          <div className="text-[11.5px] text-content-3 mt-1">{timeAgo(row.createdAt)}</div>
          {row.actionLabel && row.actionTarget?.startsWith('/') && (
            <button
              onClick={() => runAction(row)}
              className="mt-2 h-8 px-3 rounded-[9px] bg-surface-2 border border-line text-[12px] font-semibold text-content hover:border-line-strong cursor-pointer transition-colors"
            >
              {row.actionLabel}
            </button>
          )}
        </div>
        <button
          onClick={() => clearOne(row.id)}
          className="absolute top-2 right-2 w-[22px] h-[22px] rounded-md flex items-center justify-center bg-transparent border-none text-content-3 hover:text-content hover:bg-surface-2 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
          title="Clear notification"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    );
  };

  const sectionLabel = (label: string) => (
    <div className="px-4 pt-3 pb-1 font-mono text-[11px] font-bold uppercase tracking-wide text-content-3">{label}</div>
  );

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-[360px] max-w-[calc(100vw-32px)] flex flex-col bg-elevated border border-line rounded-[12px] shadow-md overflow-hidden"
        style={window.innerWidth < 768
          // phones: full-width sheet under the app bar (the bell sits at the right edge)
          ? { left: 16, right: 16, width: 'auto', top: 64, maxHeight: window.innerHeight - 96 }
          : {
            left: anchor.right + 10,
            top: anchor.top,
            maxHeight: Math.min(480, window.innerHeight - anchor.top - 12),
          }}
        role="dialog"
        aria-label="Notifications"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 shrink-0">
          <span className="text-[15px] font-extrabold text-content">Notifications</span>
          <div className="flex items-center gap-3">
            {!!data && data.unread.length > 0 && (
              <button onClick={markAllRead} className="bg-transparent border-none p-0 text-[13px] font-semibold text-primary hover:underline cursor-pointer">
                Mark all read
              </button>
            )}
            {hasRows && (
              <button onClick={clearAll} className="bg-transparent border-none p-0 text-[13px] font-semibold text-content-3 hover:text-negative cursor-pointer transition-colors">
                Clear All
              </button>
            )}
          </div>
        </div>
        <div className="overflow-y-auto pb-2">
          {!data ? (
            // Loading: 3 skeleton rows
            <div className="px-4 pb-3 flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="w-7 h-7 rounded-full bg-surface-2 shrink-0" />
                  <div className="flex-1 flex flex-col gap-1.5 pt-0.5">
                    <div className="h-3 w-2/3 rounded bg-surface-2" />
                    <div className="h-2.5 w-full rounded bg-surface-2" />
                  </div>
                </div>
              ))}
            </div>
          ) : !hasRows ? (
            <div className="flex flex-col items-center py-10 px-4 text-center">
              <span className="text-content-3 mb-2.5">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><polyline points="9.5 8.5 11.5 10.5 15 7"/></svg>
              </span>
              <span className="text-sm font-semibold text-content">You’re all caught up</span>
              <span className="text-[12.5px] text-content-3 mt-0.5">New notifications will show up here.</span>
            </div>
          ) : (
            <>
              {data.unread.length > 0 && sectionLabel('Unread')}
              {data.unread.map(renderRow)}
              {data.read.length > 0 && sectionLabel('Read')}
              {data.read.map(renderRow)}
            </>
          )}
        </div>
      </div>
    </>
  );
}
