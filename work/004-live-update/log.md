# Log / recovery handoff

## 2026-10-08 — stability proof and final sync

- Five consecutive full lifecycle runs passed with the final thread-exit fix and the 50-cycle backup-failure restart loop: `/tmp/ledger-68-final-stability-{1..5}.log`. Each run: 10 pass, 0 fail, 0 skipped; no health-assertion retries. This covers 250 restart cycles plus all update/rollback cases.
- Checks passed in order (typecheck, lint, test, build), then `npm run validate`. Lint remains at 21 existing warnings, zero errors. Helper safety/lifecycle tests: 23 pass, one optional browser test skipped.
- Fetch now shows #78 on the base (`1297d90`), sample rules/reviews. Commit recovery work, rebase unpublished commits, re-run Checks plus lifecycle on the synced branch, then targeted Opus 5.5 medium independent review.

## 2026-10-08 — recovery diagnosis

- Confirmed preflight numeric port and app string port both bind dual-stack `::`; strace shows both set `SO_REUSEADDR=1` and `IPV6_V6ONLY=0`.
- Reproduced EADDRINUSE with a tiny synthetic dual-stack HTTP server: kill, wait until main thread is zombie, rebind. Failed in the first two cycles. `/tmp/ledger-68-rebind.trace` shows rebind while another Node thread was still exiting, before the final thread/group exit.
- Linux can expose a zombie process leader while other threads retain shared file descriptors. The previous `alive` check incorrectly treated that leader as a fully exited process. Ownership metadata can vanish even earlier.
- Narrow fix: within the existing bounded stop loop, a matching identity is finished only when its leader is zombie/dead AND `/proc/PID/stat` reports one remaining thread (or the PID disappears). No new production waits or retries.
- The same prototype passed 500 consecutive immediate kill/rebind cycles with the all-threads check: `/tmp/ledger-68-rebind-all-threads.log`.
- Preserved the test's 50-cycle stress loop, per conductor's latest instruction. Five final full lifecycle passes and refreshed Checks/review remain required before shipping.

## 2026-10-08 — paused for higher-thinking recovery

Conductor approved preserving this same worktree and its UNCOMMITTED investigation. Do not discard it, switch to another branch, push, or open a PR until the failure is understood. User's latest instruction: write these notes, then conductor restarts #68 on a stronger model.

### State

- Worktree `/git/ledger-worktrees/feat-68-live-update`, branch `feat/68-live-update`.
- Base `feature/platform-retheme`, per Dispatch and worker prompt; already rebased onto #77 (`9c561fa`). Fetch/check again before shipping.
- Three unpublished commits implement update, clarity/missing-record checks, then initial fresh-fetch probe work. Commit IDs changed during rebase; inspect `git log origin/feature/platform-retheme..HEAD`.
- UNCOMMITTED `scripts/live/main.mjs`: stronger process-exit wait (`processInfo`/`alive`), exposes bind error code, exposes safe restart-failure reason.
- UNCOMMITTED `scripts/live.test.mjs`: `node:http` health helper with `agent:false`, waits for BOTH response end and socket close, no retries; stronger backup-failure assertion; temporary stress loop is **50** iterations; retains synthetic logs on health failure. Original issue implementation plus current investigation should remain under roughly 400 changed lines; check final size.
- No PR and no push. Original checks and `npm run validate` passed before current investigation (21 existing lint warnings, no errors). Current code is NOT validated for shipping: lifecycle tests still fail intermittently.
- All testing used private temporary clones/worktrees and synthetic verify-ledger databases. Never ran against real live data, `data/`, or `~/ledger-live/live`.

### Exact failure / reproduction

From this folder:

```sh
node --test scripts/live.test.mjs > /tmp/ledger-68-socket-close-stress.log 2>&1
```

This latest command failed in the `safe updates, refusal, rollback and serialization` subtest, around 20 seconds into that subtest. Its backup-recovery assertion printed:

```
Ledger stopped.
Backup failed and the previous instance could not restart: Port 40585 is busy or unavailable (EADDRINUSE); Ledger was not started. Code and data were not changed.
```

