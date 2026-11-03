# Final audit, part C: Settings, notifications, sheets and modals (#282)

Run on 2026-10-12 against `feature/platform-retheme` at commit `b51a8e6` (the merge of #324),
branch `docs/282-final-audit-part-c`. The verify-ledger sample data was launched on 2026-10-12,
so the launch month is October 2026 and "today" in the data is Oct 12. Synthetic data only;
nothing from `data/` or the live instance was opened.

**Bottom line:** no high findings. Six medium findings, each filed as its own issue
(#335 to #340, all blocking #112), plus eight low findings and a short list of states the sample
data can't reach. Settings is in good shape: every panel loads at every role, theme and width
with no sideways scrolling, no hardcoded colours, no console errors from the app itself, the
role rules hold (a member sees only what they can use, and the hidden panels are hidden), and
the server refuses admin-only requests from a member. The problems are a broken confirm-delete
footer, one developer-worded line, one misleading count, a wasteful SimpleFIN call on every
Settings page, the notifications pop-up on phones, and a set of leftover sub-44px phone controls.

## Severity

- **high**: a wrong money figure, data loss, a permission leak, a broken or unreachable flow, or a crash.
- **medium**: a visible break from the rulebook or an approved design, content clipped or unreachable on phone, wrong or misleading wording, a state with no way forward.
- **low**: cosmetic polish.

## How it was done

- Launched with `.pi/skills/verify-ledger` (Doctor `PASS`). Real sign-in through the login form
  for John (owner), Jane (admin) and Sample Member (the one limited member).
- Driven with a script over `puppeteer-core` and the system Chrome (not `chrome-devtools-axi`):
  the same real browser, but it let one script loop every role × theme × width and
  take the measurements below. Viewports were set to 390×844 (phone, touch) and 1440×900
  (desktop). Theme was set through the app's own stored theme preference (`ledger-theme`, the
  setting the Profile "Theme" control writes), then the page was reloaded and the document's
  `dark` class was confirmed for every capture. Auth was never injected.
- Every capture also ran a check over the live page: sideways overflow, every tappable control's
  size against 44px (controls with the `tap-area` hit zone are counted as 44px), anything past the
  right edge, inline hex colours, and console and network errors. For every sheet or pop-up the
  check read its geometry (height, gap to the bottom of the screen, buttons past the edge).
- Every capture was taken for all 12 role × theme × width combinations (the coverage tables).
  I opened and read the images for owner light and dark at both widths for every page and state,
  and the admin and member images wherever their content differs from the owner's (the other
  combinations are covered by the automatic checks and by comparing page text across roles).
- Compared with, in precedence order: `PRODUCT.md`, `DESIGN.md` (Phone checklist, Shared
  components), `AGENTS.md`; then the approved designs `104-settings`, `226-phone-sheets-rows`,
  `109-phone-tables-forms`, `310-filter-type-picker`, `231-account-filters`,
  `319-transactions-review-strip`; then the app as it is today. Money and colours: Settings shows
  money only in the notification text ("$23.18"), which uses the shared formatter; no inline hex
  colours were found anywhere; `npm run lint:tokens` is part of the repo checks.
- Data changed through the real UI during the audit (two launches of the sample data), all restored except where noted: Display name
  (owner, admin, member: changed to "Sample Edited", then set back); Over-budget alerts switch (off,
  reloaded, on again); Daily sync switch (off for the "Paused" capture, on again); Sample Member's
  access (Everyday → Custom → View only → Everyday, to see the restricted views); a duplicate-username
  Add user attempt (refused, nothing created). Not restored: every role's notifications were marked
  read and cleared to capture the empty state; the Ollama address under Optional extras now holds a
  loopback address I typed to get a failed connection test ("Test connection" saves it).
  All of this was in the throwaway database, which cleanup removes.

## Coverage

Cell key: **ok** = no problems at that role, theme and width. **F1 to F6** = the finding
listed below (high or medium, with an issue). **hidden ✓** = the role must not see it, and I
checked it is hidden: on a phone the member's direct link to a panel they can't use lands on the
Settings menu; on desktop it lands on Profile; the controls that open the window are absent.
**n/a** = the item only exists at the other width. Columns: O = owner, A = admin, M = member;
L = light, D = dark; 390 = phone, 1440 = desktop. "F6" on a phone sheet means one or more controls
inside it measured under 44px (list in F6).

### Settings pages

