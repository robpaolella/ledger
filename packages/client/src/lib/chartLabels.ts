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

/**
 * Y-axis labels for the given gridline values. Tries each formatter in turn
 * (coarsest first) and keeps the first whose labels are all different, so a
 * narrow range moves from "$8k" to "$7.9k" to "$7,960" instead of repeating.
 * If even the finest repeats (ticks closer than a cent), later repeats are blanked.
 */
export function distinctAxisLabels(ticks: number[], formatters: Array<(n: number) => string>): string[] {
  let labels: string[] = [];
  for (const format of formatters) {
    labels = ticks.map(format);
    if (new Set(labels).size === labels.length) return labels;
  }
  const seen = new Set<string>();
  return labels.map((l) => (seen.has(l) ? '' : (seen.add(l), l)));
}
