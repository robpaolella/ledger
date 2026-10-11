# Design: Phone, part 1 (wide tables and forms)

- Design issue: #109
- Revision: 1
- Replaces: none
- Source plan: retheme plan agreed 2026-10-08; phone audit `work/108-phone-audit/report.md` (#108)

## Job and audience
Everyday Ledger tasks must be fully usable on a phone, and setup/heavy tasks must work and be
readable, even if simpler (DESIGN.md "Phone checklist"). The phone audit found screens that are
unreadable or unreachable at 390px: wide tables squeezed or scrolled sideways, a calendar that
can't show names or amounts, a two-step setup that leads with a QR code the phone can't scan,
an Import Next button that scrolls away, a footer that runs off the edge, and no bulk edit.

Who arrives: any household member (owner, admin, member) checking the budget, reports,
recurring bills or investments on their phone, and the owner/admin doing setup chores
(two-step sign-in, CSV import, merchant tidying, recategorizing many transactions).
Success: every number is readable without sideways scrolling or overlap, and every task the
desktop offers can be completed on a phone.

## Covers
| Build issue | Part of this design | Out of scope |
| --- | --- | --- |
| #110 | Wide tables (audit Area 1 for design: F04, F17, F18, F19): Budget Year, Reports Timeline, Investments holdings, Recurring calendar | F03 Import review (#206, merged), F16 All recurring (#219) |
| #207 | Budget Year on phones (F04); built in or with #110 as the conductor records | Budget Month tap targets (#226) |
| #227 | Forms (audit Area 4: F30–F35): two-step setup key first, Ollama/SimpleFIN keyboards, Edit merchant footer, Import steps 1–2, bulk edit on phones | F06 (#209, merged #223), F29 Recurring sheet (#214) |

## Boundaries and visual authority
- PRODUCT.md (roles, money rules), DESIGN.md (tokens, Phone checklist, "Wide tables become card
  rows"), `.github/design-system.jsx`, `.github/mobile-prototype.jsx`. Desktop (1440) stays as
  it is everywhere; desktop states in this design prove that.
- Reuse: `ListRow`, `BottomSheet`/`ResponsiveModal` (handle, scroll body, pinned footer),
  `SegmentedControl`, `Button`, `ConfirmDeleteButton`, `TotpCodeInput`, `MerchantPicker`,
  `Calendar`, `Money`, existing card/section-header patterns, existing loading and error patterns.
- Don't contradict: #206 Import review cards, #219 Recurring catalogue, #214 Recurring sheet,
  #209 amount fields, `design/104-settings/` (Settings on phones). Part 2 (#226) owns sheets
  vs drawers, touch targets elsewhere, row truncation and numbers.
- **New kinds of element Robert is asked to approve:** the 12-month phone pattern (one of the
  three versions), the calendar's day dots with a selected-day list, the phone selection mode
  (Select button, tick boxes, pinned selection bar), the "Add to authenticator app" button,
  the pinned Back/Next bar on Import step 2, and the in-form "Merge & delete" row.
- Server, permissions and data are unchanged.

## Confirmed decisions (Robert, 2026-10-10, this herdr tab)
Brief confirmed by Robert on 2026-10-11 ("1. Confirmed.").
1. Scope as above; desktop unchanged unless stated. F31 needs no visuals: the builder sets the
   Ollama address to `type="url"` / `inputMode="url"`, both Ollama fields and the SimpleFIN
   setup token/access URL to `autoCapitalize="off"`, `autoCorrect="off"`, `spellCheck={false}`,
   and the access URL to `inputMode="url"`.
2. Budget Year and Reports Timeline use the same phone pattern. Versions compare:
   **A** one month at a time (month switcher in the card; rows show the month's amount and the
   year/range total); **B** one row per category with its total, tapping opens its months as a
   4-column grid; **C** keep the grid with a pinned category column and months scrolling
   sideways with an edge fade (an exception to DESIGN.md's no-sideways rule if chosen).
3. Budget Year on phones keeps desktop's tap-to-edit (opens the existing Edit budget sheet),
   with the same locks: past months of the current year and people without `budgets.edit`.
4. Recurring calendar on phones: each day shows small dots (income green, expenses in the
   category colour); tapping a day selects it and lists its items below as rows (name, account,
   amount); a row opens the existing detail; today is selected on load; an empty day reads
   "Nothing due on Oct 14." Desktop calendar unchanged.
5. Investments holdings on phones: rows grouped by asset class; left the symbol over
   "name · quantity × price", right the value over "▲ 4.2% · 12.3% of portfolio"; no tap action
   (as desktop); "By asset class" sits under the title.
6. Bulk edit on phones: a "Select" button in the phone toolbar (only with
   `transactions.bulk_edit`); rows show tick boxes with a "Select all" row; a pinned bar shows
   "3 selected · $142.50" with Edit and Delete; Edit opens a bottom sheet with Merchant,
   Category and Date (as desktop); Delete asks "Delete 3 transactions?" before anything happens.
7. Two-step setup on phones (Settings sheet and the required-setup page): "Add to
   authenticator app" (an `otpauth://` link) first, then "Or copy the setup key" with Copy, then
   "Show QR code (to scan from another device)"; code boxes and "Verify and enable" as today.
   Desktop keeps the QR first. Under the button, a fallback line: "No app opened? Copy the
   setup key below instead." (added 2026-10-11, Robert: "Yes.")
8. Import on phones: one-line step indicator "Step 2 of 3 · Map columns"; step 1 shows a
   "Choose CSV file" button (desktop keeps drag and drop); step 2 Back/Next in a pinned bottom
   bar; sign-convention choices full width with wrapping text; the 5-row preview as rows.
9. Edit merchant on phones: "Merge & delete" moves from the footer into the bottom of the form
   as a red row with a short explanation; the footer keeps Cancel and Save changes.
10. States as listed below, light and dark, 390 and 1440. Loading and errors use the app's
    existing patterns and are shown once (Budget Year).
11. Synthetic content with extremes: long names ("Other Auto/Transportation", "Vanguard Total
    Stock Market ETF"), $12,345.67 beside $4.50, a 4-item day, 25 rows in bulk select.
12. Accessibility: calendar dots never rely on colour (day labelled "Oct 1, 3 items"; list names
    each item); all new controls ≥44px and keyboard reachable with a visible focus ring;
    amounts ≥15px in rows, tabular, never truncated.

## States, themes and content
Themes `light`, `dark`; 390×844 and 1440×900. Each state opens the screen it names; the
prototype bar switches state/theme. Role is owner (John Sample) unless stated. Versions differ
only on decision 2 (Budget Year and Timeline states); other screens are identical across them.

| State slug | Screen / role | Content and wording | Actions / feedback |
| --- | --- | --- | --- |
| `budget-year` | Budget → Year 2026 | Income, Expenses, groups with subcategories incl. "Other Auto/Transportation"; $12,345.67 to $4.50 | Tap an editable amount → Edit budget sheet (shown as a note); past months locked |
| `budget-year-member` | Member without budget edit | Same data | Amounts not tappable |
| `budget-year-empty` | Year 2027, nothing planned | Dashes; "Nothing planned for 2027 yet." | — |
| `timeline` | Reports → Category breakdown → Timeline, This year | Groups, Jan–Oct, Total | Expand a group |
| `timeline-drill` | Drilled into Daily Living | Its subcategories; the existing clear-drill pill | — |
| `timeline-weekly` | Range "This month" | Wk 1–Wk 5 | — |
| `timeline-long` | Custom range Apr 2025–Sep 2026 | 18 months, labels like "Jan '26" | — |
| `holdings` | Investments | US Equity, International, Bonds, Cash; "Vanguard Total Stock Market ETF" | No tap action |
| `holdings-empty` | No investment accounts | Existing "No holdings yet" message | — |
| `calendar-today` | Recurring → Calendar, Oct 2026 | Today (10th) selected | Tap a day / row |
| `calendar-busy` | Oct 1 selected | 4 items: Mortgage, Paycheck (John), Paycheck (Jane), Car insurance | — |
| `calendar-empty-day` | Oct 14 selected | "Nothing due on Oct 14." | — |
| `bulk-select` | Transactions, Select mode, nothing ticked | 25 rows | "Select all", Cancel |
| `bulk-selected` | 3 ticked | "3 selected · $142.50" | Edit, Delete |
| `bulk-edit` | Edit sheet | "Edit 3 transactions"; Merchant, Category, Date | Apply changes (disabled until a field is set) |
| `bulk-delete` | Delete confirm | "Delete 3 transactions?" | Cancel, Delete |
| `bulk-member` | Member without bulk edit | No Select button | — |
| `twofa-key` | Settings → Security → Enable two-factor | Key first | Add to authenticator app, Copy |
| `twofa-qr` | QR shown | "Hide QR code" | — |
| `twofa-error` | Wrong code | "That code didn't work. Try the newest one." (today the server says "Invalid verification code. Please try again."; build changes the shown wording) | — |
| `twofa-required` | Required-setup page (admin, sign-in) | Same key-first order | Auto-submits at 6 digits (as today) |
| `import-upload` | Import → CSV step 1 | "Choose CSV file" | — |
| `import-map` | Step 2 | Mapping, sign choices, preview rows | Pinned Back / Next |
| `merchant-edit` | Settings → Merchants → Edit merchant | "Larkspindle Finance" | Merge & delete row; Cancel / Save changes |
| `loading` | Budget Year loading | Existing loading pattern | — |
| `error` | Budget Year failed | Existing error pattern | Try again |

Not applicable: first-run setup and the sign-in code step (no wide table or form change);
admin vs owner (identical on these screens per the audit; member differences are covered).

## Host snapshot and offline proof
Captured 2026-10-11 (launch month Oct 2026, owner John, synthetic verify-ledger data) with
the verify-ledger Launch → Doctor (PASS) → page-snapshot recipe, light/dark × 390×844/1440×900,
then Cleanup (scratch folder and server gone). Ten single-file hosts in `hosts/` (not committed:
~51 MB; removed at step 8 once final offline proof is kept):

| Host | Route / state |
| --- | --- |
| `budgetyear` | `/budget` → Year (2026) |
| `timeline` | `/reports` → range This month → Category breakdown Timeline (Year-to-date crashed the capture: ~1,500 logo images) |
| `investments` | `/investments` (holdings table below the chart) |
| `calendar` | `/recurring` → Calendar, Oct 2026 |
| `transactions` | `/transactions` |
| `security` | `/settings?panel=security` (two-step sheet not captured: the recipe forbids capturing a QR code; versions build the sheet from the Edit merchant sheet's markup) |
| `merchantedit` | `/settings?panel=merchants` → Larkspindle Finance → Edit merchant |
| `importupload` | `/import?tab=csv` step 1 |
| `importmap` | step 2, synthetic `sample-checking.csv` (6 rows) into John's Checking |
| `authshell` | `/login` (AuthShell, base for the required two-step setup page) |

Offline proof: with the app stopped, a fresh browser on network Offline opened every host
at both widths and themes (40 images); each matches its live capture apart from focus rings
and scroll position (not preserved, as documented). Requests were only `file:` and `data:`.
Still owed: the strict offline check (an owned local server request reporting
`net::ERR_INTERNET_DISCONNECTED`); from a `file:` page the probe only said "Failed to fetch".

## Real-site experiment
None.

## Open decisions
- 13. Which 12-month pattern (A, B or C), after seeing the versions.
