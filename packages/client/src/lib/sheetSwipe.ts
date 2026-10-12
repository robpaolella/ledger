/** Pointer travel (px) before a touch counts as a swipe rather than a tap. */
export const SWIPE_SLOP = 8;
/** Dragged distance (px) past which releasing closes the sheet. */
export const CLOSE_DISTANCE = 100;

export type SwipeIntent = 'pending' | 'drag' | 'ignore';

/**
 * What a touch that started on a bottom sheet is doing. A mainly-downward swipe
 * drags the sheet closed only when its body is scrolled to the top; anything
 * else (sideways, upward, or down while the body is scrolled) is left alone so
 * the page scrolls as usual.
 */
export function swipeIntent(dx: number, dy: number, bodyScrollTop: number): SwipeIntent {
  if (Math.hypot(dx, dy) < SWIPE_SLOP) return 'pending';
  if (Math.abs(dx) >= Math.abs(dy) || dy <= 0 || bodyScrollTop > 0) return 'ignore';
  return 'drag';
}

/** What happens when a drag ends: a cancelled touch (system gesture, interruption) never closes. */
export function releaseOutcome(translateY: number, cancelled: boolean): 'close' | 'snap-back' {
  return !cancelled && translateY > CLOSE_DISTANCE ? 'close' : 'snap-back';
}

/** Fields that own their own touch gestures (caret, selection, pickers): never start a drag on them. */
const OWN_GESTURE = 'input, select, textarea, [contenteditable=""], [contenteditable="true"], [role="slider"]';

export function startsOnFormField(target: { closest(selector: string): unknown } | null): boolean {
  return !!target?.closest(OWN_GESTURE);
}
