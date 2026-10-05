# Start a design from a real Ledger page

This recipe produces **editable, self-contained static HTML**, not a screenshot and
not a copy of the running React app. Use it for any reachable production route,
role and state after following [design-states.md](design-states.md). Only new sample
data from [Launch](SKILL.md#launch) is permitted. Never capture a live/copy database,
real financial information, a secret QR code, recovery codes or credentials.

## Capture the actual state in all four variants

1. Launch, run Doctor, sign in through the real UI, and reach the desired state.
   Record route, role, filters, fixture dates and state steps in your evidence manifest.
   Use a named browser session, and confirm the role and visible content with a
   snapshot. Clear accidental hover/focus, scroll the relevant containers to the top,
   and wait for the page to settle. A blank/error page isn't the intended state.
2. Set **light** through the real theme control. Use `resize 390 844`, then capture:

   ```bash
   npx -y chrome-devtools-axi resize 390 844
   node .pi/skills/verify-ledger/snapshot.mjs capture "$EVIDENCE" page-light-390
   npx -y chrome-devtools-axi screenshot "$EVIDENCE/live-light-390.png" --full-page
   npx -y chrome-devtools-axi resize 1440 900
   node .pi/skills/verify-ledger/snapshot.mjs capture "$EVIDENCE" page-light-1440
   npx -y chrome-devtools-axi screenshot "$EVIDENCE/live-light-1440.png" --full-page
   ```

3. Set **dark** through the theme control, reapply the same transient state if needed,
   and repeat with names `page-dark-390` and `page-dark-1440`. Confirm the same data,
   role and form state in all four captures. The helper checks route/theme/dimensions;
   it cannot tell whether you accidentally closed a dialog or changed a filter.
4. Assemble one file:

   ```bash
   node .pi/skills/verify-ledger/snapshot.mjs assemble "$EVIDENCE" page \
     page-light-390 page-light-1440 page-dark-390 page-dark-1440
   ```

Every capture reruns Doctor and refuses a browser on a different origin. It waits for
fonts/images, inlines the stylesheet cascade (including Google font imports), font
files and image resources, preserves form values/selected options/checkboxes and
inline SVGs, and removes React scripts, links, handlers, form actions and password
values. It does not read browser storage or serialize auth tokens. Failed asset
fetches/CORS and unsupported embedded content fail rather than silently going missing.
It writes `<name>.html` plus non-secret route/theme/viewport metadata in `<name>.json`.
Names must be simple lower-case slugs. Existing outputs are never overwritten: use a
new name to refresh evidence. The usual inherited `DATABASE_PATH` refusal also applies.

**Why four captures?** Ledger renders some phone layouts in JavaScript, not just CSS.
Resizing a single frozen desktop DOM cannot reconstruct a mobile sheet/card list.
`page.html` embeds four sandboxed `srcdoc` documents, chooses phone below 768px and
selects light/dark with `?theme=light` or `?theme=dark` (light by default). Each embedded
view contains its own inlined assets and preserves IDs/portals without cross-view CSS
collisions. There is no API or React runtime; the outer file's only script selects the
requested theme. Keep these captured viewports in the design's provenance; test extra
approved widths explicitly instead of claiming arbitrary responsive fidelity.

## Prove it works without the app or network

Keep the four running-page screenshots. Then run Cleanup to **stop the source app**
and remove its owned scratch data, stop that named browser, and open a fresh named
browser (empty cache/profile):

```bash
node .pi/skills/verify-ledger/run.mjs cleanup "$EVIDENCE"
npx -y chrome-devtools-axi stop
export CHROME_DEVTOOLS_AXI_SESSION="ledger-offline-$(basename "$EVIDENCE")"
npx -y chrome-devtools-axi open "file://$EVIDENCE/page.html?theme=light"
npx -y chrome-devtools-axi emulate --network Offline
npx -y chrome-devtools-axi resize 390 844
npx -y chrome-devtools-axi open "file://$EVIDENCE/page.html?theme=light"
npx -y chrome-devtools-axi screenshot "$EVIDENCE/offline-light-390.png" --full-page
npx -y chrome-devtools-axi resize 1440 900
npx -y chrome-devtools-axi screenshot "$EVIDENCE/offline-light-1440.png" --full-page
```

Repeat both widths with `?theme=dark`. `emulate` here is for **network only**, never
viewport sizing. See [CLI emulation caveats](design-states.md#shared-gate-and-cleanup):
after emulation 0.1.37 may save a valid PNG but report an error. Verify the saved image
and dimensions instead of ignoring the report or assuming it succeeded.

Inspect network requests: only `file:`, `about:srcdoc` and `data:` resources should
load. Confirm the source server is stopped using Cleanup's record. Offline emulation
can be verified with a failed request to an independently running, owned local test
server: it must report `net::ERR_INTERNET_DISCONNECTED`, not merely a CORS error or
connection refused. `navigator.onLine` alone is not reliable in this CLI version.
Open **every** live/offline image and compare typography, content, tables/cards,
portals, clipping and scroll behaviour. For below-the-fold content, capture matching
scrolled views as well. Save observations and dimensions in the evidence manifest.
Stop this named offline browser when finished; retain reviewed evidence outside git.

## Edit it into a design

The four individual `.html` files are ordinary editable HTML/CSS. Modify those files,
then assemble again under a new output name; assembly reads their current HTML, not
an old HTML copy in metadata. The single-file `srcdoc` attributes are HTML-escaped,
not base64 screenshots, and can also be edited directly with normal entity escaping.
Design sessions can copy the reviewed single file into their issue's design folder,
then add the state/theme switcher and prototype behaviour required by Maestro's
design-feature workflow. Do not mistake the sandboxed frozen controls for functioning
product interactions: changes to search/save/navigation require deliberate prototype
code in the design, not retained production scripts. Repeat this recipe for other
states/roles, and follow the design helper's manifest convention rather than treating
snapshot metadata as `design.json`.

Limitations are explicit: canvas, shadow DOM, frames, audio/video and external SVG
references are refused; qualified/cyclic CSS imports or unfamiliar escaped CSS URLs
need a reviewed static replacement. Captures preserve rendered markup, not transient
focus/hover, scroll offsets, browser-native validation bubbles or animation timing.
Wait for settling and capture scroll-top states; use screenshots/behaviour proof for
these transient details. If a future Ledger page uses an unsupported feature, extend
and test the helper or record a blocker—never silently substitute a blank element.
