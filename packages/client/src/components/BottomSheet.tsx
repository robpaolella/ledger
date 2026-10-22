import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialogLayer } from '../hooks/useDialogLayer';
import { releaseOutcome, startsOnFormField, swipeIntent, type SwipeIntent } from '../lib/sheetSwipe';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  /** Text, or a node (e.g. with an account logo); a node needs `descriptionTitle` for its tooltip. */
  description?: ReactNode;
  /** Tooltip for a truncated description; defaults to the description when it is text. */
  descriptionTitle?: string;
  /** Optional emoji or glyph, shown in a tile to the left of the title. */
  icon?: ReactNode;
  /** Keep a long description to one line (the full text stays in its tooltip). */
  truncateDescription?: boolean;
  footer?: ReactNode;
  /** Optional area fixed between the title and the scrolling body (a search box, a picker). */
  pinned?: ReactNode;
  children: ReactNode;
}

// Open sheets share one page scroll lock: sheets stacked on each other can close in any
// order (or together) without leaving the page locked.
let scrollLocks = 0;
let unlockedOverflow = '';

/** Phone counterpart of ResponsiveModal — same header · body · footer anatomy. */
export default function BottomSheet({ isOpen, onClose, title, description, descriptionTitle, icon, truncateDescription, footer, pinned, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  const currentTranslateY = useRef(0);
  const descriptionId = useId();

  useDialogLayer(sheetRef, isOpen, onClose);

  // Prevent body scroll while any sheet is open
  useEffect(() => {
    if (!isOpen) return;
    if (scrollLocks++ === 0) {
      unlockedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    return () => { if (--scrollLocks === 0) document.body.style.overflow = unlockedOverflow; };
  }, [isOpen]);

  // Reset translate when opening
  useEffect(() => {
    if (isOpen) {
      currentTranslateY.current = 0;
      if (sheetRef.current) sheetRef.current.style.transform = 'translateY(0)';
    }
  }, [isOpen]);

  // Swipe down from anywhere on the sheet to close it. Native listeners, because
  // touchmove must be non-passive to stop the page scrolling under a drag.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!isOpen || !sheet) return;
    let start: { x: number; y: number; inBody: boolean } | null = null;
    let intent: SwipeIntent = 'ignore';

    const onStart = (e: TouchEvent) => {
      const target = e.target as Element | null;
      if (e.touches.length !== 1 || startsOnFormField(target)) { start = null; return; }
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY, inBody: !!target && !!bodyRef.current?.contains(target) };
      intent = 'pending';
    };
    const onMove = (e: TouchEvent) => {
      if (!start || intent === 'ignore') return;
      const dx = e.touches[0].clientX - start.x;
      const dy = e.touches[0].clientY - start.y;
      if (intent === 'pending') {
        // Read the scroll position now: a body already scrolling is a scroll, not a drag.
        intent = swipeIntent(dx, dy, start.inBody ? bodyRef.current?.scrollTop ?? 0 : 0);
        if (intent === 'pending') return;
        if (intent === 'drag') sheet.style.transition = 'none';
      }
      if (intent !== 'drag') return;
      if (e.cancelable) e.preventDefault();
      currentTranslateY.current = Math.max(0, dy); // downward only
      sheet.style.transform = `translateY(${currentTranslateY.current}px)`;
    };
    const release = (cancelled: boolean) => {
      const dragged = start !== null && intent === 'drag';
      start = null;
      intent = 'ignore';
      if (!dragged) return;
      sheet.style.transition = 'transform 200ms ease-out';
      if (releaseOutcome(currentTranslateY.current, cancelled) === 'close') {
        sheet.style.transform = 'translateY(100%)';
        setTimeout(() => onCloseRef.current(), 200);
      } else {
        currentTranslateY.current = 0;
        sheet.style.transform = 'translateY(0)';
      }
    };

    const onEnd = () => release(false);
    const onCancel = () => release(true);

    sheet.addEventListener('touchstart', onStart, { passive: true });
    sheet.addEventListener('touchmove', onMove, { passive: false });
    sheet.addEventListener('touchend', onEnd);
    sheet.addEventListener('touchcancel', onCancel);
    return () => {
      sheet.removeEventListener('touchstart', onStart);
      sheet.removeEventListener('touchmove', onMove);
      sheet.removeEventListener('touchend', onEnd);
      sheet.removeEventListener('touchcancel', onCancel);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] touch-none">
      <div
        className="absolute inset-0"
        style={{ background: 'var(--bg-modal)', animation: 'fadeIn 200ms ease-out' }}
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby={title && description ? descriptionId : undefined}
        className="absolute bottom-0 left-0 right-0 bg-elevated rounded-t-[20px] flex flex-col shadow-md"
        style={{
          animation: 'sheetSlideUp 200ms ease-out',
          maxHeight: '92dvh',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle: a visual cue; the whole sheet is draggable */}
        <div className="flex justify-center shrink-0 select-none touch-none" style={{ padding: '12px 0 8px' }}>
          <div className="w-9 h-1 rounded-full bg-line-strong" />
        </div>

        {title && (
          <div className="flex items-start justify-between gap-3 shrink-0 px-5 pt-1 pb-3 border-b border-line">
            <div className="min-w-0 flex items-center gap-3">
              {icon && (typeof icon === 'string'
                ? <span className="w-11 h-11 shrink-0 rounded-[12px] bg-surface-2 border border-line flex items-center justify-center text-[22px] leading-none">{icon}</span>
                : <span className="shrink-0 flex">{icon}</span>)}
              <div className="min-w-0">
                <div className="text-[18px] font-extrabold tracking-tight text-content leading-tight break-words">{title}</div>
                {description && (
                  <div
                    id={descriptionId}
                    title={truncateDescription ? descriptionTitle ?? (typeof description === 'string' ? description : undefined) : undefined}
                    className={`text-[13px] text-content-3 mt-1 leading-snug ${typeof description === 'string' ? (truncateDescription ? 'truncate' : '') : `flex items-center gap-1.5 min-w-0 ${truncateDescription ? 'whitespace-nowrap' : ''}`}`}
                  >{description}</div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 w-11 h-11 -mr-3 -my-1.5 flex items-center justify-center rounded-[10px] text-content-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        )}

        {pinned && <div className="relative shrink-0">{pinned}</div>}

        <div
          ref={bodyRef}
          className="flex-1 min-h-0 overflow-y-auto px-5 py-3 touch-auto"
          style={{ scrollbarWidth: 'none', overscrollBehavior: 'contain' }}
        >
          {children}
        </div>

        {footer && <div className="shrink-0 px-5 pt-3 border-t border-line">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
