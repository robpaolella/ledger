import { describe, it, expect } from 'vitest';
import { defaultLayout, parseLayout, reconcile } from '../../client/src/components/dashboard/layoutModel';

const cards = {
  a: { defaultColumn: 'left' }, b: { defaultColumn: 'left' },
  c: { defaultColumn: 'right' }, d: { defaultColumn: 'right' },
} as const;
const order = ['a', 'b', 'c', 'd'] as Array<keyof typeof cards>;
const def = defaultLayout(cards, order);
const everyOnce = (l: { left: string[]; right: string[] }) => [...l.left, ...l.right].sort();

describe('dashboard layout', () => {
  it('default layout puts each card in its default column in registry order', () => {
    expect(def).toEqual({ version: 1, left: ['a', 'b'], right: ['c', 'd'] });
  });

  it('keeps a valid saved order and cross-column move', () => {
    const l = parseLayout(JSON.stringify({ version: 1, left: ['b', 'c'], right: ['d', 'a'] }), cards, order);
    expect(l).toEqual({ version: 1, left: ['b', 'c'], right: ['d', 'a'] });
  });

  it('drops unknown and duplicate ids and re-adds missing cards in their default column', () => {
    const l = reconcile(['a', 'zzz', 'a', 5], ['a', 'c'], cards, order);
    expect(l).toEqual({ version: 1, left: ['a', 'b'], right: ['c', 'd'] });
    expect(everyOnce(l)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ignores prototype names as card ids', () => {
    expect(everyOnce(reconcile(['toString', 'constructor'], [], cards, order))).toEqual(['a', 'b', 'c', 'd']);
  });

  it.each([
    ['null', null], ['empty', ''], ['not json', '{oops'], ['wrong version', '{"version":2,"left":[],"right":[]}'],
    ['missing column', '{"version":1,"left":[]}'], ['json null', 'null'], ['a number', '7'],
  ])('falls back to defaults for a corrupt value (%s)', (_n, raw) => {
    expect(parseLayout(raw, cards, order)).toEqual(def);
  });

  it('a saved default layout parses back unchanged (Reset on an already-default layout is harmless)', () => {
    expect(parseLayout(JSON.stringify(def), cards, order)).toEqual(def);
  });
});
