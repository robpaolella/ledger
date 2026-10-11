# Handoff: design #231 (Account detail filters), 2026-10-11 (fifth handoff)

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

## Learned in session 3 (step 4 research done, no files written yet)
Session 3 read everything below again and planned the build; nothing was built. Read these
notes instead of re-reading the components.
- Precedent to copy: `design/104-settings/index.html` (two `<style>` blocks: the app CSS,
  then a ~5 KB prototype block with `#proto-bar` (sticky, `--proto-bar: 48px`, dashed
  warning border), focus-visible rings, `.sr-only`). Its script: `VERSION` const, `ui`
  state, `render()`, `renderBar()` with State/Theme selects, `syncUrl()` sets
  `?state&theme` and `data-state`/`data-theme`, `setTheme()` toggles `dark` on `<html>`,
  one delegated `click` handler on `[data-act]`. Its shell puts the sidebar
  `position:absolute;top:0;bottom:0` inside `#root{position:relative}` and the phone
  app bar `sticky` with `top:var(--proto-bar)`, so the bar doesn't cover them. Do the same
  (the captured aside is `fixed top-0`, which the proto bar would cover).
- Sticky tops under the proto bar: page header `top: calc(var(--proto-bar) + 56px)` on
  phones, `var(--proto-bar)` on desktop; phone popovers (`fixed inset-x-4`) top
  `calc(var(--proto-bar) + 80px)` and max-height reduced by `--proto-bar`. Use a small
  prototype class instead of the `top-20`/`md:top-12` utilities.
- Phone vs desktop: re-render on `matchMedia('(max-width: 767px)')` change (104 does this);
  the static parts (sidebar, chart) use the captured `desktop-only`/`mobile-only` markup.
  Balance chart SVG is width-specific: take the 1078-px one from page-light-1440 and the
  332-px one from page-light-390, show each with desktop-only/mobile-only.
- On phones today's page has **no** page-header row; the "Filters" link sits in the app
  bar's `#mobile-bar-actions`. Both versions remove it (a: toolbar row; b: in the card).
  PageHeader phone row classes (no `left`, not stacked): `sticky top-14 md:top-0 z-20 -mt-4
  md:-mt-7 -mx-4 md:-mx-8 px-4 md:px-8 py-3 md:py-4 mb-5 md:mb-6 bg-bg border-b border-line
  flex items-center justify-between gap-3`, right div `flex items-center gap-2 flex-wrap
  w-full shrink-0 justify-end [&>*]:shrink-0`.
- Account rows keep the Account-detail look (category emoji + label), not Transactions'
  CategoryTag dot. Desktop row and phone ListRow markup are verbatim in page-light-1440 /
  page-light-390 (14 rows each). Avatar initials: `color-mix(in srgb, var(--c-*) 16%,
  transparent)` with `color: var(--c-*)` (the capture has resolved rgb; use the token).
- Sample data: `/tmp/ledger-evidence-J4PXt4/txns.json` = all 330 rows of this account as
  `[date, merchant, amount, group, sub, type, logo]` (2026-02-01 to 2026-10-10; 105
  merchants, Walmart 23 … ; categories Groceries 91, Dining 73, Personal Supplies 23,
  Fuel 19, Hobby 16, Loan Auto 11, Credit Card Payment 9 (transfer, amount -350 shows
  "+$350.00" muted), 8 rows "Groceries +1" are splits: filter them as Groceries).
  Logos: `logos/vendor-N.webp` (34 files, 720 KB) matching the `/uploads/vendor-N.webp`
  paths: inline as data URIs. `cats.json` = 57 categories `[id, group, sub, type]` in 16
  groups (incl. Income, Transfers) for the panel's Categories tab. Plan: embed all 330 rows
  and filter them for real in the prototype (date presets relative to 2026-10-11, so
  "Last month" = Sep 2026); flag a few rows deterministically as needs-review for Other.
  Pick the `filtered` state's two categories so the count lands under 14 and the
  `many-matches` amount filter so it lands over 14; compute, don't hand-write, counts.
