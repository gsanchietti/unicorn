# Fairy Town Step 1: Wall Style and Scenes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the game into a shared core plus places ("scenes"), with the star game moved over unchanged, and redraw everything (Bella and Bongo included) in the style of the mural in the child's room.

**Architecture:**
- `js/game.js` is split into `js/core.js` (canvas, loop, input, buttons, fullscreen, save data, scene switching), `js/backdrop.js` (sky, hills, day/night cycle, shared by every place), `js/scenes/title.js` and `js/scenes/stars.js`.
- Art stays code-drawn and pre-rendered into cached sprites. The style change lives in `js/art.js` and `js/characters.js` behind their existing APIs.
- After this step, play goes straight from the start page to the star game. The street comes in step 2.

**Tech Stack:**
- The game: plain HTML/CSS/JS, classic scripts, Canvas 2D, Web Audio, Web Speech, service worker.
- Tests: Node 22 `node:test` with `puppeteer-core` and the system Chrome (`/usr/bin/google-chrome`, override with `CHROME_PATH`).

**Spec:** `docs/superpowers/specs/2026-11-22-fairy-town-design.md` (sections Style, How it's built → Architecture, Delivery order step 1).

## Global Constraints

- No build step. Classic scripts only (no `import`/`export`). The game must still run when `index.html` is opened from disk.
- Touch-first pointer events, 60 fps on mid-range phones, DPR capped at 2, `prefers-reduced-motion` respected, the mute button kept.
- Every new or renamed game file is added to `FILES` in `sw.js`, and `VERSION` is bumped to `bella-v4` at release.
- Audio never breaks the game: every Sound call goes through a try/catch wrapper.
- localStorage access is always inside try/catch. Keys: `bella.best` and `bella.muted`. The old `stella.best` and `stella.muted` are still read as a fallback.
- No text for the child to read. Nothing frightening. Points are never taken away.
- **Style** (spec "Style"):
  - Dark, near-black, slightly uneven ink outlines.
  - Colored-pencil and light-watercolor fill with visible grain.
  - Mural palette and a cream wall-like background. At night, deep blue with the moon and ladder.
  - Bella and Bongo keep their toy eyes.
  - Pencil grain is baked into cached sprites, never generated per frame.
- Commits: conventional commits, ending with `Assisted-by: Claude Code:<model>` and the `Claude-Session:` trailer. No Co-Authored-By, no Signed-off-by.
- **Agent roles** (at most 3):
  - The implementer does tasks 1, 2 and 5.
  - A **Fable-model** designer subagent does tasks 3 and 4.

## Review Focus

1. **Turning the phone or resizing mid-game, during the star game and during a fade:** the hero stays on screen and nothing throws. Test: task 2, `resize mid-game and mid-fade keeps hero on screen`.
2. **Two fingers at once (both hands), then lifting them in either order:** no stuck "held" state, and Bella floats down. Test: task 2, `two pointers released in any order clear hold`.
3. **Double-tapping home or play during a scene fade:** it ends on exactly one scene, entered once. Test: task 2, `double tap during fade enters scene once`.
4. **App sent to the background during a fade, then back:** the fade finishes and audio resumes. Test: task 2, `hidden during fade resumes cleanly`.
5. **A phone with the old offline copy (`bella-v3`) and old `stella.*` saves:** the new files load and the score is kept. Test: task 5, `upgrade from v3 cache keeps best score`.

---

### Task 1: Test harness pinned to today's behavior

**Files:**
- Create: `tests/package.json`, `tests/helpers.js`, `tests/game.test.js`
- Modify: `.gitignore` (add `tests/node_modules/`), `AGENTS.md` (the "how to test" section points to `cd tests && npm test`)

**Interfaces:**
- Produces, from `tests/helpers.js`:
  - `startServer(root) -> Promise<{url, close}>`: a static server on a random port, made with Node's `http` module. It serves `sw.js` with the right MIME type.
  - `openGame(browser, {w, h, mobile}) -> Promise<{page, errors}>`: `errors` collects console errors and warnings, page errors, failed requests and responses with status ≥ 400.
  - `scene(page) -> Promise<string>`
  - `tapPlay(page)`: clicks `(W/2, 0.65·H)`.
  - `hold(page, ms)`
- The tests use only the debug hook. Task 2 must keep this exact shape:
  ```
  window.__bella.scene()            -> 'title' | 'stars'
  window.__bella.stars.st           -> star-game state (mode, score, hero, sinceWash, rainbow, held)
  window.__bella.stars.addPoints(n)
  window.__bella.stars.cleanAll()
  window.__bella.setTime('day'|'sunset'|'night'|'sunrise')
  window.__bella.goHome()
  ```
  - For this task only, add a thin adapter at the end of today's `js/game.js` that exposes this shape: `scene()` maps title mode to `'title'` and any other mode to `'stars'`.

- [ ] **Step 1: Write the tests in `tests/game.test.js`.** Each runs at phone portrait 390×844 and at landscape 844×390, with DPR 2 and touch on. After each test, assert `errors` is empty.
  - `start page ignores taps away from play`: tap `(0.15W, 0.9H)` → `scene() === 'title'`.
  - `play starts the star game`: `tapPlay` and wait 1.5 s → `scene() === 'stars'` and `st.mode` is `'toFly'` or `'fly'`.
  - `hold rises, release floats down`: hold 700 ms → hero y decreases. Release for 900 ms → y increases.
  - `mud, wash, clean gives +5`: set `st.sinceWash = 15` and wait until `st.mode === 'wash'` (≤ 8 s). Call `cleanAll()` and wait for `'fly'` → score grew by exactly 5.
  - `milestone at 10 shows rainbow`: `addPoints(10)` → `st.rainbow` is not null.
  - `home returns to start, play again works`: click `#home` → `'title'`, and `#home` is hidden. `tapPlay` → `'stars'`.
  - `best score saved, old key read`: set `localStorage['stella.best'] = '42'` with no `bella.best` and reload → the start page best is 42. Score points → `bella.best` is updated.
  - `mute persists`: click `#mute` and reload → `aria-pressed === 'true'`.
  - `offline reload works`: load, reload, set offline mode, reload → `window.Characters` is defined and `errors` is empty.
- [ ] **Step 2: Run the tests against the current code.** Run `cd tests && npm install && npm test`. Expected: they fail only for the missing `window.__bella.scene` / `.stars`.
- [ ] **Step 3: Add the adapter** at the end of `js/game.js` exposing the hook shape above.
- [ ] **Step 4: Run** `cd tests && npm test`. Expected: all pass.
- [ ] **Step 5: Commit.** Message `test: add headless Chrome tests for the game`.

### Task 2: Core and scenes split (behavior unchanged)

**Files:**
- Create: `js/core.js`, `js/backdrop.js`, `js/scenes/title.js`, `js/scenes/stars.js`
- Delete: `js/game.js`
- Modify:
  - `index.html`: script order `art.js, characters.js, audio.js, core.js, backdrop.js, scenes/title.js, scenes/stars.js`, then a tiny inline `Core.start('title')`.
  - `sw.js`: `FILES`.
  - `README.md` and `AGENTS.md`: the file map.
- Test: `tests/game.test.js` (add the Review Focus 1–4 tests)

**Interfaces:**
- Consumes: the debug hook shape from Task 1, which must stay identical.
- Produces `window.Core`:
  - `Core.W, Core.H, Core.M, Core.DPR`: read-only, updated on resize.
  - `Core.ctx`: the 2D context.
  - `Core.register(name, scene)`
  - `Core.go(name, args)`: a 0.4 s fade out, then `exit()` on the old scene and `enter(args)` on the new one, then a fade in. Input is ignored during a fade. A second `go` during a fade is dropped.
  - `Core.current() -> string`
  - `Core.start(name)`
  - `Core.snd(name, ...args)`: the safe Sound call, moved from `snd()` in game.js.
  - `Core.load(key, fallbackKeys[]) -> string|null` and `Core.store(key, value)`: localStorage wrapped in try/catch. `load` tries `key`, then each fallback key.
  - `Core.goFullscreen()`: moved from game.js. Leaving full screen calls `Core.go('title')` if the current scene isn't `'title'`.
  - `Core.after(sec, fn)`: timers scoped to the current scene, cleared on scene change.
  - **Buttons:** the core owns `#mute` and `#home`. `#home` is shown when `scene.home` is a scene name, and a click goes there (exiting full screen first, as today). `body.playing` is set when the current scene isn't `'title'`.
  - **Visibility:** `visibilitychange` pauses the loop and calls `Core.snd('suspend')` / `Core.snd('resume')`.
  - **Pointers:** the core tracks pointers with capture and calls `scene.pointer(type, p)`, where `type` is `'down' | 'move' | 'up'` and `p = {id, x, y, dx, dy}`. On `pointercancel`, blur and hide, it sends `'up'` for every tracked pointer.
- **Scene shape:**
  ```
  {
    home: string|null,
    clock: bool,              // whether the day/night cycle runs here
    enter(args), exit(),
    update(dt), render(g),
    pointer(type, p),
    resize()
  }
  ```
- Produces `window.Backdrop`:
  - `Backdrop.build()`: called by the core on resize.
  - `Backdrop.update(dt)`: advances the cycle only when the scene's `clock` is true. The cycle is `{day: 75, sun: 12, night: 50, rise: 12}` seconds, moved from game.js `CYC`, and it calls `setMood` as today.
  - `Backdrop.draw(g, scrollX)`
  - `Backdrop.setTime(phase)`
  - `Backdrop.mood() -> 'day'|'night'`
- **Scenes:**
  - `title` (`home: null`, `clock: false`): the start page as today. The play button at `(W/2, 0.65·H)` with radius `0.14·M`, and a hit radius of 1.35×. It calls `Core.goFullscreen()` and then `Core.go('stars', {hero: {x, y, h}})`.
  - `stars` (`home: 'title'`, `clock: true`): all of today's fly/toWash/wash/clean/toFly logic. `enter(args)` starts the game, flying from `args.hero`.

- [ ] **Step 1: Add the failing tests to `tests/game.test.js`.**
  - `resize mid-game and mid-fade keeps hero on screen`: during `'fly'`, resize 390×844 → 844×390, and resize again right after clicking `#home`. After 1 s, the hero y is within `[0, H]` and `errors` is empty.
  - `two pointers released in any order clear hold`: two touch points down via CDP `Input.dispatchTouchEvent`. Release the first, then the second → `st.held === false`, and the hero y increases over 900 ms.
  - `double tap during fade enters scene once`: wrap `Core.register`'d `stars.enter` with a counter, then `tapPlay` twice 100 ms apart → the counter is 1 and `scene() === 'stars'`.
  - `hidden during fade resumes cleanly`: click `#home`, then dispatch `visibilitychange` with `document.hidden` stubbed true and then false → `scene() === 'title'` within 2 s.
- [ ] **Step 2: Run** `cd tests && npm test`. Expected: the new tests fail (no `Core`), and the Task 1 tests pass.
- [ ] **Step 3: Implement the split** with the interfaces above. Move the code; don't rewrite gameplay. Remove `js/game.js` and its adapter. The debug hook is now assembled from `Core`, `Backdrop` and the `stars` scene.
- [ ] **Step 4: Run** `cd tests && npm test`. Expected: all pass. Also open `index.html` from disk in Chrome and check that the start page draws.
- [ ] **Step 5: Commit.** Message `refactor: split the game into core and scenes`.

### Task 3: Wall-style art kit and world (Fable designer)

**Files:**
- Modify: `js/art.js`, `js/backdrop.js` (painting only), `style.css` (the `.paper` overlay retuned to a painted-wall grain, and the `#title` text in ink style), `tools/icons.html` (only if the icon background helpers change)
- Reference: `assets/photos/ref/mural-*.jpg`
- Test: `tests/game.test.js`, plus `tests/render.test.js` (new: screenshots for review)

**Interfaces:**
- Consumes: `Backdrop` from Task 2.
- Produces: `window.Art` keeps every existing export name and signature (see `window.Art = {…}` at the end of `js/art.js`), so the scenes don't change. New exports:
  - `Art.ink(g, width)`: sets the ink stroke style: near-black `#2b2230`, round joins, width scaled.
  - `Art.pencil(spriteCanvas, color, seed)`: overlays a cached pencil-grain texture on a sprite's filled area (source-atop), made once per sprite.
  - `Art.PAL` mural keys: `wall`, `wallNight`, `river`, `riverDeep`, `leaf`, `leafDeep`, `roof`, `orange`, `mushroom`, `mushroomDeep`, `plum`, `cloud`, `cloudDeep`, `moon`, `star`, `ink`.
- **What gets redrawn, from the mural photos:**
  - Wall background (cream, with faint brush texture), and sunset and night versions.
  - Hills become the mural's grass and river bands.
  - Clouds: puffy blue mural clouds with ink outlines.
  - Stars: soft yellow 5-point stars with ink outlines that still glow and pulse.
  - The moon: a yellow crescent with the red ladder.
  - Mud splotches, soap bubbles, sponge, play button, medal, tap hint, rainbow and confetti colors, all in the same ink-and-pencil look.

- [ ] **Step 1: Write `tests/render.test.js`.**
  - It saves screenshots to `tests/out/` for: the start page at phone portrait, phone landscape and tablet 1024×768; flying in day, sunset and night (`setTime`); wash; milestone.
  - It asserts `errors` is empty.
  - It asserts an average `render` cost under 8 ms per frame at 390×844 DPR 2, measured over 120 frames through `window.__bella.frameMs()`, a new hook added in the core.
  - Add `tests/out/` to `.gitignore`.
- [ ] **Step 2: Run it on the current art.** Expected: pass, which gives baseline screenshots and cost.
- [ ] **Step 3: Restyle `js/art.js` and the backdrop painting.** Compare the screenshots side by side with the mural photos and iterate until they match the spec's Style list.
- [ ] **Step 4: Run** `cd tests && npm test`. Expected: all pass, and the render cost is under 8 ms.
- [ ] **Step 5: Commit.** Message `feat: redraw the world in the bedroom-wall style`.

### Task 4: Bella and Bongo in the wall style (Fable designer)

**Files:**
- Modify: `js/characters.js`
- Reference: `assets/photos/bella.jpg`, `assets/photos/bongo.jpg`, `assets/bella.png`, `assets/bongo.png`, `assets/photos/ref/mural-*.jpg` (line and fill only)
- Test: `tests/render.test.js` (add character sheets)

**Interfaces:**
- Consumes: `Art.ink` and `Art.pencil` from Task 3.
- Produces: the same `window.Characters` API (`W`, `H`, `prerender(ppu)`, `draw(g, pose, ppu)`, `anchors` with the same names and positions within ±10 rig units). Pose fields stay unchanged: `t, run, wave, happy, look, glow, face`.
- **What changes:**
  - Ink outlines replace the lilac lines.
  - The fill gets pencil grain.
  - The toy eyes, smiles, knees, horn and butterfly lights, Bongo's profile, head turn and pom-pom tail are all kept.

- [ ] **Step 1: Add the character sheet to `tests/render.test.js`.**
  - It saves `tests/out/characters.png`: standing, 6 gallop frames, Bongo front and profile, happy, at 300 px and at 900 px tall.
  - It asserts that `Characters.draw` averages under 1 ms over 500 calls at fly scale.
- [ ] **Step 2: Run it.** Expected: pass on the current art, which gives the baseline.
- [ ] **Step 3: Restyle the parts** in `js/characters.js`. Compare the result with the photos, so the faces still look like the toys.
- [ ] **Step 4: Run** `cd tests && npm test`. Expected: all pass.
- [ ] **Step 5: Commit.** Message `feat: redraw Bella and Bongo in the wall style`.

### Task 5: Release step 1

**Files:**
- Modify: `sw.js` (`VERSION = 'bella-v4'`, `FILES` complete), `assets/icons/*` (re-rendered from `tools/icons.html` in the new style), `README.md`, `AGENTS.md` (architecture, scenes, new style, how to test)
- Test: `tests/game.test.js`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Add the failing test** `upgrade from v3 cache keeps best score`.
  - Serve the commit before Task 2 (`git worktree add` of `ae4bb88` into a temp folder) and load it, so the `bella-v3` service worker installs.
  - Set `stella.best = '17'`.
  - Switch the server root to the working tree and reload twice.
  - Expect `window.Core` to be defined, the best score to be 17, and `caches.keys()` to equal `['bella-v4']`.
- [ ] **Step 2: Run it.** Expected: it fails while `VERSION` is still `bella-v3`.
- [ ] **Step 3: Bump `VERSION`, complete `FILES`, re-render the icons and update the docs.**
- [ ] **Step 4: Run** `cd tests && npm test`. Expected: all pass. Then check by eye the screenshots in `tests/out/`.
- [ ] **Step 5: Commit and publish.** Commit with message `feat: release the wall style and scenes`, then `git push origin main`. Wait until `gh api repos/gsanchietti/unicorn/pages/builds/latest` reports `built` for the pushed commit.
- [ ] **Step 6: Stop for the owner's review.** Per the spec, step 2 starts only after the owner approves the new look of Bella and Bongo.
