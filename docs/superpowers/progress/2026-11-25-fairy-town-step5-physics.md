<!-- Copy of the execution ledger (.superpowers/sdd/2026-11-25-fairy-town-step5-physics/progress.md), saved in git so work can resume. -->
# SDD ledger — plan: docs/superpowers/plans/2026-11-25-fairy-town-step5-physics.md

Spec: docs/superpowers/specs/2026-11-22-fairy-town-design.md
Branch: town. Base 350758e. Owner 2026-11-25: "yes" to writing the plan, then "hide and seek, after step 5" (step 6 added to the spec) — taken as the go for step 5.

## Pre-flight scan
| Tasks | Shared file / interface | Finding |
|---|---|---|
| T1 ↔ T2 | js/physics.js, street.js, tests | Sequential (T2 after T1). |
| T1 ↔ T3 | snd('clink'), snd('jarPop') | T3 in isolated worktree, parallel; no-ops until merged. |
| T2 | js/backdrop.js cloudsOnScreen/squish | New API, T2 owns it. |

Ruling: Matter.js only for the jar; bubbles use a hand-made separation pass (spec leaves it to the builder) — cost if wrong: owner wants livelier bubble physics.
Ruling: "street sky" squishy clouds = tap a backdrop cloud to squish (Bella doesn't fly on the street) — cost if wrong: small.
Ruling: models — T1/T2 opus implementer, T3 sonnet; controller reviews.

## Progress
Task 1: dispatched (base 350758e, implementer opus)
Task 3: dispatched in parallel (worktree, sound designer sonnet)
Task 3: done in worktree (7903e0d on worktree-agent-aa04c2757c9cdd3e4; audio.test 10/10; clink rate-limited 8/s, jarPop, boing softened 0.30→0.22) — cherry-pick after Task 1 commits; then AGENTS audio line.
Task 1: complete (commits 9c079d2..636db05, review clean with one carried finding — controller review: Matter 0.19.0 MIT vendored + license, 130/130, physics 0.03-0.26 ms, street 0.5 ms; street-jar-pop.png checked)
Ruling: accept file:// test ignoring pre-existing font-preload/manifest ERR_FAILED under file:// — browser blocks those on file://, game unaffected — cost if wrong: hides a real file:// error of those two kinds.
Ruling: after-game jar pop-up too small and tucked top-left near the buttons (86 px portrait, 42 px landscape, stars 3-7 px) → carried into Task 2 as a fix: center it over the street, h = min(0.42 H, 0.6 W, 1.1 u), stars scaled with the jar — cost if wrong: tuning at preview.
Task 3: complete (cherry-picked 7903e0d; AGENTS line; worktree removed)
Task 2: dispatched (resume Task 1 implementer, plus the jar pop-up fix)
Task 1: fix round 1/5 (1 addressed: big centered after-game jar; commit ed06a3d)
Task 2: complete (commits ed06a3d..2663ac5, review clean — controller review: 140/140; all scenes < 0.8 ms; jar 0.2 ms)
Ruling: accept hop vy = min(vy,0) - hopV (a falling Bella barely hopped with vy -= hopV), still capped at the top — cost if wrong: hop slightly stronger.
Ruling: accept "≥ N hops" assertions and the 15 s wait for a clear street cloud — random clouds; deferred minor: possible flake.
Task 2: minor (deferred): street cloud tap test may flake on unlucky cloud layouts.
Task 4: started (controller)
Task 4: complete (pushed main 851655b, town a705ca8 on owner's 'publish it'; Pages built; /next/ bella-next-7; matter.min.js served; live check of the after-game jar recorded in the tool output).
