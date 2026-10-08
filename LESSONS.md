# Lessons

Rules that still hold, then a dated log of the bugs and decisions behind them. Read the
relevant section before touching permissions, messages, deletes, tooltips, imports, bank
sync, or anything that handles amounts. Add a log entry when you hit a similarly hard-won
lesson.

## Permissions

- **Roles:** owner > admin > member. There is exactly one owner, created at first-run
  setup; the owner cannot be demoted, deactivated or deleted, and the owner role cannot be
  assigned through the UI.
- **Admin** has every app permission implicitly and can manage members only, never other
  admins or the owner. Only the owner can create or promote admins. Always check both the
  caller's role and the target user's role; never allow lateral or upward management.
- **Member** permissions are individual on/off switches set by the owner or an admin. Owner
  and admin skip the permission lookup entirely.
- **Member permissions are cached for 60 seconds.** Call `invalidatePermissionCache(userId)`
  whenever a user's permissions or role change.
- **Enforce on the server as well as in the UI.** Routes use `requireRole('admin')` or
  `requirePermission('...')`; the UI hides or disables controls for convenience only. Never
  store individual permissions in the JWT.
- **Permission keys** (member default in brackets). Managing users is implied by the admin
  and owner roles and is not a stored key.
  - Transactions: `transactions.create` (on), `transactions.edit` (on),
    `transactions.delete` (off), `transactions.bulk_edit` (off)
  - Import: `import.csv` (on), `import.bank_sync` (on)
  - Categories: `categories.create`, `categories.edit`, `categories.delete` (all off)
  - Accounts: `accounts.create`, `accounts.edit`, `accounts.delete` (all off)
  - Budget and balances: `budgets.edit` (on), `balances.update` (on)
  - Assets: `assets.create`, `assets.edit`, `assets.delete` (all off)
  - Bank connections: `simplefin.manage` (off)
- **In the UI:** wrap controls in `<PermissionGate permission="...">`. Use
  `fallback="hidden"` for destructive actions (delete) and `fallback="disabled"` for
  add/edit actions. Admin-only sections render conditionally on `isAdmin()`. Never combine a
  `PermissionGate` and a manual `hasPermission()` check on the same element.
- A 403 from the API raises a `permission-denied` event that the app shell turns into an
  error toast, so individual screens don't need to handle it.
- New public endpoints must be added to `PUBLIC_PATHS` in the auth middleware.

Checked against: `packages/server/src/middleware/permissions.ts`,
`packages/server/src/db/migrate-roles-permissions.ts` (keys and defaults),
`packages/server/src/routes/users.ts` (hierarchy), `packages/client/src/components/PermissionGate.tsx`,
`packages/client/src/context/AuthContext.tsx`, `packages/client/src/lib/api.ts` and
`packages/client/src/App.tsx` (the 403 event), `packages/server/src/middleware/auth.ts`.

## Messages: toast or inline

| Situation | Toast | Inline |
|---|---|---|
| Successful save, delete or import | yes | |
| API failure (network, server) | yes | |
| Missing required field | | yes |
| Can't delete (has dependencies) | | yes |
| Contextual info (filter, limit) | | yes |
| Possible duplicate on manual entry | | yes ("save again to confirm") |

Toasts report outcomes; inline text reports input problems. **Never both for one action.**

Checked against: `packages/client/src/App.tsx` (error toasts), `packages/client/src/context/ToastContext.tsx`
(a toast carries a message and a type only), and the duplicate warning in
`packages/client/src/pages/TransactionsPage.tsx`.

## No browser dialogs

Never use `alert()`, `confirm()` or `window.confirm()` in product UI. Destructive actions use
the shared `ConfirmDeleteButton` (two clicks, resets itself after 3 seconds by default);
never build delete confirmation ad hoc.

Checked against: `packages/client/src/components/ConfirmDeleteButton.tsx`. The only
`window.confirm` left is in the developer-only QA page, which is not product UI.

## Tooltips

Tooltips render through a React portal into `document.body` with `position: fixed`, so
clipped or constrained parents can't hide them. Position comes from the trigger's
`getBoundingClientRect()`, flips when near a viewport edge, shows after a 200 ms hover
delay, and hides immediately on leave. Always use the shared `Tooltip`; never render a
tooltip inside its parent's DOM tree.

Checked against: `packages/client/src/components/Tooltip.tsx`.

## Learnings log

### Transaction amount sign convention (2026-02-20)
**Problem:** Treating negative amounts as income mislabels refunds (negative expenses) and
income reversals (positive income).
**Rule going forward:** Storage is always positive = money out, negative = money in. Never
infer income or expense from the sign; check `categories.type`. Format amounts only through
`fmtTransaction()` in `packages/client/src/lib/formatters.ts`.

### Income categories follow the group/sub pattern (2026-02-20)
**Problem:** Income categories were seeded with the group name equal to the sub name, which
showed every item twice in category dropdowns.
**Rule going forward:** Every category, income or expense, follows the same group then
sub-category hierarchy. Never create one whose group name equals its sub name.

