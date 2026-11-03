# Safe personal-instance updates — Ledger #68

Issue: https://github.com/robpaolella/ledger/issues/68
Branch: `feat/68-live-update`; PR target `feature/platform-retheme` (Dispatch).
Worker folder: `/git/ledger-worktrees/feat-68-live-update`.

Add update to the live-instance launcher, with stop → backup → fast-forward → install → build → start/health; automatic code/dependency/build/database rollback on failure. Never test on real data. Only private synthetic working folders and private shared clones.

Done means all issue criteria pass, five consecutive lifecycle suites pass (conductor's additional requirement), repository Checks pass, targeted independent review passes, and an unmerged PR is open. Robert merges.

Original expected paths: `scripts/live.sh`, `scripts/live/`, `scripts/live.test.mjs`, `AGENTS.md`. Conductor informed before these multi-session handoff notes were added.