**Stress recipe currently in the test:** after creating a newer remote commit and successfully refusing a missing-record busy-port update, repeat 50 times:

1. Running synthetic app starts on the selected throwaway port.
2. Rename its private `backups` folder to `saved-backups`; replace `backups` with a symlink pointing there. This intentionally makes `backup()` reject a linked folder.
3. Run `cli('update')`. It stops, fails backup, and must restart the OLD app without changing code/data.
4. Restore the ordinary backups folder in `finally`.
5. Assert stderr matches specifically `Backup failed; update refused`, not merely `Backup failed` (the broad original regex also accepted a failed restart).
6. Assert HEAD and backup count unchanged; perform a single fresh health request, awaiting socket closure.

This avoids expensive install/build on every stress iteration. The suite still builds/seeds its initial fixture first and exercises all other update flows if this step passes. After fixing the cause, normalize this loop (e.g. 5 iterations) and perform the conductor's required **five consecutive full suite runs**, all passing, with no blind retry in health assertions.

Previous five-run loops stopped at the first failure. **There has NOT been a five-pass sequence.** Logs named stability-N include earlier failed approaches, not final proof.

### Evidence (all outside Git)

- `/tmp/ledger-68-review.log`: original independent Opus 5.5 medium review, ready for PR, no blocking findings; guard said Unchanged.
- `/tmp/ledger-68-recheck.log`: targeted review after clarity/missing-record fixes; **NOT ready for PR**, health ECONNRESET intermittent (2 of 4 reviewer runs). Code was judged correct, proof unreliable. Guard Unchanged.
- `/tmp/r68-2.log`: reviewer failing test output, no precise health call label.
- `/tmp/ledger-68-investigate.log`: instrumented failure precisely at **after backup-failure restart**, NOT after missing-record refusal.
- `/tmp/ledger-68-health-1791423655632.log`: retained synthetic server log. Final attempted successful startups appear normal; earlier SQLite-corrupt trace is from a separate intentional legacy test, not the new failure.
- `/tmp/ledger-live-health-731915-1791424263615.log`: failure despite Connection: close; normal server-start log.
- `/tmp/ledger-68-diagnostic-fresh.log`: later diagnostics / strengthened assertion runs (overwritten between attempts).
- `/tmp/ledger-68-port-test.log`: 50-cycle stress failure around 39 seconds into update subtest; exact EADDRINUSE.
- `/tmp/ledger-68-port-diagnostic.log`: kernel socket rows filtered to the synthetic port 33511 at that failure. **No LISTEN (0A) row.** Old server endpoint in FIN_WAIT2 (05), other server/client endpoints TIME_WAIT (06); test runner's client socket CLOSE_WAIT (08), inode 8899567 owned by test PID 777542, cwd this worktree. Temporary diagnostic code scanning owners was removed after capture. This is the most useful root-cause evidence.
- `/tmp/ledger-68-socket-close-stress.log`: latest failure even after all test health probes await socket close; exact command above.
- `/tmp/ledger-68-stability-{1..5}.log`: overwritten sequences of attempted five-run checks. Latest identity-exit approach passed runs 1 and 2 then failed run 3; do not claim these satisfy five passes.
- `/tmp/ledger-68-{typecheck,lint,test,build,validate}.log`: checks passed after #77 rebase, before latest investigation.
- `/tmp/ledger-68-verify-tests.log`: verify-ledger helpers passed 23, one optional browser fixture skipped.
- `/tmp/ledger-68-pool-repro.mjs` and `.log`: standalone synthetic HTTP prototype tried to reproduce pooled-reset hypothesis; 20 pooled + 20 fresh rounds had 0 resets. It did NOT reproduce the actual bind issue; don't treat it as proof.

Do not attach unreviewed server logs to a public PR. No real data was used, but keep only selected evidence.

### Hypotheses and what is actually known

