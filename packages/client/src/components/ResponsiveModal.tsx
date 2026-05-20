import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';
import BottomSheet from './BottomSheet';

interface ResponsiveModalProps {
  title?: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}

export default function ResponsiveModal({ title, isOpen, onClose, children, maxWidth }: ResponsiveModalProps) {
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

  const scrollDown = () => {
    scrollRef.current?.scrollBy({ top: 200, behavior: 'smooth' });
  };

  if (!isOpen) return null;

  if (isMobile) {
    return (
      <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>
        {children}
      </BottomSheet>
    );
  }

  // Desktop: centered modal with viewport-safe bounds.
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-6" onClick={onClose}>
      <div
        className="responsive-modal-panel bg-[var(--bg-card)] rounded-xl w-full shadow-xl"
        style={{ maxWidth: maxWidth || '28rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          ref={scrollRef}
          onScroll={checkOverflow}
          className="responsive-modal-content hide-scrollbar p-6"
        >
          {children}
        </div>

        {showScrollIndicator && (
          <>
            <div
              className="absolute bottom-0 left-0 right-0 h-[40px] pointer-events-none"
              style={{ background: 'linear-gradient(to bottom, transparent, var(--bg-card))' }}
            />
            <button
              onClick={scrollDown}
              className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-[28px] h-[28px] rounded-full flex items-center justify-center border border-[var(--bg-card-border)] cursor-pointer scroll-arrow"
              style={{
                background: 'var(--bg-card)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
