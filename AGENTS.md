# Ledger

Self-hosted personal finance app for households (transactions, budgets, net worth, bank sync). Node/TypeScript monorepo, deployed as a single Docker image.

## Stack
- Frontend: React 19, TypeScript, Vite 7, Tailwind CSS 4
- Backend: Express 5, TypeScript, Drizzle ORM
- Database: SQLite (better-sqlite3), volume-mounted file
- Auth: JWT + bcrypt
- Package manager: npm workspaces (`packages/shared`, `packages/server`, `packages/client`)
- Node 20+, npm 9+

## Checks
Run in this order before any PR (same as CI and the husky pre-push hook, which runs `npm run validate`):
```
npm run typecheck
npm run lint
npm run build
```
There is no automated test suite in CI. One manual Puppeteer e2e script exists at
`e2e/reimbursement-splits.e2e.cjs` but isn't wired into any npm script — run it directly
with `node e2e/reimbursement-splits.e2e.cjs` if you touch that feature.

## Run locally
```
npm install
npm run dev        # server on :3001, client on :5173 (http://localhost:5173)
```

## Layout
```
packages/client/   React SPA (Vite) — pages/, components/, context/, hooks/, lib/
packages/server/   Express API — routes/, middleware/, services/, db/ (Drizzle schema + seed), utils/
packages/shared/   Shared TypeScript types (src/types.ts)
scripts/           db-backup, db-restore, db-reset, deploy, docker-*, build
e2e/               Manual Puppeteer e2e test (not wired into CI)
```

## Deploy
Releases build and publish automatically: pushing a `v*` tag triggers `.github/workflows/release.yml`,
which builds the Docker image and pushes it to both Docker Hub (`robpaolella/ledger`) and GHCR.
`docker-compose.yml` pulls the Docker Hub image by default.

`scripts/deploy.sh` is a template for pushing to a self-hosted server over SSH — it has
placeholder `SERVER`/`APP_DIR` values and isn't configured for a real host. Don't assume
it's wired to any actual server without checking with Robert first.

## Watch out for
- Amount sign convention is not intuitive: positive = money out, negative = money in, for
  every category type. Never infer income/expense from the amount sign — check
  `categories.type` instead. Full rule in `.github/copilot-instructions.md` under "Project Learnings".
- All visual/styling values (colors, spacing, component patterns) are defined in
  `.github/design-system.jsx`, the single source of truth. Never hardcode hex colors or
  category colors — use CSS custom properties and `getCategoryColor()`.
- Permission checks: admin/owner bypass DB lookups entirely; member permissions are
  cached for 60s and must be invalidated via `invalidatePermissionCache(userId)` on change.
- Migrations must be backward-compatible (run on both fresh and existing databases) and
  must never delete data without a backup step.

## Reference material
`.github/copilot-instructions.md` is a long-lived, actively maintained doc (written for
Copilot, but the content applies here too) covering the full design system, mobile
responsive rules, permission system, and a dated "Project Learnings" log of real bugs and
decisions. Read it before design or permissions work, and add to the Learnings Log when
you hit a similarly hard-won lesson.