1. **Missing-record update refusal kills the running app:** ruled out by locating failure after the subsequent backup-failure restart; refusal checks now additionally confirm original PID exists. Initial refusal happens before any stop/backup/code change.
2. **Only stale global fetch pooling:** insufficient / ruled out as the sole cause. Connection: close still failed; `node:http` agent:false still failed. The visible ECONNRESET was downstream of an actual failed restart. Broad `/Backup failed/` assertion hid that failure.
3. **Loss of /proc cwd/cmdline before process exit is the whole cause:** insufficient. Changed stop polling to matching boot/start-time identity until zombie/dead/disappearance; still got EADDRINUSE. This stronger exit wait is uncommitted; keep or revise based on evidence.
4. **Only pending closure of the test's health socket:** insufficient. Awaiting response end AND socket close for every test health probe still failed the 50-cycle stress. However captured FIN_WAIT2/CLOSE_WAIT rows show connection teardown matters.
5. **A remaining server LISTEN socket:** not present in the captured kernel rows. No unknown PID was ever signalled.
6. **Known exact cause:** backup-recovery restart's bind preflight returns EADDRINUSE. The new app's health polling has not started yet. No full underlying bind explanation is established; don't state a guessed diagnosis as proven.

### Lead from the conductor (recorded verbatim in substance)

An EADDRINUSE on bind with no LISTEN row but old endpoints in FIN_WAIT2/TIME_WAIT usually means the preflight bind differs from the server's, in host/family (`0.0.0.0` vs `::` vs `127.0.0.1`) or reuseAddr/exclusive. **Compare exactly how preflight and app bind.**

Current preflight: `net.createServer(); probe.listen(port, () => probe.close(resolve))`, numeric port, no host. Backend: `packages/server/src/index.ts`, `const PORT = process.env.PORT || 3001; app.listen(PORT, ...)`, PORT is an environment string in production. Check effective host, address family, TCP flags and Node's handling, not just source similarity. Synthetic port varies; default live port is 3001.

A bounded recovery port-wait may be justified only after this evidence is understood. Do not blindly remove the busy-port protection: it prevents updates beneath an unowned running instance. Never signal an unowned process or delete real data.

### Product health handling

`start()` already catches transient fetch errors, including ECONNRESET/refused connections, and keeps checking health (150 probes, each with 500ms timeout plus 200ms interval). It requires healthy HTTP, owned PID and that PID's listening socket. Thus one transient HTTP failure does not automatically trigger database rollback. Current failing path is earlier, the port bind preflight.

### Next session / routing

`node /git/maestro/routing/route.ts escalate --tier hard` returned GPT-6.1 Sol, **high** thinking:

```
--model openai/gpt-6.1-sol --thinking high
```

The conductor will restart the worker in this SAME folder, preserving dirty investigation. For a new helper tab created by herdr, worker start is:

```
herdr agent start ledger-68-recovery --kind pi --pane "$NEW_PANE_ID" -- --model openai/gpt-6.1-sol --thinking high
```

Use the real pane returned by herdr (not a guessed ID); conductor chooses final topology/name. No need to ask Robert directly. Resolve issue #68, run the exact failure/stress recipe, then update plan checkboxes, obtain five passes, rerun Checks, targeted independent review and ship.

### Open decision / cleanup

- Conductor accepted handoff and will restart on stronger thinking once notes are written.
- Own session stays open. Review helper tab `w3V:t2` has completed; launcher used `--no-session` (no helper session file), evidence is in the review logs. It made no edits; unchanged guards passed. Close only this owned tab after checking its shell is idle.
- Tests' finally blocks stop synthetic app processes, clean verification helpers, unregister worktrees only in private clones, and remove private fixtures.
- **Cleanup PASS (2026-10-08):** final `/proc/*/cwd` scan under this exact worktree found only own Pi PID 608090, its shell PID 608035, the completed review-tab shell PID 635217, and the temporary scanning shell/Python. No server or test remained. Closed only owned completed tab `w3V:t2` (review shell). No browser session was started. Docker inspection showed only two unrelated Maestro Open Design containers, neither belonging to this worktree; left untouched. Own worker/session stays open for conductor restart. No resources were signalled by cleanup.
