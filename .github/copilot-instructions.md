# Copilot Instructions for personal-finance

## Project Overview

This is "Ledger" — a locally-hosted personal finance tracking web application built with React, Express, TypeScript, SQLite (via Drizzle ORM), and Tailwind CSS. It tracks income, expenses, budgets, net worth, asset depreciation, and investment holdings for a multi-user household with role-based permissions (owner/admin/member). It integrates with SimpleFIN Bridge for automated bank transaction and balance syncing.

## Architecture

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Express, TypeScript |
| Database | SQLite via better-sqlite3, Drizzle ORM |
| Auth | JWT (Bearer tokens), bcrypt password hashing |
| Fonts | DM Sans (UI), DM Mono (numbers/dates) |
| Containerization | Docker, Docker Compose |
| Bank Sync | SimpleFIN Bridge API |

### Monorepo Structure

```
packages/
├── client/          # React SPA (Vite)
│   ├── src/
│   │   ├── pages/          # Page components (DashboardPage, TransactionsPage, etc.)
│   │   ├── components/     # Shared UI (PermissionGate, ResponsiveModal, BottomSheet, Tooltip, ScrollableList, ConfirmDeleteButton, InlineNotification, etc.)
│   │   ├── context/        # AuthContext (role, permissions), ToastContext
│   │   ├── hooks/          # useIsMobile, usePageTitle, custom hooks
│   │   ├── lib/            # api.ts (API client), formatters.ts, categoryColors.ts
│   │   └── index.css       # CSS custom properties (light/dark themes)
│   
├── server/          # Express API
│   ├── src/
│   │   ├── routes/         # REST endpoints (auth, users, transactions, accounts, categories, budgets, reports, networth, balances, assets, import, simplefin, dashboard, setup, dev)
│   │   ├── middleware/     # auth.ts (JWT), permissions.ts (requireRole, requirePermission), errorHandler.ts
│   │   ├── services/       # simplefin.ts, venmoParser.ts, duplicateDetector.ts, transferDetector.ts, signConversion.ts
│   │   ├── db/             # index.ts (connection), schema.ts (Drizzle), seed.ts, migrations
│   │   └── utils/          # depreciation.ts, sanitize.ts
│   
└── shared/          # Shared TypeScript types
    └── src/types.ts

scripts/             # Workflow scripts (db-reset, db-backup, db-restore, build, deploy, docker-seed, docker-reset)
.github/             # Design files, prompts, and this instructions file
  ├── mockups/       # Approved mockup components (.tsx), viewable at /mockup
  ├── qa/            # QA checklist JSON configs, viewable at /qa
  └── design-system.jsx (referenced by mockups/design-system.tsx)
```

## Git Commit Conventions

**You must commit your work at logical checkpoints throughout development.** Do not wait until the end of a task to commit. Follow these rules:

### When to Commit

- After completing any new file or module that compiles/works independently
- After finishing a full API route group (e.g., all CRUD routes for a resource)
- After completing a frontend page or significant component
- After adding or modifying database schema/migrations
- After fixing a bug or resolving an error
- After adding configuration (environment, build, tooling)
- After any refactor that touches multiple files
- Before starting a new, unrelated piece of work

### Commit Message Format

Use conventional commits:

```
type(scope): short description
```

Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `style`, `test`

Scope is the area of the app: `auth`, `db`, `api`, `ui`, `transactions`, `budget`, `reports`, `networth`, `import`, `settings`, `dashboard`, `shell`, `build`

Examples:

- `chore(db): add drizzle schema and seed script`
- `feat(api): add transaction CRUD routes`
- `feat(ui): build transactions page with filters and table`
- `fix(auth): handle expired JWT token redirect`
- `refactor(api): extract category grouping logic to service`
- `chore(build): configure vite proxy and production build`
- `docs: add README with setup instructions`

### Commit Granularity

- Each commit should represent ONE logical change
- A commit should leave the codebase in a working state (compiles, no broken imports)
- Do NOT bundle unrelated changes into a single commit
- When building a full page, commit the backend routes first, then the frontend separately

### Branch Strategy

- The `main` branch is **protected**. Never commit directly to `main`.
- **At the start of every task**, check the current branch with `git branch --show-current`.
  - If there's an in-progress feature branch with uncommitted or unpushed work, **ask the developer** whether to continue on it or start fresh.
  - If starting a new task, pull the latest main (`git checkout main && git pull`) and create a new feature branch.
- **Mid-session branch switching:** If the current task is complete (or reaches a logical stopping point) and the next piece of work is unrelated, do the following automatically:
  1. Commit all remaining changes on the current branch.
  2. Push the current branch (`git push -u origin <branch-name>`).
  3. Notify the developer that the branch is ready for a PR.
  4. Switch to main and pull latest (`git checkout main && git pull`).
  5. Create a new branch for the next task.
  - If the new work **depends on** uncommitted/unmerged changes from the previous branch, warn the developer and ask how to proceed rather than switching silently.
- Never reuse a branch that has already been merged.
- Branch prefixes: `feature/`, `fix/`, `chore/`, or `refactor/` as appropriate.
  - Examples: `feature/bank-sync`, `fix/expired-jwt-redirect`, `chore/ci-pipeline`, `refactor/category-service`
- Commit incrementally as you work — don't wait until the end.
- When finished with a branch, notify the developer that it's ready for a PR.

## Code Style & Conventions

### TypeScript

- Use strict TypeScript throughout (no `any` types except when absolutely necessary)
- Shared types go in `packages/shared/src/types.ts`
- Use interfaces for object shapes, types for unions/aliases

### API Design

- All API routes are prefixed with `/api/`
- Return consistent JSON: `{ data: ... }` for success, `{ error: string }` for errors
- Use proper HTTP status codes (200, 201, 400, 401, 403, 404, 500)
- Validate request bodies before processing
- Every mutating endpoint must have `requirePermission()` or `requireRole()` middleware
- 403 responses include: `{ error: "Forbidden", message: "...", requiredPermission: "..." }`

### Frontend

- Use functional components with hooks
- Keep page components in `pages/`, reusable UI in `components/`
- Use the shared formatters from `lib/formatters.ts` for all monetary values
- DM Mono font for all numbers and dates, DM Sans for everything else
- All modals must use `<ResponsiveModal>` (renders desktop modal or mobile bottom sheet)
- All permission-dependent UI must use `<PermissionGate>` or `hasPermission()` from AuthContext

### Database

- Never delete data — use soft deletes (is_active flags) where appropriate (exception: permanent user deletion has its own explicit flow)
- All monetary values stored as numeric (not text)
- Dates stored as ISO strings (YYYY-MM-DD)
- Migrations must be backward-compatible (work on both fresh and existing databases)
- The seed script creates schema and reference data (categories) only — never seed user accounts

