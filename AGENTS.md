# Ledger

Self-hosted personal finance app for households (transactions, budgets, net worth, asset
depreciation, SimpleFIN bank sync). Node/TypeScript monorepo, deployed as a single Docker
image.

## Stack
- Frontend: React 19, TypeScript, Vite 7, Tailwind CSS 4
- Backend: Express 5, TypeScript, Drizzle ORM
- Database: SQLite (better-sqlite3), volume-mounted file
- Auth: JWT + bcrypt
- Tests: Vitest (`packages/server`)
- Package manager: npm workspaces (`packages/shared`, `packages/server`, `packages/client`)
- Node 20+, npm 9+

## Precedence
When sources disagree, the higher one wins:
1. Robert's decisions as written in the rulebook: `PRODUCT.md`, `DESIGN.md`, `AGENTS.md`.
2. An approved `design/<issue>-<name>/` folder, for its own feature only.
3. The app as it is today.
4. Archived private design notes, only to fill gaps, and never copied into the repo.
5. Version-1 material (old mockups, the old design system, older docs) carries no weight.

## Branches
`feature/platform-retheme` is the single integration branch until v2.0.0. Work branches
from it and merges into it, never into `main`. Anything that must land on `main` is
merged into it the same day, so the two don't drift (see "Finished retheme" in
`PRODUCT.md`).

## Checks
`npm run validate` is the one command CI and the `.githooks/pre-push` hook run. Run it
before any PR. It runs these in order (typecheck, lint, lint:tokens, test, build):
```
npm run typecheck
npm run lint
npm run lint:tokens
npm run test
npm run build
```
Lint currently passes with `no-explicit-any` warnings (no errors) — don't let the count block
a PR, but don't add new ones either. There's also a manual Puppeteer e2e script at
`e2e/reimbursement-splits.e2e.cjs`, not wired into any npm script — run it directly with
`node e2e/reimbursement-splits.e2e.cjs` if you touch that feature.

## Verifying a change

Use [.pi/skills/verify-ledger/SKILL.md](.pi/skills/verify-ledger/SKILL.md) to build and
run Ledger on fresh throwaway sample data, check owner/admin/member access, capture
phone and desktop evidence, and clean up. Never point verification at `data/` or a
copied live database. The skill's feature map lists the main user flows; its page-snapshot
recipe saves editable offline HTML in both themes, and its state recipes map approved
designs to real app states. Visible changes also follow Maestro's shared `design-check`
skill. After building, run the helper's safety/lifecycle tests with
`node --test .pi/skills/verify-ledger/*.test.mjs`.

## Setup after clone
```
git config core.hooksPath .githooks
```
This wires up `.githooks/pre-commit` and `.githooks/pre-push` (pre-push also refuses pushes
to `main`/`master`, force pushes, and branch deletions). It's a manual step — nothing
installs it automatically, so re-run it if hooks ever stop firing.

## Run locally
```
npm install
npm run dev        # server on :3001, client on :5173 (http://localhost:5173)
```

## Layout
```
packages/client/src/   pages/, shared components/, context/ (auth, toast), lib/ (API client, formatters)
packages/server/src/
  routes/              REST endpoints
  middleware/          auth.ts (JWT), permissions.ts (role/permission guards + 60s cache)
  services/            SimpleFIN client, CSV/Venmo parsing, duplicate/transfer detection, sign conversion
  db/                  schema.ts (Drizzle), seed.ts, migrate-*.ts (run at startup from index.ts,
                       except migrate-income-categories.ts — run by hand via `npm run migrate:income`)
packages/server/test/  Vitest tests
packages/shared/src/   types.ts — shared TypeScript types
scripts/                db-backup, db-restore, db-reset, deploy, docker-*, build
e2e/                    manual Puppeteer e2e script (not wired into CI)
```

## Deploy
Releases build and publish automatically: pushing a `v*` tag triggers `.github/workflows/release.yml`,
which builds the Docker image and pushes it to both Docker Hub (`robpaolella/ledger`) and GHCR.
`docker-compose.yml` pulls the Docker Hub image by default.

`npm run deploy` (`scripts/deploy.sh`) is a template for pushing to a self-hosted server over
SSH — it pushes the current branch, backs up the remote DB, rebuilds, and health-checks. It has
placeholder `SERVER`/`APP_DIR` values and isn't configured for a real host. Don't assume it's
wired to any actual server without checking with Robert first.

