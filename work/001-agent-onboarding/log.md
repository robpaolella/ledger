# 001 — Log

## 2026-09-30
- No CLAUDE.md or AGENTS.md existed. `.github/copilot-instructions.md` (800+ lines) is
  the real source of repo knowledge, but it's Copilot-specific and Pi never reads it.
  Kept it as-is and linked to it from AGENTS.md's "Reference material" section instead
  of duplicating its content — it's actively maintained (dated Learnings Log) and would
  drift if copied.
- No `test` npm script and no test step in CI (`.github/workflows/ci.yml` only runs
  typecheck, lint, build). There's a single manual Puppeteer e2e script not wired to
  anything. Documented this gap in AGENTS.md rather than inventing a test command.
- `scripts/deploy.sh` has placeholder SSH target values (`user@your-server-ip`) — not a
  real configured deploy path. Actual releases ship via git tag -> GitHub Actions ->
  Docker Hub/GHCR. Called this out in AGENTS.md so future agents don't assume the script
  is live.
- Proved the Checks section on a clean main: ran `npm install` (deps weren't installed),
  then `npm run typecheck` (clean), `npm run lint` (0 errors, 17 pre-existing warnings),
  `npm run build` (succeeds, all three workspaces). No source files were touched.
