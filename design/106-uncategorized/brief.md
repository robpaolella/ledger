# Design: Uncategorized in totals

- Design issue: #106
- Revision: 1
- Replaces: none
- Source plan: retheme plan agreed 2026-10-08; build issue #107

## Job and audience
Anyone in the household checking how the month or year is going (Budget, Reports, the
Dashboard Spending card), on desktop or phone. Today transactions with no category are
left out of every total on those screens, so "Expenses" can be hundreds of dollars short
with nothing on screen saying so. Robert decided (2026-10-08, "A sounds good."; PRODUCT.md
Money rules, Uncategorized) that they count in totals as an "Uncategorized" line that
links to Review.

Success: totals add up to what really came in and went out; the person can see at a glance
how much has no category and how many transactions that is, and one click takes them to
Review to fix it. "Uncategorized" is a display line only, never a real category: it can't
be picked, budgeted or edited.

## Covers
| Build issue | Part of this feature | Out of scope |
| --- | --- | --- |
| #107 | Server totals include uncategorized amounts exactly once (Budget summary, Reports period, Dashboard spending series). Every total that sums actual money includes it: Budget section Actual and Remaining and the side rail (earned/spent, remaining, bars), the Dashboard Budget card, Reports KPI cards (Income, Expenses, Net, Savings rate), the Breakdown bar and Trends total line, and the Dashboard Spending headline and this-month line; the line on Budget, Reports and the Spending card; every uncategorized transaction has an open Review item; Review opens filtered to the clicked period | Changing how transactions get categorized; renaming "Uncategorized" elsewhere in the app; the Budget Year view (it shows plans only, so the line doesn't apply) |

## Boundaries and visual authority
- PRODUCT.md: Money rules (Storage, Display, Budget, Uncategorized; transfers stay out of
  totals), Phone support, Safety and access. DESIGN.md and `packages/client/src/index.css`.
- Hosts: `/budget` (`BudgetPage.tsx`), `/reports` (`ReportsPage.tsx`), `/` Dashboard
  Spending card (`components/dashboard/cards/SpendingCard.tsx`). Link target `/reviews`.
- Reuse the existing rows, section headers, KPI cards, flow bar, trend chart, legend chips
  and `InlineNotification`-style strip. Money through `formatMoney()` (plain $X for money
  out, green +$X for money in).
- "Left to budget" is planned income minus planned expenses; the line never changes it.
  Section Remaining (planned minus actual) does drop by the uncategorized money, as built;
  awaiting Robert's confirmation (critique fix 6).
- **New kinds of element Robert is asked to approve:** only the grey diagonal-stripe fill that
  marks Uncategorized in charts and on its rows (Robert asked for it, decision 7). Version B's
  notice reuses the existing `InlineNotification` (warning) component, so it isn't new.

## Confirmed decisions (Robert, 2026-10-10, this herdr tab)
1. The line links to Review. #107 makes sure every uncategorized transaction has an open
   Review item (today one marked reviewed without a category drops out), and Review opens
   showing just the period being looked at.
2. Side comes from direction, the one place it can: money out with no category shows under
   Expenses, money in under Income, each as its own Uncategorized line. PRODUCT.md should say so.
3. No transfer warning. The line shows its transaction count ("6 to review") so a big
   number stands out and prompts categorizing.
