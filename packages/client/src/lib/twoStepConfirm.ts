/** One tap of a two-step destructive button: the first tap only arms it, the second runs the action. */
export function tapTwoStep(armed: boolean): { armed: boolean; run: boolean } {
  return armed ? { armed: false, run: true } : { armed: true, run: false };
}
