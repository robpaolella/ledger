# Design decisions: set the Saved segment apart in the Reports breakdown bar

- Design issue: #411; covered build issues: #410
- Revision: 1; replaces: none
- Maker: claude-bridge/claude-opus-5-5 (thinking low)

## Choice and approval
**Chosen: A, Outline.** Saved is a pale green fill (`color-mix(in srgb, var(--positive) 18%, var(--surface))`)
with a solid 2px `--positive` inset border (`box-shadow: inset 0 0 0 2px var(--positive)`),
in light and dark. It reads as money kept rather than spent, stays visible as a thin
sliver, and differs from Uncategorized's gray stripes. Plus the hover change agreed in
Comments: hovered segments grow taller without stretching corners or borders.

The versions differed on one decision only:

| # | Decision | Options (version) | Robert's pick and why |
| --- | --- | --- | --- |
| 1 | How Saved is set apart | a: outline; b: dot pattern; c: softer fill + wider gap | a (the recommendation), herdr 2026-10-19 |

Robert's confirmation, herdr 2026-10-19, after the A recommendation and the hover fix:
"I like it. Let's get this added to the platform retheme that's currently live."
Design PR: see the `## Design PR` comment on #411. Only Robert merging that PR
approves it for building.

## Alternatives
| Version | What differs / why rejected or chosen | Only this version had (lost) | Robert's OK to drop | Evidence |
| --- | --- | --- | --- | --- |
| a | Outline: pale green fill + solid green border. Chosen. | n/a (kept as `index.html`) | n/a | [manifest](screenshots/all/manifest.json), `screenshots/all/a-*.png` |
| b | Dots: green dot pattern on pale green. Not chosen: busier, and a second patterned segment beside Uncategorized. | The dot-pattern treatment itself; nothing else (state data, hover fix and controls are shared). | Robert chose A and asked to build it ("I like it. Let's get this added…", 2026-10-19); B's treatment is the rejected alternative and stays in the screenshots. | `screenshots/all/b-*.png` |
| c | Set apart: softer fill + 6px extra gap after Saved when it is at least 5%. Not chosen: muted green still close to a category colour in dark. | The softer-fill treatment and the wider gap after Saved. | As for b. | `screenshots/all/c-*.png` |

All-version captures (36 images: 3 versions × 3 states × 2 themes × 2 widths) were
completed and inspected before pruning versions/. Approved evidence: 12 images,
[manifest](screenshots/approved/manifest.json), every state × theme × width inspected.
`index.html` rechecked offline (network emulated Offline, no resources loaded, state/theme
controls update URL and markers, hover grows the segment by margin and shows the tooltip).
Static captures don't show hover; the hover behaviour is specified in Comments and changes.
The host snapshot was removed after this final offline proof; its capture record stays in brief.md.

## Independent critique
- Maker: claude-bridge/claude-opus-5-5. Reviewer: openai/gpt-5.6-terra, thinking medium
  (route.ts role checker), 2026-10-19.
- Command: `node /git/maestro/scripts/read-only-run.ts "$PWD" review /git/maestro/skills/design-feature/reviewer-prompt.md "<design folder, evidence, maker>" -- --model openai/gpt-5.6-terra --thinking medium`
- Evidence: /tmp/design-review-QkA1yU/versions (36 images + manifest: 3 versions × 3 states × 2 themes × 2 widths).
- Verdict: **FIXES**, one item. 1) C's wider gap after Saved outweighed a 1.9% Saved sliver.
  Fix: the wider gap applies only when Saved is at least 5% of the bar; below that the
  normal 2px gap is used. Fixes-only re-check: **PASS** (Fix 1 resolved).
- Accepted trade-offs noted by the reviewer: at 1.9% A's outline and B's dots are tiny,
  but the label and amount below carry recognition.
- Versions also rechecked offline (network emulated Offline, no resources loaded, state and
  theme controls update the URL, markers and dark class).

## Comments and changes
| ID / source | Version / element | Original note | Agreed change and verification | Resolved |
| --- | --- | --- | --- | --- |
| herdr, 2026-10-19 | A (applied to A, B, C) / hovered bar segment | "when the row grows upwards, it's just a stretch effect … only the center part of the bar grows but the radiused corners stay the same size … Otherwise … it looks warped" | Hover no longer uses `scaleY(1.28)`. The hovered segment grows 22px to 28px by pulling its top and bottom edges out 3px each (negative vertical margin), so corner radius, border and pattern keep their size; same brightness, timing (.12s) and tooltip, which no longer needs its counter-scale. Applies to every segment, not only Saved. Verified A hover on Saved at 3x zoom: 2px border and 6px corners intact. | 2026-10-19, synced |

## Experiment
None.

## Open items
None affecting the approved scope.

## Build handoff
Merged folder/revision is the feature authority; DESIGN.md/live site govern site-wide
look. Reconcile #410 in prep before marking ready.
For #410: apply A's treatment to the Saved segment only (bar). Legend and tooltip keep
the 💰 emoji and wording. Replace the bar's hover `transform: scaleY(1.28)` with growing
the hovered segment's height by 3px top and bottom (no stretch of radius, border or
pattern), keeping brightness, .12s timing and z-index; drop the tooltip's `scaleY(0.781)`
counter-scale. Uncategorized's hatch is unchanged.
