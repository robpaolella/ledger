# Product

<!-- impeccable:product-schema 1 -->

## Principles

Ledger is built to Robert's taste, and must be obvious to someone who has never used it. Work polishes and makes consistent what's there; it doesn't redesign it.

The newcomer is someone Robert invites into his instance, where the data already exists. They see a working household ledger, not an empty app, and should find their way without being told.

### Who it's for

- Robert's household comes first. Decisions are made for them.
- The public Docker image is a courtesy to others who want to self-host. It is supported, but it does not steer the product.
- Upgrading from v1.0.2 must lose no data. Every change has to work on an existing database as well as a fresh one.

### Settings rules

- Every setting has one obvious home.
- People only see settings they can use.
- Status messages tell the truth in plain English.
- Every automatic behaviour you can't see has a place to see it and switch it off.

### Phone support

- Fully supported on a phone: dashboard and balances, reviewing and categorizing, adding or editing a transaction, checking the budget, recurring and reports.
- Setup and heavy tasks (CSV import, bank connections, users and permissions, bulk edit) work and are readable on a phone, but can be simpler than on desktop.

### Finished retheme

The retheme is finished when all of these are true, in this order:

1. Every task on the retheme list is merged, apart from ones marked "after the retheme".
2. A final full audit finds no high or medium problems on sample data, covering every page, on phone and desktop, in light and dark, as owner, admin and member.
3. A sample v1.0.2 database upgrades cleanly with nothing lost.
4. Robert uses his live instance on the finished branch for about a week with no problems.
5. Then the branch merges to main, v2.0.0 is published with plain-English release notes, and the live instance switches to following main.

`feature/platform-retheme` is the single integration branch until v2.0.0; work branches from it and merges into it. Main is frozen until release. All Ledger work, bug fixes included, goes to the retheme branch. Anything that must land on main is merged into the retheme branch the same day.

## Product Purpose

Ledger is a self-hosted personal finance app for households: record and review money coming in and going out, compare spending with budgets, and understand net worth across balances, investments, and depreciable assets. The existing README identifies it as **“Your Money. Your Data.”** This is a description of the existing product, not a newly invented market position or a promise of financial advice.

## Platform

web

Ledger is a browser-based application for desktop and phone, not a native mobile app.

## Users

People in the household use Ledger to understand and maintain their shared finances. Account ownership and application roles are different: a financial account may have several owners, while the installation has exactly one **Owner** role.

| Role | What they must be able to do |
| --- | --- |
| Owner | Created during first-run setup; use all app capabilities, manage members and admins, and set member permissions. The owner cannot be demoted, deactivated, or deleted. |
| Admin | Use all app capabilities and manage members and their permissions. Cannot manage another admin or the owner. |
| Member | View the signed-in household finance screens and perform actions allowed by their individual permissions. Defaults allow adding/editing transactions, CSV and bank-sync imports, editing budgets, and updating balances. Other management and destructive actions require a grant. |

The 18 configurable member permissions (see Member permissions below) cover transaction create/edit/delete/bulk edit, CSV import, bank-sync import, category create/edit/delete, account create/edit/delete, budget editing, balance updates, asset create/edit/delete, and SimpleFIN connection management. User management is reserved for owner/admin roles, not a grantable member permission. Owner and admin bypass individual permission checks.

Do not mistake an owner filter for a privacy boundary. Shared account transactions belong in each applicable member view; the combined household view must count them only once. Personal SimpleFIN connections, unlike shared connections, are scoped to the user they belong to.

### Member permissions

Member permissions come in three presets, with individual switches under "Customize":

- **View only:** can view the household finance screens but change nothing.
- **Everyday:** today's member defaults: add and edit transactions, CSV and bank-sync imports, edit budgets, and update balances.
- **Everything except managing people:** every grantable permission. Managing users stays with the owner and admins.

## Operating Context

- Runs on the household's own server as a single Docker image, with SQLite persistence. Browser access requires sign-in after first-run owner creation; there are no default user credentials.
- Supports username/password sign-in and optional authenticator-based two-factor authentication with recovery codes. Preserve account recovery and security states when designing these flows.
- Desktop supports dense review and editing; phone layouts provide a header with a slide-out menu, card lists, and bottom-sheet forms rather than squeezing desktop tables into a narrow viewport.
- Transactions can be entered manually or reviewed and imported from CSV and SimpleFIN Bridge.
- SimpleFIN is an external service. Shared and personal connections can coexist; credentials and personal connection details must not leak between users. Do not describe self-hosting as proof that no external services are involved.
- Current currency formatters display dollar amounts with US number formatting. This is observed implementation, not a claim of multi-currency support.

## Core features

