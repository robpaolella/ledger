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

## Checks
Run in this order before any PR (same as CI and the `.githooks/pre-push` hook, which runs
`npm run validate`):
```
npm run typecheck
npm run lint
npm run test
npm run build
```
Lint currently passes with `no-explicit-any` warnings (no errors) — don't let the count block
a PR, but don't add new ones either. There's also a manual Puppeteer e2e script at
`e2e/reimbursement-splits.e2e.cjs`, not wired into any npm script — run it directly with
`node e2e/reimbursement-splits.e2e.cjs` if you touch that feature.

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
.github/mockups/, .github/*.jsx   design mockups, served at /mockup in dev (import.meta.env.DEV only)
.github/qa/, QAPage                manual QA checklist, served at /qa in dev
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
  negatives as `(123.45)`. Full rule in `.github/copilot-instructions.md` under "Project Learnings".
- All visual/styling values (colors, spacing, component patterns) are defined in
  `.github/design-system.jsx`, the single source of truth (`.github/mobile-prototype.jsx` for
  mobile layouts). Never hardcode hex colors or category colors — use CSS custom properties
  and `getCategoryColor()`.
- Permission checks: admin/owner bypass DB lookups entirely; member permissions are
  cached for 60s (`CACHE_TTL_MS` in `permissions.ts`) and must be invalidated via
  `invalidatePermissionCache(userId)` on change.
- Migrations must be backward-compatible (run on both fresh and existing databases) and
  must never delete data without a backup step.
- No `alert()`/`confirm()` in product UI — destructive actions use `ConfirmDeleteButton`.
- `.npmrc` sets `legacy-peer-deps=true`. Keep it when changing dependencies.

## Designs

Approved clickable designs live in `design/<issue>-<name>/`. For their feature, they
win on layout, content, wording, states, and behaviour. `DESIGN.md` summarizes the
site-wide look; `.github/design-system.jsx` remains its authoritative source, with
`.github/mobile-prototype.jsx` supplying mobile layout guidance. A feature design
does not silently change that visual system.

Use synthetic sample data only in designs and screenshots: this repository is public
and Ledger holds Robert's real finances. Never use the live database as design data.
This workflow supersedes the older new-mockup location instructions in the Copilot
doc; existing `.github/mockups/` files remain reference material.

## Reference material

- `PRODUCT.md`: users, roles, household workflows, and financial/product constraints.
- `DESIGN.md`: the existing light/dark tokens and component/mobile patterns, summarized
  from the authoritative design system rather than replacing it.

`.github/copilot-instructions.md` is a long-lived, actively maintained doc (written for
Copilot, but the content applies here too) covering the full design system, mobile
responsive rules, permission system, and a dated "Project Learnings" log of real bugs and
decisions. Read it before design or permissions work, and add to the Learnings Log when
you hit a similarly hard-won lesson.
