import { useEffect, useRef, type ReactNode } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Only one popover is open at a time: a newly opened one closes the rest.
const openClosers = new Set<() => void>();

// Safari doesn't focus a button on click, so remember the last thing pressed to
// know where to return focus to.
let lastPressed: HTMLElement | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => { lastPressed = (e.target as Element | null)?.closest<HTMLElement>('button, a, [tabindex]') ?? null; }, true);
}

/**
 * Shared behaviour for anchored pop-ups (filters, date range, account menu).
 * Renders a click-away backdrop plus the panel; the caller supplies the
 * position/size classes and mounts it only while open. Closes on Escape (once,
 * without reaching the page behind) and on an outside click; moves focus inside
 * on open and returns it to the trigger on close.
 */
export default function Popover({
  onClose, label, role = 'dialog', className, style, children,
}: {
  onClose: () => void;
  /** Accessible name of the panel. */
  label: string;
  role?: 'dialog' | 'menu';
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null | undefined>(undefined);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    const panel = panelRef.current!;
    const active = document.activeElement as HTMLElement | null;
    // Recorded once: Strict mode re-runs this effect with focus already inside the panel.
    if (triggerRef.current === undefined) triggerRef.current = active && active !== document.body ? active : lastPressed;
    const close = () => closeRef.current();
    openClosers.forEach((c) => c());
    openClosers.add(close);
    (panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation(); // capture phase: the page behind never sees it
      close();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      openClosers.delete(close);
      // Return focus unless something else (e.g. another popover) already took it.
      const now = document.activeElement;
      if ((!now || now === document.body) && triggerRef.current?.isConnected) triggerRef.current.focus();
    };
  }, []);

  return (
    <>
      <div className="fixed inset-0 z-40" aria-hidden="true" onClick={onClose} />
      <div ref={panelRef} role={role} aria-label={label} tabIndex={-1} style={style} className={`outline-none ${className ?? ''}`}>
        {children}
      </div>
    </>
  );
}
