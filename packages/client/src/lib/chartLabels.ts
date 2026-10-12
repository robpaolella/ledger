/**
 * Which x-axis labels to draw when there are too many to fit (phone charts).
 * Counts back from the last label so the newest one is always drawn and never
 * left off the edge: 10 months at most 5 labels gives Feb, Apr, Jun, Aug, Oct.
 * Returns ascending indexes.
 */
export function thinLabelIndices(count: number, maxLabels: number): number[] {
  if (count <= 0 || maxLabels <= 0) return [];
  const step = Math.max(1, Math.ceil(count / maxLabels));
  const out: number[] = [];
  for (let i = count - 1; i >= 0; i -= step) out.unshift(i);
  return out;
}
