---
name: verify-ledger
description: Launch Ledger safely on throwaway sample data, check its owner/admin/member roles, drive its web UI, capture phone and desktop evidence, and clean up. Use before shipping Ledger changes or whenever local verification is needed.
---

# Verify Ledger

Use Linux, Node 20+ and npm 9+. Run commands from this checkout's root. Never use
`npm run dev`, `db:reset`, a live database, a copied database, or real bank credentials
for verification. Do not inspect any checkout's `data/` folder.

## Launch

In a fresh worktree, install dependencies with `npm ci` first. Then:

```bash
EVIDENCE=$(mktemp -d /tmp/ledger-evidence-XXXXXX)
node .pi/skills/verify-ledger/run.mjs launch "$EVIDENCE"
```

Launch builds all workspaces, creates a private `/tmp/ledger-verify-*` directory,
copies the production server/client builds there, runs the compiled base seed and
then the demo seed, starts production, and creates a limited member through the
real users API. It prints Doctor `PASS`, the URL and the throwaway database path.
The supervisor keeps running in the background. Record `$EVIDENCE` for cleanup. The result includes
`url` for local checks and `lanUrl` for another device on the local network; give Robert the
`lanUrl` to open. If no suitable LAN IPv4 address exists, `lanUrl` is `null` and the result
says the app is reachable locally only.

The only supported database is the new file created by this run. **Any inherited
`DATABASE_PATH` (even empty), or extra argument, is refused before filesystem access.**
Do not bypass a refusal by running the seed manually. The refusal is deliberately
stronger than a blacklist: aliases, existing files, and paths outside `data/` are
also refused without opening or resolving the supplied path.

The server's working directory and HOME are the private scratch folder, so it does
not load a checkout's environment file. `.jwt-secret`, SQLite WAL/SHM files, and
build copies all stay inside that folder. Dependencies are read from this checkout.
`listen.mjs` is a verification-only preload: it binds the unchanged production
server to `0.0.0.0` on an OS-assigned port, reports the real port through IPC, and
exits if its supervisor disconnects. The launcher keeps its own health checks and
control endpoint on `127.0.0.1`; only the synthetic app is exposed on the LAN. Anyone
on that LAN can reach a running verification instance. This is acceptable because it
contains only synthetic data and published sample passwords. The app's own startup line
says port 0; **use Doctor's URL**, not that log line.

Each launch has separate data, build snapshots, ports, control token and logs.
Use separate worktrees for workers building concurrently, and a fresh evidence
folder for every launch. Do not reinstall dependencies while a run is active.

## Optional bank and merchant logos

Launch reads `LEDGER_LOGODEV_TOKEN_FILE`, defaulting to
`~/ledger-live/logodev-token/token.txt` in the launching user's home (not scratch HOME).
The file can contain the publishable key alone or `PUBLISHABLE_KEY=pk_...`; surrounding
whitespace is ignored. Multiple non-empty lines are rejected, so another credential
cannot accidentally be sent with the key. Never paste a real key into a command,
evidence, or a PR.
An explicit missing-file override disables logo downloads for offline verification.
Missing, empty, unreadable or non-regular files leave the usual letter badges.

After seeding, the existing logo hydration script gets the key **only in its own
environment**. Its output is discarded, not copied to either log. Downloads go into
scratch uploads, and cleanup removes them. The app server never receives the key.
Hydration has a 60-second total cap; failure or timeout does not fail launch.
Doctor's `logos` field reports `not configured`, `key rejected`, `complete`, `failed`
or `timed out`, and `loaded` counts cached institution/vendor image files, not
account/merchant rows.
`complete` means the script exited successfully, not that every logo was found.
The existing downloader hides HTTP errors, so an invalid key can report `complete`
with zero loaded; Doctor cannot distinguish HTTP 401 from other download failures.

Check `/accounts` and Settings → Merchants (`/settings?panel=merchants`) at
390×844 and 1440×900: national brands can have images; invented merchants retain
letter badges. Reload to confirm the locally cached images still render. Never
attach `run.json` or the token file. Scan evidence for the key without printing
matching lines; only report the match count.

## Doctor

```bash
node .pi/skills/verify-ledger/run.mjs doctor "$EVIDENCE"
```

Run this before driving and whenever anything looks off. It asks the authenticated
local supervisor to check its owned child, its actual process database environment
and working directory, API health (on `url` and `lanUrl` when available), production
HTML, and all three role sessions.
Launch proves password login for each role; Doctor reuses those tokens against
`/api/auth/me` instead of exhausting the five-logins-per-minute rate limit.
The limited member must have transaction creation but not deletion permission.
Doctor reads process metadata, not live financial files. It never logs JWTs.

Logs are `launcher.log` and `server.log` under `$EVIDENCE`. `run.json` is private
control state, **not a PR attachment**. Do not edit it. If launch fails, inspect
those logs and `cleaned.json`; always attempt cleanup. A failed build starts no
app or database. Use a fresh evidence folder when retrying.

## Drive

Read the code stack's `chrome-devtools-axi` skill and current CLI help first:

```bash
export CHROME_DEVTOOLS_AXI_SESSION="ledger-$(basename "$EVIDENCE")"
npx -y chrome-devtools-axi --help
npx -y chrome-devtools-axi open "<Doctor URL>/login"
npx -y chrome-devtools-axi snapshot
```

Use the latest snapshot's refs to fill **Enter username** and **Enter password**
with `fillform`, then click **Sign In** using the NEW snapshot's ref. Wait for the
Dashboard and confirm the signed-in name before navigating. Refs become stale
after each action. If a tool action reports success without changing the page,
re-snapshot; restart only your named browser session if it remains stuck.

