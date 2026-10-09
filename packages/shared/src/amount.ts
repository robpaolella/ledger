// Reads a CSV amount cell. Parentheses wrapping the whole value mean a negative,
// `(123.45)`; `$`, `,`, `+`, quotes and whitespace are ignored. Whatever is left must
// be a plain number (optional leading `-`, digits, optional decimals), otherwise the
// amount is unreadable and this returns null — never 0, since 0 is a real amount.
export function readAmount(raw: string | null | undefined): number | null {
  let s = (raw ?? '').replace(/["$,+\s]/g, '');
  const paren = /^\(.*\)$/.test(s);
  if (paren) s = s.slice(1, -1);
  // `(-5)` is ambiguous, and a stray parenthesis is not a number.
  if (paren && s.startsWith('-')) return null;
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return null;
  const v = Number(s);
  return paren ? -v : v;
}
