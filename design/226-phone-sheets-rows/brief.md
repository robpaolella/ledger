# Design: Phone, part 2 (sheets, touch targets, rows)

- Design issue: #226
- Revision: 1
- Replaces: none
- Source plan: retheme plan agreed 2026-10-08; phone audit `work/108-phone-audit/report.md` (#108), Areas 2, 3, 5 and 6

## Job and audience
Everyday Ledger tasks must be fully usable on a phone (DESIGN.md "Phone checklist", PRODUCT.md
"Phone support"). The audit found the phone app usable but awkward in three places: details and
confirms open as side drawers or centred pop-ups rather than the bottom sheets every other form
uses; many controls are 20–36px tall; and rows squeeze descriptions behind a monospace account
name, with small Budget amounts, a cramped trends chart, a 1,000-row Reports list and a tall
pinned Transactions toolbar.

Who arrives: any household member (owner, admin, member) checking or categorizing transactions,
working through Review, checking the budget, recurring bills, reports and investments on a phone.
Success: every detail and confirm feels like the rest of the phone app (sheet, handle, swipe down,
pinned buttons), everything tappable is easy to hit, and row names and amounts read clearly.

## Covers
| Build issue | Part of this design | Out of scope |
| --- | --- | --- |
| #228 | Sheets (audit Area 2: F07–F14): Transactions detail, Review detail, Recurring detail, Split editor, Approve all, Filters / Date / Sort pop-ups, Add transaction's Account list | F01 Split category and F05 rule prompt (fixed, #218); bulk edit on phones (#109 design) |
| #229 | Touch targets (Area 3: F20–F27): Budget Month, Dashboard, Transactions toolbar, Settings → Categories, Accounts, Settings switches, Bank sync and Merchants buttons, Reports / Recurring / Review / Investments toolbars | New-control sizes in #109's design (already ≥44px) |
| #230 | Rows and numbers (Area 5: F36–F40, F42): row truncation, Budget and day-total amount sizes, trends and Investments charts, Reports list length, pinned Transactions toolbar, Review toolbar | Budget Year, Timeline, holdings (#109) |

Area 6 (F02, F15) needs no design: both were fixed by #205 and #215 (closed); confirmed in the
states below (member detail without Delete; Accounts unchanged).

## Boundaries and visual authority
- PRODUCT.md (roles, money rules, phone support), DESIGN.md (tokens, Phone checklist, shared
  components), `.github/design-system.jsx`, `.github/mobile-prototype.jsx`.
- Reuse: `ResponsiveModal` / `BottomSheet` (handle, scroll body, pinned footer, scrim, Escape,
  downward drag), `FilterPopover`, `DateRangePopover`, `Popover`, `ListRow`, `SegmentedControl`,
  `Switch`, `Button`, `Money`, `MobileHeader` back arrow (as Account detail), existing toasts.
- Desktop (1440) stays as it is, except: Approve all and the Split editor use the standard
  `ResponsiveModal` at both widths (decision 4), and the Reports list shows 50 at a time
  (decision 3). Desktop states prove the rest is unchanged.
- Don't contradict: `design/109-phone-tables-forms/` (rev 1/2), `design/104-settings/`,
  `design/106-uncategorized/`, `design/231-account-filters/`, the #218 Split and rule-prompt fixes.
- No server, permission or data change. Existing wording stays, apart from decision 9.
- **New kinds of element Robert is asked to approve:** the "Show 50 more" button on Reports;
  whichever of the version options below he picks (detail full page, wrapped filter tabs,
  edge-fade scroll cue, compact one-row toolbar, toolbar that hides on scroll).

## Confirmed decisions (Robert, 2026-10-11, this herdr tab)
1. Scope as listed in Covers; desktop unchanged unless stated. Settings tap targets (Categories,
   switches, Bank sync and Merchants buttons) are in scope; #104 left those panels unchanged.
2. Touch targets: controls that are already boxes (segmented controls, chips, Budget planned-amount
   buttons, toolbar buttons, Bank sync / Merchants row buttons) grow to 44px tall on phones;
   text links ("Edit", "Create group", "Create category", "Most recent", "Needs your attention",
   "23 assigned to you →", "Expand all", "Show 1 unbudgeted") and switches keep their look with an
   invisible 44px tap area. Drag handles get a 44px tap area.
3. Reports transaction list: the 50 most recent, then "Show 50 more" (adds 50), at phone **and**
   desktop. The header line reads "50 of 412 transactions"; today's yellow "Showing the 1,000 most
   recent of …" banner goes. The main Transactions list keeps loading as you scroll (Robert:
   "The primary Transactions list expands as you scroll which I'd like to keep there.").
