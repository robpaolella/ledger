import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: string;
  children: ReactNode;
}

/** Hover tooltip on the elevated surface (design system: tooltips on `--elevated`). */
export default function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; arrowLeft: number; flipped: boolean } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;
    const rect = trigger.getBoundingClientRect();
    const tipRect = tooltip.getBoundingClientRect();
    const margin = 8;
    let top = rect.top - tipRect.height - 8;
    let flipped = false;
    if (top < margin) { top = rect.bottom + 8; flipped = true; }
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    let arrowLeft = tipRect.width / 2;
    if (left < margin) { arrowLeft = arrowLeft + (left - margin); left = margin; }
    else if (left + tipRect.width > window.innerWidth - margin) {
      const shift = left + tipRect.width - (window.innerWidth - margin);
      arrowLeft = arrowLeft + shift; left = left - shift;
    }
    setCoords({ top, left, arrowLeft, flipped });
  }, []);

  useEffect(() => { if (visible) requestAnimationFrame(updatePosition); }, [visible, updatePosition]);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleEnter = () => { timerRef.current = setTimeout(() => setVisible(true), 200); };
  const handleLeave = () => { clearTimeout(timerRef.current); setVisible(false); setCoords(null); };

  return (
    <>
      <span ref={triggerRef} onMouseEnter={handleEnter} onMouseLeave={handleLeave} onFocus={handleEnter} onBlur={handleLeave} style={{ display: 'inline-flex' }}>
        {children}
      </span>
      {visible && createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          className="bg-elevated text-content border border-line-strong shadow-md"
          style={{
            position: 'fixed',
            top: coords?.top ?? -9999,
            left: coords?.left ?? -9999,
            zIndex: 99999,
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 12,
            fontWeight: 500,
            width: 'max-content',
            maxWidth: 260,
            lineHeight: 1.4,
            whiteSpace: 'pre-line',
            opacity: coords ? 1 : 0,
            transition: 'opacity 150ms ease',
            pointerEvents: 'none',
          }}
        >
          {content}
          <div
            className="bg-elevated border-line-strong"
            style={{
              position: 'absolute',
              [coords?.flipped ? 'top' : 'bottom']: -5,
              left: coords?.arrowLeft ?? 0,
              width: 8,
              height: 8,
              transform: 'translateX(-50%) rotate(45deg)',
              borderStyle: 'solid',
              borderWidth: coords?.flipped ? '1px 0 0 1px' : '0 1px 1px 0',
            }}
          />
        </div>,
        document.body,
      )}
    </>
  );
}
