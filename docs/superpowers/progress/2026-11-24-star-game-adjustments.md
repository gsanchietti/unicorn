<!-- Copy of the execution ledger (.superpowers/sdd/2026-11-24-star-game-adjustments/progress.md), saved in git so work can resume. -->
# SDD ledger — plan: docs/superpowers/plans/2026-11-24-star-game-adjustments.md

Spec: docs/superpowers/specs/2026-11-22-fairy-town-design.md (section "Changes after the step 1 preview")
Branch: town. Base fe8ef48. Owner answers 2026-11-24: level every 10 stars; new game at level 1; do these before the street; publish to /next/ for the owner to try.

## Pre-flight scan
| Tasks | Shared file / interface | Finding |
|---|---|---|
| T1 ↔ T2 | none (stars.js vs characters.js) | Independent; run sequentially anyway (shared working tree and tests/out). |
| T1 self | existing test 'mud, wash, clean gives +5' relies on homing | Plan tells T1 to set st.mud.y = hero y there. Consistent. |
| T3 ↔ T1/T2 | sw.js VERSION bella-next-2 | Controller task. Consistent. |

Ruling: reviews by controller (owner's 3-role cap), same as step 1 — cost if wrong: less independent review.
Ruling: owner's "publish to /next/ for you to try" answer = consent to push town+main for this round — cost if wrong: an unwanted preview update (no effect on live game).
Ruling: proceed to execution without a separate plan sign-off — owner set all open choices via questions minutes earlier and asked to proceed — cost if wrong: owner redirects mid-run.

## Progress
Task 1: dispatched (base fe8ef48, implementer sonnet)
Task 1: complete (commits fe8ef48..18318c7, review clean — controller review: homing and passed=hit removed, speedK on world only, spawn intervals scaled, level reset in startGame; 36/36)
Ruling: accept the in-page 16 ms "keep mud level with Bella" interval in the wash tests (game.test + render.test) — the one-shot y set missed while she moves; render.test touched outside brief by necessity — cost if wrong: test-only.
Task 2: dispatched (base f5dea44, Fable designer)
Task 2: complete (commits f5dea44..cd9b5e3, review clean — controller review: horse tail in pink + lilac-white locks, mane rooted along crest in all 6 gallop frames, draw ~0.15 ms, API/anchors unchanged)
Ruling: accept modest tail lift (~0.2 rad) — more lift would cross the rig frame where stars.js clips the mud canvas — cost if wrong: owner asks for a livelier tail; needs a stars.js margin change.
Task 3: started (controller)
Task 3: complete (town e7b8c0a pushed; main f3f3406 pushed; Pages built; live / unchanged bella-v4, /next/ bella-next-2 with speedK; no console errors). Plan done — owner to try preview. Owner said yes to writing the step 2 plan meanwhile.