### No browser alerts (2026-02-19)
**Problem:** Browser dialogs are jarring and unstyled.
**Rule going forward:** See "No browser dialogs" above.

### Credit card CSV sign convention (2026-02-19)
**Problem:** Card statements use the opposite signs to bank statements (positive = charge),
so importing both the same way flips amounts.
**Rule going forward:** Interpret CSV amounts according to the source account type, detect
it automatically, and let the user override it on the import screen.

### Parenthesised amounts in CSVs (2026-02-19)
**Problem:** Some institutions write negatives as `(123.45)`.
**Rule going forward:** Normalise amount strings before parsing: handle parentheses,
currency symbols, commas and whitespace.

### Reusable confirmation pattern (2026-02-20)
**Problem:** Delete confirmations were inconsistent: some inline, some silent double-clicks,
one missing.
**Rule going forward:** All destructive actions use `ConfirmDeleteButton`.

### One notification per action (2026-02-20)
**Problem:** Some actions showed an inline message and a toast at once.
**Rule going forward:** See "Messages: toast or inline" above.

### Multi-owner accounts (2026-02-21)
**Problem:** A single `owner` text column can't represent joint accounts, so shared-account
transactions appeared under only one person.
**Rule going forward:** Ownership lives in the `account_owners` junction table; never assume
an account has exactly one owner. When filtering by owner, include every account the person
co-owns. The legacy `owner` column on `accounts` stays for compatibility and is not used in
new logic.

### SimpleFIN connection scoping (2026-02-20)
**Problem:** One global connection can't serve a household where each person has their own
bank login, and per-user-only can't share one.
**Rule going forward:** A connection is either shared (`user_id` NULL, usable by everyone)
or personal. Always scope queries to shared connections plus the current user's own; never
expose one user's personal connection to another.

### SimpleFIN sign conventions (2026-02-20)
**Problem:** SimpleFIN reports amounts in each bank's own convention, which differs from
Ledger's.
**Rule going forward:** Never store raw SimpleFIN amounts. Convert transactions with
`convertToLedgerSign()` (every classification flips the sign) before storing or showing.

### SimpleFIN transaction IDs for dedup (2026-02-20)
**Problem:** Overlapping sync ranges create duplicates.
**Rule going forward:** Store `simplefin_transaction_id` on every imported transaction and
filter already-imported IDs first (exact match); then run fuzzy duplicate detection (date,
amount, description) for cross-source matches.

### SimpleFIN API limits (2026-02-20)
**Problem:** SimpleFIN allows at most 24 requests a day and 60 days of history per request.
**Rule going forward:** Split date ranges longer than 60 days into separate requests, keep
the number of requests low, and show a clear error when rate limited.

### Transfer detection is dynamic (2026-02-20)
**Problem:** Hardcoded bank-specific transfer patterns break on other people's banks.
**Rule going forward:** Use generic keywords plus matching against the user's own account
names. Never hardcode bank-specific patterns.

### Sign conversion applies to transactions only (2026-02-21)
**Problem:** Applying the transaction sign flip to balances made assets negative and
liabilities positive.
**Rule going forward:** Only transaction amounts are sign-converted. Balances, holdings and
cost basis pass through as SimpleFIN reports them (positive = asset, negative = liability).

### Tooltip implementation (2026-02-22)
**Problem:** Tooltips positioned inside flex or table parents got clipped or misplaced.
**Rule going forward:** See "Tooltips" above.

### Category colours come from one place (2026-02-22)
**Problem:** Colours hardcoded per category name in several files drifted apart and broke
when categories were added or renamed.
**Rule going forward:** Category colours come only from `packages/client/src/lib/categoryMeta.ts`
(one shared map, with a fallback colour for unknown names). Never add another per-file
colour map or hardcode a category's colour in a component.

### Constrained scroll containers (2026-02-22)
**Problem:** A scrollable list inside a fixed-height card overflowed the card: percentage
`max-height` does nothing unless the parent has an explicit height.
**Rule going forward:** Give the parent an explicit height (not min-height), put
`flex-1 min-h-0` on the wrapper, and clip with `overflow-hidden` on the outer element.
Never rely on percentage `max-height` alone.

### Two depreciation methods (2026-02-22)
**Problem:** Straight-line alone doesn't match items that lose value fast early on
(electronics, vehicles).
**Rule going forward:** Assets have a `depreciation_method` (straight line or declining
balance); handle both. The calculation lives in `packages/server/src/utils/depreciation.ts`
(`calculateCurrentValue`); never duplicate it in routes or inline it elsewhere.

### Role checks use a hybrid of token and database (2026-02-23)
**Problem:** Permissions in the token can't be changed without a new login; a database
lookup on every request is slow.
**Rule going forward:** See "Permissions" above: role first, then a cached lookup for
members.