- Category emoji: own entry, else group's, else 🏷️ (RAW map in `lib/categoryMeta.ts`
  lines 45–78; colour always the group's token, unknown groups via `fallbackToken` hash
  over the 9 `c-*` tokens).
- Ported recipes, all read: FilterPopover header (Filters | search "Search
  categories…" | "N filters selected"), nav, checklist with Select all + group rows, Amount
  (Greater than/Less than/Equal to/Between + Type Debits only/Credits only), Merchants with
  counts, Other "Needs review only" + its help line, right-hand selected summary with
  per-section Clear and remove buttons, footer Clear | Cancel Apply. DateRangePopover:
  trigger `border-2` primary when open/active, "Date Range" title, presets All time, This
  month, Last month, This quarter, Last quarter, This year, Last year, Year to date (click
  applies and closes), Start/End date fields MM/DD/YYYY, footer Clear | Cancel Apply.
  Date trigger label: "Date" when all time, else the preset label or "Sep 1 – Sep 30".
  Filters button: outline sm (`buttonClasses`), active = `border-primary`, badge
  `min-w-5 h-5 px-1.5 rounded-full bg-primary text-on-primary text-[11px] font-bold`.
  Desktop search: icon button, opens a field `w-[clamp(9rem,10vw,15rem)]` with close ×,
  Escape clears. Phone toolbar: 44-px search field "Search transactions" with clear × and
  filter icon (badge `min-w-4 h-4 text-[10px]`), then a row with Date chip and Clear.
  Clear text button: `h-10 px-2.5 text-primary font-semibold text-sm`, shown whenever
  search, date or filters are active. Popover: click-away backdrop, Escape closes, focus
  moves in and returns to the trigger, only one open at a time.
- Loading state plan: spinner (`Spinner` ring, `border-line border-t-primary`) replaces the
  rows, count line hidden, controls stay usable. Error: "Couldn't load transactions." +
  secondary "Try again" in the list area.
- Build approach: a Python script outside the repo (e.g. `/tmp/design-231-build/build.py`)
  that assembles `versions/a.html` and `versions/b.html` from the captured stylesheet,
  the adapted shell, inlined logos and data, and one shared prototype script with a
  `VERSION` constant. Don't commit the script.

## Session 4 (build started; read this first)
Everything step 4 needs is now written down outside the repo, so don't re-read the components
or the captures: **`/tmp/design-231-build/SPEC.md`** is the full build spec (data rules, all 11
states with checked counts, interactions, verbatim class recipes, both versions). Done there:
`extract.py` and `build.py` (assembles both versions; untested). Still to write: `proto.css`
and `proto.js`, then run `python3 /tmp/design-231-build/build.py`. Counts verified: filtered
(Dining/Eating Out + Fuel, Last month) = 11, many-matches (over $75) = 31, no-match (Fuel over
$200) = 0. The "filtered" example in the brief said 9; the real sample data gives 11.

## Next step
Write proto.css + proto.js per SPEC.md, build, check both versions offline at both widths and
themes, fill design.json/decisions.md, then step 5 (critique) and step 6 (show Robert).
Start building immediately: three sessions have now spent their budget on research.
Nothing is waiting on Robert.
`/tmp/ledger-evidence-J4PXt4` and `/tmp/design-231-build` must still exist; if the evidence
folder is gone, step 3's capture has to be re-run (commands in brief.md).

## Next session
Claude Opus 5.5, medium thinking (`node /git/maestro/routing/route.ts role design-feature`).
Start in the ledger herdr workspace, in this tab's place, in
/git/ledger-worktrees/docs-231-design-account-filters:
`pi --model claude-bridge/claude-opus-5-5 --thinking medium`, with the prompt: "Read
/git/maestro/skills/design-feature/SKILL.md and design/231-account-filters/HANDOFF.md, then
continue design #231 with Robert from the next step. Robert makes the decisions in this tab.
Base: feature/platform-retheme (already recorded on #231)."

## Session 5 (versions built; read this first)
- `proto.css` and `proto.js` are written in `/tmp/design-231-build/`; `python3 build.py` builds
  `versions/a.html` and `versions/b.html` (about 1.8 MB each, untracked on purpose, like host.html;
  commit them with the design PR, not before, to keep history small). Rebuild after any edit to
  proto.js/proto.css; never hand-edit the versions.
- Checked: both scripts parse; opened offline (named session, network emulated Offline) with no
  script errors. `classcheck.js` (run via `chrome-devtools-axi eval "$(cat classcheck.js)"`) walks
  every state plus the Merchants/Amount/Other tabs and reports class names missing from the app
  CSS: only `active` (from the captured sidebar), so nothing new is unstyled. The console's
  "Unsafe attempt to load URL" line is `history.replaceState` on file:// and is harmless
  (data-state still updates).
- Not yet done: looking at the screenshots. Light captures of default, filtered and filters-open
  for both versions at 1440 and 390 are in `/tmp/d231shots/` (taken, not inspected). Next: open
  them, check every state × theme × width by eye (popover placement in B at 84px/left 0; phone
  popovers in #overlay under the app bar; long-names truncation; error/loading), fix, then
  verify the interactions (Apply → 400 ms spinner, Escape/focus return, date presets, custom
  dates, View all toast). The sidebar's Dark mode button is captured markup and does nothing;
  either wire it to setTheme or leave it as an inert control.
- Then fill design.json and decisions.md, step 5 critique, step 6 with Robert (questions
  unchanged: (1) where the controls sit, (2) how active filters show, plus "11 of 11 matching"
  vs "11 matching").
- Previous tab w2V:tQ was closed (old session file
  `/home/agent/.pi/agent/sessions/--git-ledger-worktrees-docs-231-design-account-filters--/2026-10-11T07-28-43-850Z_01a129dd-2f49-762c-aeeb-36b6ebabd968.jsonl`).

## Session 6 (checking by eye; read this first)
- Fixed: sidebar rendered 155 px instead of 236 px (duplicate `style` attribute on the
  captured aside). Fix is in `/tmp/design-231-build/build.py`; versions rebuilt.
- Interactions verified in both versions at 1440 and 390 with `/tmp/design-231-build/itest.js`
  (`CHROME_DEVTOOLS_AXI_SESSION=d231s6 npx -y chrome-devtools-axi eval "$(cat itest.js)"`):
  panel opens with focus inside, Escape closes and returns focus to Filters; Apply shows the
  spinner then "14 of 19 matching" + badge 1 + page Clear; date preset applies and returns
  focus; two MM/DD/YYYY fields; View all toast lists the carried filters; Clear resets; search
  filters live; no-match search message renders. No console errors.
- design.json filled (231, covers [213], 11 states, light/dark). decisions.md: header, maker
  and the three pending decisions + shared build details filled; rest awaits steps 5–6.
- Full capture: `/tmp/design-review-tyv5Zv/versions` (88 images + manifest, from
  `design.ts shots`), contact sheets in `/tmp/design-review-tyv5Zv/sheets` (`p-<state>.png` =
  four phone shots; `d-<v>-<state>.png` = light+dark desktop). Inspected and fine: all 11 phone
  sheets, desktop date-open (a, b) and filters-open (b). Not yet inspected: the other 19
  desktop sheets.
- One fix to make: in B's summary line, a long search loses its closing quote when it
  truncates (`“Blue Bottle Coffee Roasters, Oakland …` with no `”`). Use the same
  shrink-0 quote / truncating middle structure as the empty-state message. Then rebuild,
  re-run `design.ts shots` into a fresh evidence folder (old one is stale), re-inspect the
  affected states, then step 5 critique.
