# Handoff: design session for #106 (covers #107)

Temporary working note; delete it before the design PR.

Next session: Claude Opus 5.5, medium thinking (`route.ts role design-feature`).
Start it in this worktree: `cd /git/ledger-worktrees/docs-106-design-uncategorized && pi --model claude-bridge/claude-opus-5-5 --thinking medium`
Prompt: "Read design/106-uncategorized/handoff.md, then follow /git/maestro/skills/design-feature/SKILL.md from step 2's interview for #106 (covers #107) with Robert. Base: feature/platform-retheme."

## Done (step 1, 2026-10-10)
- Design issue is #106 itself (handed over, not created). Labels now `status:in-progress`, risk:low, tier:hard.
- Worktree `/git/ledger-worktrees/docs-106-design-uncategorized`, branch `docs/106-design-uncategorized` from `origin/feature/platform-retheme` (ef3032a). Branch upstream currently points at the base; push with `-u origin docs/106-design-uncategorized` at ship time.
- `## Dispatch` comment posted on #106 (Base `feature/platform-retheme`, folder `design/106-uncategorized/`).
- #107 was already `status:needs-design` and blocked by #106 (also #88, #133). No changes needed.
- Open PR on the base: #197 (BankSyncPanel/DailySyncCard). No overlap with this design.
- Maker for critique: claude-bridge/claude-opus-5-5.
- Not yet done: template files (brief.md, decisions.md, design.json) not copied; no host snapshot.

## What the code does today (read on the base branch)
- **Budget** (`BudgetPage.tsx`, server `routes/budgets.ts`): sections Income and Expenses; desktop table (Category / Planned / Actual / Remaining) with a summary rail (Left to budget card; Income and Expenses planned-vs-actual bars); phone has one card per group with Planned / Remaining pills. "Left to budget" = planned income − planned expenses, so an Uncategorized line affects actuals only, never Left to budget. A line with no plan would read as "over" in red under today's Remaining rule: the design must say how its Planned/Remaining cells look.
- **Reports** (`ReportsPage.tsx`, `routes/reports.ts`): KPIs (Income, Expenses, Net, Savings rate), Breakdown flow bar (Saved + top 6 expense groups + Other, coloured by group), Trends multi-line chart, Category breakdown (Summary and Timeline, grouped by section), Transactions list (already labels rows "Uncategorized"). No separate phone layout beyond wrapping.
- **Dashboard Spending card** (`components/dashboard/cards/SpendingCard.tsx`, `/dashboard/spending-series` in `routes/dashboard.ts`): headline "$X this month" + this-month vs last-month cumulative chart. No category list, so "the line" here is only a headline/total question (e.g. a small "includes $X uncategorized · Review" note).
- Server queries join on `categories` with `c.type = 'expense'`, so `category_id IS NULL` rows (with no splits) drop out. Splits always carry a category (`transaction_splits.category_id` NOT NULL).

## Findings to raise with Robert (round 1)
1. **Review doesn't show every uncategorized transaction.** `/reviews` lists open review items only. An uncategorized transaction whose review was marked reviewed (or never flagged) never appears there, so "links to Review" can land on a page without them. Options: the build makes sure every uncategorized transaction has an open review item; or the line links to Transactions filtered to Uncategorized. Recommend: keep Review (his decision) and have #107 guarantee they're all in it, plus filter Review to the line's period/type.
2. **Which side is an uncategorized amount on?** No category means no type. Only the sign is left (positive = out, negative = in). Recommend: money out joins Expenses as "Uncategorized", money in joins Income as "Uncategorized", each its own line; this is the one place sign decides side, and PRODUCT.md "Uncategorized" should say so.
3. **Transfers risk.** An uncategorized card payment or account-to-account move would count as spending once it's in totals. Ask whether that's acceptable (it nudges people to categorize) or whether the line needs a "may include transfers" hint.

Later rounds: Budget Planned/Remaining treatment (plan "—", Remaining neutral?); placement (bottom of each section vs top; hidden at $0 vs shown at $0); colour in the Reports flow bar/trends (neutral `--text-3` like "Other", or a hatched/warning tone); phone wording; Dashboard note wording; large counts ("24 transactions"); roles (Review link for View-only members, who can see Review but not categorize?).

## Next step
Read `/git/maestro/vendor/impeccable/skills/impeccable/reference/new-work.md` (only the established-world part matters) and `.pi/skills/verify-ledger/SKILL.md`, `page-snapshot.md`, `design-states.md`. Then ask Robert round 1 above (numbered 1–3, with the recommendations), copy the templates and fill brief.md.
