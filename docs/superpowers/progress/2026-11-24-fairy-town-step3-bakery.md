<!-- Copy of the execution ledger (.superpowers/sdd/2026-11-24-fairy-town-step3-bakery/progress.md), saved in git so work can resume. -->
# SDD ledger — plan: docs/superpowers/plans/2026-11-24-fairy-town-step3-bakery.md

Spec: docs/superpowers/specs/2026-11-22-fairy-town-design.md
Branch: town. Base df6196b. Owner goal 2026-11-24: "reach the step 3".

## Pre-flight scan
| Tasks | Shared file / interface | Finding |
|---|---|---|
| T1 ↔ T2/T3 | Bakery/Friends APIs, drawBongo | Fixed in plan; T1 placeholders, T2/T3 replace bodies. Consistent. |
| T1 ↔ T4 | snd names ding/squish/plop/bell/munch, say chebuona/grazie, setPlace('bakery') | Consistent. |
| T2 ↔ T3 | js/friends.js | Sequential; T3 keeps T2's API and husky. |
| T1 self | street closed-places test | Plan updates it to pond only. |

Ruling: no separate plan sign-off — owner set the goal "reach the step 3" and asked for autonomy; the plan follows the approved spec's bakery section — cost if wrong: owner redirects at preview.
Ruling: shape picked first (3 buttons), cream color chosen while decorating (4 pots) — spec says "round, heart or tall, in 3–4 pastel colors, at most 6 big buttons"; this keeps each screen ≤ 11 big buttons with one choice at a time — cost if wrong: a pick-screen tweak.
Ruling: wish = a topping (not a cream color) — spec example is a strawberry — cost if wrong: small.
Ruling: bella.cakes window included (spec: optional) — cheap with cached thumbnails — cost if wrong: drop it.
Ruling: Pagi's collar drawn without letters — AGENTS.md "nothing for the child to read" — cost if wrong: none.
Ruling: models — T1 opus, T2/T3 Fable, T4 sonnet; reviews by controller (3-role cap).

## Progress
Task 1: dispatched (base df6196b, implementer opus)
Ruling: run Task 4 (sound) in parallel in an isolated git worktree from df6196b; it skips README/AGENTS (controller adds those lines at merge) — owner asked about parallel agents — cost if wrong: a cherry-pick conflict in audio.js (none expected; only T4 touches it).
Task 4: dispatched in parallel (worktree, sound designer sonnet)
Task 4: done in worktree (b824c8e on worktree-agent-adc9b74226459e5ca, audio.test 7/7) — cherry-pick after Task 1 commits; then add README/AGENTS lines.
Task 1: complete (commits df6196b..5c3c54c, review clean — controller review: 84/84 then 86/86 with sound; bakery 0.25-0.28 ms; screenshot checked)
Ruling: accept API additions Bakery.windowRect, Bakery.COUNTER, SHAPES/CREAMS/TOPPINGS lists, counter sprite anchored at its top edge — documented in headers — cost if wrong: Fable keeps them.
Ruling: "Che buona!" during eating (1.2 s) — keeps 3 voice cues from cutting each other — cost if wrong: timing tweak.
Ruling: chocolate drop topping + choc cream icon read like poop in the placeholder — tell Fable to make them unmistakably chocolate (chip with a shine / bonbon, piped swirl with a wafer) — cost if wrong: kids giggle; owner may not want that.
Parked: portrait overlap (oven/Bongo/cake/friend), bell over Bongo's belly → Fable to compose within API; layout constants in bakery.js only if Fable reports a need.
Task 4: complete (cherry-picked as 36cfcb1 from worktree b824c8e; docs synced in f75ea71; worktree removed; 86/86)
Task 2: dispatched (base f75ea71, Fable designer)
Task 2: complete (commits f75ea71..e70b0a8, review clean — controller review: room/window/oven/counter/cakes/toppings, chocolate now a bonbon + chocolate cream bowl with wafer (no poop look), husky matches photo with glittery blue eyes and smiles in all states; 88/88; bakery 0.23-0.35 ms)
Ruling: keep Bongo drawn from the flying-scale cache (slightly soft, ~1.7x up) — a bakery-only scale would evict the star game's wash scale and force a rebuild mid-game at the mud hit — cost if wrong: Bongo a bit blurry on the counter; revisit with a cache of 3 scales later.
Ruling: accept render.test reorder (friends sheet last) for a puppeteer session flake — test-only — cost if wrong: hides a flake; deferred minor.
Task 2: minor (deferred): puppeteer "Session with given id not found" when friends sheet ran mid-file.
Task 1: fix round 1 dispatched (layout from Task 2 report: bellX, stoolX, windowRect top under #home)
Ruling: run Task 3 (friends.js only) in parallel with this fix round (bakery.js only) — different files; owner wants speed — cost if wrong: a flaky test run while files change; re-run.
Task 3: dispatched in parallel (Fable)
Task 1: fix round 1/5 (2 addressed: bell off Bongo, stool off cake; 1 open: window under #home — painted in art-bakery windowRect; commits e70b0a8..2154cb5)
Task 1: fix round 2 dispatched (windowRect top, art-bakery.js only)
Task 1: fix round 2/5 (1 addressed: window top max(0.12H,100) in portrait; 0 open; commits 2154cb5..08eb2a6). Task 1 complete (review clean after 2 rounds).
Task 3: complete (commits 08eb2a6..248fcc3, review clean — controller review: Pagi (collar plain tag, no letters), mouse, lizard with googly eyes, all 4 states, smiling; 88/88; Friends.draw ~0.025 ms)
Ruling: lizard sits upright and reads a bit frog-like — owner reviews at preview — cost if wrong: a redraw of one friend.
Task 5: started (controller)
Task 5: pushed (town 50b0a0d, main 33e5eac) with owner OK; Pages build was in progress when the owner said 'save the state and stop' — live check of /next/ NOT done yet. STOPPED by owner 2026-11-24.
