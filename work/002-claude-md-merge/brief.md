# 002 — Merge CLAUDE.md into AGENTS.md

## Ask
Onboard this repo to the Maestro standard: merge the 66-line CLAUDE.md (added by PR #41,
after AGENTS.md was added by PR #43) into AGENTS.md, then replace CLAUDE.md with the
one-line stub `@AGENTS.md`. Pi only reads AGENTS.md per folder, so anything left only in
CLAUDE.md is invisible to it.

## Starting point
- AGENTS.md existed but was written before PR #41 landed, so it didn't know about:
  Vitest tests, the `.githooks/` pre-commit/pre-push hooks (replacing husky),
  `npm run validate` now including `test`, and several accurate implementation details
  (middleware files, migration list, mockups/QA dev routes, sign-convention helpers,
  `.npmrc` setting, `ConfirmDeleteButton`).
- CLAUDE.md had some stale/inaccurate details of its own (e.g. lint warning count,
  referenced `~/.claude/git-workflow.md` which Maestro now supersedes).
- No `.claude/` directory existed in this repo.

## Done means
- AGENTS.md reflects the actual, verified current state of the repo (checked against
  package.json, .githooks/, test files, etc. — not copied blindly from either doc).
- CLAUDE.md is just `@AGENTS.md`.
- Checks pass on the branch.
- PR open for Robert to review.
