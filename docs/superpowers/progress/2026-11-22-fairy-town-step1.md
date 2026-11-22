<!-- Copy of the execution ledger (.superpowers/sdd/…/progress.md), saved in git so work can resume. -->
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

Saved: Task 3 work-in-progress committed as a wip commit on town (frameMs hook in core.js, tests/out/ ignored, unfinished tests/render.test.js). Resume Task 3 from that commit; the render test is not yet verified.
