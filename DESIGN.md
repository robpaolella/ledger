---
name: Ledger
description: Calm, compact household finance tools with light and dark themes and a phone layout that is a first-class citizen.
colors:
  light-bg: "#f6f7f9"
  light-surface: "#ffffff"
  light-surface2: "#eef0f4"
  light-elevated: "#ffffff"
  light-line: "#e5e8ee"
  light-lineStrong: "#d3d8e0"
  light-text: "#161a20"
  light-text2: "#586172"
  light-text3: "#5f6b7a"
  light-primary: "#2563eb"
  light-primaryHover: "#1d4ed8"
  light-onPrimary: "#ffffff"
  light-ring: "#2563eb"
  light-positive: "#059669"
  light-negative: "#dc2626"
  light-warning: "#a84e08"
  light-cTeal: "#0d9488"
  light-cGreen: "#16a34a"
  light-cBlue: "#2563eb"
  light-cIndigo: "#4f46e5"
  light-cViolet: "#7c3aed"
  light-cFuchsia: "#c026d3"
  light-cRose: "#e11d48"
  light-cOrange: "#ea580c"
  light-cAmber: "#d97706"
  light-owner1: "#2563eb"
  light-owner2: "#db2777"
  light-owner3: "#0d9488"
  light-owner4: "#7c3aed"
  light-owner5: "#ea580c"
  light-owner6: "#16a34a"
  light-ownerShared: "#64748b"
  light-bgSidebar: "#0f172a"
  light-bgZebra: "rgba(0,0,0,0.02)"
  light-bgModal: "rgba(6,8,12,0.55)"
  light-navActiveBg: "rgba(59,130,246,0.15)"
  light-navActiveText: "#93c5fd"
  light-navInactiveText: "#94a3b8"
  light-sidebarText: "#f1f5f9"
  light-heroGradientFrom: "#0f172a"
  light-heroGradientTo: "#1e293b"
  dark-bg: "#101318"
  dark-surface: "#191d24"
  dark-surface2: "#20252e"
  dark-elevated: "#252b35"
  dark-line: "#2b313c"
  dark-lineStrong: "#39414e"
  dark-text: "#f2f4f7"
  dark-text2: "#a3abb8"
  dark-text3: "#939caa"
  dark-primary: "#3d7bf4"
  dark-primaryHover: "#5b92ff"
  dark-onPrimary: "#0b1220"
  dark-ring: "#3d7bf4"
  dark-positive: "#34d399"
  dark-negative: "#f87171"
  dark-warning: "#fbbf24"
  dark-cTeal: "#2dd4bf"
  dark-cGreen: "#4ade80"
  dark-cBlue: "#60a5fa"
  dark-cIndigo: "#818cf8"
  dark-cViolet: "#a78bfa"
  dark-cFuchsia: "#e879f9"
  dark-cRose: "#fb7185"
  dark-cOrange: "#fb923c"
  dark-cAmber: "#fbbf24"
  dark-owner1: "#60a5fa"
  dark-owner2: "#f472b6"
  dark-owner3: "#2dd4bf"
  dark-owner4: "#a78bfa"
  dark-owner5: "#fb923c"
  dark-owner6: "#4ade80"
  dark-ownerShared: "#94a3b8"
  dark-bgSidebar: "#060a13"
  dark-bgZebra: "rgba(255,255,255,0.03)"
  dark-bgModal: "rgba(0,0,0,0.7)"
  dark-navActiveBg: "rgba(59,130,246,0.25)"
  dark-navActiveText: "#93c5fd"
  dark-navInactiveText: "#94a3b8"
  dark-sidebarText: "#f1f5f9"
  dark-heroGradientFrom: "#060a13"
  dark-heroGradientTo: "#0f172a"
typography:
  page-title:
    fontFamily: "'Hanken Grotesk', system-ui, -apple-system, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    letterSpacing: "-0.025em"
  page-title-phone:
    fontFamily: "'Hanken Grotesk', system-ui, -apple-system, sans-serif"
    fontSize: "17px"
    fontWeight: 800
  body:
    fontFamily: "'Hanken Grotesk', system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  list-row-title:
    fontFamily: "'Hanken Grotesk', system-ui, -apple-system, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  list-row-subtitle:
    fontFamily: "'Hanken Grotesk', system-ui, -apple-system, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
  kpi-value:
    fontFamily: "'Hanken Grotesk', system-ui, -apple-system, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    letterSpacing: "-0.025em"
  kpi-label:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 500
