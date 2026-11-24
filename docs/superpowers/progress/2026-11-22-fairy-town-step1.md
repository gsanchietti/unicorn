<!-- Copy of the execution ledger (.superpowers/sdd/2026-11-22-fairy-town-step1-style-and-scenes/progress.md), saved in git so work can resume. -->
# SDD ledger — plan: docs/superpowers/plans/2026-11-22-fairy-town-step1-style-and-scenes.md

Spec: docs/superpowers/specs/2026-11-22-fairy-town-design.md
Branch: town (from main dd865bf). Stop after Task 5 step 6 (owner review of the preview).

## Pre-flight scan

| Tasks | Shared file / interface | Finding |
|---|---|---|
| T1 ↔ T2 | `js/game.js` adapter vs deletion; `window.__bella` hook shape | Consistent: T1 adds adapter, T2 deletes game.js and rebuilds the same hook. |
| T1 ↔ T2 | test `best score saved, old key read` needs the start-page best | Hook has no `best`. Ruling below. |
| T2 ↔ T3 | `js/backdrop.js` (T2 creates, T3 repaints) | Consistent: T3 changes painting only. |
| T3 ↔ T2 | `window.__bella.frameMs()` "added in the core" but `js/core.js` not in T3 files | Ruling below. |
| T3 ↔ T4 | `Art.ink`, `Art.pencil` | T4 consumes what T3 produces. Consistent. |
| T4 ↔ T2/T3 | `Characters` API + anchors | Unchanged API; stars scene uses anchors for mud. Consistent. |
| T5 ↔ all | `sw.js` FILES; main `sw.js` guard; `window.__bella.st` on live game | Live main game exposes `window.__bella = {st,…}` (checked). Consistent. |
| T1 self | tests vs adapter | Consistent. |
| T2 self | creates core/backdrop/scenes, deletes game.js, updates index/sw/docs | Consistent. |
| T3 self | render.test baseline then restyle | Consistent. |
| T4 self | character sheet + perf assertion | Consistent. |
| T5 self | needs a main worktree with `next/` for the separation test | Consistent; worktree goes under `.worktrees/` (git-ignored) inside the repo. |

Ruling: T1 best-score test reads `window.__bella.stars.st.best` (and T2 keeps `st.best` in the stars scene state, loaded via Core.load with fallback) — keeps the hook minimal — if wrong, one test line changes.
Ruling: T3 may add `frameMs()` (average render ms over the last 120 frames) to `js/core.js` and the debug hook — needed by its own test — tiny core change.
Ruling: task reviews are done by the controller (me), not by reviewer subagents — the owner capped agents at 3 roles (implementer, Fable designer, sound designer) — reviews are less independent; mitigated by tests + screenshots + my own diff read.
Ruling: models — implementer T1/T5 sonnet, T2 opus (large refactor, judgment), T3/T4 Fable (owner rule: hardest tasks to Fable).
Ruling: "keep everything saved inside the repo" — tests, tools, review renders and this ledger live in the repo directory; ledger/briefs stay in git-ignored `.superpowers/`; renders worth keeping are committed under `docs/superpowers/review/step1/`.

