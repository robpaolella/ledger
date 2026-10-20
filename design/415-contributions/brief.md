# Design: Contributions in Settings and Reports

- Design issue: #415
- Revision: 1
- Replaces: none
- Source plan: https://github.com/robpaolella/ledger/issues/414 (decisions Q1–Q21 and the critique)
- Base: `feature/platform-retheme`

## Job and audience
A household puts money into accounts it still owns but wants to watch separately: a 529
college fund, a brokerage account, a retirement account. Today that money is a plain
transfer, and Reports leaves every transfer out, so the only way to find the year's total
is to filter by merchant, with no total shown. Contributions lets the household pick
Transfers categories to track, then shows how much was **put in** and **taken out** over
any Reports range. Those figures never count as income, spending, Net, Savings rate or
any other total.

- **Who sets it up:** whoever can edit categories (owner and admin always). Usually done once, on a desktop.
- **Who reads it:** everyone who can see Reports (owner, admin, member), on desktop and phone.
- **Success:** "We put $6,000 into the 529 this year" is one glance at Reports, and nothing else on the page moved.

## Covers
| Build issue | Part of this feature | Out of scope |
| --- | --- | --- |
| #419 | Settings → Household → Contributions panel (list, empty state, add, edit, stop tracking, help text, who sees it, phone) and the read-only line plus delete/move refusal on the category form | Server behaviour (#416); Reports |
| #420 | Reports → Category breakdown: Contributions in Summary and Timeline, desktop and phone, drill-in and the Transactions card's from → to rows | Breakdown bar, Saved segment, KPI cards, Trends, Reports CSV format, server figures (#417, #418, #421, #422) |

## Boundaries and visual authority
- `PRODUCT.md`: Settings rules (one home; hide what a person can't use; plain status
  messages), Money rules (transfers grey; money in "+$X"), Safety (in-app confirmation,
  no browser dialogs; messages by the action).
- `DESIGN.md` and `.github/design-system.jsx` win on look; `.github/mobile-prototype.jsx` for phone.
- Reused pieces: Settings `PanelHeader`, `Card`, `CardHeader`, `Field`, `SelectShell`,
  `CheckBox`, `InlineNotification`, `ResponsiveModal` (bottom sheet on phones),
  `ConfirmDeleteButton` (two-tap, relabelled "Stop tracking"), `btnRow`/`btnPrimarySm`,
  `VendorAvatar` and account type labels; Reports section headings, `MiniToggle`,
  `MonthSwitcher`, the drill-down pill, the Transactions card rows and `ListRow`, `Money`.
- **Must not change:** KPI cards, breakdown bar and Saved segment, Trends, Income and
  Expenses sections and their totals, Budget, Recurring, Dashboard, the CSV format.
- **New kinds of element for Robert to approve:** a small grey "Not in totals" tag; a
  two-figure row (Put in / Taken out) in the breakdown; a from → to account line in the
  Transactions card; a new Settings nav icon.