4. Two versions compare how it appears on Budget and Reports: **A** a row at the end of each
   section, styled apart from real categories (muted, no emoji, no plan box); **B** one notice
   strip above the list ("6 transactions ($412) have no category yet. They're counted in your
   totals. Review them"), keeping the category list pure. Built wording: see "Draft wording".
5. Nothing uncategorized: the line, notice and Dashboard note are hidden.
6. Wording is "Uncategorized", matching the rest of the app.
7. Reports charts include it as its own grey slice (Breakdown bar) and grey line (Trends),
   with diagonal stripes so it's clearly different; the Trends line is dashed (stripes
   can't show on a line) and its legend swatch is striped.
8. Dashboard Spending card: a small line under the headline, "Includes $412 uncategorized · Review",
   only when there is some.
- Assumed and not contradicted: everyone who can see these screens sees the line and can click
  through to Review (View-only members can open Review but not change it); on phones it is a
  card row at the end of the list (A) or a strip (B), same size as other rows; counts show in
  full ("48 transactions").

## States, themes and content
Themes `light`, `dark`. Widths 390×844 and 1440×900. Synthetic sample data only.
Typical: money out $412.37 across 6 transactions; money in +$85.00 across 1 (a payment-app
transfer from a friend). Large: $3,906.18 across 48 out; +$1,240.00 across 3 in.

| State slug | Surface / situation | Content | Actions |
| --- | --- | --- | --- |
| `budget` | Budget, month view, owner | Typical, both sides | Click line → Review |
| `budget-large` | Budget, month | Large | — |
| `budget-none` | Budget, month, nothing uncategorized | Line hidden | — |
| `reports` | Reports, Breakdown + Category breakdown Summary | Typical | Striped slice, row/notice |
| `reports-trends` | Reports, Trends tab + Category breakdown Timeline | Typical; dashed grey line | — |
| `reports-trends-large` | Reports, Trends + Timeline | Large; the dashed line visibly climbs in October | — |
| `reports-large` | Reports, Breakdown | Large | — |
| `reports-none` | Reports | Hidden | — |
| `dashboard` | Dashboard Spending card | "Includes $412 uncategorized · Review" | Click → Review |
| `dashboard-none` | Dashboard Spending card | No note | — |

Not separate states: loading and error (each page's existing spinner/error is unchanged; the
line arrives with the data); roles (identical for owner, admin and member; Review itself
handles View-only); empty household (Ledger always has data for an invited person; zero
uncategorized is `-none`). Keyboard: in the build the row, notice and note are real links (A's row a whole-row link) with the 2px `--ring` focus; the prototype's rows are focusable `role="link"` rows showing that ring.
Phone touch targets ≥44px.

## Draft wording (as built in the versions)
- A, Budget/Reports row: "Uncategorized" · "6 transactions" · "$412" · "6 to review ›"
  (phone card: "$412 · 6 transactions" and a "Review" button).
- B, notice: "**7 transactions have no category yet** ($412 out, +$85 in). They're counted
  in the totals below. Review them ›" (one side only drops the other part).
- Dashboard Spending card: "Includes $412 uncategorized · Review".
- Charts: the Breakdown legend entry and bar slice, and the Trends chip, are plain chart parts
  like their neighbours (the Trends chip shows/hides its line like the other chips,
  provisional: open decision 3); the
  Review links are the row (A), the notice (B) and the Dashboard note.
- Clicking any of them in the prototype shows a note saying where Review would open.

## Host snapshot and offline proof
- Captured 2026-10-10 on fresh verify-ledger sample data (source commit `ef3032a`, owner
  John), never real data. Launch:
  `LEDGER_LOGODEV_TOKEN_FILE=/nonexistent node .pi/skills/verify-ledger/run.mjs launch "$EVIDENCE"`;
  captures with the skill's `snapshot.mjs capture` for `/budget` (month view), `/reports`
  (Breakdown + Category breakdown Summary), `/reports` with Trends and Timeline open, and
  `/` (Dashboard), each in light and dark (sidebar `button[title="Dark mode"]`) at 390 and
  1440. Reports captures were trimmed to the first three transaction days to keep files small.
- Site cleaned up (`cleanup` PASS) and stopped before offline checks. Hosts
  (`host-budget.html`, `host-reports.html`, `host-trends.html`, `host-dashboard.html`) opened
  in an isolated browser with network disabled: 16 captures matched the running pages, fonts
  and images loaded, no network requests.
- Versions (`versions/a.html`, `versions/b.html`) are built from those captures plus a local
  prototype script; their Content-Security-Policy allows only inline script/style and `data:`
  fonts/images. Rechecked 2026-10-10 in headless Chrome with network emulated offline, both
  versions at 390 and 1440: `?state=&theme=` applied and set `data-state`/`data-theme`, the
  state picker changed state by keyboard (focus kept), the theme picker worked, URL updated,
  7 fonts loaded, no broken images, no external links, zero non-local requests. After the
  critique fixes, the same offline run measured the new phone tap targets (notice link and
  Dashboard note 44px, A's rows 47–72px) and Tab reached A's rows with a solid 2px focus ring.
- The Dashboard Spending chart's this-month line is scaled up by the uncategorized share
  (spread across the month) so it matches the headline; the build draws the real series.

## Real-site experiment
None.

## Open decisions
Robert's choices, all shown as built (provisional until he answers):
1. Row (A) or notice (B) on Budget and Reports.
2. Should uncategorized spend reduce section Remaining and the Budget bars? Built: yes.
3. Should the Trends Uncategorized chip show/hide its line like the other chips, or link to
   Review? Built: show/hide.
4. Link colour for "N to review" / "Review": `--warning` (built, signals it needs attention)
   or `--primary` like other links (DESIGN.md).
