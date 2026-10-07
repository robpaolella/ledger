# Settings and permissions

## Sub-features

- Preferences: appearance, display name, password and two-factor authentication.
- Users & Permissions: owner/admin/member hierarchy, granular grants and activation.
- Bank Sync empty/configuration-denied states (no real external connection).

## How to get to it (user POV)

Desktop sidebar Settings; phone More → Settings. Preferences is a tab at
`/settings?tab=preferences`; phone also has Edit Profile & Password. Users &
Permissions appears only for John/Jane, as a desktop section or phone drill-through.

## Driving it with chrome-devtools-axi

- As John, open Preferences. Fill the Display Name textbox with `Sample John`, click
  Save Profile and record the success. Reload Preferences and capture the saved
  value. Navigate back to Settings: the profile card/sidebar must show the new name.
- Sign out and sign in as Jane; inspect Users & Permissions. Member management is
  available; owner/admin peer management is restricted. Do not claim those restrictions
  from the role badge alone—open the relevant controls when permissions are changed.
- As John, change one member permission; sign in as member and confirm the affected
  control and its user-visible result. Sign out/in or refresh to fetch current grants.
- As member, Settings still has Accounts/Categories/Bank Sync but no Users &
  Permissions. Desktop Add Account/Add Category/Add Connection are disabled.
  Capture this and the corresponding owner view at both widths.
- For 2FA work use only this throwaway user's generated secret, exercise setup,
  verification and recovery via the real UI, and never publish secrets/recovery codes.

## Gotchas

Passwords here are publicly known demo values, not real credentials. Repeated
logins are rate-limited to five/minute; Doctor avoids consuming more login attempts.
Member grants are cached for 60 seconds, invalidated by the permissions API. Owner
cannot be deleted/demoted. No automatic outside-account setup, emails or bank sync.
