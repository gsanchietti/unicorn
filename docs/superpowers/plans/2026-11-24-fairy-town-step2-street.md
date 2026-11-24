# Fairy Town Step 2: The Street Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the street as the hub. Play leads there. Bella trots left and right, the sky gate opens the star game and brings her back to the gate, and the town square has a static star jar that shows her total stars.

**Architecture:**
- A new scene, `js/scenes/street.js`, registers with the core like `title` and `stars`.
- Its painted pieces come from a new art file, `js/art-town.js` (`window.Town`), built on `Art.ink` and `Art.pencil`.
- The core gains two things:
  - the star total in save data (`Core.stars()` / `Core.addStars(n)`),
  - a `from` field in every scene's `enter` args, so the street knows where Bella came back from.
- Bella gets a walk pose in `js/characters.js`.
- `js/audio.js` gains per-place music and the street sounds.

**Tech Stack:** plain HTML/CSS/JS (classic scripts, Canvas 2D, Web Audio, Web Speech). Tests use Node 22 `node:test` with `puppeteer-core` and the system Chrome.

**Spec:** `docs/superpowers/specs/2026-11-22-fairy-town-design.md`, sections "The street", "How it's built → Architecture" (navigation, save data), "Delivery order" step 2, and "Changes after the step 1 preview".

## Global Constraints

- Every hard rule in `AGENTS.md` holds:
  - nothing to read, no game over, points never subtracted, the total shown as stars and never numbers;
  - one finger and big targets (any tap target at least `0.12 * M` across);
  - 60 fps, with no per-frame `shadowBlur`, filters or grain;
  - works from `file://`, no `getImageData`, no `fetch` of local files;
  - classic scripts that define `window.*`;
  - audio only through `Core.snd`;
  - `localStorage` only through `Core.load` / `Core.store`.
- `Characters.prerender` keeps 2 cached scales. The street draws Bella at the star game's flying scale (`ppu = Math.min(H * 0.42, W * 0.52) / Characters.H * DPR`, as `title.js` does), so no third scale is ever built.
- **Navigation** (spec): `#home` goes back one level:
  - `stars` → `street`,
  - `street` → `title`.
  Leaving full screen still goes to `title`.
- **Style** (spec "Style"): mural look, the palette in `Art.PAL`, ink outlines, pencil grain baked into cached sprites. Windows light up at night.
- `sw.js`:
  - add every new file to `FILES` (`js/art-town.js`, `js/scenes/street.js`);
  - bump `VERSION` to `bella-next-3` when publishing.
- `index.html` script order:
  - `js/art.js`, `js/art-town.js`, `js/characters.js`, `js/audio.js`, `js/core.js`, `js/backdrop.js`, `js/scenes/title.js`, `js/scenes/street.js`, `js/scenes/stars.js`,
  - then `Core.start('title')`.
- Commits: conventional, ending with `Assisted-by: Claude Code:<model>`. No Co-Authored-By, no Signed-off-by. Push only with the owner's OK.
- Agent roles (at most 3):
  - the implementer does Task 1,
  - the Fable designer does Task 2,
  - the sound designer does Task 3,
  - the controller does Task 4.

## Review Focus

1. **One finger holds one half of the screen while another taps a place:** Bella walks to the place, and when both fingers lift she stops. Nothing keeps walking. Test: Task 1, `tap a place while holding cancels the hold walk`.
2. **Turning the phone or resizing on the street, mid-walk:**
   - Places keep their order, and Bella stays inside the world and on screen.
   - The target place is still reached.
   - Test: Task 1, `resize mid-walk keeps Bella in the world and on screen`.
3. **Tapping the sky gate twice, or tapping it during the walk:** the star game is entered exactly once. Test: Task 1, `double tap on the gate enters the star game once`.
4. **`localStorage` throws (private mode):** the street, the jar and the star total still work for the session. Test: Task 1, `star total works when localStorage throws`.
5. **Holding at the very end of the street:** Bella stops at the edge, and the camera never shows past the world. Test: Task 1, `world ends stop Bella and the camera`.

---

### Task 1: Street scene, navigation and the star total (implementer)

