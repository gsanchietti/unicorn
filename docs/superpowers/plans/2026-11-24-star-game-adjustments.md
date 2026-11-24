# Star Game Adjustments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the owner's feedback on the step 1 preview: a horse-like two-color tail and an attached mane for Bella, a mud cloud that can be avoided, and levels that make the star game quicker. Then publish it to `/next/`.

**Architecture:**
- The game rules change only in `js/scenes/stars.js`.
- Bella's look changes only in `js/characters.js`, behind the same API.
- Publishing reuses `tools/publish-preview.sh` from step 1.

**Tech Stack:** plain HTML/CSS/JS (classic scripts, Canvas 2D). Tests use Node 22 `node:test` with `puppeteer-core` and the system Chrome.

**Spec:** `docs/superpowers/specs/2026-11-22-fairy-town-design.md`, section "Changes after the step 1 preview".

## Global Constraints

- Every hard rule in `AGENTS.md` holds:
  - no text for the child, no game over, points never subtracted;
  - one-touch control;
  - 60 fps, with no per-frame `shadowBlur` or filters;
  - works from `file://`, no `getImageData`;
  - audio only through `Core.snd`, `localStorage` only inside try/catch.
- Branch `town`. `main` changes only in `next/`, and only through `tools/publish-preview.sh`.
- Bump town's `sw.js` `VERSION` from `bella-next-1` to `bella-next-2`, because cached files change.
- Commits: conventional, ending with `Assisted-by: Claude Code:<model>`. No Co-Authored-By, no Signed-off-by.
- Agent roles: an implementer (Task 1) and the Fable designer (Task 2). The controller does Task 3.

## Review Focus

1. **A mud cloud is on screen when a new game starts or the scene changes:** the new game begins clean and at level 1 (`st.mud === null`, `st.level === 1`). Test: Task 1, `new game starts at level 1 without mud`.
2. **The finger is held all the time while a mud cloud comes:** Bella stays at the top, and the cloud must still be able to miss her and leave. Test: Task 1, `mud cloud can be avoided`.
3. **A very long game (200+ stars):** the speed stops growing at 1.8x and the stars stay catchable. Test: Task 1, `level rises every 10 stars and speed is capped`.
4. **The +5 wash bonus crosses a level boundary:** the level still rises. Test: Task 1, `level rises every 10 stars and speed is capped` (uses `addPoints(5)` across 10).
5. **The tail in fast gallop and with reduced motion:** no gaps, nothing leaves the sprite margin. Covered by the Task 2 character sheet at 6 gallop frames, checked by eye.

---

### Task 1: Avoidable mud cloud and levels (implementer)

**Files:**
- Modify: `js/scenes/stars.js` (the header comment, the state, `spawnMud`, the mud update, `addPoints`, the fly update speeds and spawn timers, `startGame`, `stopGame`, the debug hook)
- Test: `tests/game.test.js`

**Interfaces:**
- Produces:
  - `st.level`: integer, `Math.floor(st.score / 10) + 1`, kept up to date in `addPoints`.
  - `__bella.stars.speedK()`: returns `Math.min(1 + 0.1 * (st.level - 1), 1.8)`.
  - The mud cloud now has `{x, y, ph, vy}` and no homing. It is removed when it leaves the left edge.

**Rules (from the spec):**
- **Levels.**
  - The world speed in `fly` and `toFly` is `baseSpeed() * speedK()`. That covers the stars, the clouds, the mud, the scroll and the trail.
  - The star spawn interval becomes `1.2 / speedK()` and the cloud interval `rnd(3, 4) / speedK()`, so spacing on screen stays the same.
  - Bella's up/down physics are unchanged.
- **Level-up moment** (when `st.level` rises):
  - The existing big-star pop in the score bar.
  - `starEvent()`.
  - `snd('sparkle')`.
  - No new sound, no text.
- **Mud spawn.**
  - Its `y` is random within `heroLimits()`, but at least `0.25 * H` away from the hero's `y` when it spawns, so she has room.
  - It moves left at `spd * 1.0` with a gentle bob (the existing `ph`). It never moves toward the hero.
- **Mud hit.** Only the distance test hits. Delete the `m.x < h.x - h.h` "passed = hit" clause.
- **Mud avoided.** When `m.x < -S.mudCloud.lw`:
  - set `st.mud = null` and `st.sinceWash = 10`, so the next cloud comes 5 stars later;
  - stars and clouds start spawning again (they pause while `st.mud` is set, as today).
- **New game.** `startGame` sets `st.level = 1`. `stopGame` already clears `st.mud`.

- [ ] **Step 1: Write the failing tests** in `tests/game.test.js`.

