# Fairy Town Step 4: The Bubble Pond Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the pond on the street. Bella flies over the water and bubbles leave her horn by themselves. Each grumpy blue octopus a bubble touches flips to its red smiling side, giggles, floats up to the cloud nursery and gives a star.

**Architecture:**
- A new scene, `js/scenes/pond.js`.
- Its painted pieces come from a new `js/art-pond.js` (`window.Pond`).
- The octopus is added to `js/friends.js` as a separate API, so the bakery's visiting order (`Friends.KINDS`) doesn't change.
- Bella flies with the same one-touch physics as the star game, at the same flying scale.
- Bubbles are hand-made circles in this step. Bumping each other comes with the physics extras (step 5, spec "Physics extras").
- Same pattern as steps 2 and 3:
  - the implementer builds the scene on placeholders with a fixed API,
  - the Fable designer paints,
  - the sound designer adds the audio, in parallel in an isolated worktree.

**Tech Stack:** plain HTML/CSS/JS (classic scripts, Canvas 2D, Web Audio, Web Speech). Tests use Node 22 `node:test` with `puppeteer-core`.

**Spec:** `docs/superpowers/specs/2026-11-22-fairy-town-design.md`, sections "The bubble pond", "Style" (faces: the octopus's small black dot eyes; the blue side is the only grumpy face), "How it's built" and "Delivery order" step 4.

## Global Constraints

- Every hard rule in `AGENTS.md` holds:
  - nothing to read, no game over, no misses counted, points never subtracted;
  - one touch: hold to rise, release to float down, and a tap shoots an extra bubble;
  - 60 fps, with no per-frame `shadowBlur`, filters or grain;
  - `file://` works, no `getImageData`, classic scripts;
  - audio only through `Core.snd`, storage only through `Core.load` / `Core.store`.
- **The octopus** (owner's decision, spec):
  - The blue side is gently grumpy: a soft pout, a small frown, droopy half-closed eyes, no teeth, no angry movement.
  - It never chases or bumps Bella.
  - The flip to the red smiling side is big and joyful.
  - No octopus stays blue longer than 20 s: it flips by itself with a giggle.
- `Characters.prerender` keeps 2 scales: the pond draws Bella at the star game's flying ppu (`Math.min(H * 0.42, W * 0.52) / Characters.H * DPR`).
- **Navigation:**
  - `pond` has `home: 'street'`, `clock: true` (the day/night cycle runs, as in the star game), `music: 'pond'`;
  - the street's pond place opens it (`Core.go('pond', {hero})`);
  - coming back with `args.from === 'pond'` puts Bella by the pond.
- **Stars:** 1 per octopus flipped by a bubble, and also 1 when one flips by itself, through `Core.addStars`. Every 10 caught: confetti, `fanfare`, `say('bravissima')`, and the nursery cloud rains stars.
- `sw.js`:
  - add `js/art-pond.js` and `js/scenes/pond.js` to `FILES`;
  - `VERSION` goes up at publish.
- `index.html` script order: after `js/art-bakery.js` add `js/art-pond.js`; after `js/scenes/bakery.js` add `js/scenes/pond.js`.
- Commits: conventional, ending with `Assisted-by: Claude Code:<model>`. Push only with the owner's OK.
- Agent roles:
  - the implementer does Task 1,
  - the Fable designer does Task 2,
  - the sound designer does Task 3,
  - the controller does Task 4.

## Review Focus

1. **A finger held for a long time:** Bella stays at the top, bubbles keep coming, and octopuses still get caught as they arc up toward her. Test: `holding all the time still catches octopuses`.
2. **Many bubbles and many octopuses at once (rapid taps):**
   - bubbles cap at 24 (a tap past the cap only sparkles);
   - octopuses cap at 6 on screen;
   - frames stay under budget.
   - Test: `rapid taps stay within budget`.
3. **A bubble touching an octopus that is already flipping:** no double star. Test: `each octopus gives one star`.
4. **Leaving with home mid-flight, then coming back:** a fresh pond, Bella by the pond on the street, and nothing lost from the total. Test: `home goes to the pond on the street and back starts fresh`.
5. **Resize or rotation mid-game:** Bella, the bubbles and the octopuses stay inside the water and sky bands. Test: `resize mid-game keeps everything on screen`.

---

### Task 1: Pond scene, flow and navigation (implementer)

**Files:**
- Create: `js/scenes/pond.js`, and `js/art-pond.js` with **placeholder** drawings (Task 2 replaces the bodies, not the API)
- Modify:
  - `js/friends.js`: add **placeholder** `Friends.buildOctopus` / `Friends.octopus`. Leave the four bakery friends alone.
  - `js/scenes/street.js`: the pond opens; arrive by the pond from `pond`.
  - `index.html`, `sw.js` (`FILES` only), `README.md`, `AGENTS.md`.
- Test:
  - `tests/game.test.js`, plus a `playPond(page)` helper in `tests/helpers.js`;
  - `tests/render.test.js` (pond shots and cost).

**Interfaces:**
- **`window.Pond`** (`js/art-pond.js`). Everything is pre-rendered in `Pond.build(u, DPR)`; `u` is the scene's size unit.
  - `Pond.waterTile() -> {c, w, h}`: a horizontally repeating water band (turquoise, ripples, dotted wave line on top). Its top edge is the waterline.
  - `Pond.sprite(kind, night) -> {c, w, h}`, anchored at bottom center. `kind` is `'lily'`, `'reeds'`, `'rock'` or `'lilyFlower'`. With `night` true, the colors are dimmed and there are fireflies.
  - `Pond.nursery() -> {c, w, h}`: the big puffy nursery cloud at the top, anchored at the center.
  - `Pond.bubble(r) -> {c, r}`: a soap bubble with a rainbow sheen and a highlight, cached per rounded radius (at most 4 sizes).
- **Octopus** (in `js/friends.js`):
  - `Friends.buildOctopus(h, DPR)`: pre-renders it `h` px tall.
  - `Friends.octopus(g, x, y, pose)`, centered at (x, y). `pose = {t, side: 'blue'|'red', flip, giggle}`:
    - `flip` 0..1 turns it inside out from blue to red (a squash, then a pop to the other side);
    - `giggle` 0..1 shakes it with closed happy eyes.
- **Scene behavior** (`st.mode`: `toFly` → `fly`; `off` while away):
  - **Bella:** at `flyX` (as in the star game), between the nursery cloud's bottom and the waterline. She uses the star game's hold/float feel, with the same values copied, not shared code.
  - **The world:**
    - it scrolls left at `Math.max(0.2 * W, 0.15 * H)` px/s, slower than the star game so aiming isn't needed;
    - the waterline is at `0.78 H`;
    - lily pads and reeds pass on the water;
    - the lizard sits on a rock now and then (`Friends.draw(g, 'lizard', ...)`, state `'sit'`, decoration only).
  - **Bubbles:**
    - one leaves the horn (`Characters.anchors` near the horn tip, scaled; or the rig's horn tip point if exposed) every 0.8 s;
    - each pointer `down` adds one extra (only if `0.25 s` have passed since the last);
    - they fly right at `0.45 W` px/s, rise slowly, and wobble;
    - each pops (`snd('pop')`, small sparkle) after 3.5 s, or at the nursery's bottom;
    - at most 24 at a time.
  - **Octopuses:**
    - they come in from the right in the water, blue side up, about one every 2.2 s, at most 6 on screen;
    - they bob, and every 2–4 s each pops up in a gentle arc up to `0.45 H` above the waterline and back.
  - **Catch:** a bubble touching an octopus (circle test):
    - the bubble wraps it (the bubble follows the octopus);
    - `flip` 0 → 1 over 0.5 s, `snd('flip')`, `say('preso')` (at most every 3 s), `snd('giggle')`;
    - a big burst of red and pink sparkles;
    - it floats up to the nursery (1.6 s), then the nursery jiggles;
    - +1 star: it flies to the top-left star row, `Core.addStars(1)`.
  - **Auto-flip:** an octopus still blue after 20 s flips by itself (giggle, +1 star) and floats up.
  - **Every 10 caught:** confetti, `fanfare`, `say('bravissima')`, and the nursery rains stars for 2 s.
  - **Night:** `Pond.sprite(kind, true)` and the backdrop's night.
- **Debug hook** `window.__bella.pond`:
  - `st`: `{mode, caught, bubbles, octos, held, enters}`. `bubbles` is `[{x, y, r}]`; `octos` is `[{x, y, r, side, flip, age, state}]` with `state` `'swim'|'caught'|'up'`.
  - `spawnOcto(x, y)`.
  - `shoot()`.
- **Test helper** `playPond(page)`: `tapPlay`, wait for `street`, call `__bella.street.enter('pond')`, then wait for scene `pond` and mode `fly`.

- [ ] **Step 1: Write the failing tests** in `tests/game.test.js` (both sizes unless noted):
  - `the pond opens from the street`: `playPond`. The scene is `pond`, `#home` is visible, and `goHome()` returns to `street` with `|st.x - pond.x| < 0.05 * worldW()`.
  - `bubbles leave the horn by themselves`: after 2 s with no input, `bubbles.length >= 2`.
  - `a bubble flips an octopus and gives a star`:
    - `spawnOcto` right in front of the horn's path;
    - wait for `caught` to grow by 1;
    - `Core.stars()` grew by 1;
    - the octopus's `side` is `'red'`.
  - `each octopus gives one star`: `spawnOcto`, then `shoot()` 10 times quickly. `caught` grows by exactly 1, and the stars by exactly 1.
  - `a grumpy octopus flips by itself after 20 s` (portrait): `spawnOcto` far from Bella's path, then set its `age` to 19.5. Within 1 s it is `'red'` and the stars grew by 1.
  - `every 10 caught gives confetti and bravissima`: catch 10 (set `caught` to 9 through the hook and catch 1). A confetti or rain flag is set, through a hook field `st.party > 0`.
  - `holding all the time still catches octopuses`: hold for 8 s with octopuses spawning normally. `caught >= 1`.
  - `rapid taps stay within budget` (portrait): 60 taps in 6 s. `bubbles.length <= 24` at all samples, octopuses `<= 6`, and `frameMs()` is under 8 ms.
  - `home goes to the pond on the street and back starts fresh`: catch 1, `goHome()`, enter again. `caught === 0`, and the stars are unchanged by re-entering.
  - `resize mid-game keeps everything on screen`: resize 390x844 ↔ 844x390 mid-game. Bella, the bubbles and the octopuses are within `[0, W] x [0, H]`, and the octopuses that are swimming have `y >= nursery bottom`.
  - **Changes to existing tests:** the street's closed-places test (`the pond is still closed`) becomes the `house` only.
  - `tests/render.test.js`:
    - shots `pond-day`, `pond-night`, `pond-catch` (mid-flip), `pond-landscape`;
    - the pond render cost is under 8 ms with 24 bubbles and 6 octopuses.
- [ ] **Step 2: Run** `cd tests && npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the placeholders, the scene, the octopus placeholder and the street change.
- [ ] **Step 4: Run** `cd tests && npm test`. Expected: all pass, with no console errors. Look at `tests/out/pond-*.png`.
- [ ] **Step 5: Docs.**
  - `README.md`: how to play the pond.
  - `AGENTS.md`: file map, the pond section, the hook, the script order.
- [ ] **Step 6: Commit** `feat: open the bubble pond with the octopuses`.

### Task 2: The pond and the octopus in the wall style (Fable designer)

**Files:**
- Modify: `js/art-pond.js` (replace placeholder bodies), and in `js/friends.js` only `buildOctopus` / `octopus`
- Reference:
  - `assets/photos/ref/octopus.jpg`: the reversible octopus. The red side has a small smile and small black dot eyes. The blue side is not photographed: draw it as the usual reversible-octopus pout, with a small frown and droopy half-closed eyes; gently grumpy, funny, never scary.
  - `mural-house.jpg` (the turquoise river with lily pads),
  - `mural-lizard.jpg`.
- Test: `tests/render.test.js`:
  - a pond sheet `tests/out/pond-sheet.png` with every `Pond` sprite day and night, bubbles at 4 sizes and the nursery;
  - octopus frames: blue idle, the flip at 0, 0.25, 0.5, 0.75 and 1, red idle, red giggle, and red inside a bubble.

**Interfaces:** the `Pond` and octopus APIs exactly as in Task 1. `Friends.octopus` stays under 0.3 ms, and the pond render under 8 ms.

- [ ] **Step 1: Add** the sheets. Run them on the placeholders (baseline).
- [ ] **Step 2: Draw.** Compare with the photos, and iterate. The flip must read as a happy "pop".
- [ ] **Step 3: Run** `cd tests && npm test`. Expected: all pass.
- [ ] **Step 4: Save** `docs/superpowers/review/step4/` (`pond-sheet.jpg`, `octopus.jpg`, `pond-day.jpg`, `pond-catch.jpg`).
- [ ] **Step 5: Commit** `feat: paint the pond and the reversible octopus`.

### Task 3: Pond music, sounds and voice (sound designer, isolated worktree, in parallel)

**Files:** `js/audio.js`, `tests/audio.test.js` only. The controller adds the README and AGENTS lines when merging.

**Interfaces:** the calls from Task 1, through `Core.snd`:
- `setPlace('pond')`: a floaty, bubbly day song in the same family; the night lullaby stays shared.
- `pop()`: a soft bubble pop.
- `flip()`: a squishy "fwump" that rises in pitch.
- `giggle()`: a short, bright, happy giggle made from synth chirps, about 0.6 s.
- The voice `preso: 'Preso!'` in `VOICE_TEXT` (not `RECORDED`).
- The existing `bubble()` stays for the shot.

Everything is soft, click-free and inside try/catch.

- [ ] **Step 1: Extend** `tests/audio.test.js`:
  - every new function exists and doesn't throw, before and after `init()`, muted and unmuted;
  - `setPlace('pond')` switches the day song within 2 bars;
  - the `preso` text is present.
- [ ] **Step 2: Run** `node --test audio.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `node --test audio.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add the pond song, bubble pops and the octopus giggle`.

### Task 4: Publish step 4 to the preview (controller)

- [ ] Bump `VERSION`, check `FILES`, run `npm test`, then commit `chore: bump preview cache`.
- [ ] Run `tools/publish-preview.sh . .worktrees/main`, then commit `chore: publish fairy town step 4 preview` on `main`.
- [ ] Ask the owner, then push both. Check the Pages build, that `/` is unchanged, and catch one octopus on `/next/`.
- [ ] Stop for the owner to try the pond.