- **Dashboard:** financial summaries, spending breakdown, and recent transactions.
- **Transactions:** search, filters, pagination, create/edit/delete, bulk changes, splits and reimbursements. Preserve the distinction between the bank transaction and its allocations; changes must keep totals consistent.
- **Review queue:** transactions that need a category or a second look.
- **Import (CSV and bank sync):** review categorization, duplicates, and likely transfers before importing. Both paths need these checks. SimpleFIN transaction IDs provide exact re-import protection in addition to cross-source duplicate detection.
- **Budget:** monthly category budget versus actual, including shared accounts. Negative actuals such as refunds remain visible. Over-budget emphasis belongs on actual spending and progress indicators, not the planned budget amount.
- **Recurring:** bills and income that repeat, and whether each has come due.
- **Accounts and net worth:** account balances, investment holdings, and depreciating assets. Both straight-line and declining-balance depreciation are supported; Dashboard and Net Worth use the same calculation rules.
- **Reports:** annual income/expense review with expandable categories; phone users select a month for detail or view annual totals.
- **Investments:** holdings and their value over time.
- **Daily bank sync:** see below.
- **Auto-categorizing:** suggestions from the household's rules plus its transaction history.
- **Notifications:** in-app notices, including bank-sync failures.
- **Settings, users and permissions, two-step sign-in:** accounts (including joint ownership), grouped categories, user and permission management within the role hierarchy, connection management, and personal account and security settings.

### Daily bank sync

- Bank sync runs automatically every day at 05:30 server time by default. If it fails it retries with growing delays (15 minutes, 1 hour, 3 hours, 6 hours) and notifies the people who use that connection after repeated failures. A sign-in problem with the bank connection notifies immediately.
- Anyone with the bank-sync permission can also sync manually at any time.
- SimpleFIN requests are limited to 60-day ranges; split longer ranges and explain rate-limit failures.

### Optional extras

Owner and admin only. Each shows one plain "Not set up yet" line when unconfigured. Setup steps live in the project documentation, not in the app.

- **AI categorizing:** uses a local Ollama server.
- **Amazon order matching:** matches Amazon orders to transactions.
- **Investment benchmarks:** needs the `TIINGO_TOKEN` server setting.

### Retired for good

Data stays untouched; these are never rebuilt.

- The Savings section
- Pay cycles
- Budget templates
- Filtering the budget by household member

### Don't build

- A toggle that folds Recurring into Budget
- Colours named after people

## Safety and access

- Enforce permissions on the server as well as in the UI. Hide unavailable destructive actions; disable unavailable add/edit actions; explain denied full-page features. A hidden button alone is not authorization.
- Prefer deactivation when user removal is ambiguous. Permanent user deletion requires dependency preview, reassignment of sole-owned accounts, and typed username confirmation, preserving financial records.
- Use the existing in-app confirmation pattern for ordinary destructive actions; never browser `alert()` or `confirm()`. Report action outcomes once, and keep validation/constraint messages by the relevant input or action.
- This repository is public. Designs, documentation, screenshots, and tests must use synthetic sample data only. Never open, copy into a design, or publish Robert's live financial database, account details, credentials, or recovery codes.

## Money rules

> **Part 2 (#114) fills in this section.** The bullets below are the earlier rules, kept unchanged until then.

- Stored transaction amounts always mean **positive = money out; negative = money in**. Income versus expense is determined by `categories.type`, never by amount sign alone.
- Use `packages/client/src/lib/formatters.ts` and `fmtTransaction()` for display. Normal expenses have no sign prefix; income has `+`; expense refunds and income reversals have `-`. Refunds remain expenses, not income. A minus in the entry form reverses that category's normal direction.
- CSV signs depend on source/account type; support manual sign-convention override and normalize parentheses, currency symbols, separators, and whitespace before parsing amounts.
- Convert SimpleFIN transaction amounts to Ledger's convention. Never apply that conversion to balances, holding market values, or cost basis.
- All categories use the group → sub-category hierarchy, including income. Account ownership comes from the many-to-many `account_owners` relationship, not the legacy single-owner field.

## Brand Commitments

Preserve the Ledger name and the README's self-hosted, household-finance identity. Support both light and dark themes, including system-preference fallback and a manual choice. No additional brand metaphor, marketing claim, or voice policy is established by this document.

## Accessibility & Inclusion

Existing project rules require visible hover/focus states, mobile touch targets at least 44px high, appropriate input keyboards, and password-manager autocomplete. Do not autofocus bottom-sheet fields and obscure the form with the phone keyboard. Preserve text labels and explicit amount signs rather than relying on color alone. These are design requirements, not a claim that the current application has passed a formal accessibility audit.
