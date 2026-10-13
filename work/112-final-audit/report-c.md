# Final audit, re-check C: Settings, notifications, sheets and modals (#389)

Re-check of the part C findings (`part-c.md`, #282), plus the coverage-gap comparison and the Investments notice decision. Part of #112.

Run on 2026-10-13 against `feature/platform-retheme` at `6501ea8` (all of #335 to #341 and #349 are merged there, as #377, #378, #382, #369, #370, #384, #362 and #365). Built and launched with `.pi/skills/verify-ledger` on its synthetic sample data (Doctor `PASS`; launch month October 2026, "today" Oct 13). Nothing from `data/` or the live instance was opened. Screenshots are synthetic data only.

**Bottom line:** every high or medium finding from part C was re-checked. **Five of the six pass** (F1 #335, F2 #336, F3 #337, F4 #338, F5 #339) and so do #341 and #349. **F6 (#340) mostly passes but is not fully fixed**: the Edit institution view and the Merchants search still have phone controls under 44px. The re-check also found two new medium problems and one sibling of #349. Three new issues are filed, all blocking #112:

- [#390](https://github.com/robpaolella/ledger/issues/390): Edit depreciation Delete confirmation shows two Cancel buttons and wraps Save changes onto a second row on phones (a follow-up to #341 and #335).
- [#391](https://github.com/robpaolella/ledger/issues/391): Edit institution view (Remove, Delete, Confirm, Cancel, colour swatch) and the Merchants search box are still under 44px on phones (a follow-up to #340).
- [#392](https://github.com/robpaolella/ledger/issues/392): Connect SimpleFIN, New category, New group and Add user sheets still autofocus a field on phones (a sibling of #349).

So #112 cannot say "nothing high or medium is open" until #390, #391 and #392 land. The Investments "Performance data unavailable." notice is **low** (see its section).

## Severity

Same scale as part C: **high** a wrong money figure, data loss, a permission leak, a broken flow or a crash; **medium** a visible break from the rulebook or an approved design, content clipped or unreachable on a phone, misleading wording, or a state with no way forward; **low** cosmetic polish.

## How it was done

- Launched once with `.pi/skills/verify-ledger` from this worktree (own evidence folder, cleaned up at the end). Real sign-in through the login form for John (owner), Jane (admin) and Sample Member (member); a browser context per role. Auth was never injected.
- Driven by script over `puppeteer-core` and the system Chrome (the same way part C was), so one script could loop role × theme × width. Viewports 390×844 (touch) and 1440×900; the theme was set through the app's own stored `ledger-theme` preference, the page reloaded, and the `dark` class and `innerWidth` were checked for every capture.
- Tap-target heights were measured by hit-testing the live page: for each control, how many pixels above and below its centre still land on the control (so a `tap-area` zone counts and a bare 20px field in a 40px frame does not). The measurement was run on the real windows, not on the sizes quoted in the issues. It reads 34px for the Theme buttons at 1440 (their desktop size), which shows it tells the two states apart.
- Each fix issue was checked against its own validation criteria at the role, theme and width where part C found it (owner and admin; member where the control is visible), then the screenshot was opened and read. Screenshots are named `<issue>-<page>-<role>-<theme>-<width>.png` (a few extras use `gap-` and `inv-notice-` prefixes) in `screenshots/recheck/c/`.
- Data changed in the throwaway database (removed by cleanup): the sample asset "iPad Pro" was deleted once through the real Delete → Confirm delete? flow to check #341; nothing else was saved.

## Findings and re-check status

Every finding in `part-c.md` is here. Status is one of **re-checked (pass)**, **re-check failed**, or **low (no re-check)**.

| # | Finding (part C) | Severity | Issue | Status | Evidence |
|---|---|---|---|---|---|
| F1 | Delete confirmation broke the Edit category footer (three buttons, two Cancels, Save clipped); Edit account's Remove text squeezed on phones | medium | [#335](https://github.com/robpaolella/ledger/issues/335) (fix #377) | **re-checked (pass)**. Owner and admin, both themes, 390 and 1440: footer is "Confirm delete? · Cancel" only, nothing past the edge (button edges measured), the normal Cancel / Save changes footer returns after 3 seconds and after Cancel. Edit account → Remove: text on its own lines, buttons below it. The Edit group window has no Delete button for a group that still has categories, so there is no confirmation to check there (not a regression). | [`335-edit-category-delete-owner-light-390`](screenshots/recheck/c/335-edit-category-delete-owner-light-390.png), [`335-edit-category-delete-owner-dark-390`](screenshots/recheck/c/335-edit-category-delete-owner-dark-390.png), [`335-edit-category-delete-owner-light-1440`](screenshots/recheck/c/335-edit-category-delete-owner-light-1440.png), [`335-edit-category-delete-admin-light-390`](screenshots/recheck/c/335-edit-category-delete-admin-light-390.png), [`335-edit-account-remove-owner-light-390`](screenshots/recheck/c/335-edit-account-remove-owner-light-390.png), [`335-edit-account-remove-owner-dark-1440`](screenshots/recheck/c/335-edit-account-remove-owner-dark-1440.png) |
| F2 | Financial institutions window said "Set LOGODEV_TOKEN on the server…" | medium | [#336](https://github.com/robpaolella/ledger/issues/336) (fix #378) | **re-checked (pass)**. Owner and admin, both themes, both widths: the window reads "Logos aren't set up. They're optional; setup steps are in Ledger's documentation."; no "LOGODEV", "logo.dev" or "the server" in the window or the edit view; "Fetch missing logos" is hidden when logos aren't set up. Server refusal text is "Logo fetching isn't set up. See Ledger's documentation for setup steps." The "logos set up" state could not be shown: the verification app server never receives the token by design, so only the not-set-up state was seen. | [`336-institutions-owner-light-390`](screenshots/recheck/c/336-institutions-owner-light-390.png), [`336-institutions-owner-dark-1440`](screenshots/recheck/c/336-institutions-owner-dark-1440.png), [`336-institutions-admin-light-1440`](screenshots/recheck/c/336-institutions-admin-light-1440.png), [`336-institution-edit-owner-light-390`](screenshots/recheck/c/336-institution-edit-owner-light-390.png) |
| F3 | Daily sync said "3 of 10 connections had problems" while the viewer sees fewer | medium | [#337](https://github.com/robpaolella/ledger/issues/337) (fix #382) | **re-checked (pass)**. Counts now match the list under each role: owner "3 of 7" (7 connections listed, 3 with a problem badge), admin "2 of 6", member "2 of 3". Light and dark, 390 and 1440. | [`337-bank-sync-member-light-390`](screenshots/recheck/c/337-bank-sync-member-light-390.png), [`337-bank-sync-member-light-1440`](screenshots/recheck/c/337-bank-sync-member-light-1440.png), [`337-bank-sync-full-owner-light-1440`](screenshots/recheck/c/337-bank-sync-full-owner-light-1440.png), [`337-bank-sync-owner-dark-390`](screenshots/recheck/c/337-bank-sync-owner-dark-390.png), [`337-bank-sync-admin-light-1440`](screenshots/recheck/c/337-bank-sync-admin-light-1440.png) |
| F4 | Every Settings page called SimpleFIN for each connection | medium | [#338](https://github.com/robpaolella/ledger/issues/338) (fix #369) | **re-checked (pass)**. Network log, owner and member (admin spot-checked): Profile, Security, Notifications, Categories, Merchants, Rules, Users and Optional extras make **0** `/simplefin/connections/:id/accounts` calls (only the single `GET /simplefin/connections`). Accounts makes 7 calls (owner) / 6 (admin) and Bank sync 7 / 6 / 3 (member); the Edit account window still lists the bank accounts to link. | [`338-accounts-edit-window-owner-light-1440`](screenshots/recheck/c/338-accounts-edit-window-owner-light-1440.png) (the call counts are in this report) |
| F5 | Notifications pop-up: invisible 22px clear button, small text buttons, no focus handling | medium | [#339](https://github.com/robpaolella/ledger/issues/339) (fix #370) | **re-checked (pass)**. All three roles, both themes, both widths: at 390 every clear (×), Mark all read, Clear all and View budget / Review button measures 44px and the × is visible without hover; at 1440 the × stays hover-only (22px) as the issue allows. Opening the bell puts focus inside the pop-up; Escape closes it and returns focus to the bell button. The empty state for the member still works. In the code the Sidebar renders a single bell, so there are no decorative copies left in the collapsed rail to tab through. | [`339-notifications-owner-light-390`](screenshots/recheck/c/339-notifications-owner-light-390.png), [`339-notifications-owner-dark-390`](screenshots/recheck/c/339-notifications-owner-dark-390.png), [`339-notifications-owner-light-1440`](screenshots/recheck/c/339-notifications-owner-light-1440.png), [`339-notifications-member-light-390`](screenshots/recheck/c/339-notifications-member-light-390.png), [`339-notifications-admin-light-1440`](screenshots/recheck/c/339-notifications-admin-light-1440.png) |
| F6 | Leftover controls under 44px at 390 in Settings and shared sheets | medium | [#340](https://github.com/robpaolella/ledger/issues/340) (fix #384) | **re-check failed (partly)**. Every control listed in the issue now measures 44px or more at 390 in light and dark (owner; admin and member where visible): Profile Theme, Rules search, Upload photo / logo, Shared / Personal, "I have an access URL", Institutions Add / Done, Delete / Confirm, Declining / Straight, Filters rows, Manual import chips, Date range, Mark reviewed, Open in Transactions, Open splits, Split, Split across categories. **Not fixed:** the Edit institution view (Remove 18px, Delete 20px, Confirm / Cancel 36px, colour swatch 36px) and, a miss in part C, the Merchants search (40px frame, 20px field). | [#391](https://github.com/robpaolella/ledger/issues/391) (open); evidence: [`340-settings-profile-owner-light-390`](screenshots/recheck/c/340-settings-profile-owner-light-390.png), [`340-settings-rules-owner-light-390`](screenshots/recheck/c/340-settings-rules-owner-light-390.png), [`340-tx-filters-owner-light-390`](screenshots/recheck/c/340-tx-filters-owner-light-390.png), [`340-tx-manual-import-owner-light-390`](screenshots/recheck/c/340-tx-manual-import-owner-light-390.png), [`340-review-detail-owner-light-390`](screenshots/recheck/c/340-review-detail-owner-light-390.png), [`340-bank-add-owner-light-390`](screenshots/recheck/c/340-bank-add-owner-light-390.png), [`340-asset-add-owner-light-390`](screenshots/recheck/c/340-asset-add-owner-light-390.png), [`340-institutions-owner-light-390`](screenshots/recheck/c/340-institutions-owner-light-390.png); failures: [`340-institution-edit-owner-light-390`](screenshots/recheck/c/340-institution-edit-owner-light-390.png), [`340-institution-edit-delete-confirm-owner-light-390`](screenshots/recheck/c/340-institution-edit-delete-confirm-owner-light-390.png), [`340-merchants-search-owner-light-390`](screenshots/recheck/c/340-merchants-search-owner-light-390.png) |
| A1 (shared) | Edit asset Delete deleted at once, no confirmation (filed by part A) | high in part A | [#341](https://github.com/robpaolella/ledger/issues/341) (fix #362) | **re-checked (pass)** for the Delete confirmation. Owner and admin, both themes, both widths: first tap reads "Confirm delete?" and deletes nothing (asset still listed after closing and reloading); resets after about 3 seconds; second tap deletes, shows "Asset deleted" once and net worth updates (owner, light, 1440, sample "iPad Pro"). Footer not clipped. **But** the confirming footer shows two Cancels and wraps Save changes on phones. | [#390](https://github.com/robpaolella/ledger/issues/390) (open); [`341-asset-delete-confirm-owner-light-390`](screenshots/recheck/c/341-asset-delete-confirm-owner-light-390.png), [`341-asset-delete-confirm-owner-dark-1440`](screenshots/recheck/c/341-asset-delete-confirm-owner-dark-1440.png), [`341-asset-delete-confirm-admin-light-390`](screenshots/recheck/c/341-asset-delete-confirm-admin-light-390.png), [`341-asset-deleted-toast-owner-light-1440`](screenshots/recheck/c/341-asset-deleted-toast-owner-light-1440.png) |
| A9 (shared) | Add account and Update balance sheets autofocused their field on phones (filed by part A) | medium | [#349](https://github.com/robpaolella/ledger/issues/349) (fix #365) | **re-checked (pass)**. Owner, admin (member for Update balance), both themes: at 390 focus lands on the sheet's Close button, not an input; at 1440 the first field is focused; with a real mouse click, Escape returns focus to the trigger button at both widths. The sibling sheets listed under #392 were not covered by that fix. | [`349-add-account-owner-light-390`](screenshots/recheck/c/349-add-account-owner-light-390.png), [`349-add-account-owner-light-1440`](screenshots/recheck/c/349-add-account-owner-light-1440.png), [`349-update-balance-owner-light-390`](screenshots/recheck/c/349-update-balance-owner-light-390.png), [`349-update-balance-owner-dark-1440`](screenshots/recheck/c/349-update-balance-owner-dark-1440.png), [`349-update-balance-member-light-390`](screenshots/recheck/c/349-update-balance-member-light-390.png) |

Fix issues #335 to #341 and #349 are all closed and merged into the base; no fix is still open.

### New problems found by this re-check

| # | Problem | Severity | Issue | Status | Evidence |
|---|---|---|---|---|---|
| N1 | Edit depreciation: delete confirmation shows "Confirm delete? · Cancel · Cancel · Save changes" and wraps Save onto a second row at 390; two Cancels at 1440. The same shared button is in the Edit transaction window's footer in code (not reached on sample data). A follow-up to #341, in the pattern #335 fixed for categories | medium | [#390](https://github.com/robpaolella/ledger/issues/390) | open | [`341-asset-delete-confirm-owner-light-390`](screenshots/recheck/c/341-asset-delete-confirm-owner-light-390.png) |
| N2 | Edit institution view and Merchants search under 44px at 390 (see F6) | medium | [#391](https://github.com/robpaolella/ledger/issues/391) | open | [`340-institution-edit-owner-light-390`](screenshots/recheck/c/340-institution-edit-owner-light-390.png), [`340-institution-edit-delete-confirm-owner-light-390`](screenshots/recheck/c/340-institution-edit-delete-confirm-owner-light-390.png), [`340-merchants-search-owner-light-390`](screenshots/recheck/c/340-merchants-search-owner-light-390.png) |
| N3 | Connect SimpleFIN (Label), Edit connection (Name), New category (Category name), New group (Group name) and Add user (Full name) sheets open with a field focused at 390, against PRODUCT.md ("Do not autofocus bottom-sheet fields…"). Found while checking #349 on the other sheets; not caused by a fix | medium | [#392](https://github.com/robpaolella/ledger/issues/392) | open | [`340-bank-add-owner-light-390`](screenshots/recheck/c/340-bank-add-owner-light-390.png) |

## Coverage

Every page × role × theme × width cell from part C's two coverage tables is accounted for: the 59 rows below each cover **all 12 combinations** (owner / admin / member × light / dark × 390 / 1440), except where the role cannot reach the page (member: "hidden ✓" at all four cells, which part C checked), and the two phone-only / desktop-only rows. The 12-cell grid per row is unchanged in `part-c.md`; this table adds the re-check result for each row. In this re-check the fixes were re-run at owner light and dark at both widths, admin where the control differs, and member where visible, as listed in each finding.

### Settings pages

| Page | Roles | Themes | Widths | Re-check result |
|---|---|---|---|---|
| Settings menu `/settings` (phone index; desktop opens Profile) | owner, admin, member | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Settings → Profile | owner, admin, member | light, dark | 390 and 1440 | F6 (#340) **pass**: [340-settings-profile-owner-light-390](screenshots/recheck/c/340-settings-profile-owner-light-390.png) |
| Settings → Security | owner, admin, member | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Settings → Notifications | owner, admin, member | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Settings → Accounts | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Settings → Bank sync | owner, admin, member | light, dark | 390 and 1440 | F3 (#337) **pass** (owner 3 of 7, admin 2 of 6, member 2 of 3, each equal to the list): [337-bank-sync-member-light-390](screenshots/recheck/c/337-bank-sync-member-light-390.png), [337-bank-sync-owner-dark-1440](screenshots/recheck/c/337-bank-sync-owner-dark-1440.png) |
| Settings → Categories | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Settings → Merchants | owner, admin, member | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Settings → Rules | owner, admin, member | light, dark | 390 and 1440 | F6 (#340) **pass**: [340-settings-rules-owner-light-390](screenshots/recheck/c/340-settings-rules-owner-light-390.png) |
| Settings → Users & permissions | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Settings → Optional extras | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |

### Notifications, sheets, windows and pop-ups

| Page / state | Roles | Themes | Widths | Re-check result |
|---|---|---|---|---|
| Notifications pop-up (bell), with sample alerts | owner, admin, member | light, dark | 390 and 1440 | F5 (#339) **pass**: [339-notifications-owner-light-390](screenshots/recheck/c/339-notifications-owner-light-390.png), [339-notifications-owner-dark-1440](screenshots/recheck/c/339-notifications-owner-dark-1440.png) |
| Edit account window | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | F6 (#340) **pass**: [340-edit-account-owner-light-390](screenshots/recheck/c/340-edit-account-owner-light-390.png) |
| Add account window | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | #349 **pass**: [349-add-account-owner-light-390](screenshots/recheck/c/349-add-account-owner-light-390.png), [349-add-account-owner-light-1440](screenshots/recheck/c/349-add-account-owner-light-1440.png) |
| Edit account → Remove confirmation | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | F1 (#335) **pass**: [335-edit-account-remove-owner-light-390](screenshots/recheck/c/335-edit-account-remove-owner-light-390.png), [335-edit-account-remove-owner-dark-1440](screenshots/recheck/c/335-edit-account-remove-owner-dark-1440.png); F6 (#340) **pass** |
| Edit account → Upload photo → Crop window | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Financial institutions window | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | F2 (#336) **pass**: [336-institutions-owner-light-390](screenshots/recheck/c/336-institutions-owner-light-390.png), [336-institutions-owner-dark-1440](screenshots/recheck/c/336-institutions-owner-dark-1440.png); F6 (#340): list, Add, Done **pass**; Edit institution view still has controls under 44px, **re-check failed → [#391](https://github.com/robpaolella/ledger/issues/391) (open)**: [340-institution-edit-owner-light-390](screenshots/recheck/c/340-institution-edit-owner-light-390.png) |
| Connect SimpleFIN window | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | F6 (#340) **pass**: [340-bank-add-owner-light-390](screenshots/recheck/c/340-bank-add-owner-light-390.png); new: Label field autofocused on phones → [#392](https://github.com/robpaolella/ledger/issues/392) (open) |
| Edit connection window | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | F6 (#340) **pass**: [340-bank-edit-connection-owner-light-390](screenshots/recheck/c/340-bank-edit-connection-owner-light-390.png) (admin and owner, light and dark) |
| Reconnect (sample savings feed) | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | F6 (#340) **pass**: [340-bank-reconnect-owner-light-390](screenshots/recheck/c/340-bank-reconnect-owner-light-390.png) |
| Bank sync → Disconnect confirmation | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Edit category window | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | F6 (#340) **pass**: [340-edit-category-owner-light-390](screenshots/recheck/c/340-edit-category-owner-light-390.png) |
| Edit category → Delete confirmation | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | F1 (#335) **pass**: [335-edit-category-delete-owner-light-390](screenshots/recheck/c/335-edit-category-delete-owner-light-390.png), [335-edit-category-delete-owner-dark-1440](screenshots/recheck/c/335-edit-category-delete-owner-dark-1440.png); F6 (#340) **pass**: [340-edit-category-delete-owner-light-390](screenshots/recheck/c/340-edit-category-delete-owner-light-390.png) |
| Edit category → icon tile | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | F6 (#340) **pass**: [340-edit-category-owner-light-390](screenshots/recheck/c/340-edit-category-owner-light-390.png) (the icon tile button measured 44px inside Edit category; the picker it opens was not opened separately) |
| New category window | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | new: field autofocused on phones → [#392](https://github.com/robpaolella/ledger/issues/392) (open) |
| New group window | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | new: field autofocused on phones → [#392](https://github.com/robpaolella/ledger/issues/392) (open) |
| Edit group window | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Edit merchant window | owner, admin, member | light, dark | 390 and 1440 | F6 (#340) **pass**: [340-merchant-edit-owner-light-390](screenshots/recheck/c/340-merchant-edit-owner-light-390.png) |
| Edit merchant → Merge & delete | owner, admin, member | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Merchants sort menu | owner, admin, member | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Merchants search with no match (empty) | owner, admin, member | light, dark | 390 and 1440 | no finding in part C; new at 390 (40px frame, 20px field): [#391](https://github.com/robpaolella/ledger/issues/391) (open): [340-merchants-search-owner-light-390](screenshots/recheck/c/340-merchants-search-owner-light-390.png) |
| Rules → Delete confirmation | owner, admin, member | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Rules search with no match (empty) | owner, admin, member | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Person window: John (owner) | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Person window: Jane (admin) | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Person window: Sample Member | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Person window → Customize switches | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Add user window | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | new: field autofocused on phones → [#392](https://github.com/robpaolella/ledger/issues/392) (open) |
| Edit name or password window | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Delete user confirmation | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Security → password mismatch error | owner, admin, member | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Security → Set up two-factor window | owner, admin, member | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Optional extras → AI Test connection (failed test) | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Transaction detail (sheet on phone, side panel on desktop) | owner, admin, member | light, dark | 390 and 1440 | F6 (#340) **pass**: [340-tx-detail-owner-light-390](screenshots/recheck/c/340-tx-detail-owner-light-390.png) |
| Transaction detail → Delete confirmation | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | F6 (#340) **pass**: [340-tx-detail-delete-confirm-owner-light-390](screenshots/recheck/c/340-tx-detail-delete-confirm-owner-light-390.png) |
| Add transaction window | owner, admin, member | light, dark | 390 and 1440 | F6 (#340) **pass**: [340-tx-add-owner-light-390](screenshots/recheck/c/340-tx-add-owner-light-390.png) |
| Manual import window | owner, admin, member | light, dark | 390 and 1440 | F6 (#340) **pass**: [340-tx-manual-import-owner-light-390](screenshots/recheck/c/340-tx-manual-import-owner-light-390.png) |
| Filters (sheet on phone, pop-up on desktop) | owner, admin, member | light, dark | 390 and 1440 | F6 (#340) **pass**: [340-tx-filters-owner-light-390](screenshots/recheck/c/340-tx-filters-owner-light-390.png) |
| Date range | owner, admin, member | light, dark | 390 and 1440 | F6 (#340) **pass**: [340-tx-date-range-owner-light-390](screenshots/recheck/c/340-tx-date-range-owner-light-390.png) |
| Sort | owner, admin, member | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Accounts → Filters | owner, admin, member | light, dark | 390 and 1440 | F6 (#340) **pass**: [340-accounts-filters-owner-light-390](screenshots/recheck/c/340-accounts-filters-owner-light-390.png) |
| Update balance window (account detail) | owner, admin, member | light, dark | 390 and 1440 | #349 **pass**: [349-update-balance-owner-light-390](screenshots/recheck/c/349-update-balance-owner-light-390.png), [349-update-balance-owner-light-1440](screenshots/recheck/c/349-update-balance-owner-light-1440.png) |
| Add asset window | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | F6 (#340) **pass**: [340-asset-add-owner-light-390](screenshots/recheck/c/340-asset-add-owner-light-390.png) |
| Edit depreciation window (its Delete deletes at once with no confirmation: filed by part A as #341) | owner, admin (member: hidden ✓ at all 4) | light, dark | 390 and 1440 | F6 (#340) **pass**: [340-asset-edit-owner-light-390](screenshots/recheck/c/340-asset-edit-owner-light-390.png); #341 **pass**: [341-asset-delete-confirm-owner-light-390](screenshots/recheck/c/341-asset-delete-confirm-owner-light-390.png), but its confirmation footer shows two Cancels → [#390](https://github.com/robpaolella/ledger/issues/390) (open) |
| Review detail (sheet on phone, panel on desktop) | owner, admin, member | light, dark | 390 and 1440 | F6 (#340) **pass**: [340-review-detail-owner-light-390](screenshots/recheck/c/340-review-detail-owner-light-390.png) |
| Approve all confirmation | owner, admin, member | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Recurring item detail | owner, admin, member | light, dark | 390 and 1440 | No finding in part C; not changed by a fix, not re-checked |
| Navigation drawer (phone only) | owner, admin, member | light, dark | 390 only | No finding in part C; not changed by a fix, not re-checked |
| Sidebar user menu (desktop only) | owner, admin, member | light, dark | 1440 only | No finding in part C; not changed by a fix, not re-checked |

### Other states from part C

The "Other states checked" table in `part-c.md` (panel load failures, notifications read / empty, Profile save, taken username, password mismatch, Custom / preset confirmation, View-only member, Daily sync Paused, dialog Escape and focus, server permission probes) covers states none of the fixes touch except the notifications Escape / focus row, which is now re-checked above (F5). The other rows were not re-run.

## Coverage gaps

Comparison: part A (8 page groups × 3 roles × 2 themes × 2 widths = 96 rows, counted 12 per page: Login, Setup, Two-step setup, Dashboard, Transactions, Account detail, Category detail, Accounts), part B (72 rows: Budget, Reports, Reviews, Import, Recurring, Investments, 12 each) and part C (59 rows with 12 cells each). Against the 15 page components in the client (`pages/`) and the routes in `App.tsx`:

**No page × role × theme × width combination is missing.** Every page component has a row for every role, theme and width (counted by script on the three coverage tables; Login and Setup repeat per role as part A explains). Settings has all 10 panels plus the phone menu; the member's hidden panels were checked as hidden.

Things the tables don't list as pages, checked now (owner and member, light and dark, 390 and 1440):

| Check | Result |
|---|---|
| `/net-worth` | Redirects to `/accounts` for every role, theme and width. |
| An unknown address (`/no-such-page`) | Redirects to the Dashboard. ([`gap-no-such-page-owner-light-390`](screenshots/recheck/c/gap-no-such-page-owner-light-390.png)) |
| `/settings?panel=nonsense` | Phone: the Settings menu. Desktop: Profile. |
| `/settings?panel=ai` (kept for stored Amazon alerts) | Optional extras for owner and admin; for the member the menu (phone) or Profile (desktop). |
| `/accounts/999999` | "Account not found · This account doesn't exist" with a way back ([`gap-accounts-999999-owner-light-390`](screenshots/recheck/c/gap-accounts-999999-owner-light-390.png)). |
| `/budget/category` with no category | "No category specified" with "Back to budget"; the page title reads "Ledger" rather than a page name (low). ([`gap-budget-category-owner-light-390`](screenshots/recheck/c/gap-budget-category-owner-light-390.png)) |
| A sign-in that has expired while using the app (the server answers 401) | Sent to the Sign in page with no explanation (low, below). ([`gap-session-expired-owner-light-390`](screenshots/recheck/c/gap-session-expired-owner-light-390.png)) |

No new high or medium problem came from these. The two lows are listed below. Still not reachable on the sample data (unchanged from part C, N1 to N5): Amazon / benchmarks set up, Reset two-step for a person with two-step on, Bank sync with no connections, slow-network skeletons and drag-to-close, first-run setup.

## Investments "Performance data unavailable." notice

**Decision: low** (for #112 to put in `backlog.md`). Not a medium.

- **Code (`InvestmentsPage.tsx`):** `perf` is `null` only when the performance request fails (the component's own comment: "null = fetch failed"). "No data for this range" is not a `null`: the server always answers `{ data: { range, dates, portfolio, benchmarks, backfilling } }` and the page renders the benchmark strip and chart, with a separate "Benchmark data is still backfilling…" notice when history is still loading. So the notice means "the request failed".
- **Simulated failure on sample data** (owner, request to `/api/investments/performance` aborted, and answered with a 500): the Market card shows "Performance data unavailable." in place of the strip and chart, while the Holdings table below loads normally. At 1440 light, 390 light and 390 dark. Normal load shows no notice. [`inv-notice-500-owner-light-1440`](screenshots/recheck/c/inv-notice-500-owner-light-1440.png), [`inv-notice-abort-owner-light-390`](screenshots/recheck/c/inv-notice-abort-owner-light-390.png), [`inv-notice-500-owner-dark-390`](screenshots/recheck/c/inv-notice-500-owner-dark-390.png).
- **Why not medium:** unlike the old Reviews "all caught up" (#330), the page does not look healthy. It says the data is unavailable, and the same applies to "Holdings data unavailable." Part B (L15) already rated it low for the same reason.
- **What is still lacking (low):** no "Try again" (Reviews and Recurring got a retry card in #371); the person has to reload or change the range, and the wording doesn't say whether it is temporary. Worth a backlog line: "Investments failed load: say it couldn't be loaded and add Try again."

## Low findings

Part C's eight lows are unchanged and were **not re-checked** (status: low, no re-check); #112 copies them into `backlog.md`:

1. Merchants (phone): each row's Edit button is held at 60% opacity (brightens on hover, phones have no hover), so it always looks disabled.
2. Rules: pattern rules read "Description matches the pattern ^Chewy\b", raw regular-expression text a household can't read (sample data only).
3. Profile: the owner and admin see "Used to sign in. Ask an admin to change it." under Username, but they are the admin.
4. Edit account and Edit category windows open with keyboard focus on the Close (×) button, drawing a focus ring on it, where Add account focuses the Name field (the ring is visible in the phone screenshots above).
5. The panel load error says "Couldn't load your settings" on Merchants, Rules, Users and Optional extras.
6. Phone form fields use 14px text; iOS zooms the page when a field under 16px is focused.
7. Optional extras → AI categorizing: Test connection saves the address before testing and says nothing, so a failed address stays saved.
8. Delete user: the confirmation button says "Continue" for a permanent delete.

New lows from this re-check (for #112's `backlog.md`):

9. Investments failed load has no Try again and doesn't say it is temporary (decision above; part B's L15).
10. A sign-in that expires while using the app drops the person on the Sign in page with no message.
11. `/budget/category` without a category titles the page "Ledger" instead of a page name.
12. Inline "SimpleFIN" link inside the Connect SimpleFIN instructions is 18px tall (a link inside a sentence; not counted against the 44px rule).
13. Edit group window: Delete exists only for an empty group, so the Delete confirmation in a group window could not be exercised on the sample data (every group has categories).