rounded:
  sm: "8px"
  control: "11px"
  md: "12px"
  card: "16px"
  lg: "20px"
  full: "999px"
spacing:
  card-horizontal: "20px"
  card-vertical: "16px"
  list-row-height: "64px"
  list-row-side: "16px"
  phone-page-side: "16px"
  touch-target: "44px"
components:
  card:
    backgroundColor: "{colors.light-surface}"
    rounded: "{rounded.card}"
    padding: "16px 20px"
  card-dark:
    backgroundColor: "{colors.dark-surface}"
    rounded: "{rounded.card}"
    padding: "16px 20px"
  button-primary:
    backgroundColor: "{colors.light-primary}"
    textColor: "{colors.light-onPrimary}"
    rounded: "{rounded.control}"
  button-primary-dark:
    backgroundColor: "{colors.dark-primary}"
    textColor: "{colors.dark-onPrimary}"
    rounded: "{rounded.control}"
  popover:
    backgroundColor: "{colors.light-elevated}"
    rounded: "{rounded.card}"
  popover-dark:
    backgroundColor: "{colors.dark-elevated}"
    rounded: "{rounded.card}"
---

# Design: Ledger

## Overview

Ledger is calm and compact: quiet surfaces, thin borders, gently rounded cards, and colour kept for meaning (money in, money out, over budget, needs attention). It should feel obvious to someone who has never used it, and it is built to the owner's taste. Work polishes and makes consistent what is already here; it does not redesign it.

This file describes the look as built. Its values come from `packages/client/src/index.css`, which is the source for every colour, radius and shadow. If this file and `index.css` ever disagree, `index.css` is what the app does, so fix this file. An approved folder under `design/` wins over this file for its own feature's layout, wording, states and behaviour, but does not change the site-wide look described here.

Light and dark are both first-class. Check every visible change in both themes, at phone width (390px) and desktop width (1440px).

## Colours

The front matter lists the literal values from `index.css`, prefixed `light-` and `dark-`. In code, always use the CSS variable, never the hex value.

**Use tokens, never hard-coded colours.** Raw hex values live only in the `:root` and `.dark` blocks of `index.css`. Everywhere else use a token (`var(--text-2)`, or the Tailwind utility that reads it, such as `bg-surface` or `text-content-3`). The `npm run lint:tokens` check is a ratchet that fails when new hard-coded colours appear, and it runs as part of `npm run validate`.

### Core tokens

| Role | Token | Notes |
| --- | --- | --- |
| Page background | `--bg` | Behind everything. |
| Card, panel, side rail | `--surface` | The default container fill. |
| Inset, track, hover, input fill | `--surface-2` | Also the secondary-button fill. |
| Popover, menu, modal, sheet | `--elevated` | Floats above `--surface`. |
| Border | `--line` | Default hairline. `--line-strong` is for inputs and emphasised edges. |
| Text | `--text`, `--text-2`, `--text-3` | Primary, secondary/labels, muted/placeholder. |
| Interactive | `--primary`, `--primary-hover`, `--on-primary`, `--ring` | Primary buttons, links, selection, focus. |
| Status | `--positive`, `--negative`, `--warning` | Money in and under budget; over budget and amounts owed; near a limit. |

Tailwind utilities for these: `bg-bg`, `bg-surface`, `bg-surface-2`, `bg-elevated`, `border-line`, `border-line-strong`, `text-content`, `text-content-2`, `text-content-3`, `bg-primary`, `text-positive`, `text-negative`, `text-warning`.

Money colours follow the money rules in `PRODUCT.md`: show transaction amounts with `Money` and totals that can go either way with `Change` (`packages/client/src/components/Money.tsx`, both built on `formatMoney()` in `packages/shared/src/money.ts`), and never infer income or expense from a number's sign.

### Categorical colours

