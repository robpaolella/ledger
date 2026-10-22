# Design: Settings and permissions

- Design issue: #104
- Revision: 1
- Replaces: none
- Source plan: retheme plan agreed 2026-10-08; build issue #105 (to be split after this design merges)

## Job and audience
Settings grew piecemeal and isn't cohesive. Three kinds of people arrive:

- **The owner or an admin**, setting up or looking after the household: bank connections, people and their access, optional extras.
- **A member** (often someone invited into an already-working household) who wants to change their own name, password, two-step sign-in or alerts, and possibly look after merchants or bank sync if allowed.
- **Anyone wondering why something happened on its own**: a transaction categorized automatically, a sync that ran or didn't, an alert they got.

Success: every setting has one obvious home; people only see what they can use; status tells
the truth in plain English; every automatic behaviour has a place to see it and switch it off
(PRODUCT.md "Settings rules").

## Covers
| Build issue (or planned slice) | Part of this feature | Out of scope |
| --- | --- | --- |
| #105 | Everything in this design: the Settings menu and panels, member presets and Customize, Bank sync with daily-sync status and switch, Rules, Notifications, Optional extras, users on phones, one rule for what members can't do | Changing the server's permission checks; editing the daily sync time; creating or editing rules from the Rules screen |

#105 will be split after merge; its children are added to `covers` by a later revision.

## Boundaries and visual authority
- PRODUCT.md: Principles, Settings rules, Users, Member permissions, Daily bank sync, Optional extras, Safety and access. DESIGN.md and `packages/client/src/index.css` for the look.
- Host: `/settings` (`SettingsPage.tsx`, `components/settings/*`, `MerchantsPanel.tsx`). Reuse the
  existing Settings card, panel header, field, pill, switch, segmented control, `ConfirmDeleteButton`,
  `InlineNotification`, `ResponsiveModal` / bottom sheet and list-row patterns.