4. Approve all and the Split editor use the standard `ResponsiveModal` at both widths: bottom sheet
   with pinned buttons on phones, standard modal header and close button on desktop.
5. Phone amount sizes: Budget planned and remaining 14→15px; Budget category detail 13→15px;
   Transactions day-group totals 12→13px (header labels, a step below row amounts).
6. Trends chart (Reports → Trends) and Investments chart on phones: about 220px tall; month labels
   thinned so they don't crowd ("Jan, Mar, May…"); the last label never cut off; lines keep their
   category colours and the legend chips name each line. Desktop unchanged.
7. Roles and states: owner by default (admin identical on these screens, per the audit);
   Everyday member sees the transaction detail without Delete; View-only member's transaction rows
   don't open (as today, not shown), Review detail is read-only and there is no Approve all.
   Empty: Reports "No transactions in this period."; Filters search with no match. Loading: only
   the Reports "Show 50 more" (details open instantly from the list). Errors: existing toasts.
8. Synthetic content with extremes: "Larkspindle Financial Services" on "Jane's Emergency Savings
   (4417)"; $12,345.67 beside $4.50; a 4-way split; a Review row with "Low-confidence category"
   and a note; 412 transactions in the Reports range; "Other Auto/Transportation" on Budget.
9. Wording: existing wording everywhere; new text only "Show 50 more" and "50 of 412 transactions".

## Questions the versions answer (Robert picks each separately)
| # | Decision | Version A | Version B | Version C |
| --- | --- | --- | --- | --- |
| V1 | Transaction, Review and Recurring detail on phones | Bottom sheet (handle, scrim, swipe down, up to 92% of the screen) | Full page with a back arrow in the app bar (like Account detail) | Bottom sheet (as A) |
| V2 | Filters and Date on phones | Bottom sheets; tabs and presets wrap onto two lines so all show | Anchored pop-ups fitted on screen; the clipped tab strip and presets get an edge fade and a chevron to show they scroll | Anchored pop-ups (as B) |
| V3 | What gives way in a narrow row | Account shrinks to its last four ("•• 4417") in the normal font | Account keeps its name in the normal font, capped at 40% of the row, truncated | Account leaves the phone row (shown in the detail); category alone under the name |
| V4 | Pinned Transactions toolbar (173px) and Review toolbar | One 44px row: search icon (expands on tap), Date, Sort, review chip | Toolbar hides while scrolling down and returns on scroll up; Review's Approve all moves into the app bar | Only search stays pinned; Date, Sort and the review chip scroll with the list; Review as A |

Sort is the same in every version: a bottom sheet of choices on phones (44px rows, a tick on
the current one; tapping applies and closes).

F14 (Add transaction → Account list) needs no design: the Account field is a native `<select>`
(`TransactionsPage.tsx`, `Field label="Account"`). The clipped list in the audit is the desktop
browser drawing a native list at 390px; real phones use the system picker. The field itself
already truncates long names with an ellipsis. To be confirmed with Robert (found at capture,
2026-10-11); the `tx-add-account` state is dropped.

## States, themes and content
Themes `light`, `dark`; 390×844 and 1440×900. Each state opens the screen it names; the prototype
bar switches state and theme. Owner (John Sample) unless stated. Desktop shows today's layout.

