import { useEffect, useRef, useState } from 'react';

export interface DropdownOption { key: string; label: string; /** Non-selectable group heading. */ heading?: boolean }

const MENU_MAX = 256;

/** The nearest ancestor that scrolls, so a menu can stay inside it (a modal body clips overflow). */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowY)) return p;
  }
  return null;
}

/**
 * Small custom dropdown (button + menu). Shared by AccountsPage + AccountDetailPage + RecurringPage.
 * `fullWidth` makes the button fill its container and left-aligns the menu under it; the menu
 * scrolls past `MENU_MAX` and opens upward when there is no room below.
 */
export default function Dropdown({ value, options, onChange, minWidth = 130, fullWidth = false, placeholder }: {
  value: string; options: DropdownOption[]; onChange: (k: string) => void; minWidth?: number; fullWidth?: boolean; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [room, setRoom] = useState(MENU_MAX);
  const btnRef = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => !o.heading && o.key === value)?.label ?? (fullWidth ? (placeholder ?? '') : value);
  // Escape closes just the menu, not a modal behind it (capture phase, like Popover).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);
  const toggle = () => {
    if (!open && fullWidth && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const limit = scrollParent(btnRef.current)?.getBoundingClientRect();
      const bottom = Math.min(window.innerHeight, limit?.bottom ?? window.innerHeight);
      const top = Math.max(0, limit?.top ?? 0);
      const below = bottom - r.bottom - 8;
      const above = r.top - top - 8;
      const flip = below < MENU_MAX && above > below;
      setUp(flip);
      setRoom(Math.max(120, Math.min(MENU_MAX, flip ? above : below)));
    }
    setOpen((o) => !o);
  };
  return (
    <div className="relative">
      <button ref={btnRef} type="button" onClick={toggle} aria-haspopup="listbox" aria-expanded={open} style={{ minWidth }}
        className={`flex items-center justify-between max-md:min-h-11 gap-2 px-3.5 bg-surface-2 border border-line text-sm font-semibold text-content hover:border-line-strong ${fullWidth ? 'w-full h-11 rounded-[10px]' : 'h-10 rounded-[11px]'}`}>
        <span className={`truncate ${current ? '' : 'text-content-3'}`}>{current}</span>
        <svg className="shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="listbox" style={fullWidth ? { maxHeight: room } : undefined}
            className={`absolute ${up ? 'bottom-11' : 'top-11'} z-50 min-w-full py-1 rounded-[11px] bg-elevated border border-line-strong shadow-md ${fullWidth ? 'left-0 w-full overflow-y-auto' : 'right-0'}`}>
            {options.map((o) => o.heading ? (
              <div key={`h-${o.label}`} className="px-3.5 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-content-3">{o.label}</div>
            ) : (
              <button key={o.key} type="button" role="option" aria-selected={o.key === value} onClick={() => { onChange(o.key); setOpen(false); }}
                className={`block max-md:flex max-md:items-center max-md:min-h-11 w-full text-left px-3.5 py-2 text-sm hover:bg-surface-2 ${fullWidth ? '' : 'whitespace-nowrap'} ${o.key === value ? 'text-primary font-semibold' : 'text-content'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