## Watch out for
- `data/` holds Robert's live financial data (`ledger.db` plus `ledger.db-wal`, which holds the
  most recent changes). Never write to, reset, migrate or delete it, and never point the dev
  server, Docker, tests or scripts at it; use test data or a copy. `npm run db:backup` copies
  only `ledger.db` and misses recent data, so ask Robert before any backup or restore.
- Amount sign convention is not intuitive: positive = money out, negative = money in, for
  every category type. Never infer income/expense from the amount sign — check
  `categories.type` instead, and use `fmtTransaction()` (`packages/client/src/lib/formatters.ts`)
  for display. Card CSVs and bank CSVs use opposite signs, and some institutions write
  negatives as `(123.45)`. Full rule in `PRODUCT.md` ("Money rules") and `LESSONS.md`.
- Visual values (colors, spacing, component patterns) come from
  `packages/client/src/index.css` and `DESIGN.md`. Never hardcode hex colors or category
  colors — use CSS custom properties and the helpers in
  `packages/client/src/lib/categoryMeta.ts` (`getCategoryColorVar()`).
- Permission checks: admin/owner bypass DB lookups entirely; member permissions are
  cached for 60s (`CACHE_TTL_MS` in `permissions.ts`) and must be invalidated via
  `invalidatePermissionCache(userId)` on change.
- Migrations must be backward-compatible (run on both fresh and existing databases) and
  must never delete data without a backup step.
- No `alert()`/`confirm()` in product UI — destructive actions use `ConfirmDeleteButton`.
- `.npmrc` sets `legacy-peer-deps=true`. Keep it when changing dependencies.

## Personal live instance

When Robert asks, agents may run `bash scripts/live.sh start [offline-source-folder]`,
`stop`, `status`, or `update`. First start copies only the database/WAL/SHM, uploads and JWT
secret from a **stopped, immutable source**; it never overwrites an existing working
folder. Each start backs up before the app can migrate data; the newest 30 backups
are retained. The dedicated checkout builds once; updating it is separate work.
Defaults: `~/ledger-live/live`, sibling `backups/` and `logodev-token/token.txt`,
`/git/ledger-worktrees/live-instance`, port 3001. Overrides: `LEDGER_LIVE_DIR`,
`LEDGER_LIVE_CHECKOUT`, `LEDGER_LIVE_PORT` (use isolated paths for testing).
`LEDGER_LIVE_BRANCH` selects the tracked branch (default `feature/platform-retheme`).
New checkouts fetch that branch; existing checkouts use its local origin ref without
fetching. The launcher works from the live checkout itself or another worktree of
this repository. Checkout validation and any needed build finish before first-start
copying, so those failures can be retried with the same source folder.
`update` fetches the tracked branch and refuses dirty or divergent checkouts. If newer
code exists it stops, backs up, fast-forwards, installs and builds, then starts and
checks health (a stopped instance is also started). An unchanged version takes no
backup and does not restart. Failed install/build restores the old code, dependencies
and builds; failed startup also restores the pre-update database. A previously running
instance is restarted after rollback. If the new version reached startup, rollback
starts the old version even when the instance was previously stopped; an earlier
install/build failure leaves a previously stopped instance stopped. If rollback
fails, keep the printed backup and any saved
artifacts for recovery; do not retry or restore real data without Robert.

Agents must never otherwise read, query, copy, export, screenshot or open in a browser
this live instance or its folder. All verification uses synthetic verify-ledger data;
never run the live script against real data during development. The existing `data/`
restrictions remain unchanged. Only Robert/the conductor at his request does the
first real start after merge. LAN access is HTTP, not internet-facing hosting.
Run lifecycle tests explicitly with `node --test scripts/live.test.mjs`.

## Designs

New designs go in `design/<issue>-<name>/`, using synthetic sample data only: this
repository is public and Ledger holds Robert's real finances. Never use the live database
as design data, in designs or screenshots.

An approved design wins on layout, content, wording, states, and behaviour for its
feature. The site-wide look still comes from `DESIGN.md` and
`packages/client/src/index.css`; a feature design does not silently change it.

## Reference material

- `PRODUCT.md`: users, roles, household workflows, and financial/product constraints.
- `DESIGN.md`: the light/dark tokens and component/mobile patterns.
- `LESSONS.md`: rules learned from past bugs. Read it before permissions or design work,
  and add hard-won lessons to its log.