| Role | Username | Password (synthetic only) | What to check |
| --- | --- | --- | --- |
| Owner | `john` | `password1` | All features; Settings → Users & Permissions can manage Jane and Sample Member, not delete the owner. |
| Admin | `jane` | `password1` | All financial features; Users & Permissions can manage the member, not John. |
| Limited member | `member` | `password1` | Transactions create/edit, CSV import, budgets and balances allowed; delete/bulk edit and account/category/asset/connection management denied; no Users & Permissions. |

Use **Settings → Sign Out** on phone to switch roles, or the sidebar sign-out icon
on desktop; alternatively stop this browser session and use a fresh named session
for the next role. Do not inject tokens into local storage. Avoid rapid repeated
logins; after HTTP 429 wait one minute. Fixtures cover nine source months but **shift so the launch month is current, with
its preceding eight months also populated**. The launch month stops at today; use
Transactions → All Time to read its current count. Budget/Reports should use the
launch month and its year. Record the launch date when comparing counts and balances.

Main routes: `/accounts`, `/transactions`, `/import`, `/budget`, `/reports`,
`/reviews`, `/investments`, `/settings`. `/net-worth` redirects to Accounts.
On desktop use the sidebar; on phone open the header menu for navigation. See [features/README.md](features/README.md) for
entry points, states and proof recipes. These are household permissions, not data
privacy boundaries: a member can still see household transactions.

## Evidence

Exercise the real UI, not React state setters, direct database edits or test-only
endpoints. Record the action AND result, then reload/reopen to prove persistence.
For example, Settings → Preferences → change Display Name → Save Profile → reload
Preferences; capture the saved name. For imports check the resulting transactions,
not just a success toast. Use only synthetic files and never connect SimpleFIN to
an outside account; the seed deliberately has no connections.

Capture the relevant states for each affected role at BOTH widths:

```bash
npx -y chrome-devtools-axi resize 390 844
npx -y chrome-devtools-axi eval '({width:innerWidth,height:innerHeight})'
npx -y chrome-devtools-axi snapshot > "$EVIDENCE/owner-transactions-390.txt"
npx -y chrome-devtools-axi screenshot "$EVIDENCE/owner-transactions-390.png"
npx -y chrome-devtools-axi resize 1440 900
npx -y chrome-devtools-axi eval '({width:innerWidth,height:innerHeight})'
npx -y chrome-devtools-axi screenshot "$EVIDENCE/owner-transactions-1440.png"
```

Use `resize`, not `emulate`. Confirm actual viewport dimensions, wait until content
has loaded, and **read every image**: a blank page or wrong-size capture is not
proof. Save snapshots, screenshots and concise observations outside git in
`$EVIDENCE`; attach only selected synthetic evidence to the PR, never control state
or unreviewed logs. For any visible change, follow
[Maestro's shared design-check](/git/maestro/skills/design-check/SKILL.md).

## Design sessions and state-by-state comparison

- [Page snapshot](page-snapshot.md): save the selected real page/role/state as editable
  offline HTML, with styles/fonts/images inlined and both themes at phone/desktop widths.
- [Design states](design-states.md): reach populated, empty, form, permission, validation,
  failure and loading states through real UI actions; map every approved design entry
  to a build capture. Missing/unreachable cases block the shared check.

These recipes supply Ledger's runtime and evidence; Maestro owns the comparison,
independent critique and design verdict. Snapshots are design material, not behaviour proof.

## Cleanup

```bash
npx -y chrome-devtools-axi stop
node .pi/skills/verify-ledger/run.mjs cleanup "$EVIDENCE"
```

Stop only your named browser session. Cleanup authenticates to the supervisor,
terminates and waits for its exact child (escalating after five seconds), removes
its entire in-memory scratch directory, and stops the supervisor. It never reads
a deletion path or PID from `run.json`, and never kills by name. Repeating cleanup
is safe. `cleaned.json` records completion; screenshots and logs survive.

Confirm the recorded scratch folder no longer exists and the recorded child and
supervisor PIDs are gone (allow a few seconds for HTTP connections to close).
If the supervisor was forcibly killed, its IPC child exits, but automatic directory
cleanup cannot run: report the retained scratch path; do not improvise a recursive
delete from an edited state file. A machine crash/SIGKILL is not graceful cleanup.

## Helpers and maintenance

`run.mjs` is the executable entry point; `listen.mjs` is loaded by it, not run alone.
`logos.mjs` isolates optional logo hydration. Its tests use synthetic keys and
stub downloads; lifecycle tests explicitly disable real network hydration unless
using their test-only subprocess fixture. Tests include pure pre-I/O refusals plus
two real seeded instances, wrong-token
refusal, Doctor, tampered-state safety, graceful/signal cleanup and evidence retention:

```bash
npm run build
node --test .pi/skills/verify-ledger/*.test.mjs
```

The snapshot helper also has an opt-in real-browser fixture test (no database):

```bash
LEDGER_SNAPSHOT_BROWSER_TEST=1 node --test .pi/skills/verify-ledger/snapshot-browser.test.mjs
```

It owns and stops a uniquely named browser and a synthetic local HTTP fixture. Run it
when changing capture logic, alongside the stopped-app/offline visual comparison in
[page-snapshot.md](page-snapshot.md). Unit tests cover assembly, edited HTML, dimensions,
overwrite refusal and unsafe arguments.

Also run the four repo Checks in `AGENTS.md` before a PR. Keep the feature map in
sync as flows change; pstack's `maintain-verification-skill` is the maintenance loop.
