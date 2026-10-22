/** Phone Transactions toolbar: pure rules, kept apart from the page so the server tests can import them. */

export type PhoneToolbarMode = 'select' | 'search' | 'row';

/** Select mode keeps its own rows; otherwise the one 44px row, or the expanded search in its place. */
export const phoneToolbarMode = (bulkMode: boolean, searchOpen: boolean): PhoneToolbarMode =>
  bulkMode ? 'select' : searchOpen ? 'search' : 'row';

/** The "Clear all" line shows only while something is active, and never in Select mode. */
export const showClearAll = (anyActive: boolean, bulkMode: boolean) => anyActive && !bulkMode;

/** The strip shows only with something to review, and never while selecting (tapping it would leave the page). */
export const showReviewStrip = (count: number, bulkMode: boolean) => count > 0 && !bulkMode;

/** Wording of the phone review strip: the bold lead, the rest of the line, and the link's accessible name. */
export function reviewStripText(count: number) {
  const lead = `${count.toLocaleString('en-US')} ${count === 1 ? 'transaction' : 'transactions'}`;
  const rest = count === 1 ? ' needs review' : ' need review';
  return { lead, rest, label: `${lead}${rest}. Review` };
}

/** Accessible name of the phone Filters button. */
export const filtersButtonLabel = (applied: number) => (applied > 0 ? `Filters, ${applied} applied` : 'Filters');
