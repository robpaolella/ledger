# Final audit, re-check D: #390, #391, #392

Issue #399 (part of #112). Re-checks the three medium findings that re-check C filed (`report-c.md`, N1–N3) on fresh sample data, on 2026-10-13, against `feature/platform-retheme` at `0b7967a`. Built and launched with `.pi/skills/verify-ledger` (Doctor PASS), driven by script through Chrome (puppeteer-core, one browser profile per role) with real sign-in. No saved data was changed (the delete confirmations were only armed, then cancelled or timed out).

**Bottom line:** all three are fixed in the app. **No re-check failed and no new high or medium problem was found.** One thing could not be reached (the Edit transaction window, below) and one low note is recorded.

## How it was done

- Roles, themes, widths: owner and admin, light and dark, at 390×844 (touch) and 1440×900, for every row (the Merchants search also as member, light and dark, both widths, since a member can reach it). Width and the `dark` class were read back from the page for every capture.
- Tap heights were measured by hit-testing the live page (how many pixels above and below the centre still land on the control), the way re-check C did. "h" is the control's own height.
- Screenshots are in `screenshots/recheck/d/`, named `<issue>-<state>-<role>-<theme>-<width>.png`, one per role, theme and width listed in each row. Every image was checked to be the right size and state; the ones linked are representative.
- Sample data only; the logos in the screenshots are cached images for the sample institutions.

## Findings and re-check status

