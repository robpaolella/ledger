# Final audit report (#112)

The release-bar audit of every Ledger page, compiled from the three audit parts and the four re-checks. It combines `part-a.md`, `part-b.md`, `part-c.md` (the audit, 2026-10-12) with `report-a.md`, `report-b.md`, `report-c.md` and `report-d.md` (the re-checks, 2026-10-13). Format follows `work/108-phone-audit/report.md`. All data is synthetic sample data from `.pi/skills/verify-ledger`; nothing from `data/` or the live instance was opened.

## Result

**No open high or medium findings.** Checked on 2026-10-13.

- The audit (parts A, B and C) found **2 high and 28 medium** problems, and re-check C found **3 more medium** (#390, #391, #392): **33 in all** (2 high, 31 medium), each filed as its own issue. Every one of those 33 issues is closed by a merged pull request into `feature/platform-retheme`, and every one was re-checked on fresh sample data and passed. One further issue, #385 (a follow-up to #332 that Robert's rule on household-visible Investments data called for), is also closed by a merged pull request and was re-checked with #332.
- Nothing failed a re-check at the end. Re-check C's one partial failure (#340, plus the three new issues) was fixed and re-checked in re-check D, which supersedes re-check C's "open" status for #390–#392. No re-check found a new high or medium problem after D.
- **Run against:** the audit ran on `b51a8e6` (2026-10-12). Re-checks A, B and C ran on `6501ea8` and re-check D on `0b7967a` (all 2026-10-13, all on `feature/platform-retheme`). This report was compiled against `a605f9a`, the head of `feature/platform-retheme` on 2026-10-13. Between `0b7967a` and `a605f9a` only the `v102-upgrade` test timeout (#401, a test-only change) and re-check D's report changed, so the app's code at the compile commit is the code re-check D ran on.
- **Low findings** are not fixed here: **49** are in `backlog.md`, one line each (48 new lines; part B L1 was already there from #309 and is marked "also Part B L1") (see Low findings).
- **Known, filed outside the audit:** #379 is open (see that section). It is not an audit finding.

## Severity

- **High**: a wrong money figure, data loss, a permission leak, a broken or unreachable flow, or a crash.
- **Medium**: a visible break from the rulebook or an approved design, content clipped or unreachable on phone, wrong or misleading wording, or a state with no way forward.
- **Low**: cosmetic polish. Low findings go to `backlog.md`, not into issues.

## How it was done

- **Audit** (parts A, B, C): each part launched Ledger with `.pi/skills/verify-ledger` on its synthetic sample data (Doctor PASS) and checked its pages as owner (John), admin (Jane) and the limited member, light and dark, at 390 and 1440 wide, with real sign-in. Every capture also ran a script measuring sideways scroll, clipped text and tap targets (tap areas measured by hit-testing, so invisible 44px tap areas count). Checked against PRODUCT.md, DESIGN.md, AGENTS.md, then the approved designs, then the app. Details and limits are in each part's own file.
- **Re-checks** (A, B, C, D): each fix was re-run on fresh sample data in the roles, themes and widths where the finding was found, with a screenshot of the fixed state. Failed loads were simulated in the browser (the server was never changed). Destructive steps stopped at their confirmation unless a check says otherwise.
- **This compile:** read the seven files against each other; confirmed the state of every linked issue with `gh`, and the merged pull request that closes it, and the full blocked-by list of #112 (all 97 blockers are closed); no pages were audited from scratch.

## Coverage

One row per page (or window), role, theme and width: **876 rows** (part A 96, part B 72, part C 708). "Audit result" is what the audit part recorded: a finding number, or "No problems". "Re-check" is the outcome after the fixes. Screenshots for each re-check are in the Findings table below and under `screenshots/recheck/a`, `b`, `c`, `d`; the audit's own images are under `screenshots/part-a`, `part-b`, `part-c`.

Notes on reading it:

- Login and first-run Setup happen before anyone is signed in, so they have no role; part A repeated the same captures for each role, and the rows do the same.
- Part C's finding codes: F1 #335, F2 #336, F3 #337, F4 #338 (no screen effect, a network log finding), F5 #339, F6 #340. "hidden ✓" means the role must not see the page or window and was checked to be hidden; "n/a" means the item only exists at the other width.
- "No finding to re-check" means the audit found no problem there and no fix touched it.
- Where a finding was found at 390 only, rows at 1440 show the audit result "No problems" or the same issue only if the audit recorded it there.
- Coverage gaps (from report-c, "Coverage gaps"): **no page × role × theme × width combination is missing.** Items that are not pages were also checked on 2026-10-13 (owner and member, light and dark, 390 and 1440): `/net-worth` redirects to `/accounts` for every role; an unknown address redirects to the Dashboard; `/settings?panel=nonsense` shows the Settings menu on phone and Profile on desktop; `/settings?panel=ai` opens Optional extras for owner and admin and the menu or Profile for the member; `/accounts/999999` says "Account not found" with a way back; `/budget/category` with no category says "No category specified" with a way back (low: the page title reads "Ledger"); a session that expires while using the app returns to Sign in with no explanation (low). No new high or medium problem came out of these.
- Coverage notes, states the sample data cannot reach (unchanged, not a gap in pages): first-run Setup submit (only on an empty database), a real two-step code at sign-in, empty-database states, other member permission presets, Amazon and benchmarks set up, Reset two-step for a person with two-step on, Bank sync with no connections, slow-network skeletons and drag-to-close, a genuine "all caught up" Reviews list, the Edit transaction window's footer (nothing opens that window for an existing transaction; see backlog), the Edit group window's Delete confirmation (every sample group has categories), a member with the "Manage bank connections" permission driven in the UI (covered by #385's test), colour contrast, Tab order and screen readers (not measured).

| Part | Page or window | Role | Theme | Width | Audit result | Re-check |
| --- | --- | --- | --- | --- | --- | --- |
| A | Login | owner (signed out) | light | 390 | #346, #355 | Pass: #346, #355 |
| A | Login | owner (signed out) | light | 1440 | #346 | Pass: #346, #355 |
| A | Login | owner (signed out) | dark | 390 | #346, #355 | Pass: #346, #355 |
| A | Login | owner (signed out) | dark | 1440 | #346 | Pass: #346, #355 |
| A | Login | admin (signed out) | light | 390 | #346, #355 | Pass: #346, #355 |
| A | Login | admin (signed out) | light | 1440 | #346 | Pass: #346, #355 |
| A | Login | admin (signed out) | dark | 390 | #346, #355 | Pass: #346, #355 |
| A | Login | admin (signed out) | dark | 1440 | #346 | Pass: #346, #355 |
| A | Login | member (signed out) | light | 390 | #346, #355 | Pass: #346, #355 |
| A | Login | member (signed out) | light | 1440 | #346 | Pass: #346, #355 |
| A | Login | member (signed out) | dark | 390 | #346, #355 | Pass: #346, #355 |
| A | Login | member (signed out) | dark | 1440 | #346 | Pass: #346, #355 |
| A | Setup | owner (signed out) | light | 390 | No problems | No finding to re-check |
| A | Setup | owner (signed out) | light | 1440 | No problems | No finding to re-check |
| A | Setup | owner (signed out) | dark | 390 | No problems | No finding to re-check |
| A | Setup | owner (signed out) | dark | 1440 | No problems | No finding to re-check |
| A | Setup | admin (signed out) | light | 390 | No problems | No finding to re-check |
| A | Setup | admin (signed out) | light | 1440 | No problems | No finding to re-check |
| A | Setup | admin (signed out) | dark | 390 | No problems | No finding to re-check |
| A | Setup | admin (signed out) | dark | 1440 | No problems | No finding to re-check |
| A | Setup | member (signed out) | light | 390 | No problems | No finding to re-check |
| A | Setup | member (signed out) | light | 1440 | No problems | No finding to re-check |
| A | Setup | member (signed out) | dark | 390 | No problems | No finding to re-check |
| A | Setup | member (signed out) | dark | 1440 | No problems | No finding to re-check |
| A | Two-step setup | owner | light | 390 | No problems | No finding to re-check |
| A | Two-step setup | owner | light | 1440 | No problems | No finding to re-check |
| A | Two-step setup | owner | dark | 390 | No problems | No finding to re-check |
| A | Two-step setup | owner | dark | 1440 | No problems | No finding to re-check |
| A | Two-step setup | admin | light | 390 | No problems | No finding to re-check |
| A | Two-step setup | admin | light | 1440 | No problems | No finding to re-check |
| A | Two-step setup | admin | dark | 390 | No problems | No finding to re-check |
| A | Two-step setup | admin | dark | 1440 | No problems | No finding to re-check |
| A | Two-step setup | member | light | 390 | No problems | No finding to re-check |
| A | Two-step setup | member | light | 1440 | No problems | No finding to re-check |
| A | Two-step setup | member | dark | 390 | No problems | No finding to re-check |
| A | Two-step setup | member | dark | 1440 | No problems | No finding to re-check |
| A | Dashboard | owner | light | 390 | #342, #354 | Pass: #342, #354 |
| A | Dashboard | owner | light | 1440 | #342 | Pass: #342 |
| A | Dashboard | owner | dark | 390 | #342, #354 | Pass: #342, #354 |
| A | Dashboard | owner | dark | 1440 | #342 | Pass: #342 |
| A | Dashboard | admin | light | 390 | #342, #354 | Pass: #342, #354 |
| A | Dashboard | admin | light | 1440 | #342 | Pass: #342 |
| A | Dashboard | admin | dark | 390 | #342, #354 | Pass: #342, #354 |
| A | Dashboard | admin | dark | 1440 | #342 | Pass: #342 |
| A | Dashboard | member | light | 390 | #342, #354 | Pass: #342, #354 |
| A | Dashboard | member | light | 1440 | #342 | Pass: #342 |
| A | Dashboard | member | dark | 390 | #342, #354 | Pass: #342, #354 |
| A | Dashboard | member | dark | 1440 | #342 | Pass: #342 |
| A | Transactions | owner | light | 390 | #343, #346, #350, #340 (filed by part C) | Pass: #327, #340, #343, #350 |
| A | Transactions | owner | light | 1440 | #343, #346, #350 | Pass: #343, #350 |
| A | Transactions | owner | dark | 390 | #343, #346, #350, #340 (filed by part C) | Pass: #340, #343, #350 |
| A | Transactions | owner | dark | 1440 | #343, #346, #350 | Pass: #343, #350 |
| A | Transactions | admin | light | 390 | #343, #346, #350, #340 (filed by part C) | Pass: #343, #350 |
| A | Transactions | admin | light | 1440 | #343, #346, #350 | Pass: #343, #350 |
| A | Transactions | admin | dark | 390 | #343, #346, #350, #340 (filed by part C) | Pass: #343, #350 |
| A | Transactions | admin | dark | 1440 | #343, #346, #350 | Pass: #343, #350 |
| A | Transactions | member | light | 390 | #343, #346, #340 (filed by part C) | Pass: #343 |
| A | Transactions | member | light | 1440 | #343, #346 | Pass: #343 |
| A | Transactions | member | dark | 390 | #343, #346, #340 (filed by part C) | Pass: #343 |
| A | Transactions | member | dark | 1440 | #343, #346 | Pass: #343 |
| A | Account detail | owner | light | 390 | #345, #347, #348, #349, #353 | Pass: #327, #340, #345, #347, #348, #349, #353 |
| A | Account detail | owner | light | 1440 | #345, #347, #348 | Pass: #345, #347, #348 |
| A | Account detail | owner | dark | 390 | #345, #347, #348, #349, #353 | Pass: #340, #345, #347, #348, #349, #353 |
| A | Account detail | owner | dark | 1440 | #345, #347, #348 | Pass: #345, #347, #348 |
| A | Account detail | admin | light | 390 | #345, #347, #348, #349, #353 | Pass: #345, #347, #348, #349, #353 |
| A | Account detail | admin | light | 1440 | #345, #347, #348 | Pass: #345, #347, #348 |
| A | Account detail | admin | dark | 390 | #345, #347, #348, #349, #353 | Pass: #345, #347, #348, #349, #353 |
| A | Account detail | admin | dark | 1440 | #345, #347, #348 | Pass: #345, #347, #348 |
| A | Account detail | member | light | 390 | #345, #347, #348, #349, #353 | Pass: #345, #347, #348, #349, #353 |
| A | Account detail | member | light | 1440 | #345, #347, #348 | Pass: #345, #347, #348 |
| A | Account detail | member | dark | 390 | #345, #347, #348, #349, #353 | Pass: #345, #347, #348, #349, #353 |
| A | Account detail | member | dark | 1440 | #345, #347, #348 | Pass: #345, #347, #348 |
| A | Category detail | owner | light | 390 | #331 (filed by part B: bare "Failed to load category") | Pass: #331 |
| A | Category detail | owner | light | 1440 | #331 (filed by part B: bare "Failed to load category") | Pass: #331 |
| A | Category detail | owner | dark | 390 | #331 (filed by part B: bare "Failed to load category") | Pass: #331 |
| A | Category detail | owner | dark | 1440 | #331 (filed by part B: bare "Failed to load category") | Pass: #331 |
| A | Category detail | admin | light | 390 | #331 (filed by part B: bare "Failed to load category") | Pass: #331 |
| A | Category detail | admin | light | 1440 | #331 (filed by part B: bare "Failed to load category") | Pass: #331 |
| A | Category detail | admin | dark | 390 | #331 (filed by part B: bare "Failed to load category") | Pass: #331 |
| A | Category detail | admin | dark | 1440 | #331 (filed by part B: bare "Failed to load category") | Pass: #331 |
| A | Category detail | member | light | 390 | #331 (filed by part B: bare "Failed to load category") | Pass: #331 |
| A | Category detail | member | light | 1440 | #331 (filed by part B: bare "Failed to load category") | Pass: #331 |
| A | Category detail | member | dark | 390 | #331 (filed by part B: bare "Failed to load category") | Pass: #331 |
| A | Category detail | member | dark | 1440 | #331 (filed by part B: bare "Failed to load category") | Pass: #331 |
| A | Accounts | owner | light | 390 | #344, #346, #341, #352, #349 | Pass: #327, #340, #341, #344, #346, #349, #351, #352 |
| A | Accounts | owner | light | 1440 | #344, #346, #341 | Pass: #341, #344, #346, #351 |
| A | Accounts | owner | dark | 390 | #344, #346, #341, #352, #349 | Pass: #340, #341, #344, #346, #349, #351, #352 |
| A | Accounts | owner | dark | 1440 | #344, #346, #341 | Pass: #341, #344, #346, #351 |
| A | Accounts | admin | light | 390 | #344, #346, #341, #352, #349 | Pass: #341, #344, #346, #349, #352 |
| A | Accounts | admin | light | 1440 | #344, #346, #341 | Pass: #341, #344, #346 |
| A | Accounts | admin | dark | 390 | #344, #346, #341, #352, #349 | Pass: #341, #344, #346, #349, #352 |
| A | Accounts | admin | dark | 1440 | #344, #346, #341 | Pass: #341, #344, #346 |
| A | Accounts | member | light | 390 | #344, #346, #351, #352 | Pass: #344, #346, #351, #352 |
| A | Accounts | member | light | 1440 | #344, #346, #351 | Pass: #344, #346, #351 |
| A | Accounts | member | dark | 390 | #344, #346, #351, #352 | Pass: #344, #346, #351, #352 |
| A | Accounts | member | dark | 1440 | #344, #346, #351 | Pass: #344, #346, #351 |
| B | Budget | owner | light | 390 | No problems (low: L1) | No finding to re-check |
| B | Budget | owner | light | 1440 | No problems | No finding to re-check |
| B | Budget | owner | dark | 390 | No problems (low: L1) | No finding to re-check |
| B | Budget | owner | dark | 1440 | No problems | No finding to re-check |
| B | Budget | admin | light | 390 | No problems (low: L1) | No finding to re-check |
| B | Budget | admin | light | 1440 | No problems | No finding to re-check |
| B | Budget | admin | dark | 390 | No problems (low: L1) | No finding to re-check |
| B | Budget | admin | dark | 1440 | No problems | No finding to re-check |
| B | Budget | member | light | 390 | No problems (low: L1) | No finding to re-check |
| B | Budget | member | light | 1440 | No problems | No finding to re-check |
| B | Budget | member | dark | 390 | No problems (low: L1) | No finding to re-check |
| B | Budget | member | dark | 1440 | No problems | No finding to re-check |
| B | Reports | owner | light | 390 | #326 (Summary amounts clipped) | Pass: [326-reports-summary-expanded-owner-light-390.png](screenshots/recheck/b/326-reports-summary-expanded-owner-light-390.png) |
| B | Reports | owner | light | 1440 | No problems | No finding to re-check; 1440 still lays out as before: [326-reports-summary-expanded-owner-light-1440.png](screenshots/recheck/b/326-reports-summary-expanded-owner-light-1440.png) |
| B | Reports | owner | dark | 390 | #326 (Summary amounts clipped) | Pass: [326-reports-summary-expanded-owner-dark-390.png](screenshots/recheck/b/326-reports-summary-expanded-owner-dark-390.png) |
| B | Reports | owner | dark | 1440 | No problems | No finding to re-check |
| B | Reports | admin | light | 390 | #326 (Summary amounts clipped) | Pass: [326-reports-summary-expanded-admin-light-390.png](screenshots/recheck/b/326-reports-summary-expanded-admin-light-390.png) |
| B | Reports | admin | light | 1440 | No problems | No finding to re-check |
| B | Reports | admin | dark | 390 | #326 (Summary amounts clipped) | Pass: [326-reports-summary-expanded-admin-dark-390.png](screenshots/recheck/b/326-reports-summary-expanded-admin-dark-390.png) |
| B | Reports | admin | dark | 1440 | No problems | No finding to re-check |
| B | Reports | member | light | 390 | #326 (Summary amounts clipped) | Pass: [326-reports-summary-expanded-member-light-390.png](screenshots/recheck/b/326-reports-summary-expanded-member-light-390.png) |
| B | Reports | member | light | 1440 | No problems | No finding to re-check |
| B | Reports | member | dark | 390 | #326 (Summary amounts clipped) | Pass: [326-reports-summary-expanded-member-dark-390.png](screenshots/recheck/b/326-reports-summary-expanded-member-dark-390.png) |
| B | Reports | member | dark | 1440 | No problems | No finding to re-check |
| B | Reviews | owner | light | 390 | No problems in the default view (low: L5) | No finding to re-check |
| B | Reviews | owner | light | 1440 | No problems in the default view | No finding to re-check |
| B | Reviews | owner | dark | 390 | No problems in the default view (low: L5) | No finding to re-check |
| B | Reviews | owner | dark | 1440 | No problems in the default view | No finding to re-check |
| B | Reviews | admin | light | 390 | No problems in the default view (low: L5) | No finding to re-check |
| B | Reviews | admin | light | 1440 | No problems in the default view | No finding to re-check |
| B | Reviews | admin | dark | 390 | No problems in the default view (low: L5) | No finding to re-check |
| B | Reviews | admin | dark | 1440 | No problems in the default view | No finding to re-check |
| B | Reviews | member | light | 390 | No problems in the default view (low: L5) | No finding to re-check |
| B | Reviews | member | light | 1440 | No problems in the default view | No finding to re-check |
| B | Reviews | member | dark | 390 | No problems in the default view (low: L5) | No finding to re-check |
| B | Reviews | member | dark | 1440 | No problems in the default view | No finding to re-check |
| B | Import | owner | light | 390 | No problems in the default view (Bank Sync tab) (low: L6, L16) | No finding to re-check |
| B | Import | owner | light | 1440 | No problems in the default view (Bank Sync tab) (low: L16) | No finding to re-check |
| B | Import | owner | dark | 390 | No problems in the default view (Bank Sync tab) (low: L6, L16) | No finding to re-check |
| B | Import | owner | dark | 1440 | No problems in the default view (Bank Sync tab) (low: L16) | No finding to re-check |
| B | Import | admin | light | 390 | No problems in the default view (Bank Sync tab) (low: L6, L16) | No finding to re-check |
| B | Import | admin | light | 1440 | No problems in the default view (Bank Sync tab) (low: L16) | No finding to re-check |
| B | Import | admin | dark | 390 | No problems in the default view (Bank Sync tab) (low: L6, L16) | No finding to re-check |
| B | Import | admin | dark | 1440 | No problems in the default view (Bank Sync tab) (low: L16) | No finding to re-check |
| B | Import | member | light | 390 | No problems in the default view (Bank Sync tab, 2 shared accounts only) (low: L6, L16) | No finding to re-check |
| B | Import | member | light | 1440 | No problems in the default view (Bank Sync tab, 2 shared accounts only) (low: L16) | No finding to re-check |
| B | Import | member | dark | 390 | No problems in the default view (Bank Sync tab, 2 shared accounts only) (low: L6, L16) | No finding to re-check |
| B | Import | member | dark | 1440 | No problems in the default view (Bank Sync tab, 2 shared accounts only) (low: L16) | No finding to re-check |
| B | Recurring | owner | light | 390 | No problems (low: L7) | No finding to re-check |
| B | Recurring | owner | light | 1440 | No problems | No finding to re-check |
| B | Recurring | owner | dark | 390 | No problems (low: L7) | No finding to re-check |
| B | Recurring | owner | dark | 1440 | No problems | No finding to re-check |
| B | Recurring | admin | light | 390 | No problems (low: L7) | No finding to re-check |
| B | Recurring | admin | light | 1440 | No problems | No finding to re-check |
| B | Recurring | admin | dark | 390 | No problems (low: L7) | No finding to re-check |
| B | Recurring | admin | dark | 1440 | No problems | No finding to re-check |
| B | Recurring | member | light | 390 | No problems (low: L7) | No finding to re-check |
| B | Recurring | member | light | 1440 | No problems | No finding to re-check |
| B | Recurring | member | dark | 390 | No problems (low: L7) | No finding to re-check |
| B | Recurring | member | dark | 1440 | No problems | No finding to re-check |
| B | Investments | owner | light | 390 | #325 (Market card not scoped to the viewer) (low: L4) | Pass (#325): [325-investments-other-persons-account-chart-owner-light-390.png](screenshots/recheck/b/325-investments-other-persons-account-chart-owner-light-390.png), [325-investments-other-persons-account-holdings-owner-light-390.png](screenshots/recheck/b/325-investments-other-persons-account-holdings-owner-light-390.png) |
| B | Investments | owner | light | 1440 | #325 (Market card not scoped to the viewer) (low: L4) | Pass (#325): [325-investments-other-persons-account-chart-owner-light-1440.png](screenshots/recheck/b/325-investments-other-persons-account-chart-owner-light-1440.png), [325-investments-other-persons-account-holdings-owner-light-1440.png](screenshots/recheck/b/325-investments-other-persons-account-holdings-owner-light-1440.png) |
| B | Investments | owner | dark | 390 | #325 (Market card not scoped to the viewer) (low: L4) | Pass (#325): [325-investments-other-persons-account-chart-owner-dark-390.png](screenshots/recheck/b/325-investments-other-persons-account-chart-owner-dark-390.png), [325-investments-other-persons-account-holdings-owner-dark-390.png](screenshots/recheck/b/325-investments-other-persons-account-holdings-owner-dark-390.png) |
| B | Investments | owner | dark | 1440 | #325 (Market card not scoped to the viewer) (low: L4) | Pass (#325): [325-investments-other-persons-account-chart-owner-dark-1440.png](screenshots/recheck/b/325-investments-other-persons-account-chart-owner-dark-1440.png), [325-investments-other-persons-account-holdings-owner-dark-1440.png](screenshots/recheck/b/325-investments-other-persons-account-holdings-owner-dark-1440.png) |
| B | Investments | admin | light | 390 | #325 (Market card not scoped to the viewer) (low: L4) | Pass (#325): [325-investments-other-persons-account-chart-admin-light-390.png](screenshots/recheck/b/325-investments-other-persons-account-chart-admin-light-390.png), [325-investments-other-persons-account-holdings-admin-light-390.png](screenshots/recheck/b/325-investments-other-persons-account-holdings-admin-light-390.png) |
| B | Investments | admin | light | 1440 | #325 (Market card not scoped to the viewer) (low: L4) | Pass (#325): [325-investments-other-persons-account-chart-admin-light-1440.png](screenshots/recheck/b/325-investments-other-persons-account-chart-admin-light-1440.png), [325-investments-other-persons-account-holdings-admin-light-1440.png](screenshots/recheck/b/325-investments-other-persons-account-holdings-admin-light-1440.png) |
| B | Investments | admin | dark | 390 | #325 (Market card not scoped to the viewer) (low: L4) | Pass (#325): [325-investments-other-persons-account-chart-admin-dark-390.png](screenshots/recheck/b/325-investments-other-persons-account-chart-admin-dark-390.png), [325-investments-other-persons-account-holdings-admin-dark-390.png](screenshots/recheck/b/325-investments-other-persons-account-holdings-admin-dark-390.png) |
| B | Investments | admin | dark | 1440 | #325 (Market card not scoped to the viewer) (low: L4) | Pass (#325): [325-investments-other-persons-account-chart-admin-dark-1440.png](screenshots/recheck/b/325-investments-other-persons-account-chart-admin-dark-1440.png), [325-investments-other-persons-account-holdings-admin-dark-1440.png](screenshots/recheck/b/325-investments-other-persons-account-holdings-admin-dark-1440.png) |
| B | Investments | member | light | 390 | #332 (empty state wording); #325 (low: L4) | Pass (#325): [325-investments-other-persons-account-chart-member-light-390.png](screenshots/recheck/b/325-investments-other-persons-account-chart-member-light-390.png), [325-investments-other-persons-account-holdings-member-light-390.png](screenshots/recheck/b/325-investments-other-persons-account-holdings-member-light-390.png). Pass (#332): [332-investments-empty-member-light-390.png](screenshots/recheck/b/332-investments-empty-member-light-390.png) |
| B | Investments | member | light | 1440 | #332 (empty state wording); #325 (low: L4) | Pass (#325): [325-investments-other-persons-account-chart-member-light-1440.png](screenshots/recheck/b/325-investments-other-persons-account-chart-member-light-1440.png), [325-investments-other-persons-account-holdings-member-light-1440.png](screenshots/recheck/b/325-investments-other-persons-account-holdings-member-light-1440.png). Pass (#332): [332-investments-empty-member-light-1440.png](screenshots/recheck/b/332-investments-empty-member-light-1440.png) |
| B | Investments | member | dark | 390 | #332 (empty state wording); #325 (low: L4) | Pass (#325): [325-investments-other-persons-account-chart-member-dark-390.png](screenshots/recheck/b/325-investments-other-persons-account-chart-member-dark-390.png), [325-investments-other-persons-account-holdings-member-dark-390.png](screenshots/recheck/b/325-investments-other-persons-account-holdings-member-dark-390.png). #332 empty state not captured in dark (same code as light) |
| B | Investments | member | dark | 1440 | #332 (empty state wording); #325 (low: L4) | Pass (#325): [325-investments-other-persons-account-chart-member-dark-1440.png](screenshots/recheck/b/325-investments-other-persons-account-chart-member-dark-1440.png), [325-investments-other-persons-account-holdings-member-dark-1440.png](screenshots/recheck/b/325-investments-other-persons-account-holdings-member-dark-1440.png). #332 empty state not captured in dark (same code as light) |
| C | Settings menu /settings (phone index; desktop opens Profile) | owner | light | 390 | ok | No finding to re-check |
| C | Settings menu /settings (phone index; desktop opens Profile) | owner | light | 1440 | ok | No finding to re-check |
| C | Settings menu /settings (phone index; desktop opens Profile) | owner | dark | 390 | ok | No finding to re-check |
| C | Settings menu /settings (phone index; desktop opens Profile) | owner | dark | 1440 | ok | No finding to re-check |
| C | Settings menu /settings (phone index; desktop opens Profile) | admin | light | 390 | ok | No finding to re-check |
| C | Settings menu /settings (phone index; desktop opens Profile) | admin | light | 1440 | ok | No finding to re-check |
| C | Settings menu /settings (phone index; desktop opens Profile) | admin | dark | 390 | ok | No finding to re-check |
| C | Settings menu /settings (phone index; desktop opens Profile) | admin | dark | 1440 | ok | No finding to re-check |
| C | Settings menu /settings (phone index; desktop opens Profile) | member | light | 390 | ok | No finding to re-check |
| C | Settings menu /settings (phone index; desktop opens Profile) | member | light | 1440 | ok | No finding to re-check |
| C | Settings menu /settings (phone index; desktop opens Profile) | member | dark | 390 | ok | No finding to re-check |
| C | Settings menu /settings (phone index; desktop opens Profile) | member | dark | 1440 | ok | No finding to re-check |
| C | Settings → Profile | owner | light | 390 | F6 | Pass: #340 |
| C | Settings → Profile | owner | light | 1440 | ok | Pass: #340 |
| C | Settings → Profile | owner | dark | 390 | F6 | Pass: #340 |
| C | Settings → Profile | owner | dark | 1440 | ok | Pass: #340 |
| C | Settings → Profile | admin | light | 390 | F6 | Pass: #340 |
| C | Settings → Profile | admin | light | 1440 | ok | Pass: #340 |
| C | Settings → Profile | admin | dark | 390 | F6 | Pass: #340 |
| C | Settings → Profile | admin | dark | 1440 | ok | Pass: #340 |
| C | Settings → Profile | member | light | 390 | F6 | Pass: #340 |
| C | Settings → Profile | member | light | 1440 | ok | Pass: #340 |
| C | Settings → Profile | member | dark | 390 | F6 | Pass: #340 |
| C | Settings → Profile | member | dark | 1440 | ok | Pass: #340 |
| C | Settings → Security | owner | light | 390 | ok | No finding to re-check |
| C | Settings → Security | owner | light | 1440 | ok | No finding to re-check |
| C | Settings → Security | owner | dark | 390 | ok | No finding to re-check |
| C | Settings → Security | owner | dark | 1440 | ok | No finding to re-check |
| C | Settings → Security | admin | light | 390 | ok | No finding to re-check |
| C | Settings → Security | admin | light | 1440 | ok | No finding to re-check |
| C | Settings → Security | admin | dark | 390 | ok | No finding to re-check |
| C | Settings → Security | admin | dark | 1440 | ok | No finding to re-check |
| C | Settings → Security | member | light | 390 | ok | No finding to re-check |
| C | Settings → Security | member | light | 1440 | ok | No finding to re-check |
| C | Settings → Security | member | dark | 390 | ok | No finding to re-check |
| C | Settings → Security | member | dark | 1440 | ok | No finding to re-check |
| C | Settings → Notifications | owner | light | 390 | ok | No finding to re-check |
| C | Settings → Notifications | owner | light | 1440 | ok | No finding to re-check |
| C | Settings → Notifications | owner | dark | 390 | ok | No finding to re-check |
| C | Settings → Notifications | owner | dark | 1440 | ok | No finding to re-check |
| C | Settings → Notifications | admin | light | 390 | ok | No finding to re-check |
| C | Settings → Notifications | admin | light | 1440 | ok | No finding to re-check |
| C | Settings → Notifications | admin | dark | 390 | ok | No finding to re-check |
| C | Settings → Notifications | admin | dark | 1440 | ok | No finding to re-check |
| C | Settings → Notifications | member | light | 390 | ok | No finding to re-check |
| C | Settings → Notifications | member | light | 1440 | ok | No finding to re-check |
| C | Settings → Notifications | member | dark | 390 | ok | No finding to re-check |
| C | Settings → Notifications | member | dark | 1440 | ok | No finding to re-check |
| C | Settings → Accounts | owner | light | 390 | ok | No finding to re-check |
| C | Settings → Accounts | owner | light | 1440 | ok | No finding to re-check |
| C | Settings → Accounts | owner | dark | 390 | ok | No finding to re-check |
| C | Settings → Accounts | owner | dark | 1440 | ok | No finding to re-check |
| C | Settings → Accounts | admin | light | 390 | ok | No finding to re-check |
| C | Settings → Accounts | admin | light | 1440 | ok | No finding to re-check |
| C | Settings → Accounts | admin | dark | 390 | ok | No finding to re-check |
| C | Settings → Accounts | admin | dark | 1440 | ok | No finding to re-check |
| C | Settings → Accounts | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Settings → Accounts | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Settings → Accounts | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Settings → Accounts | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Settings → Bank sync | owner | light | 390 | F3 | Pass: #337 |
| C | Settings → Bank sync | owner | light | 1440 | F3 | Pass: #337 |
| C | Settings → Bank sync | owner | dark | 390 | F3 | Pass: #337 |
| C | Settings → Bank sync | owner | dark | 1440 | F3 | Pass: #337 |
| C | Settings → Bank sync | admin | light | 390 | F3 | Pass: #337 |
| C | Settings → Bank sync | admin | light | 1440 | F3 | Pass: #337 |
| C | Settings → Bank sync | admin | dark | 390 | F3 | Pass: #337 |
| C | Settings → Bank sync | admin | dark | 1440 | F3 | Pass: #337 |
| C | Settings → Bank sync | member | light | 390 | F3 | Pass: #337 |
| C | Settings → Bank sync | member | light | 1440 | F3 | Pass: #337 |
| C | Settings → Bank sync | member | dark | 390 | F3 | Pass: #337 |
| C | Settings → Bank sync | member | dark | 1440 | F3 | Pass: #337 |
| C | Settings → Categories | owner | light | 390 | ok | No finding to re-check |
| C | Settings → Categories | owner | light | 1440 | ok | No finding to re-check |
| C | Settings → Categories | owner | dark | 390 | ok | No finding to re-check |
| C | Settings → Categories | owner | dark | 1440 | ok | No finding to re-check |
| C | Settings → Categories | admin | light | 390 | ok | No finding to re-check |
| C | Settings → Categories | admin | light | 1440 | ok | No finding to re-check |
| C | Settings → Categories | admin | dark | 390 | ok | No finding to re-check |
| C | Settings → Categories | admin | dark | 1440 | ok | No finding to re-check |
| C | Settings → Categories | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Settings → Categories | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Settings → Categories | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Settings → Categories | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Settings → Merchants | owner | light | 390 | ok | No finding to re-check |
| C | Settings → Merchants | owner | light | 1440 | ok | No finding to re-check |
| C | Settings → Merchants | owner | dark | 390 | ok | No finding to re-check |
| C | Settings → Merchants | owner | dark | 1440 | ok | No finding to re-check |
| C | Settings → Merchants | admin | light | 390 | ok | No finding to re-check |
| C | Settings → Merchants | admin | light | 1440 | ok | No finding to re-check |
| C | Settings → Merchants | admin | dark | 390 | ok | No finding to re-check |
| C | Settings → Merchants | admin | dark | 1440 | ok | No finding to re-check |
| C | Settings → Merchants | member | light | 390 | ok | No finding to re-check |
| C | Settings → Merchants | member | light | 1440 | ok | No finding to re-check |
| C | Settings → Merchants | member | dark | 390 | ok | No finding to re-check |
| C | Settings → Merchants | member | dark | 1440 | ok | No finding to re-check |
| C | Settings → Rules | owner | light | 390 | F6 | Pass: #340 |
| C | Settings → Rules | owner | light | 1440 | ok | Pass: #340 |
| C | Settings → Rules | owner | dark | 390 | F6 | Pass: #340 |
| C | Settings → Rules | owner | dark | 1440 | ok | Pass: #340 |
| C | Settings → Rules | admin | light | 390 | F6 | Pass: #340 |
| C | Settings → Rules | admin | light | 1440 | ok | Pass: #340 |
| C | Settings → Rules | admin | dark | 390 | F6 | Pass: #340 |
| C | Settings → Rules | admin | dark | 1440 | ok | Pass: #340 |
| C | Settings → Rules | member | light | 390 | F6 | Pass: #340 |
| C | Settings → Rules | member | light | 1440 | ok | Pass: #340 |
| C | Settings → Rules | member | dark | 390 | F6 | Pass: #340 |
| C | Settings → Rules | member | dark | 1440 | ok | Pass: #340 |
| C | Settings → Users & permissions | owner | light | 390 | ok | No finding to re-check |
| C | Settings → Users & permissions | owner | light | 1440 | ok | No finding to re-check |
| C | Settings → Users & permissions | owner | dark | 390 | ok | No finding to re-check |
| C | Settings → Users & permissions | owner | dark | 1440 | ok | No finding to re-check |
| C | Settings → Users & permissions | admin | light | 390 | ok | No finding to re-check |
| C | Settings → Users & permissions | admin | light | 1440 | ok | No finding to re-check |
| C | Settings → Users & permissions | admin | dark | 390 | ok | No finding to re-check |
| C | Settings → Users & permissions | admin | dark | 1440 | ok | No finding to re-check |
| C | Settings → Users & permissions | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Settings → Users & permissions | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Settings → Users & permissions | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Settings → Users & permissions | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Settings → Optional extras | owner | light | 390 | ok | No finding to re-check |
| C | Settings → Optional extras | owner | light | 1440 | ok | No finding to re-check |
| C | Settings → Optional extras | owner | dark | 390 | ok | No finding to re-check |
| C | Settings → Optional extras | owner | dark | 1440 | ok | No finding to re-check |
| C | Settings → Optional extras | admin | light | 390 | ok | No finding to re-check |
| C | Settings → Optional extras | admin | light | 1440 | ok | No finding to re-check |
| C | Settings → Optional extras | admin | dark | 390 | ok | No finding to re-check |
| C | Settings → Optional extras | admin | dark | 1440 | ok | No finding to re-check |
| C | Settings → Optional extras | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Settings → Optional extras | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Settings → Optional extras | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Settings → Optional extras | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Notifications pop-up (bell), with sample alerts | owner | light | 390 | F5 | Pass: #339 |
| C | Notifications pop-up (bell), with sample alerts | owner | light | 1440 | F5 | Pass: #339 |
| C | Notifications pop-up (bell), with sample alerts | owner | dark | 390 | F5 | Pass: #339 |
| C | Notifications pop-up (bell), with sample alerts | owner | dark | 1440 | F5 | Pass: #339 |
| C | Notifications pop-up (bell), with sample alerts | admin | light | 390 | F5 | Pass: #339 |
| C | Notifications pop-up (bell), with sample alerts | admin | light | 1440 | F5 | Pass: #339 |
| C | Notifications pop-up (bell), with sample alerts | admin | dark | 390 | F5 | Pass: #339 |
| C | Notifications pop-up (bell), with sample alerts | admin | dark | 1440 | F5 | Pass: #339 |
| C | Notifications pop-up (bell), with sample alerts | member | light | 390 | F5 | Pass: #339 |
| C | Notifications pop-up (bell), with sample alerts | member | light | 1440 | F5 | Pass: #339 |
| C | Notifications pop-up (bell), with sample alerts | member | dark | 390 | F5 | Pass: #339 |
| C | Notifications pop-up (bell), with sample alerts | member | dark | 1440 | F5 | Pass: #339 |
| C | Edit account window | owner | light | 390 | F6 | Pass: #340 |
| C | Edit account window | owner | light | 1440 | ok | Pass: #340 |
| C | Edit account window | owner | dark | 390 | F6 | Pass: #340 |
| C | Edit account window | owner | dark | 1440 | ok | Pass: #340 |
| C | Edit account window | admin | light | 390 | F6 | Pass: #340 |
| C | Edit account window | admin | light | 1440 | ok | Pass: #340 |
| C | Edit account window | admin | dark | 390 | F6 | Pass: #340 |
| C | Edit account window | admin | dark | 1440 | ok | Pass: #340 |
| C | Edit account window | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit account window | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit account window | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit account window | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Add account window | owner | light | 390 | ok | Pass: #349 |
| C | Add account window | owner | light | 1440 | ok | Pass: #349 |
| C | Add account window | owner | dark | 390 | ok | Pass: #349 |
| C | Add account window | owner | dark | 1440 | ok | Pass: #349 |
| C | Add account window | admin | light | 390 | ok | Pass: #349 |
| C | Add account window | admin | light | 1440 | ok | Pass: #349 |
| C | Add account window | admin | dark | 390 | ok | Pass: #349 |
| C | Add account window | admin | dark | 1440 | ok | Pass: #349 |
| C | Add account window | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Add account window | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Add account window | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Add account window | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit account → Remove confirmation | owner | light | 390 | F6 F1 | Pass: #335, #340 |
| C | Edit account → Remove confirmation | owner | light | 1440 | ok | Pass: #335, #340 |
| C | Edit account → Remove confirmation | owner | dark | 390 | F6 F1 | Pass: #335, #340 |
| C | Edit account → Remove confirmation | owner | dark | 1440 | ok | Pass: #335, #340 |
| C | Edit account → Remove confirmation | admin | light | 390 | F6 F1 | Pass: #335, #340 |
| C | Edit account → Remove confirmation | admin | light | 1440 | ok | Pass: #335, #340 |
| C | Edit account → Remove confirmation | admin | dark | 390 | F6 F1 | Pass: #335, #340 |
| C | Edit account → Remove confirmation | admin | dark | 1440 | ok | Pass: #335, #340 |
| C | Edit account → Remove confirmation | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit account → Remove confirmation | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit account → Remove confirmation | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit account → Remove confirmation | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit account → Upload photo → Crop window | owner | light | 390 | ok | No finding to re-check |
| C | Edit account → Upload photo → Crop window | owner | light | 1440 | ok | No finding to re-check |
| C | Edit account → Upload photo → Crop window | owner | dark | 390 | ok | No finding to re-check |
| C | Edit account → Upload photo → Crop window | owner | dark | 1440 | ok | No finding to re-check |
| C | Edit account → Upload photo → Crop window | admin | light | 390 | ok | No finding to re-check |
| C | Edit account → Upload photo → Crop window | admin | light | 1440 | ok | No finding to re-check |
| C | Edit account → Upload photo → Crop window | admin | dark | 390 | ok | No finding to re-check |
| C | Edit account → Upload photo → Crop window | admin | dark | 1440 | ok | No finding to re-check |
| C | Edit account → Upload photo → Crop window | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit account → Upload photo → Crop window | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit account → Upload photo → Crop window | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit account → Upload photo → Crop window | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Financial institutions window | owner | light | 390 | F6 F2 | Pass: #336, #340, #391 (#390–#392 re-checked in report-d: pass) |
| C | Financial institutions window | owner | light | 1440 | F2 | Pass: #336, #340, #391 (#390–#392 re-checked in report-d: pass) |
| C | Financial institutions window | owner | dark | 390 | F6 F2 | Pass: #336, #340, #391 (#390–#392 re-checked in report-d: pass) |
| C | Financial institutions window | owner | dark | 1440 | F2 | Pass: #336, #340, #391 (#390–#392 re-checked in report-d: pass) |
| C | Financial institutions window | admin | light | 390 | F6 F2 | Pass: #336, #340, #391 (#390–#392 re-checked in report-d: pass) |
| C | Financial institutions window | admin | light | 1440 | F2 | Pass: #336, #340, #391 (#390–#392 re-checked in report-d: pass) |
| C | Financial institutions window | admin | dark | 390 | F6 F2 | Pass: #336, #340, #391 (#390–#392 re-checked in report-d: pass) |
| C | Financial institutions window | admin | dark | 1440 | F2 | Pass: #336, #340, #391 (#390–#392 re-checked in report-d: pass) |
| C | Financial institutions window | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Financial institutions window | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Financial institutions window | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Financial institutions window | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Connect SimpleFIN window | owner | light | 390 | F6 | Pass: #340, #392 (#390–#392 re-checked in report-d: pass) |
| C | Connect SimpleFIN window | owner | light | 1440 | ok | Pass: #340, #392 (#390–#392 re-checked in report-d: pass) |
| C | Connect SimpleFIN window | owner | dark | 390 | F6 | Pass: #340, #392 (#390–#392 re-checked in report-d: pass) |
| C | Connect SimpleFIN window | owner | dark | 1440 | ok | Pass: #340, #392 (#390–#392 re-checked in report-d: pass) |
| C | Connect SimpleFIN window | admin | light | 390 | F6 | Pass: #340, #392 (#390–#392 re-checked in report-d: pass) |
| C | Connect SimpleFIN window | admin | light | 1440 | ok | Pass: #340, #392 (#390–#392 re-checked in report-d: pass) |
| C | Connect SimpleFIN window | admin | dark | 390 | F6 | Pass: #340, #392 (#390–#392 re-checked in report-d: pass) |
| C | Connect SimpleFIN window | admin | dark | 1440 | ok | Pass: #340, #392 (#390–#392 re-checked in report-d: pass) |
| C | Connect SimpleFIN window | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Connect SimpleFIN window | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Connect SimpleFIN window | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Connect SimpleFIN window | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit connection window | owner | light | 390 | F6 | Pass: #340 |
| C | Edit connection window | owner | light | 1440 | ok | Pass: #340 |
| C | Edit connection window | owner | dark | 390 | F6 | Pass: #340 |
| C | Edit connection window | owner | dark | 1440 | ok | Pass: #340 |
| C | Edit connection window | admin | light | 390 | F6 | Pass: #340 |
| C | Edit connection window | admin | light | 1440 | ok | Pass: #340 |
| C | Edit connection window | admin | dark | 390 | F6 | Pass: #340 |
| C | Edit connection window | admin | dark | 1440 | ok | Pass: #340 |
| C | Edit connection window | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit connection window | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit connection window | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit connection window | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Reconnect (sample savings feed) | owner | light | 390 | F6 | Pass: #340 |
| C | Reconnect (sample savings feed) | owner | light | 1440 | ok | Pass: #340 |
| C | Reconnect (sample savings feed) | owner | dark | 390 | F6 | Pass: #340 |
| C | Reconnect (sample savings feed) | owner | dark | 1440 | ok | Pass: #340 |
| C | Reconnect (sample savings feed) | admin | light | 390 | F6 | Pass: #340 |
| C | Reconnect (sample savings feed) | admin | light | 1440 | ok | Pass: #340 |
| C | Reconnect (sample savings feed) | admin | dark | 390 | F6 | Pass: #340 |
| C | Reconnect (sample savings feed) | admin | dark | 1440 | ok | Pass: #340 |
| C | Reconnect (sample savings feed) | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Reconnect (sample savings feed) | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Reconnect (sample savings feed) | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Reconnect (sample savings feed) | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Bank sync → Disconnect confirmation | owner | light | 390 | ok | No finding to re-check |
| C | Bank sync → Disconnect confirmation | owner | light | 1440 | ok | No finding to re-check |
| C | Bank sync → Disconnect confirmation | owner | dark | 390 | ok | No finding to re-check |
| C | Bank sync → Disconnect confirmation | owner | dark | 1440 | ok | No finding to re-check |
| C | Bank sync → Disconnect confirmation | admin | light | 390 | ok | No finding to re-check |
| C | Bank sync → Disconnect confirmation | admin | light | 1440 | ok | No finding to re-check |
| C | Bank sync → Disconnect confirmation | admin | dark | 390 | ok | No finding to re-check |
| C | Bank sync → Disconnect confirmation | admin | dark | 1440 | ok | No finding to re-check |
| C | Bank sync → Disconnect confirmation | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Bank sync → Disconnect confirmation | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Bank sync → Disconnect confirmation | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Bank sync → Disconnect confirmation | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit category window | owner | light | 390 | F6 | Pass: #340 |
| C | Edit category window | owner | light | 1440 | ok | Pass: #340 |
| C | Edit category window | owner | dark | 390 | F6 | Pass: #340 |
| C | Edit category window | owner | dark | 1440 | ok | Pass: #340 |
| C | Edit category window | admin | light | 390 | F6 | Pass: #340 |
| C | Edit category window | admin | light | 1440 | ok | Pass: #340 |
| C | Edit category window | admin | dark | 390 | F6 | Pass: #340 |
| C | Edit category window | admin | dark | 1440 | ok | Pass: #340 |
| C | Edit category window | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit category window | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit category window | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit category window | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit category → Delete confirmation | owner | light | 390 | F6 F1 | Pass: #335, #340 |
| C | Edit category → Delete confirmation | owner | light | 1440 | F1 | Pass: #335, #340 |
| C | Edit category → Delete confirmation | owner | dark | 390 | F6 F1 | Pass: #335, #340 |
| C | Edit category → Delete confirmation | owner | dark | 1440 | F1 | Pass: #335, #340 |
| C | Edit category → Delete confirmation | admin | light | 390 | F6 F1 | Pass: #335, #340 |
| C | Edit category → Delete confirmation | admin | light | 1440 | F1 | Pass: #335, #340 |
| C | Edit category → Delete confirmation | admin | dark | 390 | F6 F1 | Pass: #335, #340 |
| C | Edit category → Delete confirmation | admin | dark | 1440 | F1 | Pass: #335, #340 |
| C | Edit category → Delete confirmation | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit category → Delete confirmation | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit category → Delete confirmation | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit category → Delete confirmation | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit category → icon tile | owner | light | 390 | F6 | Pass: #340 |
| C | Edit category → icon tile | owner | light | 1440 | ok | Pass: #340 |
| C | Edit category → icon tile | owner | dark | 390 | F6 | Pass: #340 |
| C | Edit category → icon tile | owner | dark | 1440 | ok | Pass: #340 |
| C | Edit category → icon tile | admin | light | 390 | F6 | Pass: #340 |
| C | Edit category → icon tile | admin | light | 1440 | ok | Pass: #340 |
| C | Edit category → icon tile | admin | dark | 390 | F6 | Pass: #340 |
| C | Edit category → icon tile | admin | dark | 1440 | ok | Pass: #340 |
| C | Edit category → icon tile | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit category → icon tile | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit category → icon tile | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit category → icon tile | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | New category window | owner | light | 390 | ok | Pass: #392 (#390–#392 re-checked in report-d: pass) |
| C | New category window | owner | light | 1440 | ok | Pass: #392 (#390–#392 re-checked in report-d: pass) |
| C | New category window | owner | dark | 390 | ok | Pass: #392 (#390–#392 re-checked in report-d: pass) |
| C | New category window | owner | dark | 1440 | ok | Pass: #392 (#390–#392 re-checked in report-d: pass) |
| C | New category window | admin | light | 390 | ok | Pass: #392 (#390–#392 re-checked in report-d: pass) |
| C | New category window | admin | light | 1440 | ok | Pass: #392 (#390–#392 re-checked in report-d: pass) |
| C | New category window | admin | dark | 390 | ok | Pass: #392 (#390–#392 re-checked in report-d: pass) |
| C | New category window | admin | dark | 1440 | ok | Pass: #392 (#390–#392 re-checked in report-d: pass) |
| C | New category window | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | New category window | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | New category window | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | New category window | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | New group window | owner | light | 390 | ok | Pass: #392 (#390–#392 re-checked in report-d: pass) |
| C | New group window | owner | light | 1440 | ok | Pass: #392 (#390–#392 re-checked in report-d: pass) |
| C | New group window | owner | dark | 390 | ok | Pass: #392 (#390–#392 re-checked in report-d: pass) |
| C | New group window | owner | dark | 1440 | ok | Pass: #392 (#390–#392 re-checked in report-d: pass) |
| C | New group window | admin | light | 390 | ok | Pass: #392 (#390–#392 re-checked in report-d: pass) |
| C | New group window | admin | light | 1440 | ok | Pass: #392 (#390–#392 re-checked in report-d: pass) |
| C | New group window | admin | dark | 390 | ok | Pass: #392 (#390–#392 re-checked in report-d: pass) |
| C | New group window | admin | dark | 1440 | ok | Pass: #392 (#390–#392 re-checked in report-d: pass) |
| C | New group window | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | New group window | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | New group window | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | New group window | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit group window | owner | light | 390 | ok | No finding to re-check |
| C | Edit group window | owner | light | 1440 | ok | No finding to re-check |
| C | Edit group window | owner | dark | 390 | ok | No finding to re-check |
| C | Edit group window | owner | dark | 1440 | ok | No finding to re-check |
| C | Edit group window | admin | light | 390 | ok | No finding to re-check |
| C | Edit group window | admin | light | 1440 | ok | No finding to re-check |
| C | Edit group window | admin | dark | 390 | ok | No finding to re-check |
| C | Edit group window | admin | dark | 1440 | ok | No finding to re-check |
| C | Edit group window | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit group window | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit group window | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit group window | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit merchant window | owner | light | 390 | F6 | Pass: #340 |
| C | Edit merchant window | owner | light | 1440 | ok | Pass: #340 |
| C | Edit merchant window | owner | dark | 390 | F6 | Pass: #340 |
| C | Edit merchant window | owner | dark | 1440 | ok | Pass: #340 |
| C | Edit merchant window | admin | light | 390 | F6 | Pass: #340 |
| C | Edit merchant window | admin | light | 1440 | ok | Pass: #340 |
| C | Edit merchant window | admin | dark | 390 | F6 | Pass: #340 |
| C | Edit merchant window | admin | dark | 1440 | ok | Pass: #340 |
| C | Edit merchant window | member | light | 390 | F6 | Pass: #340 |
| C | Edit merchant window | member | light | 1440 | ok | Pass: #340 |
| C | Edit merchant window | member | dark | 390 | F6 | Pass: #340 |
| C | Edit merchant window | member | dark | 1440 | ok | Pass: #340 |
| C | Edit merchant → Merge & delete | owner | light | 390 | ok | No finding to re-check |
| C | Edit merchant → Merge & delete | owner | light | 1440 | ok | No finding to re-check |
| C | Edit merchant → Merge & delete | owner | dark | 390 | ok | No finding to re-check |
| C | Edit merchant → Merge & delete | owner | dark | 1440 | ok | No finding to re-check |
| C | Edit merchant → Merge & delete | admin | light | 390 | ok | No finding to re-check |
| C | Edit merchant → Merge & delete | admin | light | 1440 | ok | No finding to re-check |
| C | Edit merchant → Merge & delete | admin | dark | 390 | ok | No finding to re-check |
| C | Edit merchant → Merge & delete | admin | dark | 1440 | ok | No finding to re-check |
| C | Edit merchant → Merge & delete | member | light | 390 | ok | No finding to re-check |
| C | Edit merchant → Merge & delete | member | light | 1440 | ok | No finding to re-check |
| C | Edit merchant → Merge & delete | member | dark | 390 | ok | No finding to re-check |
| C | Edit merchant → Merge & delete | member | dark | 1440 | ok | No finding to re-check |
| C | Merchants sort menu | owner | light | 390 | ok | No finding to re-check |
| C | Merchants sort menu | owner | light | 1440 | ok | No finding to re-check |
| C | Merchants sort menu | owner | dark | 390 | ok | No finding to re-check |
| C | Merchants sort menu | owner | dark | 1440 | ok | No finding to re-check |
| C | Merchants sort menu | admin | light | 390 | ok | No finding to re-check |
| C | Merchants sort menu | admin | light | 1440 | ok | No finding to re-check |
| C | Merchants sort menu | admin | dark | 390 | ok | No finding to re-check |
| C | Merchants sort menu | admin | dark | 1440 | ok | No finding to re-check |
| C | Merchants sort menu | member | light | 390 | ok | No finding to re-check |
| C | Merchants sort menu | member | light | 1440 | ok | No finding to re-check |
| C | Merchants sort menu | member | dark | 390 | ok | No finding to re-check |
| C | Merchants sort menu | member | dark | 1440 | ok | No finding to re-check |
| C | Merchants search with no match (empty) | owner | light | 390 | ok | Pass: #391 (#390–#392 re-checked in report-d: pass) |
| C | Merchants search with no match (empty) | owner | light | 1440 | ok | Pass: #391 (#390–#392 re-checked in report-d: pass) |
| C | Merchants search with no match (empty) | owner | dark | 390 | ok | Pass: #391 (#390–#392 re-checked in report-d: pass) |
| C | Merchants search with no match (empty) | owner | dark | 1440 | ok | Pass: #391 (#390–#392 re-checked in report-d: pass) |
| C | Merchants search with no match (empty) | admin | light | 390 | ok | Pass: #391 (#390–#392 re-checked in report-d: pass) |
| C | Merchants search with no match (empty) | admin | light | 1440 | ok | Pass: #391 (#390–#392 re-checked in report-d: pass) |
| C | Merchants search with no match (empty) | admin | dark | 390 | ok | Pass: #391 (#390–#392 re-checked in report-d: pass) |
| C | Merchants search with no match (empty) | admin | dark | 1440 | ok | Pass: #391 (#390–#392 re-checked in report-d: pass) |
| C | Merchants search with no match (empty) | member | light | 390 | ok | Pass: #391 (#390–#392 re-checked in report-d: pass) |
| C | Merchants search with no match (empty) | member | light | 1440 | ok | Pass: #391 (#390–#392 re-checked in report-d: pass) |
| C | Merchants search with no match (empty) | member | dark | 390 | ok | Pass: #391 (#390–#392 re-checked in report-d: pass) |
| C | Merchants search with no match (empty) | member | dark | 1440 | ok | Pass: #391 (#390–#392 re-checked in report-d: pass) |
| C | Rules → Delete confirmation | owner | light | 390 | ok | No finding to re-check |
| C | Rules → Delete confirmation | owner | light | 1440 | ok | No finding to re-check |
| C | Rules → Delete confirmation | owner | dark | 390 | ok | No finding to re-check |
| C | Rules → Delete confirmation | owner | dark | 1440 | ok | No finding to re-check |
| C | Rules → Delete confirmation | admin | light | 390 | ok | No finding to re-check |
| C | Rules → Delete confirmation | admin | light | 1440 | ok | No finding to re-check |
| C | Rules → Delete confirmation | admin | dark | 390 | ok | No finding to re-check |
| C | Rules → Delete confirmation | admin | dark | 1440 | ok | No finding to re-check |
| C | Rules → Delete confirmation | member | light | 390 | ok | No finding to re-check |
| C | Rules → Delete confirmation | member | light | 1440 | ok | No finding to re-check |
| C | Rules → Delete confirmation | member | dark | 390 | ok | No finding to re-check |
| C | Rules → Delete confirmation | member | dark | 1440 | ok | No finding to re-check |
| C | Rules search with no match (empty) | owner | light | 390 | ok | No finding to re-check |
| C | Rules search with no match (empty) | owner | light | 1440 | ok | No finding to re-check |
| C | Rules search with no match (empty) | owner | dark | 390 | ok | No finding to re-check |
| C | Rules search with no match (empty) | owner | dark | 1440 | ok | No finding to re-check |
| C | Rules search with no match (empty) | admin | light | 390 | ok | No finding to re-check |
| C | Rules search with no match (empty) | admin | light | 1440 | ok | No finding to re-check |
| C | Rules search with no match (empty) | admin | dark | 390 | ok | No finding to re-check |
| C | Rules search with no match (empty) | admin | dark | 1440 | ok | No finding to re-check |
| C | Rules search with no match (empty) | member | light | 390 | ok | No finding to re-check |
| C | Rules search with no match (empty) | member | light | 1440 | ok | No finding to re-check |
| C | Rules search with no match (empty) | member | dark | 390 | ok | No finding to re-check |
| C | Rules search with no match (empty) | member | dark | 1440 | ok | No finding to re-check |
| C | Person window: John (owner) | owner | light | 390 | ok | No finding to re-check |
| C | Person window: John (owner) | owner | light | 1440 | ok | No finding to re-check |
| C | Person window: John (owner) | owner | dark | 390 | ok | No finding to re-check |
| C | Person window: John (owner) | owner | dark | 1440 | ok | No finding to re-check |
| C | Person window: John (owner) | admin | light | 390 | ok | No finding to re-check |
| C | Person window: John (owner) | admin | light | 1440 | ok | No finding to re-check |
| C | Person window: John (owner) | admin | dark | 390 | ok | No finding to re-check |
| C | Person window: John (owner) | admin | dark | 1440 | ok | No finding to re-check |
| C | Person window: John (owner) | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Person window: John (owner) | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Person window: John (owner) | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Person window: John (owner) | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Person window: Jane (admin) | owner | light | 390 | ok | No finding to re-check |
| C | Person window: Jane (admin) | owner | light | 1440 | ok | No finding to re-check |
| C | Person window: Jane (admin) | owner | dark | 390 | ok | No finding to re-check |
| C | Person window: Jane (admin) | owner | dark | 1440 | ok | No finding to re-check |
| C | Person window: Jane (admin) | admin | light | 390 | ok | No finding to re-check |
| C | Person window: Jane (admin) | admin | light | 1440 | ok | No finding to re-check |
| C | Person window: Jane (admin) | admin | dark | 390 | ok | No finding to re-check |
| C | Person window: Jane (admin) | admin | dark | 1440 | ok | No finding to re-check |
| C | Person window: Jane (admin) | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Person window: Jane (admin) | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Person window: Jane (admin) | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Person window: Jane (admin) | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Person window: Sample Member | owner | light | 390 | ok | No finding to re-check |
| C | Person window: Sample Member | owner | light | 1440 | ok | No finding to re-check |
| C | Person window: Sample Member | owner | dark | 390 | ok | No finding to re-check |
| C | Person window: Sample Member | owner | dark | 1440 | ok | No finding to re-check |
| C | Person window: Sample Member | admin | light | 390 | ok | No finding to re-check |
| C | Person window: Sample Member | admin | light | 1440 | ok | No finding to re-check |
| C | Person window: Sample Member | admin | dark | 390 | ok | No finding to re-check |
| C | Person window: Sample Member | admin | dark | 1440 | ok | No finding to re-check |
| C | Person window: Sample Member | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Person window: Sample Member | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Person window: Sample Member | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Person window: Sample Member | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Person window → Customize switches | owner | light | 390 | ok | No finding to re-check |
| C | Person window → Customize switches | owner | light | 1440 | ok | No finding to re-check |
| C | Person window → Customize switches | owner | dark | 390 | ok | No finding to re-check |
| C | Person window → Customize switches | owner | dark | 1440 | ok | No finding to re-check |
| C | Person window → Customize switches | admin | light | 390 | ok | No finding to re-check |
| C | Person window → Customize switches | admin | light | 1440 | ok | No finding to re-check |
| C | Person window → Customize switches | admin | dark | 390 | ok | No finding to re-check |
| C | Person window → Customize switches | admin | dark | 1440 | ok | No finding to re-check |
| C | Person window → Customize switches | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Person window → Customize switches | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Person window → Customize switches | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Person window → Customize switches | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Add user window | owner | light | 390 | ok | Pass: #392 (#390–#392 re-checked in report-d: pass) |
| C | Add user window | owner | light | 1440 | ok | Pass: #392 (#390–#392 re-checked in report-d: pass) |
| C | Add user window | owner | dark | 390 | ok | Pass: #392 (#390–#392 re-checked in report-d: pass) |
| C | Add user window | owner | dark | 1440 | ok | Pass: #392 (#390–#392 re-checked in report-d: pass) |
| C | Add user window | admin | light | 390 | ok | Pass: #392 (#390–#392 re-checked in report-d: pass) |
| C | Add user window | admin | light | 1440 | ok | Pass: #392 (#390–#392 re-checked in report-d: pass) |
| C | Add user window | admin | dark | 390 | ok | Pass: #392 (#390–#392 re-checked in report-d: pass) |
| C | Add user window | admin | dark | 1440 | ok | Pass: #392 (#390–#392 re-checked in report-d: pass) |
| C | Add user window | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Add user window | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Add user window | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Add user window | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit name or password window | owner | light | 390 | ok | No finding to re-check |
| C | Edit name or password window | owner | light | 1440 | ok | No finding to re-check |
| C | Edit name or password window | owner | dark | 390 | ok | No finding to re-check |
| C | Edit name or password window | owner | dark | 1440 | ok | No finding to re-check |
| C | Edit name or password window | admin | light | 390 | ok | No finding to re-check |
| C | Edit name or password window | admin | light | 1440 | ok | No finding to re-check |
| C | Edit name or password window | admin | dark | 390 | ok | No finding to re-check |
| C | Edit name or password window | admin | dark | 1440 | ok | No finding to re-check |
| C | Edit name or password window | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit name or password window | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit name or password window | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit name or password window | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Delete user confirmation | owner | light | 390 | ok | No finding to re-check |
| C | Delete user confirmation | owner | light | 1440 | ok | No finding to re-check |
| C | Delete user confirmation | owner | dark | 390 | ok | No finding to re-check |
| C | Delete user confirmation | owner | dark | 1440 | ok | No finding to re-check |
| C | Delete user confirmation | admin | light | 390 | ok | No finding to re-check |
| C | Delete user confirmation | admin | light | 1440 | ok | No finding to re-check |
| C | Delete user confirmation | admin | dark | 390 | ok | No finding to re-check |
| C | Delete user confirmation | admin | dark | 1440 | ok | No finding to re-check |
| C | Delete user confirmation | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Delete user confirmation | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Delete user confirmation | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Delete user confirmation | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Security → password mismatch error | owner | light | 390 | ok | No finding to re-check |
| C | Security → password mismatch error | owner | light | 1440 | ok | No finding to re-check |
| C | Security → password mismatch error | owner | dark | 390 | ok | No finding to re-check |
| C | Security → password mismatch error | owner | dark | 1440 | ok | No finding to re-check |
| C | Security → password mismatch error | admin | light | 390 | ok | No finding to re-check |
| C | Security → password mismatch error | admin | light | 1440 | ok | No finding to re-check |
| C | Security → password mismatch error | admin | dark | 390 | ok | No finding to re-check |
| C | Security → password mismatch error | admin | dark | 1440 | ok | No finding to re-check |
| C | Security → password mismatch error | member | light | 390 | ok | No finding to re-check |
| C | Security → password mismatch error | member | light | 1440 | ok | No finding to re-check |
| C | Security → password mismatch error | member | dark | 390 | ok | No finding to re-check |
| C | Security → password mismatch error | member | dark | 1440 | ok | No finding to re-check |
| C | Security → Set up two-factor window | owner | light | 390 | ok | No finding to re-check |
| C | Security → Set up two-factor window | owner | light | 1440 | ok | No finding to re-check |
| C | Security → Set up two-factor window | owner | dark | 390 | ok | No finding to re-check |
| C | Security → Set up two-factor window | owner | dark | 1440 | ok | No finding to re-check |
| C | Security → Set up two-factor window | admin | light | 390 | ok | No finding to re-check |
| C | Security → Set up two-factor window | admin | light | 1440 | ok | No finding to re-check |
| C | Security → Set up two-factor window | admin | dark | 390 | ok | No finding to re-check |
| C | Security → Set up two-factor window | admin | dark | 1440 | ok | No finding to re-check |
| C | Security → Set up two-factor window | member | light | 390 | ok | No finding to re-check |
| C | Security → Set up two-factor window | member | light | 1440 | ok | No finding to re-check |
| C | Security → Set up two-factor window | member | dark | 390 | ok | No finding to re-check |
| C | Security → Set up two-factor window | member | dark | 1440 | ok | No finding to re-check |
| C | Optional extras → AI Test connection (failed test) | owner | light | 390 | ok | No finding to re-check |
| C | Optional extras → AI Test connection (failed test) | owner | light | 1440 | ok | No finding to re-check |
| C | Optional extras → AI Test connection (failed test) | owner | dark | 390 | ok | No finding to re-check |
| C | Optional extras → AI Test connection (failed test) | owner | dark | 1440 | ok | No finding to re-check |
| C | Optional extras → AI Test connection (failed test) | admin | light | 390 | ok | No finding to re-check |
| C | Optional extras → AI Test connection (failed test) | admin | light | 1440 | ok | No finding to re-check |
| C | Optional extras → AI Test connection (failed test) | admin | dark | 390 | ok | No finding to re-check |
| C | Optional extras → AI Test connection (failed test) | admin | dark | 1440 | ok | No finding to re-check |
| C | Optional extras → AI Test connection (failed test) | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Optional extras → AI Test connection (failed test) | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Optional extras → AI Test connection (failed test) | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Optional extras → AI Test connection (failed test) | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Transaction detail (sheet on phone, side panel on desktop) | owner | light | 390 | F6 | Pass: #340 |
| C | Transaction detail (sheet on phone, side panel on desktop) | owner | light | 1440 | ok | Pass: #340 |
| C | Transaction detail (sheet on phone, side panel on desktop) | owner | dark | 390 | F6 | Pass: #340 |
| C | Transaction detail (sheet on phone, side panel on desktop) | owner | dark | 1440 | ok | Pass: #340 |
| C | Transaction detail (sheet on phone, side panel on desktop) | admin | light | 390 | F6 | Pass: #340 |
| C | Transaction detail (sheet on phone, side panel on desktop) | admin | light | 1440 | ok | Pass: #340 |
| C | Transaction detail (sheet on phone, side panel on desktop) | admin | dark | 390 | F6 | Pass: #340 |
| C | Transaction detail (sheet on phone, side panel on desktop) | admin | dark | 1440 | ok | Pass: #340 |
| C | Transaction detail (sheet on phone, side panel on desktop) | member | light | 390 | F6 | Pass: #340 |
| C | Transaction detail (sheet on phone, side panel on desktop) | member | light | 1440 | ok | Pass: #340 |
| C | Transaction detail (sheet on phone, side panel on desktop) | member | dark | 390 | F6 | Pass: #340 |
| C | Transaction detail (sheet on phone, side panel on desktop) | member | dark | 1440 | ok | Pass: #340 |
| C | Transaction detail → Delete confirmation | owner | light | 390 | F6 | Pass: #340 |
| C | Transaction detail → Delete confirmation | owner | light | 1440 | ok | Pass: #340 |
| C | Transaction detail → Delete confirmation | owner | dark | 390 | F6 | Pass: #340 |
| C | Transaction detail → Delete confirmation | owner | dark | 1440 | ok | Pass: #340 |
| C | Transaction detail → Delete confirmation | admin | light | 390 | F6 | Pass: #340 |
| C | Transaction detail → Delete confirmation | admin | light | 1440 | ok | Pass: #340 |
| C | Transaction detail → Delete confirmation | admin | dark | 390 | F6 | Pass: #340 |
| C | Transaction detail → Delete confirmation | admin | dark | 1440 | ok | Pass: #340 |
| C | Transaction detail → Delete confirmation | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Transaction detail → Delete confirmation | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Transaction detail → Delete confirmation | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Transaction detail → Delete confirmation | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Add transaction window | owner | light | 390 | F6 | Pass: #340 |
| C | Add transaction window | owner | light | 1440 | ok | Pass: #340 |
| C | Add transaction window | owner | dark | 390 | F6 | Pass: #340 |
| C | Add transaction window | owner | dark | 1440 | ok | Pass: #340 |
| C | Add transaction window | admin | light | 390 | F6 | Pass: #340 |
| C | Add transaction window | admin | light | 1440 | ok | Pass: #340 |
| C | Add transaction window | admin | dark | 390 | F6 | Pass: #340 |
| C | Add transaction window | admin | dark | 1440 | ok | Pass: #340 |
| C | Add transaction window | member | light | 390 | F6 | Pass: #340 |
| C | Add transaction window | member | light | 1440 | ok | Pass: #340 |
| C | Add transaction window | member | dark | 390 | F6 | Pass: #340 |
| C | Add transaction window | member | dark | 1440 | ok | Pass: #340 |
| C | Manual import window | owner | light | 390 | F6 | Pass: #340 |
| C | Manual import window | owner | light | 1440 | ok | Pass: #340 |
| C | Manual import window | owner | dark | 390 | F6 | Pass: #340 |
| C | Manual import window | owner | dark | 1440 | ok | Pass: #340 |
| C | Manual import window | admin | light | 390 | F6 | Pass: #340 |
| C | Manual import window | admin | light | 1440 | ok | Pass: #340 |
| C | Manual import window | admin | dark | 390 | F6 | Pass: #340 |
| C | Manual import window | admin | dark | 1440 | ok | Pass: #340 |
| C | Manual import window | member | light | 390 | F6 | Pass: #340 |
| C | Manual import window | member | light | 1440 | ok | Pass: #340 |
| C | Manual import window | member | dark | 390 | F6 | Pass: #340 |
| C | Manual import window | member | dark | 1440 | ok | Pass: #340 |
| C | Filters (sheet on phone, pop-up on desktop) | owner | light | 390 | F6 | Pass: #340 |
| C | Filters (sheet on phone, pop-up on desktop) | owner | light | 1440 | ok | Pass: #340 |
| C | Filters (sheet on phone, pop-up on desktop) | owner | dark | 390 | F6 | Pass: #340 |
| C | Filters (sheet on phone, pop-up on desktop) | owner | dark | 1440 | ok | Pass: #340 |
| C | Filters (sheet on phone, pop-up on desktop) | admin | light | 390 | F6 | Pass: #340 |
| C | Filters (sheet on phone, pop-up on desktop) | admin | light | 1440 | ok | Pass: #340 |
| C | Filters (sheet on phone, pop-up on desktop) | admin | dark | 390 | F6 | Pass: #340 |
| C | Filters (sheet on phone, pop-up on desktop) | admin | dark | 1440 | ok | Pass: #340 |
| C | Filters (sheet on phone, pop-up on desktop) | member | light | 390 | F6 | Pass: #340 |
| C | Filters (sheet on phone, pop-up on desktop) | member | light | 1440 | ok | Pass: #340 |
| C | Filters (sheet on phone, pop-up on desktop) | member | dark | 390 | F6 | Pass: #340 |
| C | Filters (sheet on phone, pop-up on desktop) | member | dark | 1440 | ok | Pass: #340 |
| C | Date range | owner | light | 390 | F6 | Pass: #340 |
| C | Date range | owner | light | 1440 | ok | Pass: #340 |
| C | Date range | owner | dark | 390 | F6 | Pass: #340 |
| C | Date range | owner | dark | 1440 | ok | Pass: #340 |
| C | Date range | admin | light | 390 | F6 | Pass: #340 |
| C | Date range | admin | light | 1440 | ok | Pass: #340 |
| C | Date range | admin | dark | 390 | F6 | Pass: #340 |
| C | Date range | admin | dark | 1440 | ok | Pass: #340 |
| C | Date range | member | light | 390 | F6 | Pass: #340 |
| C | Date range | member | light | 1440 | ok | Pass: #340 |
| C | Date range | member | dark | 390 | F6 | Pass: #340 |
| C | Date range | member | dark | 1440 | ok | Pass: #340 |
| C | Sort | owner | light | 390 | ok | No finding to re-check |
| C | Sort | owner | light | 1440 | ok | No finding to re-check |
| C | Sort | owner | dark | 390 | ok | No finding to re-check |
| C | Sort | owner | dark | 1440 | ok | No finding to re-check |
| C | Sort | admin | light | 390 | ok | No finding to re-check |
| C | Sort | admin | light | 1440 | ok | No finding to re-check |
| C | Sort | admin | dark | 390 | ok | No finding to re-check |
| C | Sort | admin | dark | 1440 | ok | No finding to re-check |
| C | Sort | member | light | 390 | ok | No finding to re-check |
| C | Sort | member | light | 1440 | ok | No finding to re-check |
| C | Sort | member | dark | 390 | ok | No finding to re-check |
| C | Sort | member | dark | 1440 | ok | No finding to re-check |
| C | Accounts → Filters | owner | light | 390 | F6 | Pass: #340 |
| C | Accounts → Filters | owner | light | 1440 | ok | Pass: #340 |
| C | Accounts → Filters | owner | dark | 390 | F6 | Pass: #340 |
| C | Accounts → Filters | owner | dark | 1440 | ok | Pass: #340 |
| C | Accounts → Filters | admin | light | 390 | F6 | Pass: #340 |
| C | Accounts → Filters | admin | light | 1440 | ok | Pass: #340 |
| C | Accounts → Filters | admin | dark | 390 | F6 | Pass: #340 |
| C | Accounts → Filters | admin | dark | 1440 | ok | Pass: #340 |
| C | Accounts → Filters | member | light | 390 | F6 | Pass: #340 |
| C | Accounts → Filters | member | light | 1440 | ok | Pass: #340 |
| C | Accounts → Filters | member | dark | 390 | F6 | Pass: #340 |
| C | Accounts → Filters | member | dark | 1440 | ok | Pass: #340 |
| C | Update balance window (account detail) | owner | light | 390 | ok | Pass: #349 |
| C | Update balance window (account detail) | owner | light | 1440 | ok | Pass: #349 |
| C | Update balance window (account detail) | owner | dark | 390 | ok | Pass: #349 |
| C | Update balance window (account detail) | owner | dark | 1440 | ok | Pass: #349 |
| C | Update balance window (account detail) | admin | light | 390 | ok | Pass: #349 |
| C | Update balance window (account detail) | admin | light | 1440 | ok | Pass: #349 |
| C | Update balance window (account detail) | admin | dark | 390 | ok | Pass: #349 |
| C | Update balance window (account detail) | admin | dark | 1440 | ok | Pass: #349 |
| C | Update balance window (account detail) | member | light | 390 | ok | Pass: #349 |
| C | Update balance window (account detail) | member | light | 1440 | ok | Pass: #349 |
| C | Update balance window (account detail) | member | dark | 390 | ok | Pass: #349 |
| C | Update balance window (account detail) | member | dark | 1440 | ok | Pass: #349 |
| C | Add asset window | owner | light | 390 | F6 | Pass: #340 |
| C | Add asset window | owner | light | 1440 | ok | Pass: #340 |
| C | Add asset window | owner | dark | 390 | F6 | Pass: #340 |
| C | Add asset window | owner | dark | 1440 | ok | Pass: #340 |
| C | Add asset window | admin | light | 390 | F6 | Pass: #340 |
| C | Add asset window | admin | light | 1440 | ok | Pass: #340 |
| C | Add asset window | admin | dark | 390 | F6 | Pass: #340 |
| C | Add asset window | admin | dark | 1440 | ok | Pass: #340 |
| C | Add asset window | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Add asset window | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Add asset window | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Add asset window | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit depreciation window | owner | light | 390 | F6 | Pass: #340, #341, #390 (#390–#392 re-checked in report-d: pass) |
| C | Edit depreciation window | owner | light | 1440 | ok | Pass: #340, #341, #390 (#390–#392 re-checked in report-d: pass) |
| C | Edit depreciation window | owner | dark | 390 | F6 | Pass: #340, #341, #390 (#390–#392 re-checked in report-d: pass) |
| C | Edit depreciation window | owner | dark | 1440 | ok | Pass: #340, #341, #390 (#390–#392 re-checked in report-d: pass) |
| C | Edit depreciation window | admin | light | 390 | F6 | Pass: #340, #341, #390 (#390–#392 re-checked in report-d: pass) |
| C | Edit depreciation window | admin | light | 1440 | ok | Pass: #340, #341, #390 (#390–#392 re-checked in report-d: pass) |
| C | Edit depreciation window | admin | dark | 390 | F6 | Pass: #340, #341, #390 (#390–#392 re-checked in report-d: pass) |
| C | Edit depreciation window | admin | dark | 1440 | ok | Pass: #340, #341, #390 (#390–#392 re-checked in report-d: pass) |
| C | Edit depreciation window | member | light | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit depreciation window | member | light | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit depreciation window | member | dark | 390 | hidden ✓ | Hidden for this role, checked in part C |
| C | Edit depreciation window | member | dark | 1440 | hidden ✓ | Hidden for this role, checked in part C |
| C | Review detail (sheet on phone, panel on desktop) | owner | light | 390 | F6 | Pass: #340 |
| C | Review detail (sheet on phone, panel on desktop) | owner | light | 1440 | ok | Pass: #340 |
| C | Review detail (sheet on phone, panel on desktop) | owner | dark | 390 | F6 | Pass: #340 |
| C | Review detail (sheet on phone, panel on desktop) | owner | dark | 1440 | ok | Pass: #340 |
| C | Review detail (sheet on phone, panel on desktop) | admin | light | 390 | F6 | Pass: #340 |
| C | Review detail (sheet on phone, panel on desktop) | admin | light | 1440 | ok | Pass: #340 |
| C | Review detail (sheet on phone, panel on desktop) | admin | dark | 390 | F6 | Pass: #340 |
| C | Review detail (sheet on phone, panel on desktop) | admin | dark | 1440 | ok | Pass: #340 |
| C | Review detail (sheet on phone, panel on desktop) | member | light | 390 | F6 | Pass: #340 |
| C | Review detail (sheet on phone, panel on desktop) | member | light | 1440 | ok | Pass: #340 |
| C | Review detail (sheet on phone, panel on desktop) | member | dark | 390 | F6 | Pass: #340 |
| C | Review detail (sheet on phone, panel on desktop) | member | dark | 1440 | ok | Pass: #340 |
| C | Approve all confirmation | owner | light | 390 | ok | No finding to re-check |
| C | Approve all confirmation | owner | light | 1440 | ok | No finding to re-check |
| C | Approve all confirmation | owner | dark | 390 | ok | No finding to re-check |
| C | Approve all confirmation | owner | dark | 1440 | ok | No finding to re-check |
| C | Approve all confirmation | admin | light | 390 | ok | No finding to re-check |
| C | Approve all confirmation | admin | light | 1440 | ok | No finding to re-check |
| C | Approve all confirmation | admin | dark | 390 | ok | No finding to re-check |
| C | Approve all confirmation | admin | dark | 1440 | ok | No finding to re-check |
| C | Approve all confirmation | member | light | 390 | ok | No finding to re-check |
| C | Approve all confirmation | member | light | 1440 | ok | No finding to re-check |
| C | Approve all confirmation | member | dark | 390 | ok | No finding to re-check |
| C | Approve all confirmation | member | dark | 1440 | ok | No finding to re-check |
| C | Recurring item detail | owner | light | 390 | ok | No finding to re-check |
| C | Recurring item detail | owner | light | 1440 | ok | No finding to re-check |
| C | Recurring item detail | owner | dark | 390 | ok | No finding to re-check |
| C | Recurring item detail | owner | dark | 1440 | ok | No finding to re-check |
| C | Recurring item detail | admin | light | 390 | ok | No finding to re-check |
| C | Recurring item detail | admin | light | 1440 | ok | No finding to re-check |
| C | Recurring item detail | admin | dark | 390 | ok | No finding to re-check |
| C | Recurring item detail | admin | dark | 1440 | ok | No finding to re-check |
| C | Recurring item detail | member | light | 390 | ok | No finding to re-check |
| C | Recurring item detail | member | light | 1440 | ok | No finding to re-check |
| C | Recurring item detail | member | dark | 390 | ok | No finding to re-check |
| C | Recurring item detail | member | dark | 1440 | ok | No finding to re-check |
| C | Navigation drawer (phone only) | owner | light | 390 | ok | No finding to re-check |
| C | Navigation drawer (phone only) | owner | light | 1440 | n/a | Only exists at the other width |
| C | Navigation drawer (phone only) | owner | dark | 390 | ok | No finding to re-check |
| C | Navigation drawer (phone only) | owner | dark | 1440 | n/a | Only exists at the other width |
| C | Navigation drawer (phone only) | admin | light | 390 | ok | No finding to re-check |
| C | Navigation drawer (phone only) | admin | light | 1440 | n/a | Only exists at the other width |
| C | Navigation drawer (phone only) | admin | dark | 390 | ok | No finding to re-check |
| C | Navigation drawer (phone only) | admin | dark | 1440 | n/a | Only exists at the other width |
| C | Navigation drawer (phone only) | member | light | 390 | ok | No finding to re-check |
| C | Navigation drawer (phone only) | member | light | 1440 | n/a | Only exists at the other width |
| C | Navigation drawer (phone only) | member | dark | 390 | ok | No finding to re-check |
| C | Navigation drawer (phone only) | member | dark | 1440 | n/a | Only exists at the other width |
| C | Sidebar user menu (desktop only) | owner | light | 390 | n/a | Only exists at the other width |
| C | Sidebar user menu (desktop only) | owner | light | 1440 | ok | No finding to re-check |
| C | Sidebar user menu (desktop only) | owner | dark | 390 | n/a | Only exists at the other width |
| C | Sidebar user menu (desktop only) | owner | dark | 1440 | ok | No finding to re-check |
| C | Sidebar user menu (desktop only) | admin | light | 390 | n/a | Only exists at the other width |
| C | Sidebar user menu (desktop only) | admin | light | 1440 | ok | No finding to re-check |
| C | Sidebar user menu (desktop only) | admin | dark | 390 | n/a | Only exists at the other width |
| C | Sidebar user menu (desktop only) | admin | dark | 1440 | ok | No finding to re-check |
| C | Sidebar user menu (desktop only) | member | light | 390 | n/a | Only exists at the other width |
| C | Sidebar user menu (desktop only) | member | light | 1440 | ok | No finding to re-check |
| C | Sidebar user menu (desktop only) | member | dark | 390 | n/a | Only exists at the other width |
| C | Sidebar user menu (desktop only) | member | dark | 1440 | ok | No finding to re-check |

## Findings

Every high and medium finding, with its issue, the pull request that fixed it (all merged into `feature/platform-retheme`), its status, and its re-check result and screenshots (paths relative to this file). IDs: `A…` part A, `B…` part B (part B has no B3: withdrawn during the audit), `C-F…` part C, `C-N…` found by re-check C and re-checked in re-check D. `C-A1` and `C-A9` are part A's A1 and A9, re-checked a second time in re-check C. All issues are closed; "re-checked (pass)" is the final status.

| ID | Severity | Page · who · width | Finding | Issue | Fix PR | Status | Re-check result and screenshots |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | High | Accounts · owner, admin · both | Delete in the Edit asset window deleted the asset on one click | [#341](https://github.com/robpaolella/ledger/issues/341) | [#362](https://github.com/robpaolella/ledger/pull/362) | re-checked (pass) | **Pass.** Delete now asks first: the button turns into "Confirm delete?" with a Cancel, and the Honda Civic is still listed. Owner and admin, light and dark, 1440 and 390. The confirmation was never accepted, so no asset was deleted. Observation at the time: Save changes and a second Cancel still sat beside the confirmation; that was filed as #390 and is re-checked below (C-N1). Screenshots: <br>*accounts*: admin: [dark 1440](screenshots/recheck/a/341-accounts-admin-dark-1440.png) [dark 390](screenshots/recheck/a/341-accounts-admin-dark-390.png) [light 1440](screenshots/recheck/a/341-accounts-admin-light-1440.png) [light 390](screenshots/recheck/a/341-accounts-admin-light-390.png); owner: [dark 1440](screenshots/recheck/a/341-accounts-owner-dark-1440.png) [dark 390](screenshots/recheck/a/341-accounts-owner-dark-390.png) [light 1440](screenshots/recheck/a/341-accounts-owner-light-1440.png) [light 390](screenshots/recheck/a/341-accounts-owner-light-390.png) |
| A2 | Medium | Dashboard · all roles · both | Investments card total differed per person and matched nothing on Accounts | [#342](https://github.com/robpaolella/ledger/issues/342) | [#386](https://github.com/robpaolella/ledger/pull/386) | re-checked (pass) | **Pass.** The Dashboard card reads "$155,685 investments" for owner, admin and the member, and Accounts shows $155,684.54, in both themes at 1440 and 390. Screenshots: <br>*dashboard*: admin: [dark 1440](screenshots/recheck/a/342-dashboard-admin-dark-1440.png) [dark 390](screenshots/recheck/a/342-dashboard-admin-dark-390.png) [light 1440](screenshots/recheck/a/342-dashboard-admin-light-1440.png) [light 390](screenshots/recheck/a/342-dashboard-admin-light-390.png); member: [dark 1440](screenshots/recheck/a/342-dashboard-member-dark-1440.png) [dark 390](screenshots/recheck/a/342-dashboard-member-dark-390.png) [light 1440](screenshots/recheck/a/342-dashboard-member-light-1440.png) [light 390](screenshots/recheck/a/342-dashboard-member-light-390.png); owner: [dark 1440](screenshots/recheck/a/342-dashboard-owner-dark-1440.png) [dark 390](screenshots/recheck/a/342-dashboard-owner-dark-390.png) [light 1440](screenshots/recheck/a/342-dashboard-owner-light-1440.png) [light 390](screenshots/recheck/a/342-dashboard-owner-light-390.png) |
| A3 | Medium | Transactions · all · both | "No transactions found" showed while loading and after a failed load | [#343](https://github.com/robpaolella/ledger/issues/343) | [#372](https://github.com/robpaolella/ledger/pull/372) | re-checked (pass) | **Pass.** With the transactions request held, the list shows its loading rows and never "No transactions found"; with it blocked it shows "Couldn’t load your transactions / Check your connection, then try again." and a Try again button. All three roles, light and dark, 1440 and 390. Screenshots: <br>*transactions-error*: admin: [dark 1440](screenshots/recheck/a/343-transactions-error-admin-dark-1440.png) [dark 390](screenshots/recheck/a/343-transactions-error-admin-dark-390.png) [light 1440](screenshots/recheck/a/343-transactions-error-admin-light-1440.png) [light 390](screenshots/recheck/a/343-transactions-error-admin-light-390.png); member: [dark 1440](screenshots/recheck/a/343-transactions-error-member-dark-1440.png) [dark 390](screenshots/recheck/a/343-transactions-error-member-dark-390.png) [light 1440](screenshots/recheck/a/343-transactions-error-member-light-1440.png) [light 390](screenshots/recheck/a/343-transactions-error-member-light-390.png); owner: [dark 1440](screenshots/recheck/a/343-transactions-error-owner-dark-1440.png) [dark 390](screenshots/recheck/a/343-transactions-error-owner-dark-390.png) [light 1440](screenshots/recheck/a/343-transactions-error-owner-light-1440.png) [light 390](screenshots/recheck/a/343-transactions-error-owner-light-390.png)<br>*transactions-loading*: admin: [dark 1440](screenshots/recheck/a/343-transactions-loading-admin-dark-1440.png) [dark 390](screenshots/recheck/a/343-transactions-loading-admin-dark-390.png) [light 1440](screenshots/recheck/a/343-transactions-loading-admin-light-1440.png) [light 390](screenshots/recheck/a/343-transactions-loading-admin-light-390.png); member: [dark 1440](screenshots/recheck/a/343-transactions-loading-member-dark-1440.png) [dark 390](screenshots/recheck/a/343-transactions-loading-member-dark-390.png) [light 1440](screenshots/recheck/a/343-transactions-loading-member-light-1440.png) [light 390](screenshots/recheck/a/343-transactions-loading-member-light-390.png); owner: [dark 1440](screenshots/recheck/a/343-transactions-loading-owner-dark-1440.png) [dark 390](screenshots/recheck/a/343-transactions-loading-owner-dark-390.png) [light 1440](screenshots/recheck/a/343-transactions-loading-owner-light-1440.png) [light 390](screenshots/recheck/a/343-transactions-loading-owner-light-390.png) |
| A4 | Medium | Accounts · all · both | A failed load left a spinner forever | [#344](https://github.com/robpaolella/ledger/issues/344) | [#373](https://github.com/robpaolella/ledger/pull/373) | re-checked (pass) | **Pass.** With the accounts request blocked, Accounts shows "Couldn’t load your accounts / Check your connection, then try again. Nothing in your accounts was lost." with Try again, not a spinner. All three roles, light and dark, 1440 and 390. Screenshots: <br>*accounts-error*: admin: [dark 1440](screenshots/recheck/a/344-accounts-error-admin-dark-1440.png) [dark 390](screenshots/recheck/a/344-accounts-error-admin-dark-390.png) [light 1440](screenshots/recheck/a/344-accounts-error-admin-light-1440.png) [light 390](screenshots/recheck/a/344-accounts-error-admin-light-390.png); member: [dark 1440](screenshots/recheck/a/344-accounts-error-member-dark-1440.png) [dark 390](screenshots/recheck/a/344-accounts-error-member-dark-390.png) [light 1440](screenshots/recheck/a/344-accounts-error-member-light-1440.png) [light 390](screenshots/recheck/a/344-accounts-error-member-light-390.png); owner: [dark 1440](screenshots/recheck/a/344-accounts-error-owner-dark-1440.png) [dark 390](screenshots/recheck/a/344-accounts-error-owner-dark-390.png) [light 1440](screenshots/recheck/a/344-accounts-error-owner-light-1440.png) [light 390](screenshots/recheck/a/344-accounts-error-owner-light-390.png) |
| A5 | Medium | Account detail · all · both | Any load failure said "This account doesn't exist" | [#345](https://github.com/robpaolella/ledger/issues/345) | [#365](https://github.com/robpaolella/ledger/pull/365) | re-checked (pass) | **Pass.** A failed load says "Couldn’t load this account" with Try again and Back to accounts; an id that does not exist (/accounts/99999) still says "Account not found / This account doesn't exist". All three roles, light and dark, 1440 and 390. Screenshots: <br>*account-detail-error*: admin: [dark 1440](screenshots/recheck/a/345-account-detail-error-admin-dark-1440.png) [dark 390](screenshots/recheck/a/345-account-detail-error-admin-dark-390.png) [light 1440](screenshots/recheck/a/345-account-detail-error-admin-light-1440.png) [light 390](screenshots/recheck/a/345-account-detail-error-admin-light-390.png); member: [dark 1440](screenshots/recheck/a/345-account-detail-error-member-dark-1440.png) [dark 390](screenshots/recheck/a/345-account-detail-error-member-dark-390.png) [light 1440](screenshots/recheck/a/345-account-detail-error-member-light-1440.png) [light 390](screenshots/recheck/a/345-account-detail-error-member-light-390.png); owner: [dark 1440](screenshots/recheck/a/345-account-detail-error-owner-dark-1440.png) [dark 390](screenshots/recheck/a/345-account-detail-error-owner-dark-390.png) [light 1440](screenshots/recheck/a/345-account-detail-error-owner-light-1440.png) [light 390](screenshots/recheck/a/345-account-detail-error-owner-light-390.png)<br>*account-detail-missing*: admin: [dark 1440](screenshots/recheck/a/345-account-detail-missing-admin-dark-1440.png) [dark 390](screenshots/recheck/a/345-account-detail-missing-admin-dark-390.png) [light 1440](screenshots/recheck/a/345-account-detail-missing-admin-light-1440.png) [light 390](screenshots/recheck/a/345-account-detail-missing-admin-light-390.png); member: [dark 1440](screenshots/recheck/a/345-account-detail-missing-member-dark-1440.png) [dark 390](screenshots/recheck/a/345-account-detail-missing-member-dark-390.png) [light 1440](screenshots/recheck/a/345-account-detail-missing-member-light-1440.png) [light 390](screenshots/recheck/a/345-account-detail-missing-member-light-390.png); owner: [dark 1440](screenshots/recheck/a/345-account-detail-missing-owner-dark-1440.png) [dark 390](screenshots/recheck/a/345-account-detail-missing-owner-dark-390.png) [light 1440](screenshots/recheck/a/345-account-detail-missing-owner-light-1440.png) [light 390](screenshots/recheck/a/345-account-detail-missing-owner-light-390.png) |
| A6 | Medium | Sign-in, Transactions, Accounts · all · both | Raw "Failed to fetch" / "fetch failed" shown to people | [#346](https://github.com/robpaolella/ledger/issues/346) | [#381](https://github.com/robpaolella/ledger/pull/381) | re-checked (pass) | **Pass.** Sign-in with the server unreachable says "Can't reach Ledger. Check your connection and try again."; Accounts → Refresh all against the sample's offline bank connections says "Couldn't reach your bank. Try again in a moment." Neither shows "Failed to fetch" or "fetch failed". Sign-in: signed out, light and dark, 1440 and 390. Refresh all: all three roles, light and dark, 1440 and 390. The Transactions error card is under #343. Screenshots: <br>*accounts-refresh*: admin: [dark 1440](screenshots/recheck/a/346-accounts-refresh-admin-dark-1440.png) [dark 390](screenshots/recheck/a/346-accounts-refresh-admin-dark-390.png) [light 1440](screenshots/recheck/a/346-accounts-refresh-admin-light-1440.png) [light 390](screenshots/recheck/a/346-accounts-refresh-admin-light-390.png); member: [dark 1440](screenshots/recheck/a/346-accounts-refresh-member-dark-1440.png) [dark 390](screenshots/recheck/a/346-accounts-refresh-member-dark-390.png) [light 1440](screenshots/recheck/a/346-accounts-refresh-member-light-1440.png) [light 390](screenshots/recheck/a/346-accounts-refresh-member-light-390.png); owner: [dark 1440](screenshots/recheck/a/346-accounts-refresh-owner-dark-1440.png) [dark 390](screenshots/recheck/a/346-accounts-refresh-owner-dark-390.png) [light 1440](screenshots/recheck/a/346-accounts-refresh-owner-light-1440.png) [light 390](screenshots/recheck/a/346-accounts-refresh-owner-light-390.png)<br>*signin*: signedout: [dark 1440](screenshots/recheck/a/346-signin-signedout-dark-1440.png) [dark 390](screenshots/recheck/a/346-signin-signedout-dark-390.png) [light 1440](screenshots/recheck/a/346-signin-signedout-light-1440.png) [light 390](screenshots/recheck/a/346-signin-signedout-light-390.png) |
| A7 | Medium | Account detail · all · both | Balance chart y-axis repeated "$8k" five times | [#347](https://github.com/robpaolella/ledger/issues/347) | [#365](https://github.com/robpaolella/ledger/pull/365) | re-checked (pass) | **Pass.** Joint Checking's axis shows five different values (for example $7,952 / $7,975 / $7,998 / $8,021 / $8,044), none repeated. All three roles, light and dark, 1440 and 390. (The exact values moved a little after a test balance saved during this pass; see Sample data below.) Screenshots: <br>*account-detail*: admin: [dark 1440](screenshots/recheck/a/347-account-detail-admin-dark-1440.png) [dark 390](screenshots/recheck/a/347-account-detail-admin-dark-390.png) [light 1440](screenshots/recheck/a/347-account-detail-admin-light-1440.png) [light 390](screenshots/recheck/a/347-account-detail-admin-light-390.png); member: [dark 1440](screenshots/recheck/a/347-account-detail-member-dark-1440.png) [dark 390](screenshots/recheck/a/347-account-detail-member-dark-390.png) [light 1440](screenshots/recheck/a/347-account-detail-member-light-1440.png) [light 390](screenshots/recheck/a/347-account-detail-member-light-390.png); owner: [dark 1440](screenshots/recheck/a/347-account-detail-owner-dark-1440.png) [dark 390](screenshots/recheck/a/347-account-detail-owner-dark-390.png) [light 1440](screenshots/recheck/a/347-account-detail-owner-light-1440.png) [light 390](screenshots/recheck/a/347-account-detail-owner-light-390.png) |
| A8 | Medium | Account detail · all · both | "Enter a valid balance" was a toast away from the field | [#348](https://github.com/robpaolella/ledger/issues/348) | [#365](https://github.com/robpaolella/ledger/pull/365) | re-checked (pass) | **Pass.** Saving an empty Update balance field shows "Enter a valid balance." under the field, in red, with the field outlined red; no toast appeared. All three roles, light and dark, 1440 and 390 (sheet on the phone). Screenshots: <br>*account-detail-update-balance*: admin: [dark 1440](screenshots/recheck/a/348-account-detail-update-balance-admin-dark-1440.png) [dark 390](screenshots/recheck/a/348-account-detail-update-balance-admin-dark-390.png) [light 1440](screenshots/recheck/a/348-account-detail-update-balance-admin-light-1440.png) [light 390](screenshots/recheck/a/348-account-detail-update-balance-admin-light-390.png); member: [dark 1440](screenshots/recheck/a/348-account-detail-update-balance-member-dark-1440.png) [dark 390](screenshots/recheck/a/348-account-detail-update-balance-member-dark-390.png) [light 1440](screenshots/recheck/a/348-account-detail-update-balance-member-light-1440.png) [light 390](screenshots/recheck/a/348-account-detail-update-balance-member-light-390.png); owner: [dark 1440](screenshots/recheck/a/348-account-detail-update-balance-owner-dark-1440.png) [dark 390](screenshots/recheck/a/348-account-detail-update-balance-owner-dark-390.png) [light 1440](screenshots/recheck/a/348-account-detail-update-balance-owner-light-1440.png) [light 390](screenshots/recheck/a/348-account-detail-update-balance-owner-light-390.png) |
| A9 | Medium | Accounts, Account detail · 390 | Add account and Update balance sheets autofocused their field | [#349](https://github.com/robpaolella/ledger/issues/349) | [#365](https://github.com/robpaolella/ledger/pull/365) | re-checked (pass) | **Pass.** On a phone both sheets open with focus on the Close button, not on a field, so the keyboard stays down. Add account: owner and admin (the member's button is disabled, #351). Update balance: all three roles. Light and dark. Screenshots: <br>*account-detail-update-balance*: admin: [dark 390](screenshots/recheck/a/349-account-detail-update-balance-admin-dark-390.png) [light 390](screenshots/recheck/a/349-account-detail-update-balance-admin-light-390.png); member: [dark 390](screenshots/recheck/a/349-account-detail-update-balance-member-dark-390.png) [light 390](screenshots/recheck/a/349-account-detail-update-balance-member-light-390.png); owner: [dark 390](screenshots/recheck/a/349-account-detail-update-balance-owner-dark-390.png) [light 390](screenshots/recheck/a/349-account-detail-update-balance-owner-light-390.png)<br>*accounts-add-account*: admin: [dark 390](screenshots/recheck/a/349-accounts-add-account-admin-dark-390.png) [light 390](screenshots/recheck/a/349-accounts-add-account-admin-light-390.png); owner: [dark 390](screenshots/recheck/a/349-accounts-add-account-owner-dark-390.png) [light 390](screenshots/recheck/a/349-accounts-add-account-owner-light-390.png) |
| A10 | Medium | Transactions · owner, admin · both | Unsplit removed every split with one click | [#350](https://github.com/robpaolella/ledger/issues/350) | [#364](https://github.com/robpaolella/ledger/pull/364) | re-checked (pass) | **Pass.** The first click on Unsplit changes it to "Confirm unsplit?" and the split stays in place. The confirmation was never accepted, so the sample's Costco split was left alone. Owner and admin, light and dark, 1440 and 390. Screenshots: <br>*transactions-unsplit*: admin: [dark 1440](screenshots/recheck/a/350-transactions-unsplit-admin-dark-1440.png) [dark 390](screenshots/recheck/a/350-transactions-unsplit-admin-dark-390.png) [light 1440](screenshots/recheck/a/350-transactions-unsplit-admin-light-1440.png) [light 390](screenshots/recheck/a/350-transactions-unsplit-admin-light-390.png); owner: [dark 1440](screenshots/recheck/a/350-transactions-unsplit-owner-dark-1440.png) [dark 390](screenshots/recheck/a/350-transactions-unsplit-owner-dark-390.png) [light 1440](screenshots/recheck/a/350-transactions-unsplit-owner-light-1440.png) [light 390](screenshots/recheck/a/350-transactions-unsplit-owner-light-390.png) |
| A11 | Medium | Accounts · member · both | Add account / asset Add / pencils hidden instead of disabled | [#351](https://github.com/robpaolella/ledger/issues/351) | [#376](https://github.com/robpaolella/ledger/pull/376) | re-checked (pass) | **Pass.** For the member, Add account, the asset Add button and all five asset pencils are shown disabled; for the owner (as a contrast) all seven are enabled. Light and dark, 1440 and 390. Screenshots: <br>*accounts*: member: [dark 1440](screenshots/recheck/a/351-accounts-member-dark-1440.png) [dark 390](screenshots/recheck/a/351-accounts-member-dark-390.png) [light 1440](screenshots/recheck/a/351-accounts-member-light-1440.png) [light 390](screenshots/recheck/a/351-accounts-member-light-390.png); owner: [dark 1440](screenshots/recheck/a/351-accounts-owner-dark-1440.png) [dark 390](screenshots/recheck/a/351-accounts-owner-dark-390.png) [light 1440](screenshots/recheck/a/351-accounts-owner-light-1440.png) [light 390](screenshots/recheck/a/351-accounts-owner-light-390.png) |
| A12 | Medium | Accounts · all · 390 | Physical Assets rows cut the cost off | [#352](https://github.com/robpaolella/ledger/issues/352) | [#362](https://github.com/robpaolella/ledger/pull/362) | re-checked (pass) | **Pass.** At 390 every Physical Assets row shows its whole cost line ("cost $26,500.00", "cost $1,999.00", …); none is clipped. All three roles, light and dark. Screenshots: <br>*accounts-assets*: admin: [dark 390](screenshots/recheck/a/352-accounts-assets-admin-dark-390.png) [light 390](screenshots/recheck/a/352-accounts-assets-admin-light-390.png); member: [dark 390](screenshots/recheck/a/352-accounts-assets-member-dark-390.png) [light 390](screenshots/recheck/a/352-accounts-assets-member-light-390.png); owner: [dark 390](screenshots/recheck/a/352-accounts-assets-owner-dark-390.png) [light 390](screenshots/recheck/a/352-accounts-assets-owner-light-390.png) |
| A13 | Medium | Account detail · all · 390 | Filters 36px, search field 23px, Clear 20px, Clear search 32px | [#353](https://github.com/robpaolella/ledger/issues/353) | [#365](https://github.com/robpaolella/ledger/pull/365) | re-checked (pass) | **Pass.** At 390 the search field and Filters button are 44px, Date is 44px, "Clear" in the summary line and "Clear search" have 44px tap areas (the Clear text is 20px high, its tap area is 44px). All three roles, light and dark. Observation (low, not filed): the "Clear" button inside the "Nothing matches" card is 40px tall; it was not on #353's list (see New observations). Screenshots: <br>*account-detail-toolbar*: admin: [dark 390](screenshots/recheck/a/353-account-detail-toolbar-admin-dark-390.png) [light 390](screenshots/recheck/a/353-account-detail-toolbar-admin-light-390.png); member: [dark 390](screenshots/recheck/a/353-account-detail-toolbar-member-dark-390.png) [light 390](screenshots/recheck/a/353-account-detail-toolbar-member-light-390.png); owner: [dark 390](screenshots/recheck/a/353-account-detail-toolbar-owner-dark-390.png) [light 390](screenshots/recheck/a/353-account-detail-toolbar-owner-light-390.png) |
| A14 | Medium | Dashboard · all · 390 | Net worth range menu rows 36px | [#354](https://github.com/robpaolella/ledger/issues/354) | [#363](https://github.com/robpaolella/ledger/pull/363) | re-checked (pass) | **Pass.** At 390 the range menu rows (3 months, 6 months, 1 year, All time; and the 1 month button) are 44px tall. All three roles, light and dark. Screenshots: <br>*dashboard-range-menu*: admin: [dark 390](screenshots/recheck/a/354-dashboard-range-menu-admin-dark-390.png) [light 390](screenshots/recheck/a/354-dashboard-range-menu-admin-light-390.png); member: [dark 390](screenshots/recheck/a/354-dashboard-range-menu-member-dark-390.png) [light 390](screenshots/recheck/a/354-dashboard-range-menu-member-light-390.png); owner: [dark 390](screenshots/recheck/a/354-dashboard-range-menu-owner-dark-390.png) [light 390](screenshots/recheck/a/354-dashboard-range-menu-owner-light-390.png) |
| A15 | Medium | Sign-in two-step · signed out · 390 | "Use a backup code" / "Back to sign in" 20px | [#355](https://github.com/robpaolella/ledger/issues/355) | [#368](https://github.com/robpaolella/ledger/pull/368) | re-checked (pass) | **Pass.** At 390 "Use a backup code" and "Back to sign in" have 44px tap areas (text 20px high; tap area 44px, measured by probing the page around each control). The two-step screen was reached by answering the sign-in call locally, as part A did. Signed out, light and dark, 1440 and 390. Screenshots: <br>*signin-two-step*: signedout: [dark 1440](screenshots/recheck/a/355-signin-two-step-signedout-dark-1440.png) [dark 390](screenshots/recheck/a/355-signin-two-step-signedout-dark-390.png) [light 1440](screenshots/recheck/a/355-signin-two-step-signedout-light-1440.png) [light 390](screenshots/recheck/a/355-signin-two-step-signedout-light-390.png) |
| A18 | Withdrawn (part B) | Phone sheets · 390 | Phone bottom sheets don't close on Escape | [#327](https://github.com/robpaolella/ledger/issues/327) | none needed | closed (not planned): nothing to fix; re-checked and every sheet closes on Escape | **Pass, no fix needed.** All seven sheets (and two with a field focused) closed on Escape at 390: each has an "open" and an "after Escape" screenshot, and the table below lists the counts. Screenshots: <br>*add-account-after-escape*: owner: [light 390](screenshots/recheck/a/a-327-add-account-after-escape-owner-light-390.png)<br>*add-account-open*: owner: [light 390](screenshots/recheck/a/a-327-add-account-open-owner-light-390.png)<br>*add-transaction-after-escape*: owner: [light 390](screenshots/recheck/a/a-327-add-transaction-after-escape-owner-light-390.png)<br>*add-transaction-field-focused-after-escape*: owner: [light 390](screenshots/recheck/a/a-327-add-transaction-field-focused-after-escape-owner-light-390.png)<br>*add-transaction-field-focused-open*: owner: [light 390](screenshots/recheck/a/a-327-add-transaction-field-focused-open-owner-light-390.png)<br>*add-transaction-open*: owner: [light 390](screenshots/recheck/a/a-327-add-transaction-open-owner-light-390.png)<br>*date-after-escape*: owner: [light 390](screenshots/recheck/a/a-327-date-after-escape-owner-light-390.png)<br>*date-open*: owner: [light 390](screenshots/recheck/a/a-327-date-open-owner-light-390.png)<br>*filters-after-escape*: owner: [light 390](screenshots/recheck/a/a-327-filters-after-escape-owner-light-390.png)<br>*filters-open*: owner: [light 390](screenshots/recheck/a/a-327-filters-open-owner-light-390.png)<br>*manual-import-after-escape*: owner: [light 390](screenshots/recheck/a/a-327-manual-import-after-escape-owner-light-390.png)<br>*manual-import-open*: owner: [light 390](screenshots/recheck/a/a-327-manual-import-open-owner-light-390.png)<br>*sort-after-escape*: owner: [light 390](screenshots/recheck/a/a-327-sort-after-escape-owner-light-390.png)<br>*sort-open*: owner: [light 390](screenshots/recheck/a/a-327-sort-open-owner-light-390.png)<br>*update-balance-after-escape*: owner: [light 390](screenshots/recheck/a/a-327-update-balance-after-escape-owner-light-390.png)<br>*update-balance-field-focused-after-escape*: owner: [light 390](screenshots/recheck/a/a-327-update-balance-field-focused-after-escape-owner-light-390.png)<br>*update-balance-field-focused-open*: owner: [light 390](screenshots/recheck/a/a-327-update-balance-field-focused-open-owner-light-390.png)<br>*update-balance-open*: owner: [light 390](screenshots/recheck/a/a-327-update-balance-open-owner-light-390.png) |
| B1 | High | Investments | Picking one account in the Accounts filter shows that account's portfolio performance (and chart) even when its holdings are hidden as another person's personal connection; the Market card for All accounts is identical for John and Jane while their Holdings totals differ. Server: the performance endpoint isn't scoped by connection, the holdings endpoint is. | [#325](https://github.com/robpaolella/ledger/issues/325) | [#380](https://github.com/robpaolella/ledger/pull/380) | Re-checked (pass) | **All accounts:** Holdings total is $155,684.54 for owner, admin and member, equal to the Investments group total on Accounts. **Each of the 6 accounts, as owner, admin and member:** identical holdings total and 3-month return in all three roles (for example Jane's Roth IRA $24,075.19, 2.55%), and the six totals add to $155,684.54. In all 12 role/theme/width combinations part B listed, picking another person's account shows its real holdings and its own chart, never a chart beside $0.00. Screenshots: the Market card and chart (`-chart-`) and the Holdings table (`-holdings-`) for each combination; also the member All-accounts view and the admin Total row. Screenshots: [325-investments-other-persons-account-chart-owner-light-390.png](screenshots/recheck/b/325-investments-other-persons-account-chart-owner-light-390.png)<br>[325-investments-other-persons-account-chart-owner-light-1440.png](screenshots/recheck/b/325-investments-other-persons-account-chart-owner-light-1440.png)<br>[325-investments-other-persons-account-chart-owner-dark-390.png](screenshots/recheck/b/325-investments-other-persons-account-chart-owner-dark-390.png)<br>[325-investments-other-persons-account-chart-owner-dark-1440.png](screenshots/recheck/b/325-investments-other-persons-account-chart-owner-dark-1440.png)<br>[325-investments-other-persons-account-chart-admin-light-390.png](screenshots/recheck/b/325-investments-other-persons-account-chart-admin-light-390.png)<br>[325-investments-other-persons-account-chart-admin-light-1440.png](screenshots/recheck/b/325-investments-other-persons-account-chart-admin-light-1440.png)<br>[325-investments-other-persons-account-chart-admin-dark-390.png](screenshots/recheck/b/325-investments-other-persons-account-chart-admin-dark-390.png)<br>[325-investments-other-persons-account-chart-admin-dark-1440.png](screenshots/recheck/b/325-investments-other-persons-account-chart-admin-dark-1440.png)<br>[325-investments-other-persons-account-chart-member-light-390.png](screenshots/recheck/b/325-investments-other-persons-account-chart-member-light-390.png)<br>[325-investments-other-persons-account-chart-member-light-1440.png](screenshots/recheck/b/325-investments-other-persons-account-chart-member-light-1440.png)<br>[325-investments-other-persons-account-chart-member-dark-390.png](screenshots/recheck/b/325-investments-other-persons-account-chart-member-dark-390.png)<br>[325-investments-other-persons-account-chart-member-dark-1440.png](screenshots/recheck/b/325-investments-other-persons-account-chart-member-dark-1440.png)<br>[325-investments-other-persons-account-holdings-owner-light-390.png](screenshots/recheck/b/325-investments-other-persons-account-holdings-owner-light-390.png)<br>[325-investments-other-persons-account-holdings-owner-light-1440.png](screenshots/recheck/b/325-investments-other-persons-account-holdings-owner-light-1440.png)<br>[325-investments-other-persons-account-holdings-owner-dark-390.png](screenshots/recheck/b/325-investments-other-persons-account-holdings-owner-dark-390.png)<br>[325-investments-other-persons-account-holdings-owner-dark-1440.png](screenshots/recheck/b/325-investments-other-persons-account-holdings-owner-dark-1440.png)<br>[325-investments-other-persons-account-holdings-admin-light-390.png](screenshots/recheck/b/325-investments-other-persons-account-holdings-admin-light-390.png)<br>[325-investments-other-persons-account-holdings-admin-light-1440.png](screenshots/recheck/b/325-investments-other-persons-account-holdings-admin-light-1440.png)<br>[325-investments-other-persons-account-holdings-admin-dark-390.png](screenshots/recheck/b/325-investments-other-persons-account-holdings-admin-dark-390.png)<br>[325-investments-other-persons-account-holdings-admin-dark-1440.png](screenshots/recheck/b/325-investments-other-persons-account-holdings-admin-dark-1440.png)<br>[325-investments-other-persons-account-holdings-member-light-390.png](screenshots/recheck/b/325-investments-other-persons-account-holdings-member-light-390.png)<br>[325-investments-other-persons-account-holdings-member-light-1440.png](screenshots/recheck/b/325-investments-other-persons-account-holdings-member-light-1440.png)<br>[325-investments-other-persons-account-holdings-member-dark-390.png](screenshots/recheck/b/325-investments-other-persons-account-holdings-member-dark-390.png)<br>[325-investments-other-persons-account-holdings-member-dark-1440.png](screenshots/recheck/b/325-investments-other-persons-account-holdings-member-dark-1440.png)<br>[325-investments-member-light-1440.png](screenshots/recheck/b/325-investments-member-light-1440.png)<br>[325-investments-all-accounts-total-admin-dark-1440.png](screenshots/recheck/b/325-investments-all-accounts-total-admin-dark-1440.png) |
| B2 | Medium | Reports | Category breakdown Summary on a phone shows only percentages; every dollar amount is pushed past the right edge (x 365–461 on a 390 screen) and clipped. | [#326](https://github.com/robpaolella/ledger/issues/326) | [#367](https://github.com/robpaolella/ledger/pull/367) | Re-checked (pass) | Summary with Expand all at 390, all six role/theme combinations: every group and sub-category row shows its dollar amount and percentage, right-aligned; names truncate first ("Dining/Eating O…"). Page width 390 = screen width 390 and no amount past the right edge. Desktop 1440 unchanged. Screenshots: [326-reports-summary-expanded-owner-light-390.png](screenshots/recheck/b/326-reports-summary-expanded-owner-light-390.png)<br>[326-reports-summary-expanded-owner-dark-390.png](screenshots/recheck/b/326-reports-summary-expanded-owner-dark-390.png)<br>[326-reports-summary-expanded-admin-light-390.png](screenshots/recheck/b/326-reports-summary-expanded-admin-light-390.png)<br>[326-reports-summary-expanded-admin-dark-390.png](screenshots/recheck/b/326-reports-summary-expanded-admin-dark-390.png)<br>[326-reports-summary-expanded-member-light-390.png](screenshots/recheck/b/326-reports-summary-expanded-member-light-390.png)<br>[326-reports-summary-expanded-member-dark-390.png](screenshots/recheck/b/326-reports-summary-expanded-member-dark-390.png)<br>[326-reports-summary-expanded-owner-light-1440.png](screenshots/recheck/b/326-reports-summary-expanded-owner-light-1440.png) |
| B4 | Medium | Import (CSV review) | Rows without a category can be ticked and counted ("3 of 3 selected") but are silently left out ("1 transaction will be imported"); nothing says why. | [#328](https://github.com/robpaolella/ledger/issues/328) | [#359](https://github.com/robpaolella/ledger/pull/359) | Re-checked (pass) | Synthetic 4-row CSV (one categorized row, three uncategorized), as owner, admin and member, light, 390 and 1440. Before anything is ticked the header and footer agree ("1 of 4 selected", "1 transaction will be imported"). After ticking all 4 ("4 of 4 selected"), each uncategorized row says "Choose a category to import this row" and the footer says "1 transaction will be imported. 3 selected rows skipped: choose a category to import." The screenshots show the ticked-all state. Screenshots: [328-import-review-owner-light-390.png](screenshots/recheck/b/328-import-review-owner-light-390.png)<br>[328-import-review-owner-light-1440.png](screenshots/recheck/b/328-import-review-owner-light-1440.png)<br>[328-import-review-admin-light-390.png](screenshots/recheck/b/328-import-review-admin-light-390.png)<br>[328-import-review-admin-light-1440.png](screenshots/recheck/b/328-import-review-admin-light-1440.png)<br>[328-import-review-member-light-390.png](screenshots/recheck/b/328-import-review-member-light-390.png)<br>[328-import-review-member-light-1440.png](screenshots/recheck/b/328-import-review-member-light-1440.png) |
| B5 | Medium | Reviews | "Approve all" asks "Approve 44 transactions? This marks every transaction in the current view reviewed"; 26 uncategorized ones stay (18 cleared). Only a transient toast says so. | [#329](https://github.com/robpaolella/ledger/issues/329) | [#361](https://github.com/robpaolella/ledger/pull/361) | Re-checked (pass) | On a fresh launch (45 to review), as owner, admin and member, light, 390 and 1440, the confirmation reads "Mark 19 transactions reviewed? 26 transactions need a category first and stay in the list." As owner, confirming cleared 19 and left 26 ($571.25 pending), matching the dialog. With only uncategorized rows left the dialog says "Nothing to approve yet" and offers only Close. Screenshots: [329-reviews-approve-all-owner-light-390.png](screenshots/recheck/b/329-reviews-approve-all-owner-light-390.png)<br>[329-reviews-approve-all-owner-light-1440.png](screenshots/recheck/b/329-reviews-approve-all-owner-light-1440.png)<br>[329-reviews-approve-all-admin-light-390.png](screenshots/recheck/b/329-reviews-approve-all-admin-light-390.png)<br>[329-reviews-approve-all-admin-light-1440.png](screenshots/recheck/b/329-reviews-approve-all-admin-light-1440.png)<br>[329-reviews-approve-all-member-light-390.png](screenshots/recheck/b/329-reviews-approve-all-member-light-390.png)<br>[329-reviews-approve-all-member-light-1440.png](screenshots/recheck/b/329-reviews-approve-all-member-light-1440.png)<br>[329-reviews-after-approve-owner-light-390.png](screenshots/recheck/b/329-reviews-after-approve-owner-light-390.png)<br>[329-reviews-approve-all-only-uncategorized-owner-light-1440.png](screenshots/recheck/b/329-reviews-approve-all-only-uncategorized-owner-light-1440.png) |
| B6 | Medium | Reviews, Recurring | When loading fails, Reviews shows "You're all caught up", 0 to review, $0.00 pending; Recurring shows $0.00 income and bills and "No recurring items this month." Only a disappearing toast says it failed. | [#330](https://github.com/robpaolella/ledger/issues/330) | [#371](https://github.com/robpaolella/ledger/pull/371) | Re-checked (pass) | With the page's `/api` GET calls returning HTTP 500: Reviews shows "Couldn't load your reviews", counts and money as "–", and Try again; Recurring shows "Couldn't load this month's recurring items", "–" for income and bills, and Try again. No "all caught up", no $0.00. Try again recovered both pages once calls succeeded again. Screenshots: [330-reviews-error-owner-light-1440.png](screenshots/recheck/b/330-reviews-error-owner-light-1440.png)<br>[330-reviews-error-owner-dark-390.png](screenshots/recheck/b/330-reviews-error-owner-dark-390.png)<br>[330-recurring-error-owner-light-1440.png](screenshots/recheck/b/330-recurring-error-owner-light-1440.png)<br>[330-recurring-error-owner-light-390.png](screenshots/recheck/b/330-recurring-error-owner-light-390.png) |
| B7 | Medium | Budget (Month), Reports, category detail | When loading fails, Budget Month spins forever with only a toast ("Server error"); Reports is replaced by the bare line "Failed to load reports." with no header and no Try again. The Budget Year view already has the proper error card. | [#331](https://github.com/robpaolella/ledger/issues/331) | [#360](https://github.com/robpaolella/ledger/pull/360) | Re-checked (pass) | Same simulated failure: Budget Month ("Couldn't load your budget"), Reports ("Couldn't load your reports", header and toolbar kept) and category detail ("Couldn't load this category", Try again plus Back to budget) show the error card, no endless spinner, plain wording. Try again recovered all three. Screenshots: [331-budget-error-owner-light-1440.png](screenshots/recheck/b/331-budget-error-owner-light-1440.png)<br>[331-budget-error-owner-dark-390.png](screenshots/recheck/b/331-budget-error-owner-dark-390.png)<br>[331-reports-error-owner-light-1440.png](screenshots/recheck/b/331-reports-error-owner-light-1440.png)<br>[331-reports-error-owner-light-390.png](screenshots/recheck/b/331-reports-error-owner-light-390.png)<br>[331-budget-category-error-owner-light-390.png](screenshots/recheck/b/331-budget-category-error-owner-light-390.png) |
| B8 | Medium | Investments | A member is told "No holdings yet. Link an investment or retirement account in Settings → Bank Sync" while the household has six investment accounts; the Accounts filter lists all six; picking someone else's account shows Holdings Total $0.00 / 100.00%. | [#332](https://github.com/robpaolella/ledger/issues/332), follow-up [#385](https://github.com/robpaolella/ledger/issues/385) | [#383](https://github.com/robpaolella/ledger/pull/383), [#386](https://github.com/robpaolella/ledger/pull/386) | Re-checked (pass) | The Accounts filter lists all six accounts and a member sees real holdings, so the original "no holdings" state no longer happens on sample data; it was reproduced by rewriting the holdings response in the browser to be empty. **Member (no bank-connection permission):** "Holdings appear here once an owner or admin links an investment account." with no link, at 390 and 1440. **Owner (light, 1440 and 390) and admin (light, 390 and 1440; dark, 390):** the pointer to **Settings → Bank Sync** stays. **A selection with no holdings** (member and owner): the chart card stays and a separate "No holdings / No holdings for the selected accounts." card replaces the table; no "$0.00 / 100.00%" total anywhere. A member who has the "Manage bank connections" permission was not driven in the UI; the rule is in `canLinkAccounts` (`emptyState.ts`), covered by #385's test. Screenshots: [332-investments-empty-member-light-1440.png](screenshots/recheck/b/332-investments-empty-member-light-1440.png)<br>[332-investments-empty-member-light-390.png](screenshots/recheck/b/332-investments-empty-member-light-390.png)<br>[332-investments-empty-selection-member-light-1440.png](screenshots/recheck/b/332-investments-empty-selection-member-light-1440.png)<br>[332-investments-empty-selection-member-light-390.png](screenshots/recheck/b/332-investments-empty-selection-member-light-390.png)<br>[332-investments-empty-selection-owner-light-1440.png](screenshots/recheck/b/332-investments-empty-selection-owner-light-1440.png)<br>[385-investments-empty-link-owner-light-1440.png](screenshots/recheck/b/385-investments-empty-link-owner-light-1440.png)<br>[385-investments-empty-link-owner-light-390.png](screenshots/recheck/b/385-investments-empty-link-owner-light-390.png)<br>[385-investments-empty-link-admin-light-1440.png](screenshots/recheck/b/385-investments-empty-link-admin-light-1440.png)<br>[385-investments-empty-link-admin-light-390.png](screenshots/recheck/b/385-investments-empty-link-admin-light-390.png)<br>[385-investments-empty-link-admin-dark-390.png](screenshots/recheck/b/385-investments-empty-link-admin-dark-390.png) |
| B9 | Medium | Reports (Export CSV) | The exported file writes money in as negative (`-3.00` for interest income) and spending as positive, with no Type column or note; the page shows income as +$3.00 in green. | [#333](https://github.com/robpaolella/ledger/issues/333) | [#375](https://github.com/robpaolella/ledger/pull/375) | Re-checked (pass) | The export header is `Date,Merchant,Category,Account,Amount,Type`. Interest income -3.00 reads `Income`, Publix 69.19 `Expense`, Target refund -42.50 `Refund`, card payment `Transfer`, uncategorized Costco empty. Counts across the 1,270 rows: Expense 1055, Transfer 86, Income 76, Refund 2, empty 51. Amount sign unchanged. The file is a download, so the screenshots show its first lines written over the Reports page by the check (the box is not part of the app), as owner and member. Screenshots: [333-reports-export-csv-owner-light-1440.png](screenshots/recheck/b/333-reports-export-csv-owner-light-1440.png)<br>[333-reports-export-csv-member-light-1440.png](screenshots/recheck/b/333-reports-export-csv-member-light-1440.png)<br>[333-reports-export-csv-excerpt.txt](screenshots/recheck/b/333-reports-export-csv-excerpt.txt) |
| B10 | Medium | Reviews | With a Users filter active the phone toolbar squeezes the Date filter to "D." and the Users filter to "Sampl… 1"; the Date button is unreadable. | [#334](https://github.com/robpaolella/ledger/issues/334) | [#361](https://github.com/robpaolella/ledger/pull/361) | Re-checked (pass) | At 390 with the Users filter (Sample Member) and Date filter (Last 30 days) both active: both labels read in full; the toolbar wraps to two rows; buttons are 44px high; page width 390. Owner light and dark; admin and member light. Screenshots: [334-reviews-filtered-owner-light-390.png](screenshots/recheck/b/334-reviews-filtered-owner-light-390.png)<br>[334-reviews-filtered-owner-dark-390.png](screenshots/recheck/b/334-reviews-filtered-owner-dark-390.png)<br>[334-reviews-filtered-admin-light-390.png](screenshots/recheck/b/334-reviews-filtered-admin-light-390.png)<br>[334-reviews-filtered-member-light-390.png](screenshots/recheck/b/334-reviews-filtered-member-light-390.png) |
| C-F1 | Medium | Settings and shared sheets | After tapping Delete in Edit category the footer reads "Confirm delete? · Cancel · Cancel · Save changes", and Save changes runs off the edge of the window. On phones Edit account's "Remove account" confirmation also squeezes its text into a narrow column | [#335](https://github.com/robpaolella/ledger/issues/335) | [#377](https://github.com/robpaolella/ledger/pull/377) | re-checked (pass) | re-checked (pass). Owner and admin, both themes, 390 and 1440: footer is "Confirm delete? · Cancel" only, nothing past the edge (button edges measured), the normal Cancel / Save changes footer returns after 3 seconds and after Cancel. Edit account → Remove: text on its own lines, buttons below it. The Edit group window has no Delete button for a group that still has categories, so there is no confirmation to check there (not a regression). Screenshots: [`335-edit-category-delete-owner-light-390`](screenshots/recheck/c/335-edit-category-delete-owner-light-390.png), [`335-edit-category-delete-owner-dark-390`](screenshots/recheck/c/335-edit-category-delete-owner-dark-390.png), [`335-edit-category-delete-owner-light-1440`](screenshots/recheck/c/335-edit-category-delete-owner-light-1440.png), [`335-edit-category-delete-admin-light-390`](screenshots/recheck/c/335-edit-category-delete-admin-light-390.png), [`335-edit-account-remove-owner-light-390`](screenshots/recheck/c/335-edit-account-remove-owner-light-390.png), [`335-edit-account-remove-owner-dark-1440`](screenshots/recheck/c/335-edit-account-remove-owner-dark-1440.png) |
| C-F2 | Medium | Settings and shared sheets | The Financial institutions window says "Set LOGODEV_TOKEN on the server to fetch logos automatically." (developer wording, against "UI text speaks to the site's visitor") | [#336](https://github.com/robpaolella/ledger/issues/336) | [#378](https://github.com/robpaolella/ledger/pull/378) | re-checked (pass) | re-checked (pass). Owner and admin, both themes, both widths: the window reads "Logos aren't set up. They're optional; setup steps are in Ledger's documentation."; no "LOGODEV", "logo.dev" or "the server" in the window or the edit view; "Fetch missing logos" is hidden when logos aren't set up. Server refusal text is "Logo fetching isn't set up. See Ledger's documentation for setup steps." The "logos set up" state could not be shown: the verification app server never receives the token by design, so only the not-set-up state was seen. Screenshots: [`336-institutions-owner-light-390`](screenshots/recheck/c/336-institutions-owner-light-390.png), [`336-institutions-owner-dark-1440`](screenshots/recheck/c/336-institutions-owner-dark-1440.png), [`336-institutions-admin-light-1440`](screenshots/recheck/c/336-institutions-admin-light-1440.png), [`336-institution-edit-owner-light-390`](screenshots/recheck/c/336-institution-edit-owner-light-390.png) |
| C-F3 | Medium | Settings and shared sheets | Bank sync's Daily sync card says "3 of 10 connections had problems" while the viewer sees 3 (member) or 7 (owner) connections, so the figure doesn't match the list | [#337](https://github.com/robpaolella/ledger/issues/337) | [#382](https://github.com/robpaolella/ledger/pull/382) | re-checked (pass) | re-checked (pass). Counts now match the list under each role: owner "3 of 7" (7 connections listed, 3 with a problem badge), admin "2 of 6", member "2 of 3". Light and dark, 390 and 1440. Screenshots: [`337-bank-sync-member-light-390`](screenshots/recheck/c/337-bank-sync-member-light-390.png), [`337-bank-sync-member-light-1440`](screenshots/recheck/c/337-bank-sync-member-light-1440.png), [`337-bank-sync-full-owner-light-1440`](screenshots/recheck/c/337-bank-sync-full-owner-light-1440.png), [`337-bank-sync-owner-dark-390`](screenshots/recheck/c/337-bank-sync-owner-dark-390.png), [`337-bank-sync-admin-light-1440`](screenshots/recheck/c/337-bank-sync-admin-light-1440.png) |
| C-F4 | Medium | Settings and shared sheets | Every Settings page, even Profile, makes a live SimpleFIN request for each connection the person can see (`POST /api/simplefin/connections/:id/accounts`). SimpleFIN's daily request limit is small and the Bank sync panel itself reports "daily request limit was reached"; severity is a judgement call (conductor may lower it) | [#338](https://github.com/robpaolella/ledger/issues/338) | [#369](https://github.com/robpaolella/ledger/pull/369) | re-checked (pass) | re-checked (pass). Network log, owner and member (admin spot-checked): Profile, Security, Notifications, Categories, Merchants, Rules, Users and Optional extras make 0 `/simplefin/connections/:id/accounts` calls (only the single `GET /simplefin/connections`). Accounts makes 7 calls (owner) / 6 (admin) and Bank sync 7 / 6 / 3 (member); the Edit account window still lists the bank accounts to link. Screenshots: [`338-accounts-edit-window-owner-light-1440`](screenshots/recheck/c/338-accounts-edit-window-owner-light-1440.png) (the call counts are in this report) |
| C-F5 | Medium | Settings and shared sheets | Notifications pop-up: the clear (×) button is 22px and invisible until hover, so on phones it can't be seen or tapped; Mark all read / Clear all are 20px tall and "View budget" 32px; opening the bell does not move keyboard focus into the pop-up | [#339](https://github.com/robpaolella/ledger/issues/339) | [#370](https://github.com/robpaolella/ledger/pull/370) | re-checked (pass) | re-checked (pass). All three roles, both themes, both widths: at 390 every clear (×), Mark all read, Clear all and View budget / Review button measures 44px and the × is visible without hover; at 1440 the × stays hover-only (22px) as the issue allows. Opening the bell puts focus inside the pop-up; Escape closes it and returns focus to the bell button. The empty state for the member still works. In the code the Sidebar renders a single bell, so there are no decorative copies left in the collapsed rail to tab through. Screenshots: [`339-notifications-owner-light-390`](screenshots/recheck/c/339-notifications-owner-light-390.png), [`339-notifications-owner-dark-390`](screenshots/recheck/c/339-notifications-owner-dark-390.png), [`339-notifications-owner-light-1440`](screenshots/recheck/c/339-notifications-owner-light-1440.png), [`339-notifications-member-light-390`](screenshots/recheck/c/339-notifications-member-light-390.png), [`339-notifications-admin-light-1440`](screenshots/recheck/c/339-notifications-admin-light-1440.png) |
| C-F6 | Medium | Settings and shared sheets | Leftover controls under 44px at 390 in Settings and shared sheets: Profile Theme Light/Dark 34px; Rules search 38px; "Upload photo" / "Upload logo" 20px; Shared/Personal 34px and "I have an access URL" 19px; Institutions Add 40, Fetch missing logos 32, Done 40; Delete and Confirm 40px; Declining/Straight segmented 34px; Filters rows 36–37px; Manual import chips 36px; Date range calendar buttons 40px; Review sheet Mark reviewed 32px and "Open in Transactions" 17px; Open splits 36px, Split 20px, "Split across categories" 20px | [#340](https://github.com/robpaolella/ledger/issues/340) | [#384](https://github.com/robpaolella/ledger/pull/384) | re-checked (pass) | Pass for the controls listed; the remainder (Edit institution, Merchants search) was filed as #391 and re-checked in report-d: pass. Every control listed in the issue now measures 44px or more at 390 in light and dark (owner; admin and member where visible): Profile Theme, Rules search, Upload photo / logo, Shared / Personal, "I have an access URL", Institutions Add / Done, Delete / Confirm, Declining / Straight, Filters rows, Manual import chips, Date range, Mark reviewed, Open in Transactions, Open splits, Split, Split across categories. At the time of re-check C these were not fixed (filed as #391): the Edit institution view (Remove 18px, Delete 20px, Confirm / Cancel 36px, colour swatch 36px) and, a miss in part C, the Merchants search (40px frame, 20px field). Screenshots: [`340-settings-profile-owner-light-390`](screenshots/recheck/c/340-settings-profile-owner-light-390.png), [`340-settings-rules-owner-light-390`](screenshots/recheck/c/340-settings-rules-owner-light-390.png), [`340-tx-filters-owner-light-390`](screenshots/recheck/c/340-tx-filters-owner-light-390.png), [`340-tx-manual-import-owner-light-390`](screenshots/recheck/c/340-tx-manual-import-owner-light-390.png), [`340-review-detail-owner-light-390`](screenshots/recheck/c/340-review-detail-owner-light-390.png), [`340-bank-add-owner-light-390`](screenshots/recheck/c/340-bank-add-owner-light-390.png), [`340-asset-add-owner-light-390`](screenshots/recheck/c/340-asset-add-owner-light-390.png), [`340-institutions-owner-light-390`](screenshots/recheck/c/340-institutions-owner-light-390.png); failures: [`340-institution-edit-owner-light-390`](screenshots/recheck/c/340-institution-edit-owner-light-390.png), [`340-institution-edit-delete-confirm-owner-light-390`](screenshots/recheck/c/340-institution-edit-delete-confirm-owner-light-390.png), [`340-merchants-search-owner-light-390`](screenshots/recheck/c/340-merchants-search-owner-light-390.png) |
| C-A1 | High (part A finding) | see A | Edit asset Delete deleted at once, no confirmation (filed by part A) | [#341](https://github.com/robpaolella/ledger/issues/341) | [#362](https://github.com/robpaolella/ledger/pull/362) | re-checked (pass); also re-checked in A | Second re-check in re-check C. Pass for the Delete confirmation. Owner and admin, both themes, both widths: first tap reads "Confirm delete?" and deletes nothing (asset still listed after closing and reloading); resets after about 3 seconds; second tap deletes, shows "Asset deleted" once and net worth updates (owner, light, 1440, sample "iPad Pro"). Footer not clipped.  Screenshots: [`341-asset-delete-confirm-owner-light-390`](screenshots/recheck/c/341-asset-delete-confirm-owner-light-390.png), [`341-asset-delete-confirm-owner-dark-1440`](screenshots/recheck/c/341-asset-delete-confirm-owner-dark-1440.png), [`341-asset-delete-confirm-admin-light-390`](screenshots/recheck/c/341-asset-delete-confirm-admin-light-390.png), [`341-asset-deleted-toast-owner-light-1440`](screenshots/recheck/c/341-asset-deleted-toast-owner-light-1440.png) |
| C-A9 | Medium (part A finding) | see A | Add account and Update balance sheets autofocused their field on phones (filed by part A) | [#349](https://github.com/robpaolella/ledger/issues/349) | [#365](https://github.com/robpaolella/ledger/pull/365) | re-checked (pass); also re-checked in A | Second re-check in re-check C. Pass. Owner, admin (member for Update balance), both themes: at 390 focus lands on the sheet's Close button, not an input; at 1440 the first field is focused; with a real mouse click, Escape returns focus to the trigger button at both widths. The sibling sheets listed under #392 were not covered by that fix. Screenshots: [`349-add-account-owner-light-390`](screenshots/recheck/c/349-add-account-owner-light-390.png), [`349-add-account-owner-light-1440`](screenshots/recheck/c/349-add-account-owner-light-1440.png), [`349-update-balance-owner-light-390`](screenshots/recheck/c/349-update-balance-owner-light-390.png), [`349-update-balance-owner-dark-1440`](screenshots/recheck/c/349-update-balance-owner-dark-1440.png), [`349-update-balance-member-light-390`](screenshots/recheck/c/349-update-balance-member-light-390.png) |
| C-N1 | Medium (filed by re-check C) | Accounts · Edit depreciation · 390 | Edit depreciation Delete confirmation showed two Cancels and wrapped Save changes at 390. | [#390](https://github.com/robpaolella/ledger/issues/390) | [#396](https://github.com/robpaolella/ledger/pull/396) | re-checked (pass) in re-check D | Pass (owner and admin, light and dark, 390 and 1440, 8 runs). After Delete the footer is "Confirm delete?" and one Cancel; Save changes is hidden while confirming; at 390 one row, 44px buttons. Normal footer returns after 3 seconds and after Cancel. The Edit transaction window's footer could not be reached (see Coverage notes). Screenshots: [owner light 390](screenshots/recheck/d/390-edit-depreciation-confirming-owner-light-390.png), [owner dark 390](screenshots/recheck/d/390-edit-depreciation-confirming-owner-dark-390.png), [owner light 1440](screenshots/recheck/d/390-edit-depreciation-confirming-owner-light-1440.png), [admin dark 390](screenshots/recheck/d/390-edit-depreciation-confirming-admin-dark-390.png), [admin dark 1440](screenshots/recheck/d/390-edit-depreciation-confirming-admin-dark-1440.png), [after timeout](screenshots/recheck/d/390-edit-depreciation-timeout-owner-light-390.png), [after Cancel](screenshots/recheck/d/390-edit-depreciation-cancel-admin-dark-390.png), [at rest](screenshots/recheck/d/390-edit-depreciation-rest-owner-light-390.png) |
| C-N2 | Medium (filed by re-check C) | Settings · Institutions, Merchants · 390 | Edit institution view and Merchants search under 44px at 390. | [#391](https://github.com/robpaolella/ledger/issues/391) | [#398](https://github.com/robpaolella/ledger/pull/398) | re-checked (pass) in re-check D | Pass (owner and admin, light and dark, 390 and 1440; Merchants search also as member). At 390 Remove, swatch, Delete, Confirm and Cancel are 44px, Merchants search frame 44px and field 42px; 1440 unchanged. One low note (backlog). Screenshots: [institution edit](screenshots/recheck/d/391-institution-edit-owner-light-390.png), [delete confirm owner light 390](screenshots/recheck/d/391-institution-edit-delete-confirm-owner-light-390.png), [delete confirm admin dark 390](screenshots/recheck/d/391-institution-edit-delete-confirm-admin-dark-390.png), [owner dark 1440](screenshots/recheck/d/391-institution-edit-owner-dark-1440.png), [admin light 1440](screenshots/recheck/d/391-institution-edit-delete-confirm-admin-light-1440.png), [merchants search owner](screenshots/recheck/d/391-merchants-search-owner-light-390.png), [merchants search member light 390](screenshots/recheck/d/391-merchants-search-member-light-390.png), [merchants search member dark 1440](screenshots/recheck/d/391-merchants-search-member-dark-1440.png) |
| C-N3 | Medium (filed by re-check C) | Settings · sheets · 390 | Connect SimpleFIN, Edit connection, New category, New group and Add user sheets focused a field at 390. | [#392](https://github.com/robpaolella/ledger/issues/392) | [#395](https://github.com/robpaolella/ledger/pull/395) | re-checked (pass) in re-check D | Pass (owner and admin, light and dark, 390 and 1440, 8 runs × 5 sheets). At 390 focus is on the sheet's Close button, no field; at 1440 the first field is focused. Screenshots: [Connect SimpleFIN 390](screenshots/recheck/d/392-connect-simplefin-owner-light-390.png), [Edit connection 390](screenshots/recheck/d/392-edit-connection-admin-dark-390.png), [New category 390](screenshots/recheck/d/392-new-category-owner-dark-390.png), [New group 390](screenshots/recheck/d/392-new-group-admin-light-390.png), [Add user 390](screenshots/recheck/d/392-add-user-owner-light-390.png), [Add user 1440](screenshots/recheck/d/392-add-user-admin-dark-1440.png), [New category 1440](screenshots/recheck/d/392-new-category-owner-light-1440.png), [Connect SimpleFIN 1440](screenshots/recheck/d/392-connect-simplefin-owner-light-1440.png) |

### Observations from the re-checks (not findings)

- Investments, All accounts: the Market card's 3-month return reads 2.02% while the Holdings Total row reads 2.03%. They use different calculations; the money totals match exactly. This is the same difference #379 will remove (see below).
- The sample total moved from $155,794.13 (quoted in #325) to $155,684.54: sample prices differ day to day. The check that matters (Holdings total equals the Accounts Investments group total) holds.
- #327 (phone sheets do not close on Escape) was withdrawn by part B and found nothing in part A; re-check A re-ran it for all nine sheet states and every one closed on Escape. The issue is closed as not planned.

## Known, filed outside the audit

Issues filed outside the audit that touch audited pages. They are not audit findings and do not count against "no open high or medium findings".

| Issue | What | Status |
| --- | --- | --- |
| [#379](https://github.com/robpaolella/ledger/issues/379) | Investments: the return counts contributions as gains, and the Market card and the Holdings Total disagree (Market: 2.02%, Holdings Total: 2.03% in the sample). Robert chose method A (compute the portfolio line from holdings prices) and, on 2026-10-13, to ship it after v2.0.0 on main. | **Open** (`status:needs-prep`, `tier:hard`, `risk:high`), waits for the v2.0.0 release (#113). Not a v2.0.0 blocker. |

## Low findings

Not fixed in this audit and not re-checked. Each has one line in `backlog.md` (L1 of part B shares its existing #309 line). The part's own file keeps the full list; counts are part A 14, part B 20, part C 8, plus 7 new lows the re-checks recorded.


**Part A (14)**

- Phone search fields on Transactions and Account detail show a square focus outline inside the rounded field.
- Desktop Transactions search field has no accessible name (placeholder only).
- An empty search says it twice ("Nothing matches “zzqqxx”" and "No transactions" / "0 transactions" under it).
- Phone Add transaction: the Account select text is cut ("Jane's Checking (…") at 390.
- Add transaction opens with Account set to the first account in the list (Jane's Checking for John), not an account of the signed-in person.
- Add / Edit asset: "Acquired" uses the browser's own date input while every other date field uses the app's calendar; "Annual rate" slider is 17px tall on phones.
- Transaction detail on phones: "Copy statement" is 32px (not on #340's list).
- Category detail for a category with no data, or only refunds, draws the y-axis as "$1 $1 $0 $0".
- Category detail for a category that doesn't exist says "Failed to load category" instead of "Category not found" (the not-found wording exists in code but is never reached).
- Phone liability chart (Jane's Visa): x-axis labels touch ("Sep 12Sep 18").
- Category detail on desktop truncates the account name ("John's Mastercard (…") with room to spare.
- Add account and Update balance windows return focus to the page, not the button that opened them, after Escape (desktop).
- On desktop, toasts cover the top-right header buttons (Filters, Refresh all, Add account) until they time out.
- Add account fires four failing `/api/simplefin/connections/N/accounts` calls (500) on the sample's demo connections each time it opens; nothing shows on screen.

**Part B (20)**

- Budget phone: "Entertainment" breaks mid-word as "Entertainm / ent" (known; design 309 left it to a follow-up).
- Budget phone: a month with no budget (for example January 2026) is 20 rows of dashes under a green "Left to budget —" band, with no hint to plan something; the way forward is "Show N unbudgeted".
- Budget with a View-only member: the planned-amount boxes are disabled but look the same as editable ones, so tapping does nothing and nothing says why.
- Investments: the last x-axis label of the chart is clipped ("Oct ·") at both widths.
- Reviews phone: the row subtitle clips the note ("· C…", "Check thi…").
- Import Bank Sync phone: account names truncate beside the owner badge ("John's Masterc…").
- Recurring phone: the account name truncates ("John's Chec…").
- Reports phone drill-down: the sticky pill truncates the category ("Dail…") and covers the last visible row.
- Reports empty range: Net $0 still reads "▲ saved" in green; with a custom range the phone toolbar wraps to two rows.
- Reviews "No matches" reuses the green check icon from "all caught up".
- Every sheet and dialog opens with a focus ring on the close X (phone and desktop).
- Reviews phone search field shows a double focus ring (outline plus box).
- Import CSV review: the duplicate warning icon is explained only by a hover tooltip ("Likely Duplicate"), so phone users can't read it.
- Recurring empty ("No recurring items yet.") doesn't point to the Add button (the + in the phone app bar).
- Investments failed load: "Performance data unavailable." and "Holdings data unavailable." have no Try again and don't say the problem is temporary. Rated low, not medium, by re-check C (the page does not look healthy when it fails, unlike the old Reviews "all caught up"; Reviews and Recurring got a retry card in #371).
- Import Bank Sync phone: row check boxes are 20×20 and the search field's inner input measures 81×20 (the surrounding row and field are 44px; the box itself is the small target).
- Sample data has no genuine "all caught up" Reviews state (26 uncategorized rows can't be bulk-approved); it can only be seen by failing the load (B6).
- Budget category detail desktop: the account label truncates ("John's Mastercard (…..").
- Budget Year: "planned in 2026" totals count carried-forward future months (11 months of 9 seeded), which is correct for the plan but unexplained.
- Import: the page opens on the Bank Sync tab although CSV Import is listed first.

**Part C (8)**

- Merchants (phone): each row's Edit button is held at 60% opacity because it brightens on hover, and phones have no hover, so Edit always looks disabled.
- Rules: rules that match by pattern read "Description matches the pattern ^Chewy\b", raw regular-expression text a household can't read. Only the sample data's rules do this (rules made in the app use a merchant or "contains").
- Profile: the owner and admin see "Used to sign in. Ask an admin to change it." under Username, but they are the admin; the line should differ for them.
- Edit account and Edit category windows open with keyboard focus on the Close (×) button, drawing a focus ring on it, where Add account focuses the Name field.
- The panel load error says "Couldn't load your settings" on Merchants, Rules, Users and Optional extras; it names settings for a list of merchants, rules or people.
- Phone form fields use 14px text; iOS zooms the page when a field under 16px is focused (Add user, Add account, SimpleFIN, Security).
- Optional extras → AI categorizing: **Test connection** saves the address before testing and says nothing, so a failed address stays saved.
- Delete user: the confirmation button says "Continue" for a permanent delete; it could name the action.

**New lows recorded by the re-checks (7: re-check A 1, B 1, C 4, D 1; re-check C's "Investments failed load has no Try again" is part B's L15 and is not repeated)**

- Phone Account detail: the "Clear" button inside the "Nothing matches “…”" card is 40px tall, under the 44px rule; it was not on #353's list (re-check A).
- Investments phone holdings cards (390): the right-hand "… of portfolio" line looks cut at the screen edge (re-check B, O2).
- A sign-in that expires while using the app drops the person on the Sign in page with no message.
- `/budget/category` without a category titles the page "Ledger" instead of a page name.
- Inline "SimpleFIN" link inside the Connect SimpleFIN instructions is 18px tall (a link inside a sentence; not counted against the 44px rule).
- Edit group window: Delete exists only for an empty group, so the Delete confirmation in a group window could not be exercised on the sample data (every group has categories).
- Settings → Merchants (phone): the search field is 42px tall inside its 44px frame (the 1px border takes the other 2px), so a tap exactly on the border does not focus it (re-check D, #391).

Notes: part B L1 ("Entertainment" breaks mid-word on the phone Budget) was already a line in `backlog.md` (found in #309), so that line now also says "Part B L1" instead of adding a second one. Re-check A's observation that the Edit asset confirmation still showed Save changes and a second Cancel is not listed: it was filed as #390 (C-N1) and re-checked in re-check D. Two more backlog lines come from conductor notes (not audit lows): the Edit transaction window's unreachable edit and delete path (found by #390's worker, PR #396), and Account detail's "Couldn't load this account" card, which could reuse the shared `LoadError` from #360.

## Sources

`part-a.md`, `part-b.md`, `part-c.md`, `report-a.md`, `report-b.md`, `report-c.md`, `report-d.md` in this folder; `screenshots/part-*` and `screenshots/recheck/{a,b,c,d}`.