- Facts found in code: Settings → Categories never offers "Create category" in the
  Transfers section, so Add contribution is the only place to create a Transfers
  category. The category form only opens for people with categories.edit, and those
  people can always open Contributions, so the read-only line without a link (#419) is
  not reachable today; the design shows the line with its link.

## States, themes and content
Themes: light and dark. Widths: 390×844 and 1440×900. Every state in every theme.

| State slug | Page / role | Content | Actions / feedback |
| --- | --- | --- | --- |
| reports-deposits | Reports, Summary, owner | One contribution, monthly $500 put in, nothing taken out | Row drills in |
| reports-withdrawal | Reports, Summary | One contribution, only a $2,400 taken out | — |
| reports-reversal | Reports, Summary | $1,000 put in and $1,000 taken out, shown separately, never netted | — |
| reports-several | Reports, Summary | Four contributions incl. a very long category name and several accounts | — |
| reports-timeline | Reports, Timeline | Several contributions by month (phone: one month with the month switcher) | — |
| reports-filtered | Reports, filtered to one account | Only that account's contributions; filter chip shown | — |
| reports-drill | Reports, drilled into one contribution | Pill "Contributions › 529 College Fund · $X put in · $Y taken out"; Transactions card lists the from → to rows | ✕ clears |
| reports-none | Reports, range with no tracked activity | Section absent; page exactly as today | — |
| settings-list | Settings → Contributions, owner | Four contributions, long names, several accounts, an inactive account, "An account not in Ledger" | Row opens edit |
| settings-empty | Settings → Contributions, nothing tracked | Empty state that explains the feature | Add contribution |
| settings-add | Add window, existing category picked | Category picker, account checklist | Add contribution |
| settings-add-new | Add window, creating a new category | Icon & name field (Group picker only with more than one Transfers group) | — |
| settings-add-error | Add window, no account chosen | "Choose at least one account." by the action | — |
| settings-edit | Edit window | Accounts, "Stop tracking" in the footer (two-tap) | Saves, stops |
| settings-member | Settings as a member without categories.edit | Household list has no Contributions | — |
| category-tracked | Category form, tracked Transfers category | Read-only "Tracked in Contributions" line with link | — |
| category-refused | Category form after a refused delete | Server's reason in the form's existing error notice | — |

Loading and load-failure reuse the existing Settings panel spinner and `LoadError`
("Couldn't load your settings…") unchanged, so they are not drawn again. Reports has no
new loading state: the section arrives with the page's existing data.

**Draft wording (Robert to confirm in the versions):**
- Panel description: "Track money you move into accounts like a 529, a retirement account or a brokerage account. Reports shows it in its own Contributions section. It never counts as income or spending."
- Empty state: "No contributions tracked yet" / "Put money into a 529, a retirement account or a brokerage account? Track it here to see how much went in over any period on Reports. Contributions are moves between your own accounts, so they never count as income or spending."
- How it counts (help in the panel and the add window):
  - "A transaction counts when it's filed under a tracked category. The category is what says the money was a contribution."
  - "The accounts you choose are where the money goes. Ledger counts the money leaving your other accounts and skips the copy that arrives in these, so nothing counts twice. Money Ledger only sees arriving isn't counted."
  - "Changes here update past periods on Reports too, as re-categorizing does."
- Add window: title "Add contribution"; fields "Category" (pick a Transfers category, or "New category…" for people who can create categories) and "Pays into" (checklist: active accounts, investment and retirement first, "An account not in Ledger" last; an inactive account shows only if already chosen, marked "Inactive"). Error: "Choose at least one account." Buttons "Cancel" / "Add contribution"; edit: "Save changes", "Stop tracking" → "Stop tracking?".
- Toasts: "Contribution added", "Contribution saved", "Stopped tracking <name>".
- Category form line: "Tracked in Contributions · pays into <accounts>", link "Manage in Contributions".
- Refusals (server wording, shown in the form's error notice): "Stop tracking this category in Contributions before you delete it." / "… before you move it out of Transfers."
- Reports: section/card "Contributions", tag "Not in totals", columns "Put in" and "Taken out".

## Host snapshot and offline proof
- Source: `feature/platform-retheme` at `f4d6e2f`, verify-ledger (`.pi/skills/verify-ledger/SKILL.md`,
  `page-snapshot.md`), fresh demo seed launched 2026-10-19, role owner (john), Reports range Year to date.
- Commands: `node .pi/skills/verify-ledger/run.mjs launch|doctor|cleanup /tmp/ledger-evidence-hgeXqF`;
  browser session `d415-capture`; each page captured with `snapshot.mjs capture` at light/dark × 390/1440,
  then `snapshot.mjs assemble`. The capture loop is saved as `/tmp/ledger-evidence-hgeXqF/capture-script.sh`.
  Live screenshots: `/tmp/ledger-evidence-hgeXqF/live-<page>-<theme>-<width>.png`. App cleaned up (PASS).
- Hosts (untracked until offline proof; removed at freeze): `hosts/reports.html` (Summary),
  `hosts/reports-timeline.html`, `hosts/reports-drill.html` (drilled into Household: pill + Transactions card),
  `hosts/settings-index.html` (phone Settings index; desktop shows Profile), `hosts/settings-categories.html`,
  `hosts/category-form.html` (Edit category open on Transfers › Savings Move).
- Finding for building versions: every capture shares one identical stylesheet (780 KB, fonts inlined), and
  dark differs from light only by `class="dark"` on `<html>` plus the sidebar theme button's title/icon
  ("Dark mode" moon ↔ "Light mode" sun). Reports bodies are ~1.9 MB, almost all merchant-logo data URIs.
- Host parts used (anchors in the stripped copy, see `large-hosts.md`): Reports "Category breakdown" card
  (text `Category breakdown`, section headings `text-xs font-bold uppercase text-content-2`), Timeline header row
  (`font-mono text-[11px] uppercase`), drill pill (`title="Clear drill-down"`), Transactions card (text
  `Transactions`); Settings nav (`aria-label="Settings sections"`, Household card), panel `PanelHeader` (`h2`
  Categories), category rows (`group/row`); category form dialog (`role=dialog`, "Exclude from budget" row, footer
  with Delete/Cancel/Save changes).
- Offline proof: **not done yet** (next step).

## Confirmed decisions
1. **Names (Q1):** Contributions; figures "Put in" and "Taken out". Robert: "Agreed." (2026-10-19, design tab)
2. **Account choices (Q2):** every active account, investment and retirement first, "An account not in Ledger" last; inactive only when already chosen, marked Inactive. "Agreed."
3. **New category in the add window (Q3):** reuse the category form's Icon & name field; Group picker only with more than one Transfers group. "Agreed."
4. **Reports heading (Q4):** show the section's own Put in and Taken out sums with a "Not in totals" tag. Robert: "Sure. Maybe we even create more distinction (at least in one variant) where the box is separate of the box for income and expenses."
5. **Drill-in (Q5):** pill "Contributions › <name> · $X put in · $Y taken out"; Transactions rows read from → to, grey like other transfers; on phone the from → to line replaces the account name. "Sure."
6. **Settings placement and stopping (Q6):** after Categories in Household, own icon, same place in the phone index; Stop tracking in the edit window footer with the two-tap confirmation. "Yes."

Versions differ on: (A) Reports placement — a section inside the Category breakdown
table vs its own card below it; (B) the Settings list — compact rows in one card vs one
card per contribution with its accounts listed.

## Real-site experiment
None.

Brief confirmed by Robert: "Confirmed." (2026-10-19, design tab).

## Open decisions
None beyond the version choices and the draft wording above.