**Files:**
- Create: `js/scenes/street.js`, and `js/art-town.js` with **placeholder** drawings (see Interfaces; Task 2 replaces the bodies, not the API)
- Modify:
  - `js/core.js`: `from` in enter args, star total, `music` call, `FADE_COLOR`;
  - `js/scenes/title.js`: play goes to `street`;
  - `js/scenes/stars.js`: `home: 'street'`, and `addPoints` adds to the total;
  - `index.html`, `sw.js` (`FILES` only), `README.md`, `AGENTS.md`
- Test:
  - `tests/helpers.js` (new `playStars`),
  - `tests/game.test.js`,
  - `tests/render.test.js` (street shots and street render cost)

**Interfaces:**
- **Core:**
  - `Core.go(name, args)` → the entered scene gets `enter(args)` with `args.from` set to the previous scene's name. The `args` object is created when missing.
  - `Core.stars() -> integer`: the total from `bella.stars`. When the key is missing, it is seeded once from `bella.best` (with the `stella.best` fallback) and stored.
  - `Core.addStars(n)`: adds `n` (n > 0) and stores it.
  - Scene field `music: 'street'|'stars'|null`. On every scene switch the core calls `snd('setPlace', scene.music)` when it is set. Task 3 implements `Sound.setPlace`; until then `Core.snd` ignores it.
  - `FADE_COLOR = '#f7f1e6'` (the cream wall, `Art.PAL.wall`).
  - Header comment updated.
- **Scenes:**
  - `title`: play → `Core.go('street', {hero: {x, y, h}})`. `music: 'street'`.
  - `street`: `home: 'title'`, `clock: true`, `music: 'street'`.
  - `stars`: `home: 'street'`, `music: 'stars'`. `addPoints(n)` also calls `Core.addStars(n)`.
- **`window.Town`** (js/art-town.js). All sprites are CSS-px canvases at DPR, anchored at bottom center (ground contact):
  - `Town.build(M, DPR)`: (re)builds every sprite for this size. Called from `street.resize()`.
  - `Town.sprite(kind, night) -> {c, w, h}`. `w` and `h` are in CSS px. `night` = lit windows.
  - `Town.KINDS`: `['square', 'gate', 'house', 'bakery', 'pond', 'tree', 'bush', 'flowers', 'clothesline', 'fox']`.
  - `Town.lifeSprite(kind) -> {c, w, h}`, anchored at the center, for things that move: `'mouseBalloon'` (the mouse in its basket under the patched balloon) and `'butterfly'`.
  - `Town.groundTile() -> {c, w, h}`: a horizontally repeating street band (path, grass edge).
  - `Town.drawJar(g, x, y, h, total, jiggle)`: the jar on its stand, bottom center at (x, y), `h` tall. It shows `min(total, 60)` small stars piled inside, plus one big star per 50 at the bottom. `jiggle` 0..1 is a squash-and-wobble amount.
  - `Town.drawSign(g, x, y, r, kind, t)`: a round picture sign. `kind` is `'star'` (gate), `'cake'` (bakery) or `'octopus'` (pond). `t` is time, for a soft glow pulse.
  - Placeholders for Task 1: ink-outlined rounded shapes in the right colors and proportions (house about `0.9 * M` tall, gate about `0.8 * M`, jar `0.35 * M`). The scene and tests must not depend on how they look.
- **Pose for walking** (Task 2 draws it, Task 1 sets it):
  - `pose.walk`: 0..1, eased in and out with movement.
  - `pose.stride`: walk phase in cycles. It grows with distance walked, so the hooves don't slide (`stride += |dx| / (hero.h * 0.9)`).
  - `run` stays 0 on the street.
  - `Characters.draw` ignores unknown fields until Task 2.
- **Debug hook** `window.__bella.street`:
  - `st`: `{x, camX, target, walking, dir, jarShow, jiggle}`.
  - `places()`: `[{kind, x, sx, sy, r}]`. `x` is the world x; `sx`/`sy` is the screen center of the tap target; `r` is its radius.
  - `worldW()`.
  - `enter(kind)`: same as a tap on that place.
- **Test helper** `playStars(page)` in `tests/helpers.js`: `tapPlay`, wait for scene `street`, call `__bella.street.enter('gate')`, then wait for `stars` mode `fly`.