### First-run setup flow (2026-02-23)
**Problem:** Fresh installs need an owner account before anyone can sign in, with no seed
users.
**Rule going forward:** The `setup_complete` flag in `app_config` gates a one-time,
unauthenticated `POST /api/setup/create-admin` endpoint, which creates the owner (it works once only). The setup-status check runs
before any auth check at app start. Existing installs are migrated automatically.

### Owner > admin > member hierarchy (2026-02-22)
**Problem:** With only admin and member, no one could demote an admin.
**Rule going forward:** See "Permissions" above.

### Permanent user deletion (2026-02-23)
**Problem:** Deleting a user row leaves orphaned ownership records.
**Rule going forward:** Call the delete-preview endpoint first and require reassignment of
sole-owned accounts. Do all cleanup in a single database transaction so any failure rolls
everything back. Require the person to type the username before a permanent delete.

### Deactivate vs delete (2026-02-23)
**Problem:** Removing access temporarily and permanently need different weight.
**Rule going forward:** Deactivating (`is_active` false) is reversible; permanent delete is
not. Default to deactivation when the intent is unclear, and only offer permanent delete
through the full confirmation flow.

### Repeatable operations get scripts (2026-02-22)
**Problem:** Database resets, backups and deploys were ad-hoc commands.
**Rule going forward:** Put repeatable operations in `scripts/`. Never run raw database
commands against real data without a backup first.

### Modals become bottom sheets on phones (2026-02-23)
**Problem:** Centred floating modals waste space and sit awkwardly on a phone.
**Rule going forward:** Every modal uses `ResponsiveModal`, which picks the desktop modal or
the mobile bottom sheet; the content is identical, only the container changes.

### Mobile inputs (2026-02-23)
**Problem:** Money fields showed a full text keyboard, usernames auto-capitalised, and
autofocus covered the sheet.
**Rule going forward:** Give every input the right `inputMode` (decimal for money, numeric
for digits) and `autoCapitalize` setting; add `autoComplete` on sign-in fields; don't
autofocus inside a bottom sheet.

### Wide data on phones (2026-02-23)
**Problem:** A 12-column report table is too wide for a phone, however it scrolls.
**Rule going forward:** When data has too many columns for a phone, redesign the
interaction (for example pick a month, then see its detail) instead of scrolling
horizontally.

### Transaction type filter uses category type (2026-02-24)
**Problem:** Filtering income by `amount < 0` counted refunds as income.
**Rule going forward:** Filter by `categories.type`, never by amount sign. A negative
expense is still an expense.

### Budget display must show negative actuals (2026-02-24)
**Problem:** `actual > 0` display checks hid refunds, which produce negative category
totals.
**Rule going forward:** When showing money, test `!== 0`, never `> 0`, unless hiding
negatives is intended. Refund totals must stay visible.

### Dashboard net worth matches the Net Worth page (2026-02-24)
**Problem:** The dashboard added credit card liabilities instead of subtracting them, and
used its own straight-line depreciation math.
**Rule going forward:** Both places use the same calculation: subtract liability balances
and use the shared `calculateCurrentValue()`.

### CSV import gets the same detection as bank sync (2026-02-24)
**Problem:** Transfer detection was wired only to bank sync, so card payments in CSV imports
were never flagged.
**Rule going forward:** Duplicate detection, transfer detection and categorising must work
the same on both import paths (CSV import calls `/api/import/check-transfers`).

### Tailwind class order doesn't set CSS cascade order (2026-02-27)
**Problem:** `h-screen h-[100dvh]` still used `100vh`, because Tailwind emits `.h-screen`
later in the CSS; page bottoms hid behind mobile browser chrome.
**Rule going forward:** Never rely on the order of classes in HTML to decide which utility
wins. When two must combine (for example `vh` with a `dvh` upgrade), use a custom class
with the declarations in the right order, like `.app-shell-height` in `index.css`.

### Hide scrollbars on scrolling areas (2026-05-20)
**Problem:** A visible browser scrollbar on a constrained modal didn't match the app.
**Rule going forward:** Never show a visible scrollbar for vertical modal or list
scrolling. Put `hide-scrollbar` on the scroll container, and when the area needs a scroll
hint, add a bottom fade and chevron.

### Venmo descriptions come from row type and direction (2026-05-05)
**Problem:** Guessing the statement owner's name from the first row mislabelled later
payments, for example when that row was a charge.
**Rule going forward:** Build Venmo descriptions from the row type and money direction,
never from a guessed account owner. Skip funding and transfer rows, and use the Note column
as the description.

### Every code path returns a value (2026-03-01)
**Problem:** A loader function with no final `return` gave `undefined` on first visit and
crashed React when state was read; a `@ts-nocheck` header hid the error.
**Rule going forward:** Every function with a return type returns on every path, including
the "nothing matched" case. Be extra careful in files with `@ts-nocheck`, and make sure
loaders that seed React state can't return `undefined`.

### Budget over-budget colour applies to actuals only (2026-05-22)
**Problem:** The red over-budget styling landed on the planned amount, making the plan look
like the problem.
**Rule going forward:** Red over-budget styling goes only on actual spend values and
progress indicators, never on budgeted amounts.