## Permission System

### Roles

Three-tier hierarchy: **Owner** > **Admin** > **Member**

- **Owner:** Exactly one, created at first-run setup. All permissions. Can manage admins and members. Cannot be demoted/deactivated/deleted.
- **Admin:** All app permissions implicitly. Can manage members only. Cannot manage other admins or the owner.
- **Member:** Granular permissions toggled by owner/admin.

### Permission Keys and Defaults

| Permission | Description | Member Default |
|---|---|---|
| `transactions.create` | Add transactions | ✅ |
| `transactions.edit` | Edit transactions | ✅ |
| `transactions.delete` | Delete transactions | ❌ |
| `transactions.bulk_edit` | Bulk edit/delete | ❌ |
| `import.csv` | CSV import | ✅ |
| `import.bank_sync` | Bank sync import | ✅ |
| `categories.create` | Add categories | ❌ |
| `categories.edit` | Edit categories | ❌ |
| `categories.delete` | Delete categories | ❌ |
| `accounts.create` | Add accounts | ❌ |
| `accounts.edit` | Edit accounts | ❌ |
| `accounts.delete` | Delete accounts | ❌ |
| `budgets.edit` | Edit budget values | ✅ |
| `balances.update` | Update balances | ✅ |
| `assets.create` | Add assets | ❌ |
| `assets.edit` | Edit assets | ❌ |
| `assets.delete` | Delete assets | ❌ |
| `simplefin.manage` | Manage connections | ❌ |

`users.manage` is implicit to admin/owner roles — not stored in the permissions table.

### Backend Enforcement

- `requireRole('admin')` — blocks non-admin users
- `requirePermission('transactions.create')` — admin passes through, members checked against DB with 60s cache
- Invalidate cache with `invalidatePermissionCache(userId)` when permissions change

### Frontend Enforcement

- `<PermissionGate permission="x" fallback="hidden">` — for destructive actions (delete buttons)
- `<PermissionGate permission="x" fallback="disabled">` — for creative/edit actions (add/edit buttons)
- Conditional render with `isAdmin()` — for admin-only sections (Users & Permissions)
- 403 API errors dispatched as `permission-denied` custom event → caught by AppShell → toast

## Design System

### Design File Hierarchy

Three design files exist with clear precedence:

1. **`.github/design-system.jsx`** — **Authoritative** for all colors, components, patterns, hover states, and notifications in both light and dark mode. This is the single source of truth for visual decisions. When any other file conflicts with this one, this one wins.
2. **`.github/design-reference.jsx`** — Original interactive prototype. Still valid for page layout and structure (sidebar width, grid arrangements, section order). Color values in this file may be outdated — defer to the design system guide.
3. **`.github/mobile-prototype.jsx`** — Authoritative for all mobile layouts, bottom sheet designs, and mobile-specific interactions.

### Core Design System

#### Colors (defined as CSS custom properties in `index.css`)

All component colors must use CSS variables (`var(--*)`), never hardcoded hex values (except semantic colors identical in both modes).

**Light / Dark backgrounds:**
- Main: `#f4f6f9` / `#0b0f1a`
- Card: `#ffffff` / `#141926`
- Sidebar: `#0f172a` / `#060a13`

**Semantic (same both modes):** positive `#10b981`, negative `#ef4444`, accent `#3b82f6`, warning `#f59e0b`

**Buttons:**
- Primary: `#0f172a` / `#e2e8f0` background
- Secondary: `#ebeff3` / `#1a2234` background
- Destructive: `#ef4444` both modes
- Success/Import: `#10b981` both modes

#### Typography

- **Font families:** DM Sans (body, UI), DM Mono (monetary values, dates, account badges)
- **Page titles:** 22px, weight 700 (17px on mobile)
- **KPI values:** 22px, weight 800, DM Mono (20px on mobile)
- **Table headers:** 11px, uppercase, weight 600, letter-spacing 0.04em
- **Table cells:** 13px, padding 8px 10px
- **Badges:** 11px, 2px 8px padding, 6px radius, fit-content width
- **Owner badges:** Dynamically assigned — first user gets owner-1 colors, second gets owner-2. Never hardcode names to colors.

#### Category Colors

Dynamically assigned from a 16-color palette via `getCategoryColor()` in `lib/categoryColors.ts`. Never hardcode a category name to a color.

#### Dark Mode

