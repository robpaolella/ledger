# Handoff: design #231 (Account detail filters), 2026-10-11 (second handoff)

Delete this file before the design PR.

## Decisions
All in brief.md "Confirmed decisions" 1–4 (Robert confirmed the brief: "Confirmed.").
No new decisions this session; nothing is waiting on Robert.

## Progress (design-feature skill steps)
- Steps 1–2 done (issue #231, Dispatch comment with base feature/platform-retheme, #213
  blocked and status:needs-design, brief confirmed). Branch has no upstream yet (on purpose).
- Step 3 done. Offline proof compared: phone captures byte-identical to the live ones; desktop
  differs by 2 (light) and 75 (dark) anti-aliased pixels, nothing visible. brief.md records it.
  `host.html` is copied into the design folder but deliberately **not committed** (4.4 MB;
  the skill removes it before the PR, so committing it would only bloat history). It shows as
  an untracked file: that is expected, not a stray change. Checked for secrets: the only
  token-like strings are inside inlined base64 fonts and images.
- design.json and decisions.md are still the untouched templates.

## What I learned for step 4 (saves re-reading)
- Host structure: `host.html` = four sandboxed srcdoc frames. Don't build on it directly.
  Follow design/104-settings/index.html's precedent: one self-contained page with the
  captured app stylesheet (identical in every snapshot; take it from
  `/tmp/ledger-evidence-J4PXt4/page-light-1440.html`'s single `<style>`, 773 KB with fonts),
  CSP meta allowing `script-src 'unsafe-inline'`, a prototype bar, and a script that renders
  the page from ported component recipes. Dark mode is the `dark` class on `<html>`.
  Only use class names the app already uses (the stylesheet is compiled Tailwind).
- Static shell to reuse: sidebar, desktop page header (breadcrumb), balance card and Summary
  card from `page-light-1440.html` body; phone app bar (back, title "John's Visa (…7733)",
  actions slot) from `page-light-390.html`. Responsive classes `desktop-only`/`mobile-only`
  switch at 768px.
- Components to port as JS template strings (read them, already checked):
  `FilterPopover.tsx` (use NAV Categories, Merchants, Amount, Other; Other = "Needs review
  only"; Merchants list should be this account's merchants with their counts here),
  `DateRangePopover.tsx` (presets All time…Year to date, start/end fields, Clear/Cancel/Apply),
  `buttonClasses.ts` (outline sm, `active` = primary border), Transactions search/Clear/
  Filters badge and `phoneToolbar` (`TransactionsPage.tsx` ~1661–1800), `ListRow.tsx` (phone
  rows), desktop row markup in `AccountDetailPage.tsx` ~285–300, `Spinner.tsx`,
  `VendorAvatar` (primitives.tsx), `formatMoney` rules (positive = "$X" plain, negative =
  "+$X" positive tone, transfers muted). Category emoji/colour: `lib/categoryMeta.ts`
  (group map + `fallbackToken` hash; use `var(--c-*)` tokens, never hex).
- Popover positions: both are `fixed inset-x-4 top-20` on phones; on desktop `absolute
  top-12 right-0`, 820 px (filters) and 660 px (date). In version b the Transactions card has
  `overflow-hidden` and sits ~690 px wide, so a right-anchored 820 px panel would run over the
  sidebar: anchor b's panels to the card's left edge, rendered outside the clipped card.
  Note that as a build detail in decisions.md.
- PageHeader on phones: `right` renders as a sticky toolbar row under the app bar (as
  Transactions does). So version a's phone toolbar is sticky at the top of the page, above
  the balance chart and far from the list; version b's sits inside the card next to the list.
  That trade-off is the main thing to point out to Robert in question (1).
- Reference images: `/tmp/ledger-evidence-J4PXt4/tx-dark-390.png` (Transactions phone
  toolbar), `txfilter-dark-{390,1440}.png`, `txdate-dark-{390,1440}.png`.

## Next step
Step 4: build the versions (plan unchanged):
- a: controls in the page header (desktop: Clear, search icon, Date, Filters with count badge,
  replacing today's "Filters" link; phone: the Transactions phone toolbar, search field +
  filter icon, then Date chip and Clear), active filters shown only by the badge and the count
  line ("9 of 9 matching").
- b: controls on the Transactions card header (title + count left; search, Date, Filters
  right; phone: search field + filter icon and Date chip inside the card), plus a plain
  summary line of the active filters under the card header with Clear.
- Independent decisions to ask Robert separately: (1) where the controls sit, (2) how active
  filters show.
- States: default, filters-open, date-open, filtered, many-matches, no-match, search-no-match,
  no-transactions, long-names, loading, error. Themes light, dark.
Then step 5 (critique) and step 6 (show Robert in Open Design).

## Next session
Claude Opus 5.5, medium thinking (`node /git/maestro/routing/route.ts role design-feature`).
Start in the ledger herdr workspace, in this tab's place, in
/git/ledger-worktrees/docs-231-design-account-filters:
`pi --model claude-bridge/claude-opus-5-5 --thinking medium`, with the prompt: "Read
/git/maestro/skills/design-feature/SKILL.md and design/231-account-filters/HANDOFF.md, then
continue design #231 with Robert from the next step. Robert makes the decisions in this tab.
Base: feature/platform-retheme (already recorded on #231)."
