import { useEffect, useRef, type RefObject } from 'react';

// Open dialogs, oldest first. Only the last one answers Escape and keeps Tab inside it,
// so a window opened over another closes on its own.
const layers: symbol[] = [];
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Safari doesn't focus a button on tap, so the opener would read as <body>. Remember the
// last thing pressed, briefly, to know where to return focus to.
let lastPressed: { el: HTMLElement; at: number } | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>('button, a, [tabindex]');
    lastPressed = el ? { el, at: Date.now() } : null;
  }, true);
}
const PRESS_WINDOW_MS = 1000;

/**
 * Dialog behaviour shared by the pop-up window and the bottom sheet: focus moves in on
 * open (unless a field already took it with autoFocus), Tab stays inside, Escape closes
 * only the top dialog, and focus goes back to whatever opened it.
 */
export function useDialogLayer(ref: RefObject<HTMLElement | null>, active: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!active) return;
    const id = Symbol('dialog');
    layers.push(id);
    const focused = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const pressed = lastPressed && Date.now() - lastPressed.at < PRESS_WINDOW_MS ? lastPressed.el : null;
    // A field that took autoFocus already holds focus by now, so it isn't the opener: go back to what was pressed.
    const opener = focused && focused !== document.body && !el?.contains(focused) ? focused : (pressed ?? (el?.contains(focused) ? null : focused));
    if (el && !el.contains(document.activeElement)) el.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });

    const handler = (e: KeyboardEvent) => {
      if (layers[layers.length - 1] !== id) return;
      if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current(); return; }
      if (e.key !== 'Tab' || !el) return;
      // A popover the dialog opened elsewhere on the page (an emoji picker) keeps its own Tab order.
      const focused = document.activeElement;
      if (focused && focused !== document.body && !el.contains(focused)) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.tabIndex >= 0 && n.offsetParent !== null);
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (focused === document.body || focused === first)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (focused === document.body || focused === last)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      layers.splice(layers.indexOf(id), 1);
      // The opener may be gone (its row deleted); then focus stays where the browser puts it.
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [active, ref]);
}