CSS custom properties in `index.css`. Dark palette uses deep navy/charcoal (#0b0f1a, #141926) — not pure black. Accent colors unchanged between modes. Toggle stored in `localStorage('ledger-theme')` with system preference fallback.

### Notification Rules

| Scenario | Toast | Inline |
|---|---|---|
| Successful save/delete/import | ✓ | — |
| API failure (network, server) | ✓ | — |
| Missing required field | — | ✓ |
| Can't delete (has dependencies) | — | ✓ |
| Contextual info (filter, limit) | — | ✓ |
| Duplicate detected (manual entry) | ✓ (with action) | — |

**Never both for the same action.** Toasts for outcomes, inline for input problems.

### Interactive States

All interactive elements must have visible hover/focus states:

- **Primary/Destructive/Success buttons:** Darken bg + `translateY(-1px)` + shadow on hover. `transition: all 150ms ease`
- **Secondary button:** Darken bg only. Hover: `#dfe3e8` (light) / `#243044` (dark)
- **Ghost/link buttons:** `text-decoration: underline` on hover (instant, no transition)
- **Toggle pills (inactive):** `var(--bg-hover)` background on hover
- **Table rows (clickable):** `var(--bg-hover)` background + `cursor: pointer`
- **Clickable badges:** `filter: brightness(1.1)` on hover
- **Clickable cards:** Border lightens + shadow increases on hover
- **Sidebar interactive elements:** `hover:bg-white/5` for nav items; `.sidebar-card` class for footer cards (bg `rgba(255,255,255,0.07)` → `rgba(255,255,255,0.12)` on hover, `transition: background 150ms ease`)
- **Input focus:** Blue ring — `border-color: var(--color-accent)` + `box-shadow: 0 0 0 3px rgba(59,130,246,0.2)`
- **Input error focus:** Red ring — same pattern with `var(--color-negative)`

### Tooltip Spec

- Render via React portal to `document.body` with `position: fixed`
- Always dark style (#0f172a bg, #f1f5f9 text) regardless of theme
- `width: max-content` with `max-width: 250px`, padding `6px 12px`
- Viewport-aware: flips direction when near edges
- Show on mouseenter with 200ms delay, hide immediately on mouseleave

### Layout

- **Sidebar:** 220px wide, #0f172a background (hidden on mobile)
- **Main content:** 28px top/bottom, 36px left/right padding
- **KPI card grid:** 4 columns desktop, 2×2 mobile
- **Cards:** 12px radius, 1px border, `var(--bg-card-shadow)`

## Mobile Responsive Design

### Breakpoint

Single breakpoint: **768px**. Below = mobile layout. At or above = desktop layout (unchanged).

```css
@media (max-width: 767px) { /* mobile overrides */ }
```

Utility classes: `.desktop-only` (hidden on mobile), `.mobile-only` (hidden on desktop)

### Navigation

- **Desktop:** Sidebar (unchanged)
- **Mobile:** Bottom tab bar (Home, Transactions, Budget, More) + More bottom sheet menu (Reports, Net Worth, Import, Settings)

### Page Patterns

- **Tables → Card lists:** Desktop tables convert to stacked cards on mobile. Each card: description + amount top line, date · badges bottom line.
- **Side-by-side layouts → Stacked:** Two-column grids stack vertically
- **4-column KPIs → 2×2 grid**
- **Settings → Drill-through:** Navigation list with sub-pages and "← Back" links

### Bottom Sheets

All modals render as bottom sheets on mobile via `<ResponsiveModal>`:
- Slide up from bottom, 200ms ease-out animation
- Drag handle (36px × 4px) at top
- `max-height: 92vh`, scrollable content
- Backdrop closes on tap
- Render via React portal

### Floating Transaction Pill

Centered pill button `+ Transaction` floating above the tab bar on Dashboard and Transactions pages. Mobile only. Hidden when sheets are open.

### Mobile Input Rules

- Amount fields: `inputMode="decimal"`
- Username fields: `autoCapitalize="off"`
- No autofocus inside bottom sheets (prevents keyboard covering the sheet)
- Auth fields: `autoComplete="username"` / `autoComplete="current-password"` / `autoComplete="new-password"`
- All touch targets: minimum 44px height

## Mockup Workflow

### How to Create and View Mockups

When I ask you to prototype, mock up, or visually design something before implementing it, follow this workflow:

### Setup (one time)

A mockup index route exists at `/mockup` in the app. It lists all `.tsx` files in `.github/mockups/` as clickable cards. Clicking one loads it via `?mockup={name}` query parameter with dynamic lazy import. This page is only available in development (`npm run dev`) and is excluded from production builds.

### Creating a Mockup

1. Create a new `.tsx` file in `.github/mockups/` with a descriptive name (e.g., `import-mobile-mockup.tsx`)
2. The component must export a default React component
3. The component has full access to:
   - All CSS custom properties (light/dark mode theming)
   - DM Sans and DM Mono fonts
   - All existing shared components (Badge, Card, Toggle, InlineNotification, etc.)
   - `useIsMobile()` hook for testing responsive layouts
   - Tailwind CSS classes
4. Tell me to open `http://localhost:5173/mockup?mockup={name}` in my browser to view it
5. The mockup index at `/mockup` will automatically discover the new file

### Mockup Requirements

- **Always include a dark/light toggle** in the mockup so I can verify both themes
- **For mobile mockups**, wrap the content in a 390px-wide container with the phone frame styling (rounded corners, shadow) so it's viewable on a desktop browser
- **For desktop mockups**, render at full width
- **For comparison mockups** (e.g., "admin view vs member view"), include a toggle to switch between views
- **Include realistic sample data** — never use "Lorem ipsum" or placeholder text. Use data that resembles what the app actually displays.
- **Make it interactive** where relevant — dropdowns should open, toggles should toggle, expandable sections should expand

### After Approval

Once I approve the mockup:
1. The mockup file stays in `.github/mockups/` for future reference (it's already there)
2. Proceed with implementation, referencing the mockup

### Adding the Route

The route is already registered in App.tsx (dev-only). No setup needed:

```tsx
{import.meta.env.DEV && <Route path="/mockup" element={<MockupPage />} />}
```

MockupPage.tsx is the index/viewer — do NOT edit it to add mockups. Instead, add `.tsx` files to `.github/mockups/`.

## QA Checklists

### When to Create a QA Checklist

Create a QA checklist whenever:
- A feature branch is ready for testing
- A multi-prompt build sequence is complete
- I ask you to create a QA checklist or test plan

### How It Works

The app has a permanent dev-only QA viewer at `/qa` that renders interactive checklists from JSON config files. Copilot only writes the test items — the viewer UI is already built and reusable.

### Creating a Checklist

1. Create a JSON file at `.github/qa/{feature-name}.json` following this schema:

```json
{
  "title": "Roles & Permissions QA",
  "storageKey": "qa-roles-permissions",
  "testingOrder": "Start with Section 1 (fresh install). Create users in Section 2, then test permissions in order.",
  "sections": [
    {
      "title": "1. Fresh Install Setup",
      "groups": [
        {
          "name": "Admin Account Creation",
          "items": [
            "Setup page shows welcome message and form",
            "Username validates: lowercase alphanumeric only",
            "Submitting creates account and redirects to Dashboard",
            "Created user has role 'owner'"
          ]
        }
      ]
    },
    {
      "title": "2. Permission Enforcement",
      "groups": [
        {
          "name": "Transactions",
          "items": [
            "Member WITH transactions.create → Add button works",
            "Member WITHOUT transactions.create → Add button disabled",
            "Member WITHOUT transactions.delete → Delete button hidden"
          ]
        }
      ]
    }
  ]
}
```

2. Tell me to open `http://localhost:5173/qa?checklist={feature-name}` to use it.

### Item Writing Style

Each test item should describe a specific action and expected result:

Good: "Tap '+ Transaction' pill → bottom sheet slides up with form"
Good: "Toggle off 'Delete' permission → delete button hidden on member's view"

Bad: "Test the transaction form"
Bad: "Check permissions work"

### Section Organization

Organize by user flow, not by technical component:

Good: "Adding a Transaction", "Member Permission Enforcement", "Dark Mode"
Bad: "AuthContext.tsx", "API Routes", "Database Schema"

### The QA Viewer Provides

The viewer component handles all of this automatically — Copilot never needs to build it:
- Click-to-cycle: ○ Untested → ✓ Pass → ✗ Fail → ⏭ Skip → ○ Untested
- Per-item notes with add/edit/clear
- Collapsible sections with progress counts and color-coded headers
- Sticky progress bar with pass/fail/skip/remaining counts and percentage
- Segmented progress visualization
- Persistence via `dev_storage` table on the server (synced automatically, with localStorage as fallback cache)
- Reset All button
- **Export Results** button that copies a Markdown summary to the clipboard

### Sharing Results with Copilot

After testing, click "Export Results" in the progress bar. This copies a Markdown summary to your clipboard with all failed items, notes, skipped items, and passed items. Paste it directly into the Copilot chat and ask for fix prompts.

Example workflow:
1. Run through the checklist
2. Click "Export Results" → "Results copied to clipboard"
3. Paste into Copilot: "Here are my QA results. Please create fix prompts for the failed items."
4. Copilot reads the failures and notes, writes targeted fix prompts

### After QA

- Failed items: I may ask you to create fix prompts based on failures
- The JSON file stays in `.github/qa/` as a record of what was tested
- Re-run anytime by revisiting the `/qa` URL

## Project Learnings

This is a living document. You MUST maintain this section throughout the life of the project. It captures hard-won lessons — things that broke, things that were non-obvious, decisions that were made and why — so we never repeat mistakes or lose context.

### Rules for Maintaining Learnings

1. **When to add a learning:**
   - You encounter a bug or error that took more than a trivial fix
   - A library or API behaves differently than expected
   - You discover a compatibility issue between dependencies
   - A design decision is made that future work needs to respect
   - I (the developer) tell you something to remember — if I say "remember this", "note this", "save this for later", or anything similar, add it here immediately
   - You try an approach that fails and switch to a different one
   - You find that something in these instructions needs clarification based on real usage

2. **Format for each learning:**
   ```
   ### [SHORT TITLE] (YYYY-MM-DD)
   **Context:** What we were doing when this came up
   **Problem:** What went wrong or what was non-obvious
   **Resolution:** What we did to fix it / what the correct approach is
   **Rule going forward:** The specific thing to always/never do
   ```

3. **When to commit learnings:**
   - Add the learning to this file as part of the same commit where you fix the issue, OR
   - If I provide a learning verbally, add it and commit immediately: `docs: add learning — {short title}`

4. **Never delete learnings.** They are append-only. If a learning becomes outdated, mark it as `[SUPERSEDED]` with a note pointing to the newer learning, but keep the original.

5. **Reference learnings proactively.** Before starting work on any task, scan this section for relevant learnings. If a learning applies to what you're about to do, follow it without being asked.

### Learnings Log

### Transaction Amount Sign Convention (2026-02-20)
**Context:** Designing the transaction entry form and display logic
**Problem:** Original design used an Expense/Income toggle to control sign, but refunds (negative expenses) and income reversals (positive income) don't fit cleanly into a simple positive/negative split. Displaying all negative amounts as green "+$X" was misleading for refunds.
**Resolution:** Minus in the amount field = "reverse this category's normal direction." Storage: Positive = money out, Negative = money in. Always. Display: Check BOTH the sign AND the category type. Never assume negative = income. Use `fmtTransaction()` from `lib/formatters.ts` everywhere.

Form Input → Storage → Display:
| Toggle   | User Types | Stored As | Category Type | Display          |
|----------|-----------|-----------|---------------|------------------|
| Expense  | 50        | +50       | expense       | Black "$50.00"   |
| Expense  | -50       | -50       | expense       | Green "-$50.00"  |
| Income   | 5000      | -5000     | income        | Green "+$5,000"  |
| Income   | -500      | +500      | income        | Red "-$500.00"   |

**Rule going forward:** Always check both the amount sign AND the category type when determining how to display a transaction. Green = money coming to you (income or refund). Red = money leaving against an income category. Black = normal expense.

### Income Categories Must Follow Group/Sub Pattern (2026-02-20)
**Context:** Income categories were originally seeded with group_name = sub_name, making each item its own parent group.
**Problem:** This caused duplicate display in the category dropdown (bold header + identical child for each income type) and was inconsistent with the expense category hierarchy.
**Resolution:** Changed all income categories to use group_name = "Income" with each income type as a sub_name, matching the exact pattern used by expense categories.
**Rule going forward:** ALL categories — income and expense — must follow the same group → sub-category hierarchy. Never create a category where group_name equals sub_name. If a new category type is added in the future (e.g., "Transfer"), it should follow this same pattern.

### No Browser Alerts (2026-02-19)
**Context:** Delete confirmations and error messages were using browser alert/confirm dialogs
**Problem:** Browser dialogs are jarring, unstyled, and inconsistent with the app's design
**Resolution:** Replaced with inline notification banners (red for errors, inline confirm state for destructive actions)
**Rule going forward:** Never use alert(), confirm(), or window.confirm() anywhere in the app. All user notifications must be inline UI elements.

### Credit Card CSV Sign Convention (2026-02-19)
**Context:** Importing credit card CSV statements
**Problem:** Credit card statements use inverted signs — positive = charge (expense), negative = credit (refund). Bank accounts use the opposite. Importing without accounting for this produces incorrect transaction amounts.
**Resolution:** Auto-detect sign convention based on account type and allow manual override on the import screen.
**Rule going forward:** Always consider the source account type when interpreting CSV amounts. Never assume a single sign convention for all account types.

### Parenthesized Amounts in CSVs (2026-02-19)
**Context:** Parsing CSV files from financial institutions
**Problem:** Some institutions format negative amounts as (123.45) instead of -123.45
**Resolution:** Added parsing for parenthesized amounts, stripping $, commas, and whitespace before numeric conversion
**Rule going forward:** Always normalize amount strings before parsing — handle parentheses, currency symbols, commas, and whitespace.

### Reusable Confirmation Pattern (2026-02-20)
**Context:** Delete actions across the app had inconsistent confirmation UX
**Problem:** Some used the inline "Confirm Delete?" pattern, others required double-click with no visual feedback, one had no confirmation at all
**Resolution:** Extracted a reusable `<ConfirmDeleteButton>` component (in `components/ConfirmDeleteButton.tsx`) with props for onConfirm, label, confirmLabel, and timeout (default 3s). Applied consistently across SettingsPage, TransactionsPage, and NetWorthPage.
**Rule going forward:** All destructive actions must use the shared ConfirmDeleteButton component. Never implement delete confirmation ad-hoc.

### Notification Strategy (2026-02-20)
**Context:** Some actions showed both inline notifications and toasts simultaneously
**Problem:** Redundant and cluttered — user sees the same message twice in different places
**Resolution:** Established clear rules: toasts for action results (success/failure), inline for validation errors and constraint messages, never both. Removed duplicate setBulkNotification + addToast calls from TransactionsPage and duplicate setNotification + addToast from ImportPage.
**Rule going forward:** One notification per action, maximum. Toasts for outcomes, inline for input problems. Never use both for the same action.

### Multi-Owner Accounts (2026-02-21)
**Context:** Some accounts (joint checking, shared credit card) are owned by multiple household members
**Problem:** The original schema used a single `owner` text field, which couldn't represent shared ownership. This affected the Budget page owner filter — shared account transactions would only appear under one person.
**Resolution:** Created an `account_owners` junction table supporting many-to-many relationships. Individual owner views on the Budget page include both sole and shared accounts. The "All" view remains the source of truth with no double-counting. Shared accounts display a "Shared" badge and multiple owner badges.
**Rule going forward:** Always use the account_owners junction table for ownership. Never assume an account has exactly one owner. When filtering by owner, include accounts where the user is ANY of the owners, not just the sole owner. The legacy `owner` column on `accounts` is kept for backward compat but should not be used in new app logic.

### SimpleFIN Connection Scoping (2026-02-20)
**Context:** Designing SimpleFIN integration for a multi-user household app
**Problem:** A single global connection doesn't support households where each person has their own SimpleFIN account, but per-user-only doesn't support shared connections
**Resolution:** simplefin_connections supports both: user_id = NULL for shared (all users can sync), user_id set for personal. Multiple connections allowed.
**Rule going forward:** Always scope SimpleFIN queries to connections the current user has access to (shared + their own). Never expose one user's personal connection to another user.

### SimpleFIN Sign Conventions (2026-02-20)
**Context:** SimpleFIN API returns amounts in each bank's native convention
**Problem:** Checking accounts use positive = deposit. Credit cards use negative = charge. This is inconsistent across account types and differs from Ledger's internal convention.
**Resolution:** Convert all amounts during sync based on linked Ledger account classification. All classifications flip sign (-simplefinAmount).
**Rule going forward:** Never store raw SimpleFIN amounts. Always convert to internal convention (positive = money out, negative = money in) before display or storage.

### SimpleFIN Transaction IDs for Dedup (2026-02-20)
**Context:** Bank sync can be run multiple times for overlapping date ranges
**Problem:** Without tracking imported SimpleFIN transaction IDs, re-syncing creates duplicates
**Resolution:** Store simplefin_transaction_id on each imported transaction. Filter out already-imported IDs before showing review screen. Separate from fuzzy duplicate detection.
**Rule going forward:** Always check simplefin_transaction_id first (exact dedup), then run fuzzy detection (date + amount + description) for cross-source matching.

### SimpleFIN API Limits (2026-02-20)
**Context:** Integrating with SimpleFIN Bridge API
**Problem:** Rate limited to 24 requests/day, 60 days max per request
**Resolution:** User-initiated sync only (no auto-polling). Split ranges > 60 days. Clear errors on rate limit.
**Rule going forward:** Never auto-poll SimpleFIN. Always user-initiated. Split date ranges > 60 days. Show clear errors if rate limited.

### Transfer Detection Should Be Dynamic (2026-02-20)
**Context:** Detecting credit card payments and inter-account transfers during import
**Problem:** Hardcoding bank-specific patterns is fragile across different users' banks
**Resolution:** Generic keywords plus dynamic matching against the user's own Ledger account names.
**Rule going forward:** Never hardcode bank-specific transfer patterns. Match against the user's actual account names for dynamic detection.

### Sign Conversion Applies to Transactions Only (2026-02-21)
**Context:** SimpleFIN returns both transactions and account balances
**Problem:** The sign conversion logic (which flips signs based on account classification) was being applied to balances, causing assets to show as negative and liabilities as positive
**Resolution:** Sign conversion must ONLY be applied to transactions. Balances, holdings market values, and cost basis values are passed through as-is from SimpleFIN — they already use the correct real-world convention (positive = asset, negative = liability).
**Rule going forward:** Never apply the transaction sign conversion function to balance or holdings data. Only transaction amounts get converted.

### Design System as Source of Truth (2026-02-22)
**Context:** The app's styling grew organically through many prompts, creating inconsistencies in colors, component patterns, and dark mode support
**Problem:** Hardcoded hex values scattered across components, multiple tooltip implementations, inconsistent notification patterns, badge colors not using CSS variables
**Resolution:** Created a comprehensive design system guide (`.github/design-system.jsx`) defining every color, component, and pattern. Migrated entire app to CSS custom properties. Unified all tooltips, notifications, badges, and buttons into shared components.
**Rule going forward:** All visual decisions come from the design system guide. All component colors must use CSS custom properties. No hardcoded hex values in component styles (except semantic colors same in both modes). When adding a new component or pattern, add it to the design guide first, then implement.

### Tooltip Implementation (2026-02-22)
**Context:** Tooltips were rendering inside flex/table containers, causing layout issues
**Problem:** Absolutely-positioned tooltips inside constrained parent containers get clipped, overflow, or render incorrectly
**Resolution:** All tooltips render via React portal to document.body with position: fixed. Position calculated from trigger's getBoundingClientRect(). Viewport-aware with automatic flipping. Always dark style regardless of theme.
**Rule going forward:** Never render tooltips inside their parent component's DOM tree. Always use the shared Tooltip component which portals to document.body.

### Category Colors Are Dynamic (2026-02-22)
**Context:** Category colors were hardcoded to specific category names in 4 separate files
**Problem:** Adding or renaming categories required updating the color mapping in every file. Duplicate CATEGORY_COLORS maps drifted out of sync.
**Resolution:** Categories are assigned colors dynamically from a 16-color palette (in `lib/categoryColors.ts`) based on their sorted index. Colors wrap with modulo if there are more categories than colors.
**Rule going forward:** Never hardcode a category name to a color. Always use `getCategoryColor()` from `lib/categoryColors.ts`. The palette is defined once in that file.

### Design System Must Stay in Sync (2026-02-22)
**Context:** Changed the secondary button background color in CSS but almost forgot to update the design system guide
**Problem:** If the design system guide (`.github/design-system.jsx`) drifts from the actual CSS, it stops being the source of truth and future work will reference stale values
**Resolution:** Any change to a dynamic design element (colors, spacing, component patterns) that is also defined in the design system guide must be updated in both places simultaneously.
**Rule going forward:** When making any visual/styling change that touches a value defined in `.github/design-system.jsx`, always update the design system file in the same commit. Ask the user to confirm before modifying the design system.

### ScrollableList Component Pattern (2026-02-22)
**Context:** The Settings page needed fixed-height cards with scrollable content, a gradient fade indicator, and a pinned bottom button
**Problem:** Multiple failed approaches: (1) `flex-1` on the scroll area without a fixed card height caused the card to grow unbounded. (2) `max-h` with `min-h` didn't pin the button to the bottom. (3) Passing `maxHeight="100%"` to the inner scroll div didn't constrain it because CSS percentage max-height requires an explicit height on the parent — content overflowed out of the card.
**Resolution:** Created `<ScrollableList>` component (`components/ScrollableList.tsx`). Correct structure: outer card has a fixed `h-[Npx]` + `flex flex-col`, a `flex-1 min-h-0` wrapper around `<ScrollableList maxHeight="100%">`, and the button is `flex-shrink-0` at the bottom. The ScrollableList outer div uses `overflow-hidden` to clip content, and the inner div uses `h-full overflow-y-auto` for scrolling. The gradient overlay and chevron button are absolutely positioned inside the outer div and auto-hide via scroll/resize detection.
**Rule going forward:** For any fixed-height container with scrollable content, use the `<ScrollableList>` component. The parent must have an explicit height (not min-height) and the wrapper around ScrollableList must have `flex-1 min-h-0`. The ScrollableList outer div must have `overflow-hidden` — never rely on percentage `max-height` alone to constrain content.

### Two Depreciation Methods (2026-02-22)
**Context:** The app tracks depreciable assets for net worth calculation
**Problem:** Only straight-line depreciation was supported, which doesn't reflect how electronics, vehicles, and appliances actually lose value (fast early, slow later)
**Resolution:** Added declining balance as a second method. Straight line for even-wear items (furniture, home improvements), declining balance for fast-depreciation items (electronics, vehicles). The `calculateCurrentValue` function is in `packages/server/src/utils/depreciation.ts` (shared between assets.ts and networth.ts routes). UI includes suggested rates and explanatory tooltips.
**Rule going forward:** When adding asset-related features, always check the `depreciation_method` field and handle both calculation paths. Never assume straight-line. The calculation utility lives in `utils/depreciation.ts` — do not duplicate it in route files.

### Role-Based Permission System (2026-02-23)
**Context:** Adding admin/member roles with 18 granular permissions
**Problem:** Multiple approaches to permission checking exist (JWT-only, DB-only, hybrid). Pure JWT means permissions can't be hot-reloaded. Pure DB means every request hits the database.
**Resolution:** Hybrid approach: JWT contains `role` for fast admin bypass, DB queried for member permissions with 60s in-memory cache. Cache invalidated on admin update via `invalidatePermissionCache(userId)`. Admin role bypasses all permission checks entirely — no DB lookup needed.
**Rule going forward:** Always check role first (admin = pass through), then check DB permissions for members. Never store individual permissions in JWT — they must be hot-reloadable. Use `requirePermission()` middleware for route protection, `hasPermission()` in frontend for UI gating.

### First-Run Setup Flow (2026-02-23)
**Context:** Fresh installs need an admin account before the app can be used
**Problem:** Hardcoded seed users prevented generic installs. Need a one-time setup without authentication.
**Resolution:** `app_config` table tracks `setup_complete` flag. GET `/api/setup/status` is public. POST `/api/setup/create-admin` works only once (checks flag + user count). App.tsx checks setup status on mount and routes to SetupPage if needed. Existing installs are auto-migrated (first user becomes admin, `setup_complete = true`).
**Rule going forward:** All new public endpoints must be added to `PUBLIC_PATHS` in auth middleware. The setup status check must happen before any auth check in the app boot sequence.

### UI Permission Gate Patterns (2026-02-23)
**Context:** Different UI elements need different behavior when user lacks permission
**Problem:** Three distinct patterns needed: hide entirely (destructive actions), show but disable (creative actions), and show permission denied message (full-page features)
**Resolution:** Created `<PermissionGate>` component with `fallback="hidden"` and `fallback="disabled"` modes. For full-page denials (Import tabs), use inline conditional rendering with a styled message. For 403 API errors, dispatch `permission-denied` custom event from api.ts, caught by AppShell to show toast.
**Rule going forward:** Delete buttons → `fallback="hidden"`. Add/Edit buttons → `fallback="disabled"`. Admin-only sections → conditional render with `isAdmin()`. API 403 errors → handled automatically via event + toast. Never use both PermissionGate and manual `hasPermission()` check on the same element.

### Owner > Admin > Member Hierarchy (2026-02-22)
**Context:** The original two-tier system (admin/member) treated all admins equally
**Problem:** Once someone was promoted to admin, no one could demote them. The app creator had no special authority over other admins.
**Resolution:** Added "owner" role for the account creator. Owner can manage everyone including admins. Admins can only manage members. There is always exactly one owner. First-run setup creates owner. Migration promotes first admin to owner for existing installs.
**Rule going forward:** Always check both the requesting user's role AND the target user's role when processing user management actions. Owner > Admin > Member. Never allow lateral or upward management (admin cannot edit admin, member cannot edit anyone). The owner role cannot be assigned through the UI — it is set only during first-run setup or migration.

### Permanent User Deletion (2026-02-23)
**Context:** Need to permanently remove users while preserving all financial data
**Problem:** Users own accounts via the account_owners junction table. Simply deleting the user row would leave orphaned ownership records.
**Resolution:** Two-step deletion flow: Step 1 previews all data dependencies (GET /users/:id/delete-preview) and requires reassignment of sole-owned accounts. Step 2 requires typing the username to confirm. The actual deletion (DELETE /users/:id/permanent) handles all dependencies in a single database transaction: reassign sole-owned accounts, remove co-ownership entries, delete permissions, delete personal SimpleFIN connections, then delete the user row.
**Rule going forward:** Never delete a user without first calling the delete-preview endpoint to check for dependencies. All data cleanup must happen in a single transaction — if any step fails, roll back everything. Require username confirmation for all permanent deletions.

### Deactivate vs Delete (2026-02-23)
**Context:** Two ways to remove a user's access
**Problem:** Need clear distinction between temporary removal (might come back) and permanent removal (gone forever)
**Resolution:** Deactivate (soft delete) sets is_active = false — user can't log in but their row persists and they can be reactivated. Permanently delete removes the user row entirely — irreversible, all data dependencies must be handled first. Both options are available on user cards with different button styles and different confirmation flows.
**Rule going forward:** Default to deactivation when the intent is ambiguous. Only offer permanent deletion with the full two-step confirmation flow. Never permanently delete without the username-typing confirmation step.

### Development Workflow Scripts (2026-02-22)
**Context:** Needed standardized commands for database management and deployment
**Problem:** Database resets, backups, and deployments were done with ad-hoc commands that weren't documented
**Resolution:** Created shell scripts in scripts/ with npm shortcut commands. Deploy script automates the full push-build-restart-verify cycle with automatic database backup and health check.
**Rule going forward:** All repeatable operations should have a script. Never run raw database commands in production without backing up first. The deploy script is the only way to ship to production — never manually docker compose build on the server.

### Bottom Sheet Pattern (2026-02-23)
**Context:** Desktop modals don't work well on mobile — they float awkwardly and waste horizontal space
**Problem:** Needed a consistent mobile interaction pattern for all modal content
**Resolution:** Created BottomSheet component (slide-up from bottom, drag handle, 92vh max-height, scrollable content, portal to document.body). ResponsiveModal wrapper automatically chooses desktop modal or mobile bottom sheet based on viewport width. All modals in the app use ResponsiveModal.
**Rule going forward:** Never render a centered floating modal on mobile. Always use ResponsiveModal. Content inside is identical for both — only the container changes. New modals must use ResponsiveModal from the start.

### Mobile Input Optimization (2026-02-23)
**Context:** Form inputs on mobile need keyboard-specific attributes for good UX
**Problem:** Number fields showed full text keyboard, username fields auto-capitalized, autofocus covered the sheet
**Resolution:** Added inputMode (decimal for money, numeric for digits), autoCapitalize off for usernames/search, disabled autofocus on mobile bottom sheets, added autoComplete for password manager support.
**Rule going forward:** Every new input field must have the correct inputMode and autoCapitalize. Never autofocus inside a bottom sheet. Always add autoComplete to auth-related fields.

### Mobile Reports Redesign (2026-02-23)
**Context:** The desktop Reports page uses a 12-column horizontal table that doesn't work on mobile
**Problem:** Horizontal scrolling with sticky columns was cramped and awkward. The data is too wide for a phone screen regardless of how it's formatted.
**Resolution:** Replaced the table on mobile with two views: "Monthly Detail" (scrollable month pill selector + expandable category cards for the selected month) and "Annual Totals" (simple category lists with year totals). Desktop table unchanged.
**Rule going forward:** When data has too many columns for mobile, don't force horizontal scroll — redesign the interaction pattern entirely. Prefer drill-down (select a month, then see its data) over scroll (see all months at once).

### Mobile Net Worth Layout (2026-02-23)
**Context:** The desktop Net Worth page has side-by-side Accounts and Depreciable Assets sections
**Problem:** Side-by-side doesn't fit on mobile, and the depreciable assets table columns are too cramped
**Resolution:** On mobile: hero card → Update Balances button → accounts grouped by classification as individual cards (with expandable holdings for investment accounts) → depreciable assets as individual cards with method badges → + Add Asset button.
**Rule going forward:** Investment accounts with holdings should show an expandable section within their card. Depreciable assets show name, date, cost, method badge (SL/DB X%), and current value — no table columns.

### Transaction Type Filter Must Use Category Type (2026-02-24)
**Context:** Filtering transactions by "Income" or "Expense" on the Transactions page
**Problem:** Filter checked `amount < 0` for income and `amount >= 0` for expense. This incorrectly classified refunds (negative expenses like -$29.99) as income, inflating the income transaction count.
**Resolution:** Changed filter to use `eq(categories.type, 'income')` and `eq(categories.type, 'expense')` instead of amount sign checks.
**Rule going forward:** Never use amount sign to determine transaction type. Always use the `categories.type` field. A negative expense is still an expense (it's a refund), not income.

### Budget Display Must Handle Negative Actuals (2026-02-24)
**Context:** Budget page showing actual spending per category
**Problem:** Display logic used `sub.actual > 0` checks, which hid negative actuals (refunds). An Amazon refund of -$29.99 in "Other Daily Living" showed "—" instead of the amount.
**Resolution:** Changed all `sub.actual > 0` and `gActual > 0` display checks to `!== 0` across both mobile and desktop views (6 locations in BudgetPage.tsx).
**Rule going forward:** When displaying monetary values, use `!== 0` checks, never `> 0`, unless you explicitly intend to hide negative values. Refunds produce negative category totals that must be visible.

### Dashboard Net Worth Must Match Net Worth Page (2026-02-24)
**Context:** Dashboard KPI showed net worth ~$7K higher than the Net Worth page
**Problem:** Two bugs: (1) Dashboard summed ALL balances including credit card liabilities (adding them instead of subtracting). (2) Dashboard used inline straight-line depreciation, ignoring the declining balance method for assets like vehicles.
**Resolution:** Separated liabilities in the balance loop and subtracted them. Replaced inline depreciation math with `calculateCurrentValue()` from `utils/depreciation.ts` which handles both depreciation methods.
**Rule going forward:** Dashboard and Net Worth page must use the same calculation logic. Always use the shared `calculateCurrentValue()` utility — never inline depreciation math. Always separate liability balances and subtract them from net worth.

### PR Descriptions Must Be Raw Markdown in Console (2026-02-24)
**Context:** Asked to create a PR description
**Problem:** First attempt rendered as formatted text (not copyable markdown). Second attempt saved to a file instead of printing to console.
**Resolution:** Print PR descriptions as raw markdown directly in the console output so the developer can copy-paste into GitHub.
**Rule going forward:** Always output PR descriptions as a raw markdown code block in the console. Never render as formatted text and never save to a file unless explicitly asked.

### CSV Import Must Include Transfer Detection (2026-02-24)
**Context:** Credit card payment "PAYMENT THANK YOU" not flagged during CSV import
**Problem:** Transfer detection (`detectTransfers()`) was only wired for SimpleFIN sync. CSV import hardcoded `isLikelyTransfer: false` with no server call.
**Resolution:** Added `/api/import/check-transfers` endpoint in import.ts. Wired ImportPage to call it after categorization, setting `isLikelyTransfer` on matching rows.
**Rule going forward:** Any detection logic available for SimpleFIN sync must also be available for CSV import. The two import paths should have feature parity for duplicate detection, transfer detection, and categorization.

### Mockup Viewer Loads from .github/mockups/ Only (2026-02-24)
**Context:** Added 2FA sections to `.github/design-system.jsx` but they didn't appear on `/mockup?mockup=design-system`
**Problem:** The mockup viewer (`MockupPage.tsx`) uses `import.meta.glob('../../../../.github/mockups/*.tsx')` — it only loads `.tsx` files from `.github/mockups/`. The `.github/design-system.jsx` at the repo root is the authoritative design reference but is NOT what the mockup viewer renders.
**Resolution:** Updated `.github/mockups/design-system.tsx` (the renderable copy) with the same changes.
**Rule going forward:** When updating the design system, always update BOTH files: `.github/design-system.jsx` (authoritative reference) and `.github/mockups/design-system.tsx` (renderable mockup). The mockup viewer only sees files in `.github/mockups/`.

### Design System Mockup Must Use Full Theme Token Names (2026-02-24)
**Context:** TOTP code input boxes appeared invisible in the design system mockup
**Problem:** Used shorthand token names (`t.ib`, `t.input`, `t.tp`, `t.tm`) that don't exist in the theme object. The actual tokens are `t.bgInputBorder`, `t.bgInput`, `t.textPrimary`, `t.textMuted`. No error is thrown — the styles just silently resolve to `undefined` and the elements render without borders or backgrounds.
**Resolution:** Replaced all shorthand tokens with the correct full names from the theme object defined at the top of the file.
**Rule going forward:** When adding sections to the design system mockup, always reference the theme object at the top of the file for exact token names. Never abbreviate — there are no shorthand aliases. Test that new elements are visually visible before committing.

### Dev Storage for Tool State (2026-02-24)
**Context:** QA checklist progress was stored in localStorage, lost across browsers/devices
**Problem:** QA testing on a phone couldn't be resumed on desktop, and clearing browser data wiped all progress
**Resolution:** Created `dev_storage` table (key TEXT PK, value TEXT, updated_at TEXT) and `/api/dev/storage/:key` CRUD routes. QAPage loads from server on mount (falls back to localStorage), debounces saves to server (500ms). Mockup index also uses `.github/mockups/` directory with Vite glob imports for discovery.
**Rule going forward:** Dev tool state that should persist across devices goes in `dev_storage` via the `/api/dev` routes. Use localStorage only as an immediate cache, not as the source of truth for dev tools.

### Mockups Live in .github/mockups/ (2026-02-24)
**Context:** Mockups were created by overwriting MockupPage.tsx directly
**Problem:** Only one mockup visible at a time, no history, old mockups lost when replaced
**Resolution:** MockupPage.tsx is now an index/viewer. Mockup components live as individual `.tsx` files in `.github/mockups/`. The viewer discovers them via `import.meta.glob` and loads them lazily via `?mockup={name}` query parameter.
**Rule going forward:** Never edit MockupPage.tsx to add mockups. Always create new `.tsx` files in `.github/mockups/`. Each file must have a default export React component.

### Tailwind Class Order Does Not Guarantee CSS Cascade Order (2026-02-27)
**Context:** The app shell used `h-screen h-[100dvh]` intending the arbitrary value to override the standard utility
**Problem:** On mobile, bottom page content was hidden behind the browser chrome, requiring a second scroll. Investigation revealed that Tailwind generates `.h-screen` (100vh) AFTER `.h-[100dvh]` (100dvh) in the CSS output, so 100vh was winning in the cascade. Since 100vh includes the area behind mobile browser chrome (address bar, bottom navigation), the scroll container was taller than the visible area.
**Resolution:** Created a dedicated `.app-shell-height` CSS class in `index.css` with `height: 100vh; height: 100dvh;` (CSS progressive enhancement — dvh overrides vh in the same rule block). Replaced the conflicting Tailwind classes with this single class.
**Rule going forward:** Never rely on HTML class order to control CSS cascade priority between Tailwind utilities. When two utilities set the same CSS property and one must win, use a custom CSS class with declarations in the correct order (later declaration wins within the same rule). This is especially important for viewport units with fallbacks (vh → dvh, vh → svh).

### New Mockups Require Vite Glob Re-evaluation (2026-02-27)
**Context:** Created a new mockup `.tsx` file in `.github/mockups/` while the dev server was running
**Problem:** The new mockup did not appear in the `/mockup` index list. Vite's `import.meta.glob` builds its file list when the module is first evaluated and does not automatically detect new files matching the pattern.
**Resolution:** After creating a new mockup file, run `touch packages/client/src/pages/MockupPage.tsx` to trigger Vite's HMR to re-evaluate the glob and pick up the new file.
**Rule going forward:** Always run `touch packages/client/src/pages/MockupPage.tsx` immediately after creating a new mockup file in `.github/mockups/`. This ensures the mockup appears in the viewer without requiring a full dev server restart.

### Functions Must Have Explicit Fallback Returns (2026-03-01)
**Context:** QA checklist page showed white screen for any checklist never opened before in that browser
**Problem:** `loadStateLocal()` and `loadStateFromServer()` had no explicit `return` at the end of the function body. When no localStorage/server entry existed (first visit), the functions returned `undefined`. Since `useState(() => loadStateLocal(...))` initialized state as `undefined`, any access to `state.checks` crashed React with an unhandled error. The file had `@ts-nocheck` so TypeScript didn't catch the missing return.
**Resolution:** Added `return { checks: {}, notes: {} }` as fallback at end of `loadStateLocal()` and `return null` at end of `loadStateFromServer()`.
**Rule going forward:** Every function with a declared return type must have an explicit return on every code path, including the "nothing matched" fallback. Pay special attention to files with `@ts-nocheck` — they silently swallow type errors. When initializing React state from a loader function, always ensure the loader cannot return `undefined`.

## Development Workflow

### Environments

- **Development:** Local machine, `npm run dev`, SQLite at `packages/server/data/ledger.db`
- **Production:** Docker container on remote server, SQLite at `./data/ledger.db` (volume mounted)

### Scripts Reference

| Command | What It Does | When to Use |
|---|---|---|
| `npm run dev` | Starts dev server (client + API) | Daily development |
| `npm run db:reset` | Deletes DB and re-seeds (dev only) | Fresh start, schema changes |
| `npm run db:backup` | Copies DB to timestamped backup | Before risky operations |
| `npm run db:restore` | Restores DB from a backup file | When something goes wrong |
| `npm run docker:build` | Builds production Docker image | Before deploying |
| `npm run docker:seed` | Seeds DB inside Docker container | After fresh deploy |
| `npm run docker:reset` | Resets production DB (dangerous) | Only when absolutely necessary |
| `npm run deploy` | Full deploy: push, build, restart, verify | Shipping to production |

### Database Rules

- **Never** write a migration that deletes data without a backup step
- **Always** make migrations backward-compatible — they should work on both fresh and existing databases
- **Always** run `npm run db:backup` before testing migrations on a database with real data
- The seed script creates schema and reference data (categories) only — never seed user accounts
- Fresh installs are detected by checking for zero users in the database

### Deployment Process

1. Commit all changes on a feature branch
2. Merge to main
3. Run `npm run deploy` (or `./scripts/deploy.sh`)
4. The script pushes to GitHub, SSHs into the server, backs up the DB, rebuilds Docker, restarts, and runs a health check
5. If the health check fails, manually rollback using the backup created in step 4

### Docker Notes

- The SQLite database lives on a volume mount (`./data:/app/data`), not inside the container
- Rebuilding the container does NOT affect the database
- `docker compose logs -f` to view logs
- `docker compose exec ledger sh` to open a shell inside the container
