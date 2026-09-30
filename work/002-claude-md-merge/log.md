# 002 — Log

## 2026-09-30
- Pulling `main` mid-task revealed PR #41 had landed (I'd been looking at a stale fetch).
  That commit was substantial, not just docs: it added `packages/server/test/` (Vitest),
  switched `npm run validate` to include `test`, and replaced `.husky/pre-push` with
  `.githooks/pre-commit` + `.githooks/pre-push` (wired via a manual
  `git config core.hooksPath .githooks`, not auto-installed). AGENTS.md (written against
  the pre-#41 state) was stale on all of this.
- Rather than pick a side between CLAUDE.md and AGENTS.md, verified every disputed claim
  directly against the repo: scripts in package.json, presence/absence of test dirs,
  `.githooks` vs `.husky` on disk, `.npmrc`, `fmtTransaction`/`ConfirmDeleteButton` usage,
  the mockup/QA dev routes, and the migrate-*.ts list in `db/index.ts`. All of CLAUDE.md's
  substantive claims checked out except the exact lint-warning count (17, not 12) — left
  that detail out rather than hardcode a number that will drift again.
- Dropped the `~/.claude/git-workflow.md` pointer in the pre-push hook's own output — git
  workflow is now covered by Maestro, per onboard-repo's instruction not to duplicate it.
- No `.claude/` directory existed in this repo, so nothing to delete there.
- Ran `git config core.hooksPath .githooks` locally so pre-push actually fires here.