| # | Finding (report-c) | Severity | Issue | Fix PR | Status | Evidence |
|---|---|---|---|---|---|---|
| N1 | Edit depreciation: delete confirmation showed two Cancels and wrapped Save changes at 390 | medium | [#390](https://github.com/robpaolella/ledger/issues/390) | [#396](https://github.com/robpaolella/ledger/pull/396) | **re-checked (pass)** | below |
| N2 | Edit institution (Remove, swatch, Delete, Confirm, Cancel) and Merchants search under 44px at 390 | medium | [#391](https://github.com/robpaolella/ledger/issues/391) | [#398](https://github.com/robpaolella/ledger/pull/398) | **re-checked (pass)**, one low note | below |
| N3 | Connect SimpleFIN, Edit connection (Name), New category, New group and Add user focused a field at 390 | medium | [#392](https://github.com/robpaolella/ledger/issues/392) | [#395](https://github.com/robpaolella/ledger/pull/395) | **re-checked (pass)** | below |

### N1 / #390: Edit depreciation delete confirmation

Checked on Accounts → Physical Assets → "iPad Pro" pencil → Edit depreciation. Owner and admin, light and dark, 390 and 1440 (8 runs).

- At rest the footer is Delete · Cancel · Save changes.
- After tapping Delete it is **"Confirm delete?" and one Cancel** (Cancel count in the window: 1, in all 8 runs). Save changes is hidden while confirming, so nothing wraps or clips: at 390 the footer is one row, every button 44px tall, right edge at 233 of 390.
- After the 3-second timeout the normal footer returns (Delete · Cancel · Save changes); so it does after tapping Cancel. The asset is still listed after each check.
- Edit transaction window: **could not be reached.** #390's fix also covers its footer, but nothing in the app opens that window for an existing transaction (`TransactionsPage.tsx` only ever sets the editor to "new", and the Add transaction window has no Delete), so its confirmation footer can't be shown. Transaction detail's own Delete confirmation was already checked in re-check C (F6).

Screenshots: [`confirming owner light 390`](screenshots/recheck/d/390-edit-depreciation-confirming-owner-light-390.png), [`confirming owner dark 390`](screenshots/recheck/d/390-edit-depreciation-confirming-owner-dark-390.png), [`confirming owner light 1440`](screenshots/recheck/d/390-edit-depreciation-confirming-owner-light-1440.png), [`confirming admin dark 390`](screenshots/recheck/d/390-edit-depreciation-confirming-admin-dark-390.png), [`confirming admin dark 1440`](screenshots/recheck/d/390-edit-depreciation-confirming-admin-dark-1440.png), [`after timeout owner light 390`](screenshots/recheck/d/390-edit-depreciation-timeout-owner-light-390.png), [`after Cancel admin dark 390`](screenshots/recheck/d/390-edit-depreciation-cancel-admin-dark-390.png), [`at rest owner light 390`](screenshots/recheck/d/390-edit-depreciation-rest-owner-light-390.png). The other roles, themes and widths use the same names.

### N2 / #391: Edit institution and Merchants search

Checked on Settings → Accounts → Institutions → Ally Bank (has a logo, so Remove shows), then Delete, and on Settings → Merchants.

| Control | At 390 (owner and admin, light and dark) | At 1440 |
|---|---|---|
| Remove (logo) | 44px (was 18) | 18px, unchanged |
| Colour swatch | 44px (was 36) | 36px, unchanged |
| Delete | 44px (was 20) | 20px, unchanged |
| Confirm / Cancel (after Delete) | 44px / 44px (was 36) | 36px / 36px, unchanged |
| Change logo, Back | 44px | Back 44px, Change logo 18px, unchanged |
| Merchants search (owner, admin and member) | frame 44px (was 40), field 42px (was 20) | frame 40px, unchanged |

- Cancel after Delete restores the Delete button. The desktop values equal the old phone values, so desktop is unchanged.
- **Low note, no issue filed:** the Merchants search field itself is 42px tall inside its 44px frame (the frame's 1px border takes the other 2px), so a tap exactly on the border doesn't focus it. It's 22px more than before and visually a 44px control.

Screenshots: [`institution edit owner light 390`](screenshots/recheck/d/391-institution-edit-owner-light-390.png), [`delete confirm owner light 390`](screenshots/recheck/d/391-institution-edit-delete-confirm-owner-light-390.png), [`delete confirm admin dark 390`](screenshots/recheck/d/391-institution-edit-delete-confirm-admin-dark-390.png), [`institution edit owner dark 1440`](screenshots/recheck/d/391-institution-edit-owner-dark-1440.png), [`delete confirm admin light 1440`](screenshots/recheck/d/391-institution-edit-delete-confirm-admin-light-1440.png), [`merchants search owner light 390`](screenshots/recheck/d/391-merchants-search-owner-light-390.png), [`merchants search member light 390`](screenshots/recheck/d/391-merchants-search-member-light-390.png), [`merchants search member dark 1440`](screenshots/recheck/d/391-merchants-search-member-dark-1440.png). Other combinations use the same names.

### N3 / #392: Sheets no longer focus a field on phones

Checked by opening each sheet from its button and reading what has focus. Owner and admin, light and dark, 390 and 1440 (8 runs × 5 sheets).

| Sheet | At 390 | At 1440 |
|---|---|---|
| Connect SimpleFIN (Settings → Bank sync) | focus on the sheet's Close button; no field | Label field focused |
| Edit connection (Name) | Close button; no field | Name field focused |
| New category | Close button; no field | Category name focused |
| New group | Close button; no field | Group name focused |
| Add user | Close button; no field | Full name focused |

Screenshots: [`Connect SimpleFIN owner light 390`](screenshots/recheck/d/392-connect-simplefin-owner-light-390.png), [`Edit connection admin dark 390`](screenshots/recheck/d/392-edit-connection-admin-dark-390.png), [`New category owner dark 390`](screenshots/recheck/d/392-new-category-owner-dark-390.png), [`New group admin light 390`](screenshots/recheck/d/392-new-group-admin-light-390.png), [`Add user owner light 390`](screenshots/recheck/d/392-add-user-owner-light-390.png), [`Add user admin dark 1440`](screenshots/recheck/d/392-add-user-admin-dark-1440.png), [`New category owner light 1440`](screenshots/recheck/d/392-new-category-owner-light-1440.png), [`Connect SimpleFIN owner light 1440`](screenshots/recheck/d/392-connect-simplefin-owner-light-1440.png). Other combinations use the same names.

## New problems

None.
