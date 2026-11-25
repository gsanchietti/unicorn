<!-- Copy of the execution ledger (.superpowers/sdd/2026-11-25-fairy-town-step6-house/progress.md), saved in git so work can resume. -->
# SDD ledger — plan: docs/superpowers/plans/2026-11-25-fairy-town-step6-house.md

Spec: docs/superpowers/specs/2026-11-22-fairy-town-design.md (Delivery order step 6 + "be quick")
Branch: town. Base 079b9ce. Owner 2026-11-25: "fine go".

## Pre-flight scan
| Tasks | Shared file / interface | Finding |
|---|---|---|
| T1 ↔ T2 | House API (room, SPOTS, spot back/front/hide) | Fixed in plan. |
| T1 ↔ T3 | snd rustle/scurry, say trovato/cucu, setPlace('house') | T3 parallel in a worktree. |
| T1 ↔ bakery/pond | Friends.build same-size no-op; enter() calls | T1 owns the small edits in bakery.js/pond.js/friends.js. |

Ruling: one friend peeks at a time; a hidden (not peeking) friend tapped is also found — generous for a 5-year-old — cost if wrong: owner wants only peekers findable.
Ruling: 5 friends incl. the red octopus; +2 bonus when all found — mirrors other places' milestone feel — cost if wrong: trivial.
Ruling: Bella shown small by the door at the flying-scale ppu (no new Characters scale).
Ruling: models — T1 opus, T2 Fable, T3 sonnet; controller reviews.

## Progress
Task 1: dispatched (base 079b9ce, implementer opus)
Task 3: dispatched in parallel (worktree, sound designer sonnet)
Task 3: done in worktree (db94c43 on worktree-agent-a7f6a54fff3edfcbe; audio.test 12/12; house song 104 bpm, rustle ≤4/s, scurry, trovato/cucu) — cherry-pick after Task 1 commits; then README rows + AGENTS line.
Task 1: complete (commits 079b9ce..37e0f3d, review clean — controller review: 160/160; house 0.55 ms seek / 0.83 ms party; house-peek.png checked)
Ruling: accept API additions House.floorY, Friends.built(), friendH/octoH hooks, st.scurrying, spots() state/wig; pond rebuilds its octopus in enter() — keep caches right across scenes — cost if wrong: none.
Ruling: party→seek test waits 5 s (3 s party + 1.2 s hide run) — brief's 4 s was inconsistent with its own timings — cost if wrong: none.
Carried to Task 2: placeholder peek shows only ear tips (raise 0.35 h vs front ≈1.08 h) — designer must size fronts so ears/tail clearly show at peek; portrait painted door sits behind the curtain.
Task 3: complete (cherry-picked db94c43 as 62553e5; docs bba8a05; audio 12/12; worktree removed)
Task 2: dispatched 16:36 (Fable) on owner request "start it, you can interrupt it later" — told to commit early and be clean by 16:52.
Carried to Task 2 (from house-peek.png): at peek only the mouse's ear tips show above the sofa — peek must clearly show ears/tail (bigger raise or shorter fronts); Bella is tiny in the bottom-left corner in portrait — consider placing her by a door at floor level. Both may need house.js constants (raise, Bella spot) — allow Task 2 to touch those two constants or do a Task 1 fix round.
Task 2: PARTIAL (commit bff4e89 — curtain redrawn, PEEK_UP 0.35→0.5, Bella min(0.42u, 0.27H); render.test 25/25). Left: the other 7 furniture pieces still placeholders; house sheet test + house-sheet.jpg; Bella at a painted door; peek checked for 2 friends only; curtain peek is a small sliver.
OPEN: `holding all the time still catches octopuses [landscape]` failed once in the designer's partial run after bff4e89 (passed in Task 1's full run 160/160 at 37e0f3d). Not investigated — may be flaky, or the pond's new enter()-time Friends/octopus rebuild. Run the pond tests first when resuming.
STOPPED by owner at 16:58 2026-11-25.
