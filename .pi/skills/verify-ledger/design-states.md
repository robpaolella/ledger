# Real states for a design check

Start with [Launch, Doctor and Drive](SKILL.md). Use a separate launch/evidence folder
and named browser per checkout. These recipes change only that run's new sample data.
Never inspect or copy `data/`, inject auth tokens, set React state, edit SQLite, or
fake a state by changing the live page's DOM. `/mockup` and `/qa` are not production routes.

## Map each approved entry before driving

Read the issue's linked `design/<issue>-<name>/brief.md`, `decisions.md`, `design.json`
and `screenshots/approved/manifest.json`. Preserve that manifest's IDs and widths.
In the shared design-check's evidence manifest, map **every** approved entry to:

| Field | Example |
| --- | --- |
| Approved ID / revision | The actual ID and revision from the approved manifest (not a newly invented ID) |
| Route and entry point | `/transactions`; sidebar Transactions / phone Transactions tab |
| Role and identity | owner / John; login with the synthetic credentials in Drive |
| Data / UI state | `empty-search`; search `zz-no-sample-match-49`, keep All Time |
| Theme | light / dark, using the actual theme control below |
| Viewport | 390×844 / 1440×900, plus any extra approved widths |
| Expected result | 0 transactions and “No transactions found for this period” |
| Proof / reset | screenshot + accessibility snapshot; clear search to recover 91 seeded transactions |

