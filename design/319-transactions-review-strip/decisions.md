# Design decisions: phone Transactions review strip

- Design issue: #319; covered build issues: #318
- Revision: 1; replaces: none (changes the phone review chip from #294; reuses notice a from `design/309-budget-year-cards/`)
- Maker: claude-bridge/claude-opus-5-5, medium thinking

## Choice and approval
- Approved version: **A, `filters`** (now `index.html`), with Date as a calendar icon button and "Clear all" inside the pinned toolbar. Robert, 2026-10-12: "Approved." Approval here prepares the PR; Robert's merge approves the design for building.
- Reason: Robert chose the standalone Filters button ("That's the only version I want to use now."); I had recommended B. His Date-icon comment removed A's truncation cost.

Confirmed so far (Robert, 2026-10-12; see `brief.md`):
1. The strip scrolls away; it isn't pinned ("It should scroll away.").
2. One line, "**45 transactions** need review" … "Review ›"; the whole strip opens Review; counts as "1,234" ("I like your suggestion.").
3. Strip directly under the toolbar line, "Clear all" under the strip ("That sounds like an acceptable approach for now.").
4. Two versions for the freed space ("The two sound fine for now.").

Round 2 (Robert, 2026-10-12):
- He first said "I actually like version B better. I put some comments on it." The comments were on `filters.html` (A); asked to clarify (#3), he answered: "Whichever the /filters.html version is. That's the only version I want to use now."
5. Freed space: **A, `filters`** (above). I had recommended B.
6. Hide the strip in Select mode: **yes** ("yes, agreed with hiding the strip when selecting transactions").
7. "Clear all" between the toolbar and the strip: **yes** ("Yes, do it."), from comment cmt_aa19d458.
8. Date as a calendar icon button in A: from comment cmt_db9c6c40, confirmed by #5's answer.

Round 3 (Robert, 2026-10-12):
9. Drop B: **yes** ("9. Drop B."), after being told what only B had (below).
10. "I'm almost happy with filters.html, but the Clear all is below the gray divider line but it should be above it. The gray divider line should move down so it's still touching the review strip." Change: "Clear all" is now the toolbar's last line inside the pinned header, above the divider; the strip always touches the divider. Consequence: "Clear all" stays pinned while scrolling (today it scrolls away). Applied in search mode too.

## Alternatives
Complete evidence for both versions as they stood when B was dropped (8 states × light/dark × 390/1440, with manifest) is in `screenshots/all/`. They differed on one decision (#5).
- **A, `filters`:** a standalone Filters icon button after search, with today's primary border and count badge when filters apply. Only A has filters one tap away from the row and their count visible without opening search. Cost: a fuller row, so long Date labels truncate ("Sep 1…").
- **B, `nothing`:** no extra control; Filters stays inside the expanded search only (today). Only B keeps the row quieter and shows long Date labels in full ("Sep 12 – Oct …" at 390). Cost: filters are two taps away; applied filters show only as the search button's primary border.
- B dropped. What it lost (told to Robert before the drop): no Filters button in the row, and the date range shown as readable text rather than an icon. Robert confirmed: "9. Drop B."

## Independent critique
- Reviewer: GPT-5.6 Terra (openai/gpt-5.6-terra, medium thinking), routed with `node /git/maestro/routing/route.ts role checker --maker claude-bridge/claude-opus-5-5`.
- Command: `node /git/maestro/scripts/read-only-run.ts <worktree> review /git/maestro/skills/design-feature/reviewer-prompt.md "Design: <folder>. Images and manifest: /tmp/design-review-22Woyy/versions. ..." -- --model openai/gpt-5.6-terra --thinking medium` (exit 0, worktree unchanged).
- Verdict: FIXES. All 64 images (2 versions × 8 states × 2 themes × 2 widths) readable and passing; strip follows the #309 notice; versions genuinely differ.
  1. `decisions.md` was still the template. Fix: this record.
  2. "Opens Review" is a toast in the prototype, not a proven destination. Fix: `brief.md` marks `/reviews` as a build requirement the build verifies.
- Re-check of fixes 1–2 (same reviewer and command, fixes only): PASS.
- Noted limits: the 1440 images show the framed phone design and don't prove desktop is unchanged (the build does, per `brief.md`).

## Comments and changes
- cmt_db9c6c40, `versions/filters.html`: "This date selector text is almost fully hidden. There's no point in even making it text. The date selector should just mirror the search and filter buttons and show a calendar icon instead. Color and border blue if a filter is selected." Resolution: in A, Date is an outline icon button (calendar icon, the same as the Date button's existing icon), primary border and icon when a range is set; accessible name "Date" or "Date: <range>".
- cmt_aa19d458, `versions/filters.html`: "The Clear all button seems out of place below the Review strip. It should probably be between the buttons and the strip." Resolution: "Clear all" directly under the toolbar line at today's spacing; the strip under it, still full width. With no Clear all, the strip touches the toolbar line as before. Applied to both versions.

## Experiment
None.

## Open items
None affecting the approved scope.

## Build handoff
The merged folder/revision is the feature authority; DESIGN.md and the live site govern the site-wide look.
- Approved file `index.html`, evidence `screenshots/approved/` (8 states × light/dark × 390/1440, with manifest). The 1440 images show the phone design framed; desktop Transactions must not change, proven by before/after desktop captures.
- The strip reuses the joined notice built in #306 (not a copy of its styles), as one line.
- Phone toolbar row: search, Filters (icon, count badge, primary border when applied), Date (calendar icon, primary border/icon when a range is set, accessible name with the range), Sort, Select (bulk editors only). Filters also stays inside the expanded search.
- "Clear all" moves from below the pinned toolbar into it (last line, above the divider), in row and search modes; it is now pinned. The strip sits below the divider and scrolls away.
- No strip when the count is 0, while it loads or fails, or in Select mode.
- Final offline proof of `index.html` (2026-10-12): opened from `file://` with network emulated offline; no network resources, fonts loaded, `data-state`/`data-theme` matched the URL.
