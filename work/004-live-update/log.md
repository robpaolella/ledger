# Safe live update — work log

## Decisions (2026-10-07)

- Issue #68, base/PR target `feature/platform-retheme`, as recorded by Dispatch.
- Robert approved stop → backup → fast-forward → install → build → start/health; automatic rollback including database; update starts a previously stopped instance.
- Test only synthetic databases and private shared clones. Never touch the personal instance, live checkout, `data/`, or port 3001.
- Conductor required the 50-cycle recovery stress and five consecutive full lifecycle passes before shipping.

## Implementation and initial review (2026-10-08)

- Added update with dirty/divergent/missing-branch refusals, unchanged no-op, backup before install, preserved dependencies/builds, code/artifact rollback, database restoration after attempted startup, clear outcomes, and existing command lock.
- Lifecycle tests use private shared clones/worktrees, never registering worktrees in the shared repository.
- Initial independent Claude Opus 5.5 medium review passed. Recheck of clarity and missing-record protection found an intermittent health failure; shipping paused. Evidence: `/tmp/ledger-68-review.log`, `/tmp/ledger-68-recheck.log`.
- Narrowed the failure to recovery after a refused backup: the old version sometimes could not rebind its port. Stronger assertions prevent a failed recovery from passing.

## Root cause and recovery (2026-10-08)

- Preflight numeric port and app string port both bind dual-stack `::`; syscall traces confirm identical `SO_REUSEADDR=1`, `IPV6_V6ONLY=0`.
- Tiny synthetic HTTP prototype reproduced EADDRINUSE in its first two cycles after killing Node and waiting for its main thread to become zombie.
- `/tmp/ledger-68-rebind.trace` shows rebind before the final Node thread exits. Linux can expose a zombie leader while other threads still retain shared sockets; vanished ownership metadata is even earlier.
- Fix: in the existing bounded stop loop, require the same process identity to disappear, or zombie/dead state with one remaining thread. No new wait, port retry, or health-assertion retry.
- The prototype then passed 500 immediate kill/rebind cycles: `/tmp/ledger-68-rebind-all-threads.log`.
- Fresh test health requests await both response completion and socket closure. Kept the 50-cycle backup-failure restart regression and synthetic-only failure diagnostics.

## Verification and final sync (2026-10-08)

- Five consecutive complete lifecycle runs passed on the fixed code, each 10 pass, 0 fail, with the 50-cycle stress: `/tmp/ledger-68-final-stability-{1..5}.log` (250 recovery restarts).
- Checks passed in order, plus `npm run validate`; 21 existing lint warnings, zero errors. Helper safety/lifecycle tests: 23 pass, one optional browser fixture skipped (`/tmp/ledger-68-final-verify-tests.log`).
- Rebased unpublished commits onto #78 (`1297d90`) with no conflicts. Re-ran all Checks and validate successfully: `/tmp/ledger-68-synced-{typecheck,lint,test,build,validate}.log`; server tests 19 pass.
- Full lifecycle on the synced branch also passed, including 50 restarts: `/tmp/ledger-68-synced-lifecycle.log`.
- Remaining: targeted independent Opus review, PR, PR-record verification, owned-resource cleanup. No decisions are open.
