# Settings and permissions

## Sub-features

- Preferences: appearance, display name, password and two-factor authentication.
- Users & Permissions: owner/admin/member hierarchy, granular grants and activation.
- Bank Sync empty/configuration-denied states (no real external connection).

## How to get to it (user POV)

Desktop sidebar Settings; phone More → Settings. The menu shows only what the person
can use, in groups: You (Profile, Security), Household (Accounts, Categories,
Merchants) and Admin (Users & permissions, Optional extras, John/Jane only). A group
with no entries is not drawn. Desktop opens on Profile; phones open the index.
`/settings?tab=preferences` opens Profile; `?panel=ai` opens Optional extras
(`?panel=extras`). A `?panel=` the person can't see behaves like no panel (Profile on
desktop, the index on phones). There is no "Restricted setting" card.

## Driving it with chrome-devtools-axi

- As John, open Preferences. Fill the Display Name textbox with `Sample John`, click
  Save Profile and record the success. Reload Preferences and capture the saved
  value. Navigate back to Settings: the profile card/sidebar must show the new name.
- Sign out and sign in as Jane; inspect Users & Permissions. Member management is
  available; owner/admin peer management is restricted. Do not claim those restrictions
  from the role badge alone—open the relevant controls when permissions are changed.
- As John, change one member permission; sign in as member and confirm the affected
  control and its user-visible result. Sign out/in or refresh to fetch current grants.
- As member, the menu follows the grants: Accounts needs any `accounts.*` grant (or
  bank sync for now), Categories any `categories.*`, Merchants `transactions.edit`;
  Users & permissions and Optional extras never show. Controls the member can't use
  (Add account, Add category) are hidden, not dimmed. Capture this and the owner view
  at both widths.
- Panel load failure: set the network offline (`emulate --network Offline`), open
  Users, Categories, Accounts, Merchants or Optional extras: the error message and
  "Try again" show; back online, "Try again" loads the panel.
- For 2FA work use only this throwaway user's generated secret, exercise setup,
  verification and recovery via the real UI, and never publish secrets/recovery codes.

## Gotchas

Passwords here are publicly known demo values, not real credentials. Repeated
logins are rate-limited to five/minute; Doctor avoids consuming more login attempts.
Member grants are cached for 60 seconds, invalidated by the permissions API. Owner
cannot be deleted/demoted. No automatic outside-account setup, emails or bank sync.
