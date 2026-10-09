import { useEffect, useRef, type RefObject } from 'react';

// Open dialogs, oldest first. Only the last one answers Escape and keeps Tab inside it,
// so a window opened over another closes on its own.
const layers: symbol[] = [];
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
    const opener = document.activeElement as HTMLElement | null;
    const el = ref.current;
    if (el && !el.contains(document.activeElement)) el.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });

    const handler = (e: KeyboardEvent) => {
      if (layers[layers.length - 1] !== id) return;
      if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current(); return; }
      if (e.key !== 'Tab' || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.tabIndex >= 0 && n.offsetParent !== null);
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      const inside = el.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === first)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (!inside || document.activeElement === last)) { e.preventDefault(); first.focus(); }
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
