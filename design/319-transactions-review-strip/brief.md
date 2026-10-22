# Design: phone Transactions review strip

- Design issue: #319
- Revision: 1
- Replaces: none. Changes the phone review chip from #294 (PR #316); reuses the joined notice approved in `design/309-budget-year-cards/` (notice a, built in #306).
- Source plan: #318

## Job and audience
A household member opens Transactions on their phone. Today the count of transactions waiting for review is an amber chip at the right end of the toolbar row. Robert (2026-10-12) wants it as "a strip that's below all of these options in a yellow bar ... that spans the whole width of the screen and ... touches the line below it", which "would probably look cleaner" and frees room in the toolbar row. Tapping it still opens Review.

## Covers
| Build issue | Part of this feature | Out of scope |
| --- | --- | --- |
| #318 | Phone review strip under the toolbar; what fills the freed toolbar space; its order with "Clear all"; Select mode, search open, members, zero/one/large counts | Desktop toolbar; the Review page toolbar; Budget's notice (#306); Filters sheet contents (#307) |

## Boundaries and visual authority
- `DESIGN.md` and `.github/design-system.jsx` govern the look. The strip reuses the Budget joined notice from `design/309-budget-year-cards/` (notice a): full width, `color-mix(--warning 12%, --surface)` background, a 1px `color-mix(--warning 30%)` bottom border, `--warning` 13px text, the same warning icon and "›" link treatment. It is one line here instead of two (Robert #2). The build reuses #306's component rather than copying its styles (#318 validation).
- Phone only; desktop Transactions is unchanged. At 1440 the prototype shows the phone design in a 390×844 frame; those images are presentation only, and the build proves desktop is unchanged with before/after captures.
- The toolbar row keeps today's buttons (search, Date, Sort, Select for bulk editors) and behaviour. Filters stays inside the expanded search field in both versions.
- New element: none. Version A's standalone Filters button is an existing outline icon button with the existing count badge.

## States, themes and content
| State slug | Role / situation | Content | Actions / feedback |
| --- | --- | --- | --- |
| normal | Owner, 45 waiting | Strip: "**45 transactions** need review" … "Review ›" | Tap anywhere on the strip: opens Review (`/reviews`, as the chip does today). Build requirement: the prototype only shows a stand-in message, so the build verifies the destination |
| one | Owner, 1 waiting | "**1 transaction** needs review" | Same |
| large | Owner, 1,234 waiting | "**1,234 transactions** need review" (five-character count) | Same; fits one line at 390 |
| none | Owner, nothing waiting | No strip; list sits under the toolbar as today | — |
| filtered | Owner, date "Sep 12 – Oct 12" plus 2 filters | "Clear all" right-aligned as the toolbar's last line, above its bottom divider, so it is pinned with the toolbar (Robert #9, revising #3 and #7). The strip stays joined to the divider. Filters button with primary border and "2" badge; Date is a calendar icon button with primary border and icon, named "Date: Sep 12 – Oct 12" (Robert #8) | Clear all clears and hides itself; the toolbar shrinks back to one row |
| search | Owner, search open | Search field (Filters inside) + close; "Clear all" under it inside the toolbar when a search or filter is active; strip stays under the toolbar | Close returns to the row |
| select | Owner, Select mode | Today's Select toolbar; **no strip** while selecting (tapping it would leave the page and lose the selection) | Cancel brings the strip back |
| member | Limited member (no bulk edit) | Row without Select; strip shows. Members can open Review; without edit permission it is view-only (existing behaviour) | Same as normal |

- Loading and error: the count is loaded separately and fails silently today. While it loads, or if it fails, no strip shows; the page is otherwise unchanged. No separate states.
- Scrolling: the strip scrolls away with the list; only the toolbar stays pinned (Robert #1).
- Themes: light and dark. Widths: 390×844 is the design; 1440 is presentation only (above).
- Accessibility: the strip is one link, at least 44px tall, named "45 transactions need review. Review"; visible focus ring. Version A's Filters button is named "Filters" or "Filters, 2 applied".

## Host snapshot and offline proof
- Source: `origin/feature/platform-retheme` at e1e91ce, verify-ledger skill (`.pi/skills/verify-ledger/SKILL.md`).
- Commands: `npm ci`; `node .pi/skills/verify-ledger/run.mjs launch "$EVIDENCE"` (Doctor PASS); signed in as john/password1; `/transactions` (All Time, 45 waiting for review). `snapshot.mjs capture` for light/dark × 390/1440 (theme via the sidebar "Dark mode" control), `snapshot.mjs assemble ... tx`; `run.mjs cleanup` PASS (scratch folder removed).
- Offline proof: `host.html` (removed from the final folder once `index.html` had its own offline proof) opened from `file://` in a fresh browser with network emulated offline, at 390 and 1440 in both themes. It rendered with fonts and logos; no resources were requested over the network.
- Versions are built from the light-390 capture (`tx-light-390.html`) by a one-off build script: the phone toolbar block (`div.w-full.flex.flex-col.gap-2` inside the sticky page header) is replaced by `#proto-toolbar`, and `#proto-below` is inserted before the list card (`div.bg-surface.rounded-card`). Everything else (app bar, list rows) is the capture. The CSP gains only `script-src 'unsafe-inline'`.
- Host parts used: `#mobile-bar-title span`, the sticky page header, the phone toolbar row, `[aria-label="Manual import"]` and `[aria-label="Add transaction"]` (hidden in Select mode), the list card.

## Confirmed decisions
1. The strip scrolls away with the page; it isn't pinned (Robert, 2026-10-12: "It should scroll away.").
2. One slim line, "**45 transactions** need review" left and "Review ›" right; the whole strip opens Review; large counts as "1,234" (Robert: "I like your suggestion.").
3. Strip directly under the toolbar line, then "Clear all" under it (Robert: "That sounds like an acceptable approach for now."). Revised by #7.
4. Compare two versions for the freed space: A, a standalone Filters button; B, nothing extra (Robert: "The two sound fine for now.").

5. Freed space: version A, the standalone Filters button (Robert: "Whichever the /filters.html version is. That's the only version I want to use now.").
6. Hide the strip in Select mode (Robert: "yes, agreed with hiding the strip when selecting transactions").
7. "Clear all" sits between the toolbar and the strip (Robert, comment cmt_aa19d458; confirmed "Yes, do it."). Refined by #9.
8. In A, Date is a calendar icon button like search and Filters, primary border and icon when a range is set (Robert, comment cmt_db9c6c40). Trade-off told to Robert: the row shows that a range is set, not which one.
9. "Clear all" moves inside the pinned toolbar, above its divider, and the divider moves down so it still touches the strip (Robert: "the Clear all is below the gray divider line but it should be above it. The gray divider line should move down so it's still touching the review strip."). Consequence: "Clear all" now stays pinned while scrolling, where today it scrolls away.
10. Version B dropped (Robert: "9. Drop B.").

## Real-site experiment
None.

## Open decisions
None.