**Layout and behavior (decided here; tune by playing, keep the structure):**
- **World size:** `worldW = Math.max(4 * W, 5.5 * M)`. The ground line is at `groundY = H - Math.max(H * 0.14, M * 0.16)`.
- **Places:** world x as fractions of `worldW`, left to right:
  - `square` 0.12, `gate` 0.32, `house` 0.50, `bakery` 0.68, `pond` 0.88;
  - plus trees, bushes and flowers between them;
  - a `bush` at 0.02 and at 0.98 marks the ends.
- **Bella:**
  - Her height is the same as on the start page: `Math.min(H * 0.28, W * 0.55)`. Her hooves stand on `groundY`.
  - From `title` she starts at 0.22. From `stars` she starts at the gate.
- **Camera:** `camX` eases toward `clamp(x - W / 2, 0, worldW - W)`.
- **Parallax:**
  - `Backdrop.draw(g, camX * 0.25)` for the wall, sky and hills;
  - the street layer at 1.0;
  - front flowers at 1.25.
- **Moving:** hold the left or right half to trot that way at `Math.max(0.35 * W, 0.5 * M)` px/s, facing that way. Mirror the rig with `scale(-1, 1)` for left. Release to stop; `pose.walk` eases to 0. `snd('clipClop')` plays each half stride.
- **Places react:**
  - A pointer `down` inside a place's tap target sets `target` and cancels the hold walk. Bella walks there, then:
    - `gate`: `snd('say', 'andiamo')`, then `Core.go('stars', {hero: <Bella's screen box>})`.
    - `square`: the jar jiggles (`jiggle` 1 → 0 over 0.8 s), `jarShow` = 3 s. A row of stars (the total, drawn like the start page's medal row) rises over the jar. `snd('star', ...)` sparkles.
    - `bakery`, `pond`: closed in this step. The house wiggles and sparkles, with `snd('door')`. Nothing opens.
  - Each place with a sign (`gate`, `bakery`, `pond`) bobs it gently when Bella is within `0.6 * M`.
- **Ends:** Bella stops at `[0.04, 0.96] * worldW`.
- **Night:** `Town.sprite(kind, Backdrop.mood() === 'night')`. Fireflies come from the backdrop.
- **Life** (spec "The street"):
  - `clothesline` sits between `house` and `bakery`, and `fox` near `square`.
  - Per frame there are only transforms: the fox sprite sways a few degrees around its feet, and the clothesline sprite flaps a little (a small skew).
  - The mouse balloon drifts slowly across the sky at parallax 0.5 and comes back from the other side.
  - 2–3 butterflies float along sine paths near the flowers.
  - With reduced motion, sways and flaps are halved and the balloon still drifts. Pagi and the bee come with the bakery in step 3.

- [ ] **Step 1: Write the failing tests** (`tests/game.test.js`, using `each` at both sizes unless noted).
  - Change the existing tests that go into the star game to use `playStars(page)`.
  - Change `play starts the star game` into `play goes to the street`:
    - after `tapPlay`, the scene is `street`;
    - `#home` is visible;
    - `goHome()` returns to `title`.
  - `hold right trots right, hold left trots left, release stops`:
    - hold at `(0.85 W, 0.5 H)` for 800 ms: `st.x` grows and `st.walking` is true;
    - release, then after 400 ms: `st.walking` is false and `st.x` stays put (within 1 px over 300 ms);
    - repeat the same on the left half: `st.x` decreases.
  - `tap the sky gate: walks there and enters the star game`:
    - click at the gate's `sx, sy` from `places()` (pan first with `st.x` near the gate if it is off screen);
    - wait for scene `stars`, then mode `fly`.
  - `home from the star game lands by the sky gate`:
    - from `stars`, call `goHome()` and wait for scene `street`;
    - `|st.x - gate.x| < 0.05 * worldW()`.
  - `home goes back one level`: stars → street → title, one `goHome()` each.
  - `stars add to the jar total, seeded from best` (portrait only):
    - set `bella.best = 23` and remove `bella.stars`, then reload;
    - `Core.stars() === 23`;
    - `playStars`, then `addPoints(5)`: `localStorage['bella.stars'] === '28'`.
  - `tap the jar: it jiggles and shows the total`: `enter('square')`, then wait until `st.jarShow > 0` and `st.jiggle > 0`.
  - `tap a place while holding cancels the hold walk`:
    - finger 1 holds the left half;
    - finger 2 taps the gate (two touch points via `page.touchscreen` or CDP `Input.dispatchTouchEvent`);
    - the scene becomes `stars`, with no stuck `walking`.
  - `resize mid-walk keeps Bella in the world and on screen`:
    - hold right, then resize 390x844 → 844x390 during the walk;
    - `0 <= st.x <= worldW()`;
    - Bella's screen x (`st.x - st.camX`) is in `[0, W]`.
  - `double tap on the gate enters the star game once`:
    - click the gate twice, 80 ms apart;
    - count `stars` enters through a counter on the hook (`__bella.stars.enters`, incremented in `enter`): it equals 1.
  - `star total works when localStorage throws`:
    - `evaluateOnNewDocument` makes `localStorage.getItem` / `setItem` throw;
    - `playStars` then `addPoints(3)`: `Core.stars()` grows by 3, and there are no page errors.
  - `world ends stop Bella and the camera`:
    - hold right for 12 s (or set `st.x` near the end and hold 1 s): `st.x <= 0.96 * worldW() + 1` and `st.camX <= worldW() - W + 1`;
    - the same on the left: `st.x >= 0.04 * worldW() - 1` and `st.camX >= -1`.
  - `tests/render.test.js`:
    - shots `street-day`, `street-night` (portrait), `street-landscape-day`, `street-jar`;
    - the street's average render cost at 390x844 DPR 2 is under 8 ms (`frameMs()`, 120 frames, while walking).
- [ ] **Step 2: Run** `cd tests && npm test`. Expected: the new tests FAIL (no `street` scene).
- [ ] **Step 3: Implement** the core changes, `js/art-town.js` with placeholders, `js/scenes/street.js`, and the title/stars/index/sw changes.
- [ ] **Step 4: Run** `cd tests && npm test`. Expected: all pass, with no console errors. Look at `tests/out/street-*.png`.
- [ ] **Step 5: Docs.**
  - `README.md`: how to play, now with the street.
  - `AGENTS.md`:
    - file map: `js/art-town.js`, `js/scenes/street.js`;
    - core: `Core.stars`, `Core.addStars`, `args.from`, `music`;
    - the debug hook `__bella.street`;
    - the save key `bella.stars`;
    - navigation one level back.
- [ ] **Step 6: Commit** `feat: add the street with the sky gate and the star jar`.

### Task 2: The town in the wall style, and Bella's walk (Fable designer)

**Files:**
- Modify: `js/art-town.js` (replace the placeholder bodies, same API), `js/characters.js` (the walk pose)
- Reference:
  - `assets/photos/ref/mural-mushrooms.jpg` (bakery: the big pink mushroom house; other mushroom houses),
  - `mural-house.jpg` (orange house with red roof and tower, round trees, turquoise river, clothesline, fox with balloons),
  - `mural-moon.jpg` (the gate: a puffy blue cloud with the moon's red ladder going up);
  - Bella's photos for the walk.
- Test: `tests/render.test.js`:
  - a town sheet `tests/out/town.png` with every `Town.KINDS` sprite (day and night) and both life sprites, plus the jar at totals 0, 7, 23, 60 and 130, and the three signs;
  - walk frames added to the character sheet (8 phases of `stride`, with `walk = 1`).

**Interfaces:**
- Consumes: `Town` API and pose fields `walk` / `stride` exactly as in Task 1, plus `Art.ink` and `Art.pencil`.
- Produces: the same `window.Town` and `window.Characters` APIs. Anchors stay within ±10 rig units. `Characters.draw` stays under 1 ms.

**What it looks like (spec "The street" and "Style"):**
- **Places:**
  - `bakery`: the big pink bellflower mushroom house with dotted edges, a round yellow door and windows, and a curly stem.
  - `house`: the orange house with a red roof and a small tower.
  - `gate`: a big puffy ink-outlined blue cloud on the ground, with the red ladder rising from it toward the sky.
  - `pond`: a turquoise pool with lily pads and an octopus peeking out, red and smiling, eyes only above the water.
  - `square`: a small round plaza with a stone stand for the jar.
  - `tree`, `bush`, `flowers`: as in the mural.
  - `clothesline`: two posts and a line with little clothes. `fox`: the fox holding balloons, from `mural-house.jpg`.
  - `mouseBalloon` (from `mural-mouse-balloon.jpg`) and `butterfly`: life sprites.
- **Night:** windows glow warm yellow (pre-rendered, no per-frame blur).
- **Jar:** clear glass with an ink outline and a soft highlight. Stars pile from the bottom, never past the neck.
- **Signs:** round, cream, ink rim, a clear picture: a star, a cake, an octopus.
- **Walk:** a gentle four-beat walk (diagonal leg pairs), with a small head nod and tail sway. Bongo bobs with it. At `walk = 0` the pose is the current stand. Both smile.

- [ ] **Step 1: Add** the town sheet and walk frames to `tests/render.test.js`. Run it on the placeholders; this is the baseline.
- [ ] **Step 2: Draw** the town and the walk.
- [ ] **Step 3: Compare** the sheets and `street-*.png` with the mural photos and iterate.
- [ ] **Step 4: Run** `cd tests && npm test`. Expected: all pass, the street renders in under 8 ms, and `Characters.draw` takes under 1 ms.
- [ ] **Step 5: Save** review renders `docs/superpowers/review/step2/` (`town.jpg`, `walk.jpg`, `street-day.jpg`, `street-night.jpg`).
- [ ] **Step 6: Commit** `feat: paint the fairy town and give Bella a walk`.

### Task 3: Street music and sounds (sound designer)

**Files:**
- Modify: `js/audio.js` only

**Interfaces:**
- Consumes: the calls Task 1 makes through `Core.snd`:
  - `setPlace(name)`,
  - `clipClop()`,
  - `door()`,
  - `say('andiamo')`,
  - the existing `star(n)` and `sparkle()`.
- Produces, on `window.Sound` (each wrapped in try/catch, like the rest):
  - `setPlace('street'|'stars')`: picks the day song for that place. The night lullaby stays shared. It crossfades at a bar boundary, like `setMood`. Before `init()`, it is remembered.
  - `clipClop()`: a soft two-tap hoof sound, alternating slightly in pitch, about 0.12 s, gentle. It is played every half stride, so it must not tire the ear.
  - `door()`: a small door chime (2–3 bell notes).
  - Voice cue `andiamo: 'Andiamo!'` in `VOICE_TEXT`. It is not in `RECORDED`.
  - A new **street day song**: cheerful, the same family as the marimba day song, at a walking tempo.
  - Header API list updated.

- [ ] **Step 1: Write the tests** in a new `tests/audio.test.js`, driven over the DevTools protocol on a real-time page (AGENTS.md: offline renders hang under virtual time):
  - every new function exists and does not throw before or after `init()`, muted and unmuted;
  - `setPlace('street')` then `setPlace('stars')` changes the active day song within 2 bars (read through a `_` test hook);
  - no console errors.
- [ ] **Step 2: Run** `cd tests && node --test audio.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** in `js/audio.js`.
- [ ] **Step 4: Run** `cd tests && npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: add the street song, hoof steps and the door chime`.

### Task 4: Publish step 2 to the preview (controller)

- [ ] **Step 1:** Set `VERSION = 'bella-next-3'`, check `FILES` lists the new files, and run `cd tests && npm test`. Commit `chore: bump preview cache to bella-next-3`.
- [ ] **Step 2:** Run `tools/publish-preview.sh . .worktrees/main` and `git status` there. Commit `chore: publish fairy town step 2 preview` on `main`.
- [ ] **Step 3:** Ask the owner before pushing. Then push `town` and `main`, wait for the Pages build, and check:
  - `/` is unchanged;
  - `/next/` has the street;
  - neither page has console errors.
- [ ] **Step 4:** Stop for the owner to try the street. Step 3 (the bakery) starts after their OK.
