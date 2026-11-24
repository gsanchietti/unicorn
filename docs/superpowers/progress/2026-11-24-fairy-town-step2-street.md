<!-- Copy of the execution ledger (.superpowers/sdd/2026-11-24-fairy-town-step2-street/progress.md), saved in git so work can resume. -->
# SDD ledger — plan: docs/superpowers/plans/2026-11-24-fairy-town-step2-street.md

Spec: docs/superpowers/specs/2026-11-22-fairy-town-design.md
Branch: town. Base f1a893f. Owner approved the plan 2026-11-24 ("yes"); execution subagent-driven as before.

## Pre-flight scan
| Tasks | Shared file / interface | Finding |
|---|---|---|
| T1 ↔ T2 | js/art-town.js (T1 placeholders, T2 real bodies), Town API, pose.walk/stride | Consistent: API fixed in plan; T2 changes bodies only. |
| T1 ↔ T3 | Core.snd('setPlace'/'clipClop'/'door'/'say','andiamo') | Consistent: T1 calls, T3 implements; Core.snd ignores missing fns meanwhile. |
| T1 ↔ T2 | tests/render.test.js (T1 street shots, T2 town sheet + walk frames) | Sequential edits; consistent. |
| T1 self | existing tests use tapPlay→stars | Plan: switch them to playStars helper. Consistent. |
| T1 self | double-tap test needs __bella.stars.enters | Small hook addition in stars.js, allowed (stars.js in T1 files). |
| T3 self | audio tests over DevTools protocol, real-time page | AGENTS.md gotcha noted in plan. |
| T4 | push | Ask owner first (plan step 3). |

Ruling: reviews by controller (owner's 3-role cap) — cost if wrong: less independent review.
Ruling: models — T1 opus (multi-file integration, new scene + many tests), T2 Fable (owner rule), T3 sonnet (sound designer, single file).

## Progress
Task 1: dispatched (base f1a893f, implementer opus)
Task 1: complete (commits f1a893f..6ace34a, review clean — controller review: core args.from/stars/addStars/setPlace/FADE_COLOR, title→street, stars home street + addStars, 59/59, street 0.54 ms; shots checked portrait + landscape)
Ruling: accept Town size unit U = min(M, 0.8H, 2.2*hero h) instead of M — houses overflowed landscape phones — cost if wrong: places a bit small on tablets; designer told.
Ruling: tap targets at door/ground level, not whole sprite — keeps half-screen hold usable in landscape — cost if wrong: child taps a roof and nothing happens; revisit at owner preview.
Ruling: separation test now reads cache names from sw.js files — was hard-coded bella-next-1 — cost if wrong: none.
Ruling: 54-char commit subject accepted as is (brief's exact text).
Parked: portrait street leaves a tall empty sky above the street band — composition for Task 2 designer to consider within the API.
Task 2: dispatched (base 6ace34a, Fable designer)
Task 2: complete (commits 6ace34a..b04c1a4, review clean — controller review: town sheet day/night matches mural refs, signs, jar fills, walk; 60/60; street 0.41-0.48 ms; draw 0.13-0.16 ms; only art-town.js, characters.js, render.test.js + review JPEGs)
Ruling: Task 2's street.js concerns (landscape cadence, fox hidden at start, landscape Bella small, top of bakery/gate under buttons) are Task 1 code → fix round 1 on Task 1 (resume implementer) before Task 3 — cost if wrong: one extra round.
Ruling: fix values — street heroH = min(H*0.34, W*0.55) (draws below the fly ppu, no new cache scale); u = min(M, 0.8H, 2.0*heroH, (gy - 0.18H)/1.36); speed = min(max(0.35W, 0.5M), 1.2*heroH); fox f 0.16 — cost if wrong: tuning at owner preview.
Task 1: fix round 1 dispatched (FIX_BASE b04c1a4)
Task 1: fix round 1/5 (3 addressed, 0 open — landscape cadence 2.67 c/s, heroH 132.6 / u 189 / speed 159, fox at 0.16; commits b04c1a4..8639ad6; controller re-review of diff + street-landscape-day.png). AGENTS.md 3-line sync accepted.
Task 3: dispatched (base 8639ad6, sound designer sonnet)
Task 3: complete (commits 8639ad6..4a99f67, review clean — controller review: setPlace/clipClop/door/andiamo present, all wrapped (playSfx try/catch), audio tests RED 5/5 → GREEN, 65/65)
Ruling: sound levels unheard (headless) — owner checks by ear at preview, especially clipClop at 4-5/s — cost if wrong: a level tweak.
Task 4: started (controller)
Task 4: complete (town 4666750, main 4060f37 pushed with owner OK; Pages built; live / unchanged bella-v4; /next/ bella-next-3; live play-through title→street→stars→street, no errors). Plan done. Owner goal 2026-11-24: 'reach the step 3' = OK to start the bakery.