| Page / state | O L390 | O L1440 | O D390 | O D1440 | A L390 | A L1440 | A D390 | A D1440 | M L390 | M L1440 | M D390 | M D1440 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Settings menu `/settings` (phone index; desktop opens Profile) | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| Settings → Profile | F6 | ok | F6 | ok | F6 | ok | F6 | ok | F6 | ok | F6 | ok |
| Settings → Security | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| Settings → Notifications | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| Settings → Accounts | ok | ok | ok | ok | ok | ok | ok | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Settings → Bank sync | F3 | F3 | F3 | F3 | F3 | F3 | F3 | F3 | F3 | F3 | F3 | F3 |
| Settings → Categories | ok | ok | ok | ok | ok | ok | ok | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Settings → Merchants | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| Settings → Rules | F6 | ok | F6 | ok | F6 | ok | F6 | ok | F6 | ok | F6 | ok |
| Settings → Users & permissions | ok | ok | ok | ok | ok | ok | ok | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Settings → Optional extras | ok | ok | ok | ok | ok | ok | ok | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |

Cross-cutting, every Settings page at every role, theme and width: **F4** (Settings contacts
SimpleFIN for each connection on load, see below). It is not repeated in each cell.

### Notifications, sheets, windows and pop-ups

Opened from where a person meets them: Settings, the bell, Transactions, Review, Recurring,
Accounts and account detail (sheets owned by parts A and B are checked here only as shared sheets).

