# Pre-release check (#405)

Two first-day flows the final audit (`work/112-final-audit/report.md`, Coverage notes) could not reach on sample data: first-run Setup on an empty database, and two-step sign-in with real codes. Run on 2026-10-14 against `842fd2e` (head of `feature/platform-retheme` when the worker started). Screenshots are in `screenshots/prerelease/`, named `<step>-<width>-<theme>.png` at 390 and 1440 wide, light and dark. A screenshot set is the same state in all four combinations unless the step says otherwise.

## Result

**One medium finding (M1), no high.** Both flows work: Setup validates, creates the owner and never comes back; two-step sign-in accepts right codes, refuses wrong, old and reused ones, and can be turned off or reset by an admin. Five low findings (L1–L5) are listed below; they are not filed.

Severity (from the audit): **High** = wrong money, data loss, permission leak, broken or unreachable flow, crash. **Medium** = visible break from the rulebook or a design, content clipped or unreachable on phone, wrong or misleading wording, or a state with no way forward. **Low** = cosmetic polish.

## Throwaway data used

- Flow 1: a new folder `/tmp/ledger-empty-s2tQq2` (used as working directory and HOME), with database `/tmp/ledger-empty-s2tQq2/ledger.db`, the production build (`packages/server/dist/index.js`, `NODE_ENV=production`, `DATABASE_PATH` set) on port **3417**. No `.env` or `.jwt-secret` from a checkout was read (the secret was generated inside that folder).
- Flow 2: `.pi/skills/verify-ledger` launch (database `/tmp/ledger-verify-usBLpp/ledger.db`, port 45817, synthetic sample data, Doctor PASS).
- Never opened: `data/`, `~/ledger-live/`, port 3001.
- **Cleanup confirmed:** the empty-database server was stopped (its process gone, port 3417 no longer listening) and its folder deleted; verify-ledger `cleanup` returned PASS, `/tmp/ledger-verify-usBLpp` no longer exists, the child process is gone and port 45817 no longer listens. Both named browser sessions were stopped.

## How it was driven

Real UI in a real browser (chrome-devtools-axi), by typing into the actual fields. Dark mode in screenshots is the page's dark class toggled at capture time, not a saved preference. Codes came from a small local TOTP calculation (SHA-1, 6 digits, 30 s, RFC 6238) fed with the setup key the app shows. "Expired" means a code from 120 seconds earlier (the server accepts a code one 30-second step either side of now, so only codes older than about a minute are really expired).

## Flow 1: first-run Setup on an empty database

| # | Step | Seen | Result | Screenshots |
| --- | --- | --- | --- | --- |
| 1 | Start production on a brand-new database file; open `/` | The server seeded default categories on its own; `/api/setup/status` said setup required; the app showed "Welcome to Ledger" with Name, Username, Password, Confirm password | Pass | `setup-01-first-load` |
| 2 | Submit with every field empty | The browser's own "Please fill out this field" bubble on the first field; nothing sent, nothing created | Pass (the native bubble is not captured by screenshots) | – |
| 3 | Username `ab` (too short) | Red banner "Username must be 3–20 lowercase letters or numbers", form kept, no token stored | Pass | `setup-02-bad-username` |
| 4 | Password `short` | "Password must be at least 8 characters" | Pass | (text only) |
| 5 | Passwords that differ | "Passwords do not match" | Pass | (text only) |
| 6 | Name of three spaces | "Display name is required" (from the server) | Pass | `setup-03-blank-name` |
| 7 | Direct to the API: no fields, username `Pat!`, short password, blank name | 400 each with a clear message (for example "Username is required"); `/api/setup/status` still said setup required, so nothing was created | Pass | – |
| 8 | Sixth attempt inside a minute | 429 "Too many attempts. Please try again in a minute." (Setup allows 5 a minute) | Pass | – |
| 9 | Submit valid details (Pat Example, `pat`, `password123`) | Landed on the Dashboard signed in as Pat, the owner ("Hello, Pat!"); Settings → Profile shows "Owner"; status now says setup not required | Pass | `empty-dashboard`, `empty-settings` |
| 10 | Every main page on the empty app | See the table below | **Finding M1**, lows L1–L3 | `empty-*` |
| 11 | Sign out, then sign in with a wrong password, then the right one | Sign-out lands on `/login`; the wrong password shows "Invalid credentials"; the right one reaches the Dashboard; reloading `/accounts` stays signed in | Pass | `signin-01-after-signout`, `signin-02-wrong-password` |
| 12 | Never back to Setup | With the owner signed out, `/` and `/setup` both show Sign in; a direct Setup request answers 403 "Setup has already been completed"; after stopping and restarting the server on the same file, `/api/setup/status` still says not required and nobody is asked to set up | Pass | – |

