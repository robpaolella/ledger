# Ledger

Self-hosted personal finance tracker for a multi-user household (owner/admin/member roles):
transactions, budgets, net worth, asset depreciation, SimpleFIN bank sync. Runs as a
Docker container.

## Stack
npm workspaces: `packages/client` (React 19, Vite 7, Tailwind CSS 4), `packages/server`
(Express 5, Drizzle ORM, SQLite via better-sqlite3, JWT + bcrypt), `packages/shared` (types).
TypeScript throughout, ESLint, Vitest (server). Docker image published to GHCR and Docker Hub.

## Checks
Run in this order before any PR. `/ship` reads this section.
```
npm run typecheck
npm run lint
npm run test
npm run build
```
`npm run validate` runs all four; `.githooks/pre-push` runs it on every push. Lint
currently passes with 12 `no-explicit-any` warnings.

## Setup after clone
```
git config core.hooksPath .githooks
```

## Run locally
```
npm install
npm run dev        # API :3001 + client http://localhost:5173
```
The dev SQLite DB is `packages/server/data/ledger.db`. `npm run db:reset` re-seeds it,
and `db:backup` / `db:restore` snapshot it.

## Layout
- `packages/server/src/routes/` — REST endpoints; `middleware/` has JWT auth (`auth.ts`) and role/permission guards (`permissions.ts`).
- `packages/server/src/services/` — SimpleFIN client, CSV/Venmo parsing, duplicate and transfer detection, sign conversion.
- `packages/server/src/db/` — `schema.ts` (Drizzle), `seed.ts`, and `migrate-*.ts` scripts that `src/index.ts` runs at startup
  (except `migrate-income-categories.ts`, run by hand via `npm run migrate:income`).
- `packages/server/test/` — Vitest tests.
- `packages/client/src/` — `pages/`, shared `components/`, `context/` (auth, toast), `lib/` (API client, formatters).
- `.github/mockups/` — mockups served at `/mockup` in dev. `.github/qa/` — QA checklists served at `/qa`.
- `scripts/` — DB, Docker and deploy helpers behind the `db:*`, `docker:*` and `deploy` npm scripts.

## Deploy
- **Releases:** push a `v*` tag. `.github/workflows/release.yml` runs the checks, then pushes
  `ghcr.io/robpaolella/ledger` and `robpaolella/ledger` (Docker Hub) with the version tag and `latest`.
  It needs the `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` repo secrets.
- **Own server:** `npm run deploy` (`scripts/deploy.sh`) pushes the current branch, SSHes in, backs
  up the DB, rebuilds and health-checks. `SERVER` and `APP_DIR` in the script are placeholders; set
  them before use. Run it from an up-to-date `main` after the PR merges. Its push is then a no-op.
  If local `main` has unpushed commits, `.githooks/pre-push` refuses the push and the deploy stops.
- Production SQLite lives on the `./data` volume. `JWT_SECRET` is auto-generated and persisted
  there if unset.

## Watch out for
- Sign convention: stored amounts are positive = money out, negative = money in. Display must check the sign and the category type; use `fmtTransaction()`.
- Card CSVs and bank CSVs use opposite signs, and some institutions write negatives as `(123.45)`.
- Migrations must work on fresh and existing databases and never drop data without a backup step.
- No `alert()`/`confirm()`. Destructive actions use `ConfirmDeleteButton`.
- `.npmrc` sets `legacy-peer-deps=true`. Keep it when changing dependencies.

## Reference material
- `.github/copilot-instructions.md` — permission matrix, design system rules, mobile patterns, mockup and QA workflows, and the append-only Learnings log. Its Git sections are superseded by `~/.claude/git-workflow.md`.
- `.github/design-system.jsx` — authoritative colors and components. `.github/mobile-prototype.jsx` — mobile layouts.
