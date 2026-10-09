import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';
import BottomSheet from './BottomSheet';

interface ResponsiveModalProps {
  /** Rendered as the modal header (desktop + bottom sheet). Omit to render only children. */
  title?: string;
  /** Optional one-line description under the title. */
  description?: string;
  /** Optional emoji or glyph, shown in a tile to the left of the title. */
  icon?: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Sticky footer (actions). Rendered under a divider, outside the scroll area. */
  footer?: ReactNode;
  maxWidth?: string;
  /** Set false when the body manages its own padding. */
  padded?: boolean;
}

const closeIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
);

/**
 * The app's one modal shell (design system: overlay `--bg-modal` + blur,
 * elevated panel, 18px radius, header · body · footer). On phones it becomes a
 * bottom sheet with the same anatomy.
 */
export default function ResponsiveModal({ title, description, icon, isOpen, onClose, children, footer, maxWidth, padded = true }: ResponsiveModalProps) {
  const isMobile = useIsMobile();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);

  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
    const hasOverflow = el.scrollHeight > el.clientHeight + 4;
    setShowScrollIndicator(hasOverflow && !atBottom);
  }, []);

  useEffect(() => {
    if (!isOpen || isMobile) return;
    const el = scrollRef.current;
    if (!el) return;
    checkOverflow();
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(el);
    window.addEventListener('resize', checkOverflow);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', checkOverflow);
    };
  }, [checkOverflow, children, isMobile, isOpen]);

  // ESC closes (desktop; the bottom sheet handles its own)
  useEffect(() => {
    if (!isOpen || isMobile) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, isMobile, onClose]);

  const scrollDown = () => scrollRef.current?.scrollBy({ top: 200, behavior: 'smooth' });

  if (!isOpen) return null;

  if (isMobile) {
    return (
      <BottomSheet isOpen={isOpen} onClose={onClose} title={title} description={description} icon={icon} footer={footer}>
        {padded ? <div className="py-1">{children}</div> : children}
      </BottomSheet>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-6"
      style={{ background: 'var(--bg-modal)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex flex-col w-full bg-elevated border border-line-strong rounded-[18px] shadow-md overflow-hidden"
        style={{ maxWidth: maxWidth || '30rem', maxHeight: 'calc(100dvh - 48px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="shrink-0 flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-line">
            <div className="min-w-0 flex items-center gap-3">
              {icon && <span className="w-11 h-11 shrink-0 rounded-[12px] bg-surface-2 border border-line flex items-center justify-center text-[22px] leading-none">{icon}</span>}
              <div className="min-w-0">
                <h2 className="text-[18px] font-extrabold tracking-tight text-content m-0 leading-tight">{title}</h2>
                {description && <p className="text-[13px] text-content-3 mt-1 m-0 leading-snug">{description}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 w-8 h-8 -mr-2 -mt-1 flex items-center justify-center rounded-[8px] text-content-2 hover:bg-surface-2 hover:text-content transition-colors"
            >
              {closeIcon}
            </button>
          </div>
        )}

        <div className="relative flex-1 min-h-0 flex flex-col">
          <div
            ref={scrollRef}
            onScroll={checkOverflow}
            className={`flex-1 min-h-0 overflow-y-auto hide-scrollbar ${padded ? 'px-6 py-5' : ''}`}
            style={{ overscrollBehavior: 'contain' }}
          >
            {children}
          </div>
          {showScrollIndicator && (
            <>
              <div
                className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none"
                style={{ background: 'linear-gradient(to bottom, transparent, var(--elevated))' }}
              />
              <button
                type="button"
                onClick={scrollDown}
                aria-label="Scroll down"
                className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full flex items-center justify-center bg-elevated border border-line-strong shadow-sm text-content-3 hover:text-content"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
            </>
          )}
        </div>

        {footer && <div className="shrink-0 px-6 py-4 border-t border-line">{footer}</div>}
      </div>
    </div>
  );
}
