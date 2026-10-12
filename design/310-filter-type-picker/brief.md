# Design: phone Filters sheet type picker and pinned search

- Design issue: #310
- Revision: 1
- Replaces: none. Builds on the phone Filters sheet from `design/226-phone-sheets-rows/`
  (V2a), built in #288 / PR #305; that design is not rewritten.
- Source plan: #307

## Job and audience
A household member on a phone opens **Filters** on Transactions, Reports or Account detail
to narrow the list. Today they choose a filter type from five tabs that wrap onto two rows
of different widths, and the search box scrolls away with a long list. Success is picking
a type in one obvious control, seeing which types already have selections, and searching
a long list without losing the search box. Source: Robert, 2026-10-12, testing PR #305
(quoted in #307).

## Covers
| Build issue (or planned slice) | Part of this feature | Out of scope |
| --- | --- | --- |
| #307 | Phone Filters sheet: type picker, pinned picker + search, search hidden on Amount/Other | Desktop pop-up (unchanged), one-row toolbars (#294), Review sheet account logo |

## Boundaries and visual authority
- `DESIGN.md` and `.github/design-system.jsx` tokens; the existing BottomSheet (handle,
  title, close, footer Clear / Cancel / Apply) and FilterPopover checklist rows stay as built.
- Filter types per page (from code on PR #305): Transactions 5 (Categories, Merchants,
  Accounts, Amount, Other); Reports 4 (no Other); Account detail 4 (no Accounts);
  Accounts page 1 (Accounts only, so no picker is shown).
- Count rule is the app's `filterDraftCount`: each selected subcategory, merchant and
  account counts 1; Amount condition 1; Debits/Credits type 1; To review 1.
- New kinds of element Robert is asked to approve, one per version: a single horizontally
  scrolling pill row (A), a dropdown menu button (B), a two-step type list with back
  navigation (C).
- Must not change: desktop pop-up layout, footer actions, checklist rows and their wording,
  "N filters selected" line, the selected-filters summary under the list.

## States, themes and content
| State slug | Role / situation | Content range and exact wording | Actions / feedback |
| --- | --- | --- | --- |
| start | Owner, Transactions, sheet just opened, nothing selected | 5 types, 0 filters; Categories list (17 groups, 63 subcategories) | Pick a type; search "Search categories…" |
| choosing | Owner, Transactions, choosing a type with selections in several types | Categories 3, Merchants 2, Amount 1, Other 1 = "7 filters selected" | A: row scrolled to the end; B: menu open; C: type list |
| selected | Owner, Transactions, in Categories with selections | Groceries, Dining/Eating Out, Fuel ticked; other counts as above | Counts visible on each type |
| scrolled | Owner, Transactions, Merchants list scrolled far down | ~300 merchants (sample) | Picker and "Search merchants…" stay in view |
| no-match | Owner, Transactions, Merchants search "zzq" | "Nothing matches “zzq”" | Search stays editable |
| keyboard | Owner, Transactions, typing "amber" in Merchants search | Phone keyboard covers the lower part of the screen | Picker, search and footer stay above the keyboard; list scrolls between |
| reports | Owner, Reports | 4 types (no Other) | Same picker with 4 types |

Pages that share the sheet, beyond the captured states (Robert, decision 3):
- **Account detail** (4 types: Categories, Merchants, Amount, Other; no Accounts, since the
  list is already one account) gets the same dropdown, listing its 4 types. It is the
  same layout as the `reports` state with a different type list, so it has no separate state.
- **Accounts page** (1 type: Accounts) shows **no picker**: the sheet is the pinned
  search ("Search accounts…"), the "N filters selected" line, then the Accounts list,
  exactly the `start` layout minus the "Filter by" row. A one-option dropdown would be
  a control with nothing to choose.

Amount and Other have nothing to search, so the search box is hidden on them (Robert,
decision 2). Empty, loading, error, locked and no-permission states don't apply: the sheet
opens on data the page already loaded, has no save of its own (Apply filters the page),
and every role that can see a page can filter it. "No merchants yet" and "No accounts
match" empty lists keep today's wording. Themes: light, dark. Widths: 390×844 (changed),
1440×900 (desktop pop-up, unchanged, shown for every state). Keyboard: every control is
a real button reachable with Tab; pills/menu/list items show the current type with
`aria-pressed`/`aria-current`, and the B menu closes with Escape.

## Host snapshot and offline proof
Captured 2026-10-12 from PR #305's branch `feat/288-phone-filter-date-sort-sheets` at
`3885704` (the sheet isn't on `feature/platform-retheme` yet), in a throwaway detached
worktree `/git/ledger-worktrees/tmp-310-host`. Owner John on synthetic verify-ledger data.
Commands: `node .pi/skills/verify-ledger/run.mjs launch "$EVIDENCE"` (Doctor PASS) →
sign in → `/transactions` → Filters → `snapshot.mjs capture` at light/dark × 390/1440
(theme switched with the app's own Dark mode button) → `snapshot.mjs assemble` →
`run.mjs cleanup "$EVIDENCE"` (PASS, cleaned). Evidence: `/tmp/ledger-evidence-nPPyED`.

Host parts used (from `sheet-light-390.html` / `sheet-light-1440.html`, with theme by
`html.dark`; dark-only inline colours mapped from the dark captures):
- Phone: `#root` page behind the sheet; the sheet `div[role=dialog][aria-label=Filters]`,
  keeping its handle, title row and footer; its scroll body
  (`div.flex-1.min-h-0.overflow-y-auto.px-5.py-3.touch-auto`) is replaced by the prototype.
- Desktop: the whole page with the Filters pop-up open, unchanged.

Versions are generated from those captures by a build script kept outside the repo
(`/tmp/d310-build/`); each version (now the approved `index.html`) is one self-contained file (app stylesheet
and fonts inlined, ~3.9 MB) whose phone and desktop views switch at 768px.

Offline proof (2026-10-12): app stopped (Cleanup PASS), fresh browser session
`d310-offline` with network emulated Offline, each version opened from `file://` at
390×844: state/theme markers set from the URL, choosing Merchants, ticking a merchant and
the count update all worked; fonts loaded; a fetch to `127.0.0.1` failed. Each version's
Content Security Policy is `default-src 'none'` (inline styles/scripts and `data:` only),
so no request can leave the file. Full-matrix captures: 84 images from
`design.ts shots` in `/tmp/design-review-hdQiOs/versions`.

## Confirmed decisions
1. Make all three layouts as versions: A one scrolling row, B dropdown, C two-step list
   (Robert, 2026-10-12).
2. Pin the picker and search under the sheet title; hide search on Amount and Other; the
   "N filters selected" line and selected-filters list stay as they are (Robert, 2026-10-12).
   Version C exception: a two-step list has no picker inside a type's list. There the
   pinned part is the title (the type's name) with a back arrow to the type list, plus the
   search; switching type costs one extra tap. This is the trade-off Robert was shown for C
   when he chose all three (round 1, option c: "it adds a tap"); it is part of the choice he
   makes between versions, not a gap in C. Raised by the independent critique, finding 1.
3. Desktop pop-up unchanged; no picker on the Accounts page; states as listed above
   (Robert, 2026-10-12).

## Real-site experiment
None.

## Open decisions
None.