```js
each('level rises every 10 stars and speed is capped', async ({ page }) => {
  await tapPlay(page); await waitFor(page, () => window.__bella.stars.st.mode === 'fly');
  const L = () => ev(page, () => [window.__bella.stars.st.level, window.__bella.stars.speedK()]);
  assert.deepStrictEqual(await L(), [1, 1]);
  await ev(page, () => window.__bella.stars.addPoints(9));
  assert.deepStrictEqual(await L(), [1, 1]);
  await ev(page, () => window.__bella.stars.addPoints(5));       // 14: crosses 10 like the wash bonus
  const [l2, k2] = await L();
  assert.strictEqual(l2, 2); assert.ok(Math.abs(k2 - 1.1) < 1e-9, String(k2));
  await ev(page, () => window.__bella.stars.addPoints(200));
  const [l3, k3] = await L();
  assert.strictEqual(l3, 22); assert.strictEqual(k3, 1.8);
});

each('mud cloud can be avoided', async ({ page }, s) => {
  await tapPlay(page); await waitFor(page, () => window.__bella.stars.st.mode === 'fly');
  await page.mouse.move(s.w / 2, s.h / 2); await page.mouse.down();     // hold: Bella goes to the top
  await hold(page, 1200);
  await ev(page, () => { window.__bella.stars.st.sinceWash = 15; });
  await waitFor(page, () => !!window.__bella.stars.st.mud);
  await ev(page, () => { const st = window.__bella.stars.st; st.mud.y = innerHeight * 0.75; });   // far below her
  const y0 = await ev(page, () => window.__bella.stars.st.mud.y);
  await hold(page, 300);
  assert.ok(Math.abs(await ev(page, () => window.__bella.stars.st.mud.y) - y0) < innerHeightTol(s), 'no homing');
  await waitFor(page, () => !window.__bella.stars.st.mud, 15000);
  await page.mouse.up();
  const r = await ev(page, () => { const st = window.__bella.stars.st; return { mode: st.mode, since: st.sinceWash, dirty: !!st.splotches }; });
  assert.strictEqual(r.mode, 'fly'); assert.strictEqual(r.dirty, false); assert.strictEqual(r.since, 10);
});
const innerHeightTol = (s) => s.h * 0.03;   // the gentle bob only

each('new game starts at level 1 without mud', async ({ page }) => {
  await tapPlay(page); await waitFor(page, () => window.__bella.stars.st.mode === 'fly');
  await ev(page, () => { window.__bella.stars.addPoints(30); window.__bella.stars.st.sinceWash = 15; });
  await waitFor(page, () => !!window.__bella.stars.st.mud);
  await ev(page, () => window.__bella.goHome());
  await waitFor(page, () => window.__bella.scene() === 'title');
  await hold(page, 900);
  await tapPlay(page); await waitFor(page, () => window.__bella.scene() === 'stars');
  const r = await ev(page, () => ({ level: window.__bella.stars.st.level, mud: window.__bella.stars.st.mud }));
  assert.deepStrictEqual(r, { level: 1, mud: null });
});
```

- **Keep the existing `mud, wash, clean gives +5` test meaningful.** The mud no longer homes in, so after `sinceWash = 15` and the cloud appears, set `st.mud.y` to the hero's `y`. That makes the hit certain. Change only that line.

- [ ] **Step 2: Run** `cd tests && node --test game.test.js`. Expected: the three new tests FAIL (`st.level` is undefined, `speedK` is not a function, or the mud homes in or hits).
- [ ] **Step 3: Implement** the rules above in `js/scenes/stars.js`. Update its header comment: the hook gains `speedK`, and `st.level` is listed.
- [ ] **Step 4: Run** `cd tests && npm test`. Expected: all pass, with no console errors.
- [ ] **Step 5: Commit** `feat: let Bella dodge the mud cloud and add levels that speed up`.

### Task 2: Horse tail and attached mane (Fable designer)

**Files:**
- Modify: `js/characters.js`
- Reference: `assets/photos/bella.jpg`, `assets/bella.png`. Look at real horse tails too: long hair falling from the dock and fanning out at the end, moving with the gallop.
- Test: `tests/render.test.js` (the existing character sheet; no new test)

**Interfaces:**
- Consumes: `Art.ink`, `Art.pencil` (unchanged).
- Produces: the same `window.Characters` API. `W`, `H`, `prerender`, `draw` and `anchors` stay the same, with anchors within ±10 rig units. Pose fields are unchanged.

**What changes:**
- **Tail:** a horse's tail, not a pom-pom.
  - It starts high at the dock, then falls in long locks that fan out and end in soft rounded tips.
  - It keeps the two colors: pink locks and lilac-white locks, layered.
  - It swings and lifts with `run` (the gallop) and sways gently at rest. With reduced motion, the sway is still allowed, since it is small.
  - Locks are cached sprites, as today; per frame there are only transforms.
- **Mane:** attached along the crest of the neck, from between the ears down to the withers, with no gap where it meets the neck at any gallop phase.
- **Everything else stays:** the toy eye, the smile, the horn and butterfly lights, the legs and knees, Bongo.

- [ ] **Step 1: Run** `cd tests && node --test render.test.js` and keep `tests/out/characters.png` as the "before" image.
- [ ] **Step 2: Redraw** the tail and fix the mane in `js/characters.js`.
- [ ] **Step 3: Compare** the new character sheet (all 6 gallop frames, both sizes) with the photo. No gaps at the dock or along the crest, and both sides still smile.
- [ ] **Step 4: Run** `cd tests && npm test`. Expected: all pass; `Characters.draw` stays under 1 ms.
- [ ] **Step 5: Save** `docs/superpowers/review/step1/before-tail.jpg` and `after-tail.jpg` (cropped from the character sheet), plus `after-tail-fly-day.jpg`.
- [ ] **Step 6: Commit** `feat: give Bella a horse tail and attach her mane`.

### Task 3: Publish to the preview (controller)

**Files:**
- Modify: `sw.js` (`VERSION = 'bella-next-2'`)
- On `main` (`.worktrees/main`): `next/`, regenerated with `tools/publish-preview.sh . .worktrees/main`.

- [ ] **Step 1:** Bump `VERSION`, run `cd tests && npm test`, and commit `chore: bump preview cache to bella-next-2`.
- [ ] **Step 2:** Run the publish script, then `git status` in `.worktrees/main`. Commit `chore: update fairy town preview` there.
- [ ] **Step 3:** Push `town` and `main`. The owner approved publishing this round to `/next/`.
- [ ] **Step 4:** Wait for `gh api repos/gsanchietti/unicorn/pages/builds/latest` to report `built`. Then check that `/` is unchanged (`js/game.js`, `bella-v4`) and that `/next/sw.js` says `bella-next-2`.
- [ ] **Step 5:** Stop. The owner tries the preview. Step 2 (the street) is planned next.