Also record main/build SHAs and dirty diff, recipe steps, fixture dates, current date,
browser timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`), image dimensions,
and paths. Do not treat an owner filter as a role/privacy boundary. A snapshot file
is a design starting point, **not** proof that the real app reaches a state.

If a state isn't covered below, use the feature map and real user steps to establish
and document a recipe before comparison. Missing data, an unreachable loading/error
state, a first-run setup state (the standard launch is already set up), or an
ambiguous approved state is a **blocker**, not permission to invent UI or omit an entry.
Request a safe fixture extension as separate work when normal UI cannot reach it.

## Route, role and theme

- Sign in as John (owner), Jane (admin), or Sample Member using Drive. Confirm the
  displayed identity under Settings before capture. Use a fresh named browser or
  Sign Out between roles; don't race the login rate limit.
- Navigate through the sidebar or phone tabs/More. A direct `open` to the Doctor
  URL plus route also works, but always confirm the loaded heading and role. If a
  browser action reports success without changing the page, inspect again. With
  chrome-devtools-axi 0.1.37, ref clicks can be no-ops: `run` with a inspected CSS
  selector is a useful fallback (example below). Never accept blank-page evidence.
- Desktop: sidebar **Dark mode / Light mode**. Phone: **More → Settings → Preferences
  → Switch to Dark Mode / Switch to Light Mode**, then return to the target page and
  reapply any transient state. Theme persists across reloads in this owned browser.
- Confirm `document.documentElement.classList.contains('dark')` (true = dark), not
  just the OS preference. Theme initialization lives in the signed-in AppShell:
  a fresh `/login` is light even when the OS prefers dark. For a dark login state,
  sign in, choose Dark mode, then use **Sign out** without reloading; the document
  retains its dark class. A hard reload returns the unsigned login to light. Record
  this distinction rather than injecting a class to fake the state. To check system
  fallback, set `emulate --color-scheme light|dark` in a fresh browser **before signing
  in** (no saved theme); the signed-in shell applies it. Always use `resize` for dimensions.

```bash
npx -y chrome-devtools-axi run <<'JS'
await page.click('a[href="/transactions"]');
await page.wait('input[placeholder="Search transactions..."]');
console.log(await page.snapshot());
JS
```

## Reproducible Transactions states (same page, either theme, either width)

The fresh seed has **91 transactions**, dated January–March 2026. Reapply each state
at the other width: React sometimes selects different DOM for phone and desktop.

| State | Real steps and expected result | Reset |
| --- | --- | --- |
| Populated | Open Transactions. Clear search/filters, select All Time. Expect 91 transactions, BlueCross BlueShield / $210.00 first, table on desktop and cards on phone. | Clear filters/search again; fresh launch if a previous test changed data. |
| Empty results | Type `zz-no-sample-match-49` into Search transactions. Wait for 0 transactions and “No transactions found for this period”. This is a **filtered-empty** state, not a household with no data. | Clear the search; wait for 91 transactions. |
| Add form / incomplete input | From populated, desktop **Add Transaction** or phone **+ Transaction**. Expect Add Transaction modal/bottom sheet with date/account, blank Description/Amount and Select category. Save cannot complete with missing fields. The default date is today; record it for comparisons. | Cancel; no transaction was created. Close, change theme, reopen rather than clicking behind the modal. |
| Detail / edit | Click a seeded ordinary transaction (not a split) and inspect its values. A split needs the separate feature-map recipe. | Cancel; do not save unless testing persistence. |
| Restricted member | Log in as member, open Transactions. Add/edit remain available; bulk editing and deletion are absent. Inspect a row's detail as well as the page. | New browser/sign out; restore any grants through owner UI if changed. |

Search can be driven without guessing accessibility refs:

```bash
npx -y chrome-devtools-axi run <<'JS'
await page.fill('input[placeholder="Search transactions..."]', 'zz-no-sample-match-49');
await page.wait(800);
console.log(await page.snapshot());
JS
```

## Other data, validation, permission and failure states

Use the [feature map](features/README.md) for detailed entry points and persistence
proof. These are state recipes, not permission to change app code during verification.

- **Monthly data:** Budget → March 2026 and Reports → 2026 match the seed. An empty
  month outside January–March is different from an unconfigured household. Select
  dates explicitly; record them so main and build don't compare different months.
- **No connections:** Settings → Bank Sync has no seeded SimpleFIN connections.
  Capture that real empty state; never connect an outside account to populate it.
- **Validation error:** Settings → Preferences → Change Password; enter a synthetic
  new password and a different confirmation. Submit and capture the actual inline
  mismatch error. Do not enter the correct current password or publish password values.
  Cancel/clear to reset. Required blank fields may be prevented by native validation
  or a disabled Save instead of an app error; do not relabel these as server errors.
- **Permission denied:** As member, inspect Settings and Import's bank-sync controls.
  User management is absent and connection management denied. For a design requiring
  denied CSV import, John → Settings → Users & Permissions → Sample Member → revoke
  CSV import through the real UI, then sign the member out/in and open Import. Record
  the grant change, then restore it as John or discard the launch. Do not change roles
  by editing tokens. UI absence alone does not prove API authorization.
- **Network failure:** Reach the target page online first. In **this named browser**,
  `npx -y chrome-devtools-axi emulate --network Offline`, then perform the affected
  real request (e.g. submit an otherwise valid synthetic profile edit). Capture the
  actual failure toast/inline response immediately. Do not reload the whole app:
  a browser “no internet” page is not Ledger's error state. Restore by stopping only
  this browser and starting a fresh named session; Doctor must still pass. Verify
  that the failed change was not persisted before retrying. Do not claim this proves
  an HTTP 500, rate limit, or SimpleFIN error; those require their own safe recipe.
- **Loading:** In a separate owned browser, `emulate --network 'Slow 3G'`, then trigger
  the page's real fetch/action. Capture its actual loading indicator before completion
  and then the result. If it finishes too quickly or has no loading UI, report that
  limitation; don't add overlays or mutate state to manufacture one. A fresh browser
  clears emulation for the next case.
- **Locked/2FA/recovery:** Use the throwaway user's real Preferences security flow only
  when the issue calls for it. Never attach secret QR codes, recovery codes or tokens.
  The basic launch does not preconfigure 2FA or lockouts; an approved state without
  a tested safe setup recipe blocks comparison rather than being silently substituted.

## Shared gate and cleanup

For **any visible change**, execute
[`/git/maestro/skills/design-check/SKILL.md`](/git/maestro/skills/design-check/SKILL.md)
end to end. This file supplies Ledger's launch/roles/states; do not fork Maestro's
comparison/review procedure here. Capture main and build at the exact same states,
themes and widths, inspect every image, and hand it the manifest plus behaviour proof.
Use `screenshot PATH --full-page`; Ledger's app shell has an internal scroller, so a
full-page image may still be one viewport. Scroll the real content area and capture
additional lower-page/detail evidence where the affected content is below the fold.

The 0.1.37 CLI can report “did not report a saved screenshot path” after **any**
`emulate`, including network/color scheme. Check the PNG exists, its actual dimensions,
and open it; never treat the error alone as successful proof. Offline emulation may
leave `navigator.onLine` true; an attempted request with `net::ERR_INTERNET_DISCONNECTED`
in the network log is the reliable check. Keep these limitations in the evidence.

Always run [Cleanup](SKILL.md#cleanup), even on failure. For local test branches:
never push/open a PR; retain evidence outside their worktrees, clean their owned
runtimes, remove only their worktrees, then delete only their recorded local branches.