Nine hues with shared chroma, brighter in dark mode so they stay readable: `--c-teal`, `--c-green`, `--c-blue`, `--c-indigo`, `--c-violet`, `--c-fuchsia`, `--c-rose`, `--c-orange`, `--c-amber`. They colour charts, avatars, tags and other category-like marks. Colour a category through `getCategoryColor()` / `getCategoryColorHex()`, never a hard-coded value. Never rely on colour alone to tell categories apart; the name or label is always visible too.

### Owner tags

Numbered tokens `--owner-1` to `--owner-6` tint the account-owner tags, plus `--owner-shared` for shared accounts. One helper, `ownerColor(userId)` in `badges.tsx`, gives each person the same colour everywhere: sorted user ids take owner-1, owner-2 and so on, wrapping after six. Owner tags are data-driven; never name a colour after a person, and do not add new ones.

### Older token names

Existing components still use older names (`--bg-card`, `--text-primary`, `--color-positive`, `--btn-primary-bg`, `--badge-*`, `--bg-inline-*`, `--toggle-*`, and so on). `index.css` points almost all of them at a core token above, so they follow the theme automatically. In new work, use the core tokens. Tinted badges and inline messages are built by mixing a core token into the surface (`color-mix`), which is why they work in both themes without separate values.

A few tokens keep fixed values that do not swap with the core set: `--bg-modal` (the one scrim for every modal, sheet and panel), `--bg-zebra`, and the dark navigation and hero values (`--nav-*`, `--hero-gradient-*`). Use `var(--bg-modal)` for any scrim; do not invent another.

## Typography

- **Hanken Grotesk** (weights 400 to 800) is the UI font; `system-ui` is the fallback.
- **JetBrains Mono** is for small technical labels such as KPI captions and account labels.
- **Figures use tabular numerals** (the `tabular` class or `tabular-nums`) so columns of money line up. Right-align money in columns.
- Page titles are 22px / weight 800 on desktop and 17px on phones. Body copy is about 13px on desktop; phone lists use 15px titles with 12.5px subtitles. KPI values are 30px / 800 with a small uppercase mono caption above.
- **Type scale.** Use these named sizes (Tailwind `text-*` utilities and `--text-*` variables from `index.css`); no new literal sizes. 11px `caption`, 12px `small`, 13px `label`, 14px `copy`, 15px `large`, 17px `heading`, 22px `title` (page titles, big numbers), 30px `display` (KPI values). The in-between 12.5px and 13.5px sizes round to 13 and 14 as pages adopt the scale; the 12.5px `list-row-subtitle` in the token list at the top is one of them. The names avoid the colour aliases (`--text-body`, `--text-muted`, and so on).
- Do not shrink form text or touch targets just because a table is compact.

## Spacing, radius and shadow

- Cards (such as the KPI card) use 20px horizontal and 16px vertical padding, `--radius-card` (16px), `--line` border and `--shadow-sm`. Settings panels use slightly rounder 18px cards.
- Radius scale: `--radius-sm` 8px (small controls and icon buttons), `--radius-control` 11px (buttons and inputs), `--radius-md` 12px, `--radius-card` 16px (cards), `--radius-lg` 20px (bottom sheets), `--radius-full` for pills. The desktop modal panel uses 18px.
- Shadows: `--shadow-sm` for cards and active toggles, `--shadow-md` for popovers, menus, modals and hover lift. Light: `0 1px 2px rgba(16,24,40,.06)` and `0 10px 30px rgba(16,24,40,.09)`. Dark: `0 1px 2px rgba(0,0,0,.45)` and `0 6px 22px rgba(0,0,0,.4)`.
- Phone pages use 16px side padding and 40px bottom padding.

## Themes

Dark applies when `<html>` has the `dark` class. On the first visit Ledger copies the device setting (`prefers-color-scheme`), or light if there is none. That first choice is saved in the browser (`ledger-theme`) straight away, and from then on the saved choice wins: Ledger does not keep following the device setting, so a later change to the device's light/dark mode does not change Ledger until someone uses the toggle. The toggle is in the navigation (side rail and phone drawer) and Settings; both use the same `useTheme()` state, so they cannot disagree. Build with tokens and both themes work with no extra code; only add a `dark:` rule for something a token cannot express (for example the date-picker icon).

## Layout