| Page / state | O L390 | O L1440 | O D390 | O D1440 | A L390 | A L1440 | A D390 | A D1440 | M L390 | M L1440 | M D390 | M D1440 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Notifications pop-up (bell), with sample alerts | F5 | F5 | F5 | F5 | F5 | F5 | F5 | F5 | F5 | F5 | F5 | F5 |
| Edit account window | F6 | ok | F6 | ok | F6 | ok | F6 | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Add account window | ok | ok | ok | ok | ok | ok | ok | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Edit account → Remove confirmation | F6 F1 | ok | F6 F1 | ok | F6 F1 | ok | F6 F1 | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Edit account → Upload photo → Crop window | ok | ok | ok | ok | ok | ok | ok | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Financial institutions window | F6 F2 | F2 | F6 F2 | F2 | F6 F2 | F2 | F6 F2 | F2 | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Connect SimpleFIN window | F6 | ok | F6 | ok | F6 | ok | F6 | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Edit connection window | F6 | ok | F6 | ok | F6 | ok | F6 | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Reconnect (sample savings feed) | F6 | ok | F6 | ok | F6 | ok | F6 | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Bank sync → Disconnect confirmation | ok | ok | ok | ok | ok | ok | ok | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Edit category window | F6 | ok | F6 | ok | F6 | ok | F6 | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Edit category → Delete confirmation | F6 F1 | F1 | F6 F1 | F1 | F6 F1 | F1 | F6 F1 | F1 | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Edit category → icon tile | F6 | ok | F6 | ok | F6 | ok | F6 | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| New category window | ok | ok | ok | ok | ok | ok | ok | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| New group window | ok | ok | ok | ok | ok | ok | ok | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Edit group window | ok | ok | ok | ok | ok | ok | ok | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Edit merchant window | F6 | ok | F6 | ok | F6 | ok | F6 | ok | F6 | ok | F6 | ok |
| Edit merchant → Merge & delete | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| Merchants sort menu | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| Merchants search with no match (empty) | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| Rules → Delete confirmation | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| Rules search with no match (empty) | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| Person window: John (owner) | ok | ok | ok | ok | ok | ok | ok | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Person window: Jane (admin) | ok | ok | ok | ok | ok | ok | ok | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Person window: Sample Member | ok | ok | ok | ok | ok | ok | ok | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Person window → Customize switches | ok | ok | ok | ok | ok | ok | ok | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Add user window | ok | ok | ok | ok | ok | ok | ok | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Edit name or password window | ok | ok | ok | ok | ok | ok | ok | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Delete user confirmation | ok | ok | ok | ok | ok | ok | ok | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Security → password mismatch error | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| Security → Set up two-factor window | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| Optional extras → AI Test connection (failed test) | ok | ok | ok | ok | ok | ok | ok | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Transaction detail (sheet on phone, side panel on desktop) | F6 | ok | F6 | ok | F6 | ok | F6 | ok | F6 | ok | F6 | ok |
| Transaction detail → Delete confirmation | F6 | ok | F6 | ok | F6 | ok | F6 | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Add transaction window | F6 | ok | F6 | ok | F6 | ok | F6 | ok | F6 | ok | F6 | ok |
| Manual import window | F6 | ok | F6 | ok | F6 | ok | F6 | ok | F6 | ok | F6 | ok |
| Filters (sheet on phone, pop-up on desktop) | F6 | ok | F6 | ok | F6 | ok | F6 | ok | F6 | ok | F6 | ok |
| Date range | F6 | ok | F6 | ok | F6 | ok | F6 | ok | F6 | ok | F6 | ok |
| Sort | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| Accounts → Filters | F6 | ok | F6 | ok | F6 | ok | F6 | ok | F6 | ok | F6 | ok |
| Update balance window (account detail) | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| Add asset window | F6 | ok | F6 | ok | F6 | ok | F6 | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Edit depreciation window (its Delete deletes at once with no confirmation: filed by part A as #341) | F6 | ok | F6 | ok | F6 | ok | F6 | ok | hidden ✓ | hidden ✓ | hidden ✓ | hidden ✓ |
| Review detail (sheet on phone, panel on desktop) | F6 | ok | F6 | ok | F6 | ok | F6 | ok | F6 | ok | F6 | ok |
| Approve all confirmation | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| Recurring item detail | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| Navigation drawer (phone only) | ok | n/a | ok | n/a | ok | n/a | ok | n/a | ok | n/a | ok | n/a |
| Sidebar user menu (desktop only) | n/a | ok | n/a | ok | n/a | ok | n/a | ok | n/a | ok | n/a | ok |

### Other states checked

Each row below was run at every role it applies to, in light and dark, at 390 and 1440 (12
combinations for all three roles, 8 for owner and admin only, 4 for one role), unless the row says
otherwise. They were captured on a second launch of the sample data (same code, same commit),
because some of them (notifications, the paused daily sync) can only be reached once on a
given launch and are shown in every theme and width after that.

| State | Roles | Result |
|---|---|---|
| Panel load failure: Merchants, Rules, Users, Optional extras (network offline, then back online) | owner, admin: all four panels; member: Merchants and Rules (the only ones the member can see) | ok: "Couldn't load your settings. Check your connection and try again." with **Try again**; once the network is back, Try again loads the panel. Low L5 (wording) |
| Panel load failure: Accounts, Categories, Bank sync (that panel's request refused) | owner, admin: all three; member: Bank sync | ok: same message and a working Try again |
| Notifications pop-up, **read** state (after Mark all read) | owner, admin (8 combinations); member has no notifications, so nothing to mark read | ok: unread rows move under "Read"; the bell dot clears |
| Notifications pop-up, **empty** state ("You're all caught up") | owner, admin, member | ok (F5's focus point applies to it as well) |
| Notifications switch (Over-budget alerts) saves and survives a reload | owner, admin, member | ok |
| Profile → Save changes: "Profile updated" toast, name persists after reload | owner, admin, member | ok |
| Add user with a taken username | owner, admin (member: hidden ✓) | ok: "Username already exists" inline, nothing created |
| Security password mismatch ("Passwords do not match") | owner, admin, member | ok (also a row in the table above) |
| Person window → Customize → flip a switch → "Custom" label; then pick a preset: "This replaces Sample's custom switches with View only." with Cancel / Confirm; Confirm applies it | owner, admin (member: hidden ✓) | ok |
| Member set to **View only** (owner changed it, then restored Everyday) | member; light and dark × 390 and 1440 | ok: the Settings menu shows only Profile, Security, Notifications; direct links to Bank sync, Merchants and Rules land on that menu (phone) or Profile (desktop); Transactions has no Select and its Add is dimmed; Import says "You don't have permission to use this. Contact an admin to request access." |
| Bank sync with the Daily sync switch off ("Paused") | owner, admin (with the switch), member (text only, no switch) | ok: "Daily sync is off. Sync now still works." on each connection and in the card; Next sync reads "Off. Switch daily sync on to sync each morning." |
| Escape and focus in a dialog (Person window); focus and Escape on the bell pop-up | owner, admin, member (bell) at 390 and 1440, light (behaviour doesn't change with theme) | Dialog ok: focus moves in on open, Escape closes, focus returns to the row. The bell pop-up fails the focus part (F5) |
| Server permission probes (read-only requests as each role) | member, admin, owner | ok: a member gets 403 for `/users/:id/delete-preview`, `/amazon/status`, `/llm/config`, `/llm/status` and `/benchmarks/status`; sees only shared connections; the user list for a member holds only names and usernames, no roles or 2FA state |

## Findings

| # | Finding | Where (role, theme, width) | Severity | Issue | Screenshots |
|---|---|---|---|---|---|
| F1 | After tapping Delete in Edit category the footer reads "Confirm delete? · Cancel · Cancel · Save changes", and Save changes runs off the edge of the window. On phones Edit account's "Remove account" confirmation also squeezes its text into a narrow column | owner, admin; both themes; both widths (Edit account part: 390 only) | medium (content clipped) | #335 | `owner-light-390-cat-delete`, `owner-light-1440-cat-delete`, `owner-dark-1440-cat-delete`, `owner-light-390-acct-delete` |
| F2 | The Financial institutions window says "Set LOGODEV_TOKEN on the server to fetch logos automatically." (developer wording, against "UI text speaks to the site's visitor") | owner, admin; both themes; both widths | medium (wording) | #336 | `owner-light-390-inst-manager`, `owner-light-1440-inst-manager` |
| F3 | Bank sync's Daily sync card says "3 of 10 connections had problems" while the viewer sees 3 (member) or 7 (owner) connections, so the figure doesn't match the list | owner, admin, member; both themes; both widths | medium (misleading) | #337 | `member-light-390-settings-bank`, `member-light-1440-settings-bank`, `owner-dark-1440-settings-bank` |
| F4 | Every Settings page, even Profile, makes a live SimpleFIN request for each connection the person can see (`POST /api/simplefin/connections/:id/accounts`). SimpleFIN's daily request limit is small and the Bank sync panel itself reports "daily request limit was reached"; severity is a judgement call (conductor may lower it) | every role; any theme and width | medium | #338 | none (network log: member, Profile: `GET /connections` then `POST /connections/7/accounts`, `/9/accounts`, `/10/accounts`) |
| F5 | Notifications pop-up: the clear (×) button is 22px and invisible until hover, so on phones it can't be seen or tapped; Mark all read / Clear all are 20px tall and "View budget" 32px; opening the bell does not move keyboard focus into the pop-up | every role; both themes; mainly 390 (focus part both widths) | medium (Phone checklist 1, Popover rule) | #339 | `owner-light-390-notif-bell`, `owner-dark-390-notif-bell`, `owner-light-1440-notif-bell`, `member-light-390-notif-bell` |
| F6 | Leftover controls under 44px at 390 in Settings and shared sheets: Profile Theme Light/Dark 34px; Rules search 38px; "Upload photo" / "Upload logo" 20px; Shared/Personal 34px and "I have an access URL" 19px; Institutions Add 40, Fetch missing logos 32, Done 40; Delete and Confirm 40px; Declining/Straight segmented 34px; Filters rows 36–37px; Manual import chips 36px; Date range calendar buttons 40px; Review sheet Mark reviewed 32px and "Open in Transactions" 17px; Open splits 36px, Split 20px, "Split across categories" 20px | owner, admin, member where visible; both themes; 390 | medium (Phone checklist 1, design 226) | #340 | `owner-light-390-settings-profile`, `owner-light-390-settings-rules`, `owner-light-390-tx-filters`, `owner-light-390-tx-manual-import`, `owner-light-390-review-detail`, `owner-light-390-bank-add`, `owner-light-390-asset-add`, `owner-light-390-inst-manager` |

Overlap with part A (not repeated here): #341 (asset Delete has no confirmation, seen in the Edit depreciation window) and #349 (Add account and Update balance sheets autofocus on phones) concern sheets this part also lists.

All screenshots are in `work/112-final-audit/screenshots/part-c/` (`<role>-<theme>-<width>-<state>.png`).
Besides the finding evidence it holds one or two passing captures for each page and window, the
member and admin views, the error states, the View-only member and the Custom/preset confirmation.

## Low findings

- Merchants (phone): each row's Edit button is held at 60% opacity because it brightens on hover, and phones have no hover, so Edit always looks disabled.
- Rules: rules that match by pattern read "Description matches the pattern ^Chewy\b", raw regular-expression text a household can't read. Only the sample data's rules do this (rules made in the app use a merchant or "contains").
- Profile: the owner and admin see "Used to sign in. Ask an admin to change it." under Username, but they are the admin; the line should differ for them.
- Edit account and Edit category windows open with keyboard focus on the Close (×) button, drawing a focus ring on it, where Add account focuses the Name field.
- The panel load error says "Couldn't load your settings" on Merchants, Rules, Users and Optional extras; it names settings for a list of merchants, rules or people.
- Phone form fields use 14px text; iOS zooms the page when a field under 16px is focused (Add user, Add account, SimpleFIN, Security).
- Optional extras → AI categorizing: **Test connection** saves the address before testing and says nothing, so a failed address stays saved.
- Delete user: the confirmation button says "Continue" for a permanent delete; it could name the action.

## Could not check (sample data lacks the state)

Recorded as findings rather than skipped, for the conductor to decide whether to extend the fixtures:

- N1. Optional extras with Amazon and benchmarks set up (design 104 state `extras-on`) and Amazon's "Session expired" card: the sample has no Amazon sidecar or benchmark key, so only the "Not set up yet" cards were seen.
- N2. Users → Reset two-step for a person who has two-step on, and the two-step code screen at sign-in: no sample user has it enabled (also part A's sign-in page).
- N3. Bank sync with no connections at all ("bank-empty"): the sample has ten connections owned by three people, so reaching it needs each person to disconnect theirs. Not done.
- N4. Loading states (slow network skeletons) and drag-to-close on phone sheets were not exercised.
- N5. First-run setup (`/setup`): only appears on an empty database.