| State slug | Screen / role | Content and wording | Actions / feedback |
| --- | --- | --- | --- |
| `tx-detail` | Transactions → Larkspindle Financial Services detail | $12,345.67, Jane's Emergency Savings (4417) | Close by handle / scrim / back (per V1) |
| `tx-detail-member` | Everyday member, same detail | No Delete transaction | — |
| `tx-split` | Split editor, 4 legs | Existing split wording | Cancel / Save split pinned |
| `review-detail` | Review → Larkspindle Books | "Low-confidence category", note "Check this transaction" | Mark reviewed |
| `review-detail-viewonly` | View-only member | Fields read-only, no Mark reviewed | — |
| `recurring-detail` | Recurring → Car insurance detail | Existing detail | Edit |
| `approve-all` | Review → Approve all | Existing confirm wording | Cancel / Approve all pinned |
| `tx-filters` | Transactions → Filters, Categories tab | All four tabs reachable | Clear / Cancel / Apply |
| `filters-no-match` | Filters, search "zzz" | Existing no-match wording | — |
| `tx-date` | Transactions → Date | All presets reachable | Clear / Cancel / Apply |
| `tx-sort` | Transactions → Sort | Existing sort options | Tap applies |
| `transactions` | Transactions list | Long names, $12,345.67 and $4.50, 13px day totals | Toolbar per V4, rows per V3 |
| `reviews` | Review list | Toolbar per V4, "Low-confidence category" reasons | — |
| `budget-month` | Budget → Month | "Other Auto/Transportation"; 15px amounts; 44px buttons | — |
| `budget-category` | Budget → a category | 15px amounts | — |
| `dashboard` | Dashboard | Links with 44px tap areas | — |
| `accounts` | Accounts | 44px period chips, Totals/Percent, Add, edit pencil | — |
| `settings-categories` | Settings → Categories | 44px Edit / Create group / Create category / drag handle | — |
| `settings-bank` | Settings → Bank sync | Switches with 44px tap area; 44px Edit / Reconnect | — |
| `settings-merchants` | Settings → Merchants | 44px Edit; Rules Delete 44px | — |
| `reports-trends` | Reports → Trends | 220px chart, thinned labels, 44px Breakdown/Trends and segmented controls | — |
| `reports-list` | Reports → Transactions list | "50 of 412 transactions" | Show 50 more |
| `reports-list-more` | After tapping, loading | "Show 50 more" in its loading state | — |
| `reports-list-empty` | Range with nothing | "No transactions in this period." | — |
| `recurring-list` | Recurring | 44px tabs and toggle | — |
| `investments` | Investments | 44px Market/Allocation; chart labels not cut | — |

Not applicable: page loading and failure states (unchanged by this design; existing patterns);
admin vs owner (identical on these screens per the audit); View-only transaction rows (no
visible change, they don't open).

Accessibility: every sheet keeps focus inside, returns it to the opener on close and closes on
Escape; scroll cues are visual only, with every tab still reachable by keyboard; tap areas never
overlap; amounts ≥15px in rows, tabular, never truncated.

## Host snapshot and offline proof
Captured 2026-10-11 from `feature/platform-retheme` at `2665824` (launch month Oct 2026, owner
John, synthetic verify-ledger data, logos off via `LEDGER_LOGODEV_TOKEN_FILE=/nonexistent/none`)
with `.pi/skills/verify-ledger` Launch → Doctor PASS → page-snapshot recipe (light/dark ×
390×844/1440×900), then Cleanup (scratch `/tmp/ledger-verify-orHBeN` gone, child stopped).
Twenty single-file hosts in `hosts/` (~75 MB, **never committed**; removed at freeze):

| Host | Route / state |
| --- | --- |
| `transactions` | `/transactions` |
| `txdetail` | row "Mossquill Pet Clinic" opened (drawer) |
| `txfilters`, `txdate`, `txsort` | Filters, Date, Sort opened |
| `txsplit` | detail → Split |
| `reviews`, `reviewdet`, `approveall` | `/reviews`; row "Larkspindle Finance" opened; Approve all |
| `recurring`, `recdetail` | `/recurring`; "Health plan premium" opened |
| `budget`, `budgetcat` | `/budget` Month; Fuel category detail |
| `dashboard`, `accounts`, `investments` | `/`, `/accounts`, `/investments` |
| `reports` | `/reports` → Trends (list at the bottom) |
| `setcategories`, `setbank`, `setmerchants` | `/settings?panel=categories|bank|merchants` |

(`reviewdetail` in the evidence folder is a failed click; `reviewdet` replaces it.)

Offline proof (2026-10-11): app stopped, fresh browser session `d226-offline`, network Offline:
all 20 hosts × light/dark × 390/1440 opened from `file://` (80 images in `/tmp/d226-offline/`,
none blank; spot-checked against live captures). A fetch to an owned local server
(`127.0.0.1:18226`) failed with `net::ERR_INTERNET_DISCONNECTED` and the server's access log shows
no browser request. Requests were only `file:` and `data:`. Server and browser stopped after.

Host parts used: every host's main column (`#root .app-shell-height > div.flex-1`) and the sidebar
(`#root aside`, from `transactions` 1440); the overlay hosts' added `fixed`/`absolute` elements (the
drawers, popovers, scrims and centred dialogs). Extracted (light markup, inline category colours
mapped back to `--c-*` tokens, long lists capped) by `/tmp/d226-build/extract.js` into
`/tmp/d226-build/frag/` (`<page>-m|d.html`, `ov-<host>-m|d.html` with parent paths).

## Real-site experiment
None.

## Open decisions
V1–V4 (answered by the versions).