### Empty states (step 10)

| Page | What it shows | Way forward | Verdict |
| --- | --- | --- | --- |
| Dashboard | Zero-value cards; "No recent transactions."; "Nothing upcoming."; "All caught up."; Investments card says to connect an account in Settings → Bank sync | Only the Investments card points anywhere | M1, L1, L2 |
| Accounts | Net worth $0.00, Summary, "No physical assets tracked."; no account list at all | "Add account" button at top | Pass, L3 |
| Transactions | "No transactions found for this period" | None in the empty state; "Add transaction" opens a form whose Account list is empty and whose submit stays disabled | **M1** |
| Import | CSV step 1 with "Select an account…" (empty list) and "Choose CSV file"; Bank Sync tab says "No linked accounts. Connect a bank in Settings first." | CSV tab: none; Bank Sync tab: yes | **M1** |
| Review | "You're all caught up. Every transaction has been reviewed. Nice work." | n/a | L1 |
| Reports | $0 cards; "No spending in this period."; "No transactions in this period." | None | M1 (same cause) |
| Budget | The seeded categories with "—" in every column | Categories are editable in place | Pass |
| Recurring | "No recurring items this month." | "Add recurring" button | Pass |
| Investments | "No holdings yet. Link an investment or retirement account in Settings → Bank Sync." | Names the place | Pass |
| Settings | Profile shows owner details | n/a | Pass |

## Flow 2: two-step sign-in

Sample member (`member`) used to turn two-step on and off; owner (`john`) and admin (`jane`) used for the reset.

