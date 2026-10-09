import { useEffect, useRef, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialogLayer } from '../hooks/useDialogLayer';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  /** Optional emoji or glyph, shown in a tile to the left of the title. */
  icon?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

/** Phone counterpart of ResponsiveModal — same header · body · footer anatomy. */
export default function BottomSheet({ isOpen, onClose, title, description, icon, footer, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const currentTranslateY = useRef(0);

  useDialogLayer(sheetRef, isOpen, onClose);

  // Prevent body scroll when open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  // Reset translate when opening
  useEffect(() => {
    if (isOpen) {
      currentTranslateY.current = 0;
      if (sheetRef.current) sheetRef.current.style.transform = 'translateY(0)';
    }
  }, [isOpen]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const deltaY = e.touches[0].clientY - dragStartY.current;
    const translate = Math.max(0, deltaY); // downward only
    currentTranslateY.current = translate;
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${translate}px)`;
  }, []);

  const handleTouchEnd = useCallback(() => {
    dragStartY.current = null;
    if (sheetRef.current) sheetRef.current.style.transition = 'transform 200ms ease-out';
    if (currentTranslateY.current > 100) {
      if (sheetRef.current) sheetRef.current.style.transform = 'translateY(100%)';
      setTimeout(onClose, 200);
    } else {
      currentTranslateY.current = 0;
      if (sheetRef.current) sheetRef.current.style.transform = 'translateY(0)';
    }
  }, [onClose]);

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
        className="absolute bottom-0 left-0 right-0 bg-elevated rounded-t-[20px] flex flex-col shadow-md"
        style={{
          animation: 'sheetSlideUp 200ms ease-out',
          maxHeight: '92dvh',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div
          className="flex justify-center shrink-0 cursor-grab active:cursor-grabbing select-none touch-none"
          style={{ padding: '12px 0 8px' }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-9 h-1 rounded-full bg-line-strong" />
        </div>

        {title && (
          <div className="flex items-start justify-between gap-3 shrink-0 px-5 pt-1 pb-3 border-b border-line">
            <div className="min-w-0 flex items-center gap-3">
              {icon && <span className="w-11 h-11 shrink-0 rounded-[12px] bg-surface-2 border border-line flex items-center justify-center text-[22px] leading-none">{icon}</span>}
              <div className="min-w-0">
                <div className="text-[18px] font-extrabold tracking-tight text-content leading-tight">{title}</div>
                {description && <div className="text-[13px] text-content-3 mt-1 leading-snug">{description}</div>}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 w-11 h-11 -mr-3 -mt-1.5 flex items-center justify-center rounded-[10px] text-content-2 hover:bg-surface-2"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        )}

        <div
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