## Progress
Task 1: dispatched (base dd865bf, implementer sonnet)
Task 1: complete (commits dd865bf..af06e89, review clean — controller review; release test samples 1.5 s for momentum, accepted)
Task 2: dispatched (base af06e89, implementer opus)
Task 2: complete (commits af06e89..5cc6ac3, review clean — controller review)
Ruling: accept st.held = finger down now + st.hasHeld for tap hint; Task 1 home test wait 1000 ms (fade-in ignores taps per brief); Backdrop.update(dt, clock); extras Core.reduced, in-memory load/store, Backdrop.draw {top,behind}, Backdrop.hillH, body.has-home — all small and serve the brief — cost if wrong: minor cleanup.
Ruling: edge case "fullscreen closed during play fade → no trip to title" parked — harmless (game just runs without fullscreen) — revisit only if seen on a device.
Task 3: dispatched (base 5cc6ac3, Fable designer)
Task 3: STOPPED by owner request before completion (Fable agent stopped). Uncommitted Task 3 changes, if any, left in the working tree on branch town. Resume: re-dispatch Task 3 from base 5cc6ac3.
Saved: wip commit 531a435 on town; ledger copy at docs/superpowers/progress/2026-11-22-fairy-town-step1.md
Task 3: re-dispatched 2026-11-24 (base 531a435 = 5cc6ac3 + wip frameMs hook and unfinished render.test.js, Fable designer)
Ruling: resume on top of the wip commit, not from 5cc6ac3 — the wip holds the frameMs hook the brief's own ruling allowed plus a draft test — cost if wrong: implementer rewrites the draft test.
Ruling: Fable reports its baseline screenshots/costs in its report before restyling, and saves before/after review renders to docs/superpowers/review/step1/ (per earlier "keep everything in repo" ruling) — cost if wrong: a few PNGs to drop.
Task 3: complete (commits 531a435..0409f81, review clean — controller review: all 21 old Art exports kept + ink/pencil added; no shadowBlur/filters/getImageData; 28/28 tests; render 0.66-0.68 ms vs 8 ms budget; renders checked against mural-moon.jpg)
Ruling: accept extras (sun, sleepy moon face, ladder cloud, meadow trees, ink #mute/#home, Art.pencil optional strength) — fit the mural, small — cost if wrong: owner asks to drop some at preview review.
Ruling: medal row overlapping the ground on landscape/tablet is pre-existing (same in before-start-tablet.jpg), parked for owner preview review — cost if wrong: small title.js layout tweak later.
Ruling: stars kept 5-point per brief though the mural's stars are 6-point — flag to owner at preview — cost if wrong: one sprite change.
Parked: sw.js VERSION bump → Task 5 (publishes). Icons regenerate → after Task 4 (Task 5). AGENTS.md "soft watercolor, pastel" hard-rule line → owner decides.
Task 4: dispatched (base 0409f81, Fable designer)
Ruling: spec's "walking is added as a new pose" is NOT in Task 4 (brief keeps pose fields unchanged; walking serves the street in step 2) — cost if wrong: add a walk pose in step 2 anyway.
Task 4: complete (commits 0409f81..89f413f, review clean — controller review: 29/29; draw 0.13-0.17 ms vs 1 ms; anchors identical; toy eyes and smiles kept, checked character sheet vs bella.jpg)
Ruling: accept removal of white sticker halo (mural is line+fill; night render still reads) and the short outline gap where near legs meet body — owner sees both at preview — cost if wrong: small characters.js tweak.
Ruling: perf measured 5 draws per rAF instead of a tight 500-call loop — tight loop times Chrome's paint backlog, not draw — cost if wrong: none, still 500 calls averaged.
Task 5: dispatched (base 89f413f, implementer sonnet) — steps 1-4 + local commits only; NO push and NO publish until the owner says so (AGENTS.md: push only when owner asks).
Task 5: steps 1-4 complete (town 89f413f..a319a05 + controller fix 'fix: cream launch colors and a distinct preview label'; main a385fa5 amended with republished next/) — controller review: guard + bella-v4 + scoped cache delete OK; next/ holds only game files; 30/30 tests.
Ruling: accept scoped activate-delete in both sw.js (bella-v* / bella-next-*) beyond the brief — without it the two workers wipe each other's caches on one origin — cost if wrong: none known; remember the prefix when town goes live.
Ruling: controller made the 3-line short_name/theme-color fix itself instead of a fix round — trivial, tests re-run 30/30 — cost if wrong: unreviewed 3 lines.
Task 5: step 5 (push town + main, Pages build, live check) WAITING for owner approval to push.
Task 5: step 5 done — owner approved push; pushed town (new) and main fc23f24..4f873ce (also carried 4 unpushed docs commits: spec, plan, ref photos — told owner). Pages built 4f873ce. Live / = old game (js/game.js, Core undefined, bella-v4 + guard), /next/ = new (Core, title scene, bella-next-1, "Bella prova"), no console errors either.
Task 5: step 6 — STOPPED for owner review of the preview. Step 2 of the spec starts only after owner approves Bella and Bongo's new look.
Owner 2026-11-24: "design approved, go with step 2".
Ruling: step 1's final whole-branch review is deferred to before `town` replaces the live game (merge to main) — the branch isn't being merged now, the preview is approved, and the owner's 3-role cap rules out a separate reviewer agent — cost if wrong: issues found later, at merge time, over a larger diff.