- **Desktop** (768px and wider): a collapsible side rail (64px collapsed, 236px expanded) and a sticky `PageHeader` with the title on the left and controls on the right. KPI summaries sit in four columns.
- **Phone** (767px and narrower; the app switches in `useIsMobile()` and in the `desktop-only` / `mobile-only` helper classes): no side rail. A sticky app bar sits on top and navigation is a slide-in drawer. KPI grids drop from four columns to two. Page titles move into the app bar.
- Cards group related information. Keep one clear primary action per screen.

## Phone checklist

Everyday tasks (dashboard and balances, reviewing and categorizing, adding or editing a transaction, checking budget, recurring and reports) must be fully usable on a phone. Setup and heavy tasks (CSV import, bank connections, users and permissions, bulk edit) must work and be readable, and can be simpler. Check a phone-visible change against all seven:

1. **Touch targets.** Anything tappable is at least 44px tall (`.touch-row` is 44px, drawer rows are 44px, list rows are 64px). App-bar icon buttons are 40px square; keep the surrounding row tall enough to tap.
2. **Thumb reach.** Primary actions sit low or in the app bar, not in a far top corner. Confirm and cancel actions live in a sheet footer within reach. Navigation opens from the menu button at the top left of the app bar.
3. **No sideways scrolling.** Pages never scroll horizontally. Long text truncates (`min-w-0`, `truncate`); wide tables become card rows (below). Test at 390px.
4. **Sheets instead of pop-ups.** On phones a modal becomes a bottom sheet (`ResponsiveModal` handles the swap): drag handle, scrolling body, sticky footer, closes on the scrim, Escape or a downward drag, 92dvh at most, safe-area padding at the bottom. Small anchored popovers (filters, date ranges) should still fit inside the screen.
5. **The right keyboard per field.** Money fields use `inputMode="decimal"` (`CurrencyInput` does this). Digits-only fields such as the last four of a card, and verification codes, use `inputMode="numeric"`. Usernames and codes turn off auto-capitalisation (`autoCapitalize="off"`). Sign-in and password fields set `autoComplete` (`current-password`, `new-password`, `one-time-code`).
6. **Sticky action buttons.** In a sheet or long form, the main buttons stay in a pinned footer (the `footer` slot of `ResponsiveModal` and `BottomSheet`), outside the scrolling body. Page headers and toolbars pin under the app bar.
7. **Readable numbers.** Amounts are tabular, right-aligned, at least 15px in list rows, and never truncated: truncate the description before the amount. Keep currency formatting identical to desktop.

## Wide tables become card rows on phones

Any list that has more columns than fit comfortably in 390px is not squeezed or scrolled sideways on a phone. It is shown as card rows instead: the same data, grouped as the desktop view groups it, on `ListRow`s (avatar, title and subtitle on the left, amount and one line of meta on the right). Keep the most important facts (what it is, how much, when or which account) on the row and move the rest into the detail sheet that opens when a row is tapped. Transactions, Review and the account and category detail pages follow this rule. When you add a new wide table, build its phone version as card rows in the same change.

## Shared components

Use these before building anything similar. Ask the owner before adding a new kind of UI element.

- **`Popover`**: the shared behaviour of every anchored pop-up (filters, date range, account menu): closes on Escape (once, not the page behind) and on an outside click, moves focus inside on open and back to the trigger on close, and carries the right role and label. Mount it only while open and pass it the position classes; anything clickable inside must be a real button so Tab reaches it.
- **`FilterPopover`**: the app-wide filter popover (categories, merchants, accounts, amount, other) with Clear, Cancel and Apply. Use it for any list that filters by those dimensions, so filtering looks the same everywhere. Pass `sections` to show only some (the Accounts page shows just Accounts). Rows are checkbox buttons. Wrap its trigger in a `relative` element; it is controlled through a draft the page maps to its own query on Apply.
- **`DateRangePopover`**: the one date-range selector: presets on the left, start and end calendar fields on the right, Clear, Cancel and Apply. Use it for any date-range filter. Presets apply immediately; custom dates go through a draft.
- **`ListRow`**: the two-line row for transaction-like lists on phones, and anywhere a table would not fit: avatar or leading tile, title and subtitle, amount and meta, optional chevron. 64px tall with a hairline between rows.
- **`MobileHeader` and `PageHeader` (the app bar)**: `MobileHeader` is the phone app bar (menu, notifications, centred title, page actions, or a back arrow on detail pages). `PageHeader` is the sticky header every primary page uses; on phones it hands its title and actions to the app bar through `MobileBar` and only renders tabs or a toolbar below it. Use `PageHeader` on every primary page.
- **`MobileNavDrawer` (the nav drawer)**: the side rail as a slide-in drawer on phones, with the same items and active styling. It closes on the scrim, Escape or any navigation. It is opened from the app bar; pages do not open it themselves.
- **Charts** (`components/charts/`), drawn with theme tokens so they follow light and dark:
  - **`AreaLineChart`**: one value over time with a soft fill, such as net worth or a balance history.
  - **`DonutChart`**: parts of a whole, such as allocation or spending by category.
  - **`MultiLineChart`**: several series on one time axis, with a shared formatter and labels, for comparing trends.

