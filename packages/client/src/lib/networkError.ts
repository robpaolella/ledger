/** What a visitor sees when the request never reached Ledger (offline, server down). */
export const NETWORK_ERROR_MESSAGE = "Can't reach Ledger. Check your connection and try again.";

/**
 * The plain-English message for an error thrown by fetch(), or null when it
 * should pass through unchanged (a deliberate abort).
 */
export function networkErrorMessage(err: unknown): string | null {
  if (typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError') return null;
  // The browser's own wording ("Failed to fetch") means nothing to a visitor.
  return NETWORK_ERROR_MESSAGE;
}
