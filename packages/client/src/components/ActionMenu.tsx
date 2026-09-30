import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';
import BottomSheet from './BottomSheet';

export interface ActionMenuItem {
  key: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  hidden?: boolean;
}

interface ActionMenuProps {
  items: ActionMenuItem[];
  /** Trigger button label. Default "Manage". */
  label?: string;
  /** Title shown on the mobile bottom sheet. Defaults to `label`. */
  sheetTitle?: string;
  /** Classes for the trigger button (caller controls sizing per layout). */
  buttonClassName?: string;
  /** Desktop panel horizontal alignment relative to the trigger. Default "right". */
  align?: 'left' | 'right';
}

/**
 * Consolidated action menu: an anchored dropdown on desktop, a bottom sheet on
 * mobile. Data-array driven so features can be added as menu items instead of
 * new toolbar buttons. Mirrors the app's existing dropdown (SettingsPage) and
 * "More" bottom-sheet (BottomTabBar) patterns.
 */
export default function ActionMenu({ items, label = 'Manage', sheetTitle, buttonClassName, align = 'right' }: ActionMenuProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const visible = items.filter((it) => !it.hidden);

  // Desktop: close on outside click / Escape.
  useEffect(() => {
    if (!open || isMobile) return;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, isMobile]);

  const select = (item: ActionMenuItem) => {
    if (item.disabled) return;
    setOpen(false);
    item.onClick();
  };

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-haspopup="menu"
      aria-expanded={open}
      className={buttonClassName ?? 'text-[12px] text-[var(--btn-secondary-text)] bg-[var(--btn-secondary-bg)] border-none rounded-lg px-3 py-1.5 cursor-pointer font-semibold btn-secondary'}
    >
      <span className="inline-flex items-center gap-1.5 justify-center">
        {label}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transition: 'transform 150ms ease', transform: open ? 'rotate(180deg)' : 'none' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </span>
    </button>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <BottomSheet isOpen={open} onClose={() => setOpen(false)} title={sheetTitle ?? label}>
          <div className="flex flex-col pb-2">
            {visible.map((it) => (
              <button
                key={it.key}
                type="button"
                onClick={() => select(it)}
                disabled={it.disabled}
                className="flex items-center gap-3 w-full text-left px-1 py-3 bg-transparent border-none cursor-pointer min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {it.icon && <span className="text-[22px] leading-none flex-shrink-0">{it.icon}</span>}
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-[var(--text-primary)]">{it.label}</span>
                  {it.description && <span className="block text-[12px] text-[var(--text-muted)]">{it.description}</span>}
                </span>
              </button>
            ))}
          </div>
        </BottomSheet>
      </>
    );
  }

  return (
    <div className="relative" ref={wrapperRef}>
      {trigger}
      {open && (
        <div
          role="menu"
          className={`absolute top-full mt-1.5 z-50 min-w-[240px] bg-[var(--bg-card)] border border-[var(--bg-card-border)] rounded-lg overflow-hidden ${align === 'right' ? 'right-0' : 'left-0'}`}
          style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.16)' }}
        >
          {visible.map((it, i) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              onClick={() => select(it)}
              disabled={it.disabled}
              className="flex items-center gap-3 w-full text-left px-3.5 py-2.5 bg-transparent border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderTop: i > 0 ? '1px solid var(--table-row-border)' : 'none' }}
              onMouseEnter={(e) => { if (!it.disabled) e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {it.icon && <span className="text-[16px] leading-none flex-shrink-0">{it.icon}</span>}
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-[var(--text-primary)]">{it.label}</span>
                {it.description && <span className="block text-[12px] text-[var(--text-muted)]">{it.description}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