- Server permission checks stay unchanged (#104 out of scope). Honest wording replaces them.
- Unchanged in substance: Profile, Security (password, two-step sign-in), Categories and Merchants
  panels, the account edit window, the add/edit/delete user flows. They appear only as far as the
  new menu and member rule touch them.
- **New kinds of element Robert is asked to approve:** the per-member access preset choice (radio
  rows, with Customize), the connection status pill set (Working / Sync failed / Reconnect needed /
  Paused), the Rules list (with "Show all N rules"), the Notifications section and, in version B
  only, a desktop side panel for a person. The phone person view is the existing `BottomSheet`
  with new content. Dialogs follow `ResponsiveModal`/`BottomSheet` focus behaviour (focus moves in,
  returns to the row on close, Escape closes).

## Confirmed decisions (Robert, 2026-10-08, this herdr tab)
1. **Member rule.** In Settings, "people only see settings they can use" wins over PRODUCT.md's
   general "disable add/edit": a section shows in the menu only if the person can change something
   in it; inside a section, controls they can't use are hidden, with one plain line such as
   "An admin manages connections." The "Restricted setting" card goes. A View-only member sees
   only Profile, Security and Notifications. Elsewhere in the app the disable rule is unchanged.
2. **Honest switch names** in Customize (server unchanged), keeping the 12 grouped switches:
   "Edit budgets and recurring bills", "Edit transactions, merchants, rules and Review",
   "Manage accounts and institutions", "Update balances (including fetching from the bank)".
   A member whose switches match no preset shows as "Custom".
3. **Automatic behaviour sits with its subject** (daily sync in Bank sync, split out of Accounts;
   rules in Rules beside Merchants; AI and Amazon in Optional extras). The versions compare this
   against one "Automatic" page listing everything with its switch.
4. **Daily sync.** Anyone who can see Bank sync sees Last sync and Next sync in plain words. Only
   people with "Manage connections" see the on/off switch. 5:30 am shows as text, not editable.
   Each account's "Import transactions automatically" switch stays in its edit window.
5. **Rules screen.** Every "Always categorize" rule (merchant → category, or "description
   contains…" → category) with search; delete only (two-click confirm; already-categorized
   transactions stay as they are). Creating and changing rules stays in Transactions and the
   merchant window. Seen by people with the transactions switch. Empty: "No rules yet. When you
   change a transaction's category, Ledger can offer to remember it, and the rule appears here."
   Typical size up to about 200.
6. **Notifications** (new section under You): each person switches over-budget alerts on or off
   for themselves. Bank-sync failure alerts stay always on: "You'll always hear when bank sync
   fails, so it never stops quietly."
7. **"Not suggesting rules for"**: a second list on Rules of merchants where someone chose
   "don't ask again", each with Undo.
8. **Access presets.** Each member shows View only / Everyday / Everything except managing people /
   Custom. Customize opens the 12 switches; changing one makes it Custom. Choosing a preset
   while Custom first shows "This replaces Sam's custom switches" with Confirm. On phones the user
   list is tappable rows opening a bottom sheet (role, access, edit, 2FA reset, delete). Desktop
   inline-expand vs side panel is compared across versions.
9. **Honest bank status.** One pill per connection plus a plain line: Working ("Last synced today
   5:31 am"), Sync failed ("Couldn't reach SimpleFIN. Trying again at 6:45 am"), Reconnect needed
   ("SimpleFIN didn't accept the sign-in. Paste a new setup token to reconnect." / for others
   "Ask an admin to reconnect."), Paused ("Daily sync is off. Sync now still works."). The card
   summary shows the worst state, never "Connected" while one is failing.
10. **Menu.** You: Profile, Security, Notifications (everyone). Household: Accounts, Bank sync,
    Categories, Merchants, Rules (only what each can use). Admin: Users & permissions, Optional
    extras (owner/admin). Phones keep the tap-into menu list.
- **Optional extras** (renamed from AI): AI categorizing, Amazon order matching, Investment
    benchmarks; each shows one plain "Not set up yet" line when unconfigured; setup steps stay in
    the project docs. Owner and admin only.

## States, themes and content
Themes: `light`, `dark`. Widths: 390×844 and 1440×900. Every state works in both themes. Each
state opens the panel it is about; the prototype's Settings menu is clickable to move between
panels within the current state. Sample people are synthetic (John Sample owner, Jane Sample
admin, Sam Rivera and Alex Chen members).

| State slug | Role / situation | Content range | Actions / feedback |
| --- | --- | --- | --- |
| `menu-owner` | Owner, phone menu index / desktop Profile | Full menu, all three groups | Tap a section |
| `menu-view-only` | View-only member | You group only | Profile, Security, Notifications |
| `menu-everyday` | Everyday member | You + Bank sync, Merchants, Rules | Accounts, Categories and Admin hidden (nothing there they can change) |
| `users-owner` | Owner on Users & permissions | 6 people incl. one inactive, one Custom, long name | Preset choice, Customize open on one member, role select, add user |
| `users-admin` | Admin | Owner and other admin read-only; members manageable | No 2FA requirements card |
| `user-detail` | Owner, member opened (phone sheet / desktop per version) | Custom member | "This replaces…" confirm shown |
| `user-switches` | Owner, long-named View-only member opened, Customize open | All 12 honest switch names | Sheet/panel scrolled to the switches |
| `user-switches-more` | Same member, scrolled to the Finance switches | The last 5 switches incl. "Edit budgets and recurring bills", "Update balances (including fetching from the bank)", "Run bank sync" | — |
| `user-everyday-switches` | Owner, Everyday member opened, Customize open | Ticked switches | — |
| `user-actions` | Same member, scrolled to the end | Sign-in, edit, delete | Can sign in switch, Edit name or password, Delete user |
| `bank-working` | Owner, 2 connections working, daily sync on | 9 linked accounts | Sync now, daily switch, add connection |
| `bank-problems` | Owner, one Sync failed + one Reconnect needed | Summary shows worst | Reconnect action |
| `bank-member` | Everyday member | Status visible, no switch, no connection management | "Ask an admin to reconnect." |
| `bank-paused` | Owner, daily sync switched off, Bank sync page | Paused pills | Sync now still offered |
| `daily-problems` | Owner, the daily sync card with failures (A: Bank sync; B: Automatic) | Retry times | Switch |
| `daily-member` | Everyday member, the daily sync card (no switch) | | "An admin manages connections and daily sync." |
| `daily-paused` | Owner, the daily sync card switched off | | Switch back on |
| `daily-gave-up` | Owner, a connection failed all of today's retries | "Couldn't reach SimpleFIN after 5 tries today. Next try tomorrow at 5:30 am."; Next sync "Tomorrow 5:30 am (today's retries ran out)" | — |
| `daily-off-failing` | Owner, daily sync off while connections fail | "Sync failed. Daily sync is off, so Ledger won't retry on its own. Use Sync now." | Sync now |
| `bank-empty` | Owner, no connection | | Connect SimpleFIN |
| `rules` | Owner | 40 rules (merchant, "contains" and pattern rules) in checking order; first 25 then "Show all 40 rules" (B shows 5 on its Automatic page); 3 muted merchants | One Delete already in its "Confirm delete?" step, Undo |
| `rules-search` | Owner, search with no match | | "No rules match …" |
| `rules-empty` | Owner | No rules, no muted merchants | Empty wording above |
| `notifications` | Member | Over-budget on, sync failures always on | Switch |
| `extras` | Owner | AI set up and on; Amazon not set up; benchmarks not set up | Test connection, switches |
| `extras-on` | Owner | AI switched off with a failed connection test; Amazon and benchmarks set up, each with its own switch | Switches |
| `accounts` | Owner on Accounts | 9 accounts, linked and not linked; bank connection card moved to Bank sync | Add account, Edit, Institutions |
| `loading` | A panel loading (Users shown; every panel uses the same pattern, accepted by Robert, decision 22) | Skeleton/spinner as today | — |
| `error` | A panel failed to load (Users shown; same pattern everywhere) | "Couldn't load your settings. Check your connection and try again." | Try again |

Not applicable: first-run/no-household (the owner already exists before Settings is reachable);
locked/2FA lockout (sign-in, not Settings). Keyboard: every control reachable by Tab with a
visible focus ring; switches and presets are real buttons/radios with labels. Phone touch
targets ≥44px (the shared Switch keeps its look with a 44px tap area); sheets keep actions in a pinned footer.

## Host snapshot and offline proof
- Source commit: `c396cf7` (origin/feature/platform-retheme at capture; later rebased onto `e6e2525`, which changes no Settings code).
- Skill: `.pi/skills/verify-ledger/SKILL.md` and `page-snapshot.md`.
- Launch: `npm ci`; `EVIDENCE=$(mktemp -d /tmp/ledger-evidence-XXXXXX)`;
  `LEDGER_LOGODEV_TOKEN_FILE=/nonexistent node .pi/skills/verify-ledger/run.mjs launch "$EVIDENCE"` (Doctor PASS, logos not configured, so letter badges only).
- Route/role/state: `/settings?panel=users`, owner (John), seeded sample data. Signed in through the real form; dark set with the sidebar theme control.
- Snapshot: `snapshot.mjs capture` for host-light-390, host-light-1440, hostd-dark-390, hostd-dark-1440, then `snapshot.mjs assemble "$EVIDENCE" host …` → `host.html` (styles, fonts and images inlined; no scripts, tokens or storage).
- Cleanup: `chrome-devtools-axi stop` (session `ledger-104-host`), `run.mjs cleanup "$EVIDENCE"` → PASS, cleaned.
- Offline proof: fresh session `ledger-104-offline`, `emulate --network Offline`, opened `host.html?theme=light|dark` at 390×844 and 1440×900; only `file:` and `data:` requests; captures match the live screenshots.
- Versions are built from that host's stylesheet (latin font subsets kept), its sidebar and its phone app bar; Settings content is rebuilt with the same component recipes (`components/settings/ui.tsx`). CSP allows only inline script for the prototype controls; no network.
- Observed on the sample data while capturing: the bank card showed "Connected" while all three connections said "Couldn't reach SimpleFIN", confirming the problem decision 9 fixes.

## Real-site experiment
None.

## Applying decision 1
An Everyday member can't change anything in Accounts (no account switches), so Accounts is hidden
for them too; their Household menu is Bank sync, Merchants and Rules. The planned
`accounts-member` state became an owner `accounts` state.

## Decisions after the versions (Robert, 2026-10-08)
11. Automatic behaviour stays in each subject's home (version A).
12. A person opens in the existing pop-up window on desktop (`ResponsiveModal`) and a bottom sheet
    on phones; the people list is tappable rows at both widths.
13. Notifications wording: "You'll always hear when bank sync keeps failing or needs reconnecting,
    so it never stops quietly."
14. Rate-limit line: "SimpleFIN's daily request limit was reached. Trying again at <time>".
15. Sync-failure alerts go only to people who can see Bank sync; others don't see that line.
16. #105 includes the stored data needed for honest status (see decisions.md, Open items).

19. When daily sync gives up for the day: the connection says "Couldn't reach SimpleFIN after 5 tries
    today. Next try tomorrow at 5:30 am."; Next sync reads "Tomorrow 5:30 am (today's retries ran
    out)"; with daily sync off and a connection failing: "Sync failed. Daily sync is off, so Ledger
    won't retry on its own. Use Sync now."
21. PRODUCT.md's Settings rules now say controls a person can't use are hidden in Settings and
    disabled elsewhere, so the rulebook and decision 1 agree.
22. Loading and error are shown once (Users); every panel uses the same pattern.

With 12, the desktop side panel is no longer a proposed new element. A preset picked while a member
is Custom is outlined with "Picked. Confirm below to apply." until confirmed.

## Open decisions
None.
