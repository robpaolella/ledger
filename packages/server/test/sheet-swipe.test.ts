import { describe, expect, it } from 'vitest';
import { CLOSE_DISTANCE, SWIPE_SLOP, releaseOutcome, startsOnFormField, swipeIntent } from '../../client/src/lib/sheetSwipe';

describe('swipeIntent', () => {
  it('waits until the touch has travelled past the tap slop', () => {
    expect(swipeIntent(0, SWIPE_SLOP - 1, 0)).toBe('pending');
    expect(swipeIntent(3, 3, 0)).toBe('pending');
  });

  it('drags on a mainly-downward swipe when the body is at the top', () => {
    expect(swipeIntent(0, 20, 0)).toBe('drag');
    expect(swipeIntent(10, 20, 0)).toBe('drag');
  });

  it('leaves a downward swipe to scroll when the body is scrolled down', () => {
    expect(swipeIntent(0, 40, 1)).toBe('ignore');
    expect(swipeIntent(0, 40, 300)).toBe('ignore');
  });

  it('ignores horizontal and upward swipes', () => {
    expect(swipeIntent(30, 10, 0)).toBe('ignore');
    expect(swipeIntent(-30, 30, 0)).toBe('ignore'); // equal travel counts as sideways
    expect(swipeIntent(0, -40, 0)).toBe('ignore');
  });
});

describe('startsOnFormField', () => {
  const el = (matches: boolean) => ({ closest: () => (matches ? {} : null) });

  it('is true inside inputs, selects and textareas, false elsewhere', () => {
    expect(startsOnFormField(el(true))).toBe(true);
    expect(startsOnFormField(el(false))).toBe(false);
    expect(startsOnFormField(null)).toBe(false);
  });

  it('asks for form fields but not buttons, so taps and drags on buttons still work', () => {
    let asked = '';
    startsOnFormField({ closest: (sel) => { asked = sel; return null; } });
    expect(asked).toMatch(/input/);
    expect(asked).toMatch(/select/);
    expect(asked).toMatch(/textarea/);
    expect(asked).not.toMatch(/button/);
  });
});

describe('releaseOutcome', () => {
  it('closes only past the release distance', () => {
    expect(releaseOutcome(CLOSE_DISTANCE + 1, false)).toBe('close');
    expect(releaseOutcome(CLOSE_DISTANCE, false)).toBe('snap-back');
    expect(releaseOutcome(0, false)).toBe('snap-back');
  });

  it('never closes on a cancelled touch, however far it was dragged', () => {
    expect(releaseOutcome(CLOSE_DISTANCE + 200, true)).toBe('snap-back');
  });
});