| # | Step | Seen | Result | Screenshots |
| --- | --- | --- | --- | --- |
| 1 | Settings → Security as the member | "Two-factor authentication: Off" with an "Enable two-factor" button | Pass | `twostep-01-security-off` |
| 2 | Enable | Window "Set up two-factor authentication" with a QR code (on phone an "Add to authenticator app" button, a Copy button and a "Show QR code" link) and the setup key in groups of four | Pass | `twostep-02-setup-key` |
| 3 | Confirm with a wrong code (000000) | Red boxes and "That code didn't work. Try the newest one."; nothing turned on | Pass | `twostep-03-setup-wrong-code` |
| 4 | Confirm with the real code from the key | "Save your backup codes": ten codes (`XXXX-XXXX`), a warning that they won't be shown again, Copy all, Done; Security then says "Enabled" with "Regenerate backup codes" and "Disable" | Pass | `twostep-04-backup-codes`, `twostep-05-security-on` |
| 5 | Sign out; sign in with the right username and password | Goes to "Two-factor authentication · Enter the 6-digit code from your authenticator app" with six boxes, "Use a backup code" and "Back to sign in" | Pass | `twostep-06-signin-code-step` |
| 6 | Wrong code (111111) | Submits as soon as the sixth digit is typed; "Invalid verification code · 4 attempts remaining"; boxes clear and focus returns to the first | Pass | `twostep-07-signin-wrong-code` |
| 7 | Expired code (120 seconds old) | Refused with the same "Invalid verification code · 3 attempts remaining" | Pass, L4 | `twostep-08-signin-expired-code` |
| 8 | Correct current code | Signed in, Dashboard | Pass | – |
| 9 | Backup code | "Use a backup code" shows one field (placeholder `XXXX-XXXX`); the first backup code signed in | Pass | `twostep-09-signin-backup-field` |
| 10 | The same backup code again | Refused: "Invalid verification code · 4 attempts remaining" | Pass | `twostep-10-backup-code-reused` |
| 11 | A second backup code typed in lower case | Accepted once, signed in | Pass | – |
| 12 | Turn two-step off: Security → Disable | Asks for the password; a wrong password shows "Password is incorrect" and keeps it on; the right one turns it off ("Off", "Enable two-factor" again) | Pass | `twostep-11-disable-wrong-password`, `twostep-12-disabled` |
| 13 | Admin reset, as the owner: Settings → Users & permissions | The member's row has a "Two-step on" badge; the person window says "Two-step sign-in is on." with "Reset two-step"; the first press turns the button into "Confirm reset?" and "Cancel" (it reverts after a few seconds if left); confirming removes the badge and the line | Pass | `admin-01-users-list`, `admin-02-reset-confirm` (1440 light only: the confirm state times out before a capture at each size) |
| 14 | The member signs in after the owner's reset | Straight to the Dashboard, no code asked | Pass | – |
| 15 | Admin reset, as Jane: two-step turned on for the member again (through the app's own setup and confirm requests, not the Settings screen), then Jane resets it in Users & permissions | Same result; the member then signs in with no code | Pass | – |
| 16 | Role limits | Jane's reset request for John (owner) is refused: 403 "You cannot reset 2FA for a user with equal or higher role"; for herself: 400 "Use the disable endpoint for your own account" | Pass | – |

## Findings

### Medium

**M1. A new household has no way forward from several empty pages: nothing says an account has to be added first.**
Steps to reproduce: complete Setup on an empty database; open Transactions and press Add (phone: the + in the header). The window opens with Account, Merchant and Category empty, "Add transaction" greyed out, and nothing says why or links to Accounts. Open Import → CSV Import: "Select an account…" lists nothing, and "Choose CSV file" gives no message. Dashboard, Transactions and Reports show only "No recent transactions", "No transactions found for this period" and "No spending in this period" with no pointer. Only Accounts (an "Add account" button) and Investments/Bank Sync (name Settings) say where to go.
Evidence: `empty-transactions-add-dialog-*`, `empty-transactions-add-account-list-390-light.png`, `empty-import-390-*`, `empty-transactions-*`, `empty-dashboard-*`, `empty-reports-*`. Severity: medium, "a state with no way forward" (a first-day dead end, though Accounts is one tap away).

### Low (report only)

- **L1.** Review on a brand-new app reads "You're all caught up. Every transaction has been reviewed. Nice work." There are no transactions yet, so the praise is misleading (`empty-reviews-*`).
- **L2.** With every figure at zero the charts draw odd axes: net worth runs from -$1.00 to $1.00 on Dashboard and Accounts, and the Spending chart shows "$1 $1 $1 $0 $0" (`empty-dashboard-*`, `empty-accounts-*`).
- **L3.** Accounts on an empty app has a blank area where the account list goes, with no "No accounts yet" line (`empty-accounts-1440-*`).
- **L4.** At sign-in an expired code and a wrong code get the same "Invalid verification code". The setup window says "Try the newest one", which would also help here (a hint about the phone's clock is the usual fix). Also, after five wrong codes the sign-in is refused ("Too many attempts"); that limit was read in the code, not exercised.
- **L5.** In the setup window, after a failed attempt the boxes keep the old digits (000000) and typing a new code on top of them did nothing until Backspace cleared them (`twostep-03-setup-wrong-code-*`). On the sign-in step the boxes clear themselves. Also Settings → Security and the sign-in step say "Two-factor authentication" while Users & permissions, DESIGN.md and PRODUCT.md say "two-step".

## Not covered

Regenerating backup codes, the owner's own Security panel, the "Require two-step for admins/members" switches, the five-wrong-codes lockout, and the Setup-time two-step requirement prompt (`twofaSetupRequired`) were not driven. Neither flow was re-audited beyond the steps above.