Other shared building blocks: `ResponsiveModal` and `BottomSheet` (modals), `ConfirmDeleteButton` (destructive actions), `InlineNotification`, `Tooltip`, `KPICard`, `CurrencyInput`, `SegmentedControl`, `Switch`, `BudgetBar` and `VendorAvatar` (in `primitives.tsx`), and `PermissionGate`.

## Patterns in use

### Six-box code input (`TotpCodeInput`)

The two-step sign-in code is six single-digit boxes (44px by 52px, centred, `--surface-2` fill, `--line-strong` border, primary border on focus). It advances as you type, accepts a pasted code across all boxes, steps back on Backspace, and the first box carries `autoComplete="one-time-code"` so phones can offer the code from a message. It uses the numeric keypad. Use it for every one-time-code entry (sign-in, two-step setup, and the check in Settings). A backup-code field is a separate, plain text input.

### Inputs

Inputs and selects are 44px tall with `--surface-2` fill, a `--line-strong` border and 11px corners. Buttons use the shared `Button` component (`components/Button.tsx`) with `--radius-control` (11px) corners: primary is `--primary` with `--on-primary` text, secondary is `--surface-2` with a `--line-strong` border, outline is `--surface` with a `--line-strong` border (toolbar triggers; `active` turns the border `--primary` while open or applied), ghost has no fill or border and `--btn-ghost-text` (hover `--surface-2`), and danger is outlined with `--negative` text. Sizes: `md` 42px (forms and footers), `sm` 40px (toolbars and panel headers), `row` 34px with 9px corners (row actions). `iconOnly` makes the button square and requires an `aria-label`. `loading` disables the button, sets `aria-busy` and ignores clicks; keep the "Saving…" wording as the label (no spinner). Keyboard focus shows a 2px `--ring` outline. Use `Button` for new buttons; pages not yet moved still use the class recipes in `components/settings/ui.tsx`: `inputCls` for fields, and `btnPrimary`, `btnSecondary`, `btnDanger` for buttons, which are built from the same source as `Button` (`buttonClasses.ts`). Input focus shows a `--primary` border with a soft 3px ring; an invalid field (`aria-invalid` or `.error`) shows the same in `--negative`. Number spinners are hidden.

The sign-in, first-run setup and two-step setup pages (`AuthShell`) follow light and dark like the rest of the app, with the `--bg` backdrop and `--text` wordmark. Their field text is 16px so iPhones do not zoom on focus; the rule lives in `index.css` under `.auth-shell` and leaves Settings fields at 14px.

### Badges, tags and progress

Badges are tinted pills (a mix of the core token into transparent, with the solid token as text) in matched pairs for account type, owner, classification, duplicates, transfers and connection status. Progress bars (`BudgetBar`) use `--surface-2` as the rail and the fill goes `--positive` when under, `--warning` from 80%, and `--negative` when over.

## Do's and Don'ts

### Do
- Use the tokens and the shared components above.
- Ask the owner before adding a new kind of UI element.
- Check light and dark at 390px and 1440px for any visible change.
- Keep financial meaning intact: signs, category type and permissions.
- Use synthetic sample data only in designs and screenshots; this repository is public.

### Don't
- Hard-code a colour, a category colour or a scrim.
- Name colours after people.
- Squeeze a wide table onto a phone or let a page scroll sideways.
- Treat recorded values as proof of contrast, keyboard or reduced-motion support; verify the real interaction.
