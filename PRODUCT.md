# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Ledger is a browser-based application for desktop and phone, not a native mobile app.

## Users

Household members use Ledger to understand and maintain their shared finances. Account ownership and application roles are different: a financial account may have several owners, while the installation has exactly one **Owner** role.

| Role | What they must be able to do |
| --- | --- |
| Owner | Created during first-run setup; use all app capabilities, manage members and admins, and set member permissions. The owner cannot be demoted, deactivated, or deleted. |
| Admin | Use all app capabilities and manage members and their permissions. Cannot manage another admin or the owner. |
| Member | View the signed-in household finance screens and perform actions allowed by their individual permissions. Defaults allow adding/editing transactions, CSV and bank-sync imports, editing budgets, and updating balances. Other management and destructive actions require a grant. |

The 18 configurable member permissions cover transaction create/edit/delete/bulk edit, CSV import, bank-sync import, category create/edit/delete, account create/edit/delete, budget editing, balance updates, asset create/edit/delete, and SimpleFIN connection management. User management is reserved for owner/admin roles, not a grantable member permission. Owner and admin bypass individual permission checks.

Do not mistake an owner filter for a privacy boundary. Shared account transactions belong in each applicable member view; the combined household view must count them only once. Personal SimpleFIN connections, unlike shared connections, are scoped to the user they belong to.

## Product Purpose

Ledger is a self-hosted personal finance app for households: record and review money coming in and going out, compare spending with budgets, and understand net worth across balances, investments, and depreciable assets. The existing README identifies it as **“Your Money. Your Data.”** This is a description of the existing product, not a newly invented market position or a promise of financial advice.

## Operating Context

- Runs on the household's own server as a single Docker image, with SQLite persistence. Browser access requires sign-in after first-run owner creation; there are no default user credentials.
- Supports username/password sign-in and optional authenticator-based two-factor authentication with recovery codes. Preserve account recovery and security states when designing these flows.
- Desktop supports dense review and editing; phone layouts provide bottom navigation, card lists, and bottom-sheet forms rather than squeezing desktop tables into a narrow viewport.
- Transactions can be entered manually or reviewed and imported from CSV and SimpleFIN Bridge. Bank sync is user-initiated, not background polling: “automated import” in the README does not authorize scheduled fetching.
- SimpleFIN is an external service. Shared and personal connections can coexist; credentials and personal connection details must not leak between users. Do not describe self-hosting as proof that no external services are involved.
- Current currency formatters display dollar amounts with US number formatting. This is observed implementation, not a claim of multi-currency support.

## Capabilities and Constraints

### Household workflows

- **Dashboard:** financial summaries, spending breakdown, and recent transactions.
- **Transactions:** search, filters, pagination, create/edit/delete, bulk changes, and split/reimbursement handling. Preserve the distinction between the bank transaction and its allocations; changes must keep totals consistent.
- **Budget:** monthly category budget versus actual, including household-member filters and shared accounts. Negative actuals such as refunds remain visible. Over-budget emphasis belongs on actual spending and progress indicators, not the planned budget amount.
- **Reports:** annual income/expense review with expandable categories; phone users select a month for detail or view annual totals.
- **Net worth:** account balances, investment holdings, and depreciable assets. Both straight-line and declining-balance depreciation must be supported; Dashboard and Net Worth must use the same calculation rules.
- **Imports:** review categorization, duplicates, and likely transfers before importing. CSV and bank-sync paths both need these checks. SimpleFIN transaction IDs provide exact re-import protection in addition to cross-source duplicate detection.
- **Settings:** accounts (including joint ownership), grouped categories, user/permission management within the role hierarchy, connection management, and personal account/security settings.

### Money and classification rules

- Stored transaction amounts always mean **positive = money out; negative = money in**. Income versus expense is determined by `categories.type`, never by amount sign alone.
- Use `packages/client/src/lib/formatters.ts` and `fmtTransaction()` for display. Normal expenses have no sign prefix; income has `+`; expense refunds and income reversals have `-`. Refunds remain expenses, not income. A minus in the entry form reverses that category's normal direction.
- CSV signs depend on source/account type; support manual sign-convention override and normalize parentheses, currency symbols, separators, and whitespace before parsing amounts.
- Convert SimpleFIN transaction amounts to Ledger's convention. Never apply that conversion to balances, holding market values, or cost basis.
- All categories use the group → sub-category hierarchy, including income. Account ownership comes from the many-to-many `account_owners` relationship, not the legacy single-owner field.
- SimpleFIN requests are limited to 60-day ranges; split longer ranges and explain rate-limit failures rather than silently retrying or polling.

### Safety and access

- Enforce permissions on the server as well as in the UI. Hide unavailable destructive actions; disable unavailable add/edit actions; explain denied full-page features. A hidden button alone is not authorization.
- Prefer deactivation when user removal is ambiguous. Permanent user deletion requires dependency preview, reassignment of sole-owned accounts, and typed username confirmation, preserving financial records.
- Use the existing in-app confirmation pattern for ordinary destructive actions; never browser `alert()` or `confirm()`. Report action outcomes once, and keep validation/constraint messages by the relevant input or action.
- This repository is public. Designs, documentation, screenshots, and tests must use synthetic sample data only. Never open, copy into a design, or publish Robert's live financial database, account details, credentials, or recovery codes. Existing prototype examples are not verified product facts or approved data to reproduce.

## Brand Commitments

Preserve the Ledger name and the README's self-hosted, household-finance identity. Support both light and dark themes, including system-preference fallback and a manual choice. No additional brand metaphor, marketing claim, or voice policy is established by this document.

## Evidence on Hand

This record is extracted for Robert's review under issue #47, not a new product interview or a completed live-user audit. Sources:

- `README.md`: purpose, capabilities, installation model.
- `.github/copilot-instructions.md`: product/design rules and dated lessons; where older overview text conflicts, current code and later lessons clarify behavior.
- `packages/server/src/routes/users.ts`, `middleware/permissions.ts`, `db/migrate-roles-permissions.ts`, and setup/auth routes: role hierarchy, member defaults, first-run and security flows.
- `packages/client/src/pages/`, shared components, `lib/formatters.ts`, and server import/sign-conversion/depreciation code: current workflows and calculation conventions.
- `.github/design-system.jsx` and `.github/mobile-prototype.jsx`: visual and responsive reference, summarized separately in `DESIGN.md`.

No live database was consulted. Market differentiation, claims about financial outcomes, and a formal accessibility certification are not established by these sources; do not invent them. Material new product decisions go to Robert on the relevant issue.

## Product Principles

1. Preserve the meaning of financial data across entry, import, calculations, filtering, and display.
2. Support the household without confusing shared ownership with roles or personal connection access.
3. Make consequential actions reviewable, permission-aware, and explicit about failure or data loss.
4. Keep the product usable on desktop and phone without changing its financial meaning.

## Accessibility & Inclusion

Existing project rules require visible hover/focus states, mobile touch targets at least 44px high, appropriate input keyboards, and password-manager autocomplete. Do not autofocus bottom-sheet fields and obscure the form with the phone keyboard. Preserve text labels and explicit amount signs rather than relying on color alone. These are design requirements, not a claim that the current application has passed a formal accessibility audit.
