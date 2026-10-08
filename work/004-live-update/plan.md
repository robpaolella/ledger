# Plan

- [x] Read issue, comments, Dispatch and repository instructions; verify base.
- [x] Implement update, saved dependencies/builds, database rollback, refusals and locking.
- [x] Add synthetic lifecycle coverage using private shared clones.
- [x] Run original repository Checks and verify-ledger helper tests.
- [x] Initial independent Opus 5.5 medium review (ready for PR, nonblocking clarity findings).
- [x] Clarify stopped/running rollback outcomes and refuse missing-record busy-port updates.
- [x] Sync unpublished branch with `origin/feature/platform-retheme` after #77.
- [x] Diagnose intermittent EADDRINUSE: zombie main thread did not mean all Node threads had released shared sockets. Require zombie/dead state with one remaining thread; no added wait/retry.
- [x] Keep the 50-cycle backup-failure restart regression, per conductor; diagnostics use only synthetic logs.
- [x] Pass five consecutive complete lifecycle runs, each retaining the 50-cycle restart stress and no health-assertion retries (final-stability-1 through 5).
- [x] Re-run typecheck, lint, test, build; `npm run validate`; verify helper tests (23 pass, one optional browser test skipped). Re-run Checks after final base sync.
- [x] Targeted independent Opus 5.5 medium recovery re-review PASS; four additional full lifecycle runs passed, including two concurrent runs. Speculative nonblocking startup-crash cleanup case recorded in backlog/PR.
- [ ] Final base sync, in-flight file overlap check, commit, push and PR into `feature/platform-retheme`.
- [ ] Verify PR base/risk/issue reference and resource cleanup; report link, do not merge.
