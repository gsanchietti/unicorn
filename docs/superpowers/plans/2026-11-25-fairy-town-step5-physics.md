# Fairy Town Step 5: Physics Extras Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The last step of the new world:
- a real star jar where every earned star drops in and piles up, with Matter.js;
- squishy clouds that bounce Bella into a small hop;
- bubbles that bump each other in the pond and in the star game's wash.

**Architecture:**
- **Matter.js** (MIT, compatible with GPL-3.0) is vendored as `js/vendor/matter.min.js` with its license, loaded as a classic script and cached by the service worker. It is used only for the jar.
- **`js/physics.js`** (`window.Phys`) holds the jar world (a thin wrapper over Matter) and two small hand-made helpers:
  - a damped spring, for the cloud squish;
  - a circle separation pass, for bumping bubbles.

  The spec leaves "Matter.js or hand-made circles" to the builder. Bubbles stay hand-made because there are at most 24, and that is cheaper on phones.
- The street draws the jar's stars from the physics bodies. `Town.drawJar` gains an optional `bodies` argument.

**Tech Stack:** plain HTML/CSS/JS (classic scripts, Canvas 2D), Matter.js 0.19.0 vendored. Tests use Node 22 `node:test` with `puppeteer-core`.

**Spec:** `docs/superpowers/specs/2026-11-22-fairy-town-design.md`, sections "Physics extras", "The street" (town square jar) and "Delivery order" step 5.

## Global Constraints

- Every hard rule in `AGENTS.md` holds:
  - nothing to read, and the total is never shown as a number;
  - no game over, points never subtracted;
  - one touch;
  - 60 fps: the physics step is under 1 ms per frame on the test machine, and it runs only while the jar is on screen;
  - no per-frame `shadowBlur`/filters;
  - `file://` works: the vendored file is a classic script, with no `fetch`;
  - no `getImageData`; audio only through `Core.snd`.
- **The jar** (spec):
  - at most about 60 bodies;
  - every 10 older stars merge into one big star at the bottom, so the jar never overflows;
  - shown on the town square, and briefly after each game.
- **Squishy clouds** (spec): when Bella touches a cloud in the star game, it squashes and wobbles like jelly (a spring) and pushes her into a small upward hop with `snd('boing')`. The hop is capped so she stays on screen, and it works even while held.
  - On the street, Bella never flies. There, a tap on a backdrop cloud squishes it with a boing. That is the "street sky" part, made for one finger.
- **Bubble bumping** in the pond and in the star game's wash: bubbles push apart softly and wobble. No bubble pushes an octopus or Bella.
- `sw.js`:
  - add `js/vendor/matter.min.js` and `js/physics.js` to `FILES`;
  - `VERSION` goes up at publish.
- `index.html`: `js/vendor/matter.min.js`, then `js/physics.js`, right after `js/art.js`.
- `LICENSE` stays GPL-3.0. Add `js/vendor/LICENSE-matter.txt` (MIT, from the package) and a "Third-party" line in `README.md`.
- Commits: conventional, ending with `Assisted-by: Claude Code:<model>`. Push only with the owner's OK.
- Agent roles:
  - the implementer does Tasks 1 and 2,
  - the sound designer does Task 3 (isolated worktree, in parallel),
  - the controller does Task 4.

## Review Focus

1. **A huge total (5000 stars) or a corrupt `bella.stars`:**
   - the jar builds at most 60 bodies, with big stars for the rest;
   - no freeze, and it is built once, not per frame.
   - Test: `a huge total keeps the jar small`.
2. **Coming back to the street after a game with many new stars (60+):** the drops are spread over time (at most 3 per 0.2 s), and the merge keeps the bodies at 60 or fewer. Test: `many new stars drop in without overflowing`.
3. **A cloud hop while held at the top:** Bella stays inside `heroLimits()`, and holding still works after the hop. Test: `cloud hop stays on screen while held`.
4. **The jar off screen while walking, or the app hidden:** the physics doesn't run (step count stops growing). Test: `jar physics sleeps off screen`.
5. **Resize while stars settle:** bodies stay inside the jar (`0..1` in jar space). Test: `resize keeps the stars inside the jar`.

---

### Task 1: The physics star jar (implementer)

**Files:**
- Create:
  - `js/vendor/matter.min.js` (Matter.js 0.19.0, from `https://cdn.jsdelivr.net/npm/matter-js@0.19.0/build/matter.min.js`; check it is the MIT build and keep its header comment);
  - `js/vendor/LICENSE-matter.txt`;
  - `js/physics.js`.
- Modify:
  - `js/art-town.js`: `drawJar` gains an optional `bodies`, drawing those instead of the static pile;
  - `js/scenes/street.js`;
  - `index.html`, `sw.js` (`FILES`), `README.md`, `AGENTS.md`.
- Test: `tests/game.test.js`, `tests/render.test.js`

**Interfaces:**
- **`Phys.jar`:**
  - `Phys.jar.create(seedTotal)` returns a jar world in **jar space**. Jar space is a unit box (x 0..1, y 0..1, y down), with the inner glass walls as Matter static bodies: a rounded bottom and straight sides up to the neck at y 0.18.
    - From `seedTotal`, it makes the starting pile right away, settled with no animation: `big = Math.min(Math.floor(seedTotal / 10), 50)` big stars and `small = seedTotal % 10` small ones. That is at most 60 bodies. Past 500 the jar simply looks full.
  - `.drop(n)`: queues `n` new small stars that fall from the neck (at most 3 per 0.2 s).
  - `.step(dt)`: fixed 1/60 substeps, at most 3 per call.
  - `.bodies()`: returns `[{x, y, a, big}]`.
  - `.count()`, `.steps()`: the step counter, for tests.
  - When the small stars reach 20, the 10 lowest small ones merge into one big star at the bottom (a soft sparkle, `snd('star', 9)`).
- **`Phys.spring`:**
  - `Phys.spring(k, damp)` returns `{x, v, kick(v0), step(dt)}`: a damped spring around 0.
  - Defaults: `k = 120`, `damp = 9`.
- **`Phys.separate(circles, iterations)`:** pushes overlapping `{x, y, r}` circles apart along their center line by half the overlap each. Default `iterations = 2`. In place, O(n²) with n ≤ 24.
- **`Town.drawJar(g, x, y, h, total, jiggle, bodies)`:**
  - when `bodies` is given, it draws the cached jar back, then each body with `Art.starSprite` (small, or big at 2.2x) at jar space → screen, rotated by `a`, then the cached glass front;
  - without `bodies`, it is unchanged.
- **Street:**
  - The town square's jar uses a `Phys.jar` built on `enter` from `Core.stars()`. It steps only while the jar is within the screen ±`L.u` and the page is visible.
  - **After each game:** when entering the street with `args.from` in `stars`, `bakery` or `pond`, and the total grew since the street was last shown, a small copy of the jar pops up for 3 s next to Bella (top center of the screen, `0.22 u` tall). The new stars `.drop()` into it, then it slides away. The square's jar shares the same world.
  - The street remembers the last shown total in memory, not in storage.
- **Debug hook** additions to `__bella.street`:
  - `jar()` returns `{count, steps, bodies}`;
  - `st.jarPop` is the seconds left of the after-game pop-up.

- [ ] **Step 1: Write the failing tests** (portrait unless noted):
  - `the jar fills from the total`:
    - set `bella.stars = 37` and enter the street;
    - `jar().count` is between 4 and 60, and the big stars are 3;
    - shot `street-jar-physics`.
  - `stars from a game drop into the jar`:
    - `playStars`, then `addPoints(4)`, then `goHome()`;
    - `st.jarPop > 0`, and within 3 s `jar().count` grew by 4.
  - `many new stars drop in without overflowing`: `addPoints(75)`, then home. After 8 s `jar().count <= 60`, and the big stars grew.
  - `a huge total keeps the jar small`: `bella.stars = 5000`, then enter. `jar().count <= 60`, with no page errors and `frameMs() < 8`.
  - `jar physics sleeps off screen`: walk far from the square (`st.x` near the pond). `jar().steps` stays the same over 1 s.
  - `resize keeps the stars inside the jar`: rotate during the drops. All bodies stay within 0..1 in jar space.
  - **Matter is loaded from file://:** a test that opens `index.html` through a `file://` URL and checks `typeof Matter === 'object'`, with no errors.
  - Street render cost with the jar settling is under 8 ms.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Vendor Matter, write `js/physics.js` with the jar and the two helpers, then change `drawJar` and the street.
- [ ] **Step 4: Run** `cd tests && npm test`. Expected: all pass, with no console errors.
- [ ] **Step 5: Docs.**
  - `README.md`: the jar, and the third-party line.
  - `AGENTS.md`: file map (`js/vendor/`, `js/physics.js`), script order, the hook, the jar rules.
- [ ] **Step 6: Commit** `feat: a real star jar where every star drops in`.

### Task 2: Squishy clouds and bumping bubbles (implementer)

**Files:**
- Modify: `js/scenes/stars.js`, `js/scenes/pond.js`, `js/scenes/street.js` (tap to squish backdrop clouds), `js/backdrop.js` (expose the far-cloud positions for the street tap, and a per-cloud squish value), `AGENTS.md`
- Test: `tests/game.test.js`, `tests/render.test.js`

**Interfaces:**
- Consumes `Phys.spring` and `Phys.separate` from Task 1.
- **Star game:**
  - When Bella's body circle touches a cloud (the cloud already has a cooldown `cd`), the cloud gets `Phys.spring().kick(...)`. Its sprite draws with a squash `scale(1 + s, 1 - s)` around its center, `s` clamped to ±0.25.
  - Bella gets `vy -= hopV`, with `hopV = 0.9 * M` px/s, capped so that the apex stays at or below `heroLimits().top`.
  - `snd('boing')`. The cooldown is 0.6 s per cloud.
- **Wash bubbles** (star game) and **pond bubbles:** call `Phys.separate(bubbles, 2)` every frame after moving them. The wobble is already drawn; leave it.
- **Street:**
  - a tap on a backdrop far-cloud (the hit test uses `Backdrop.cloudsOnScreen(camX * 0.25)`, which returns `[{i, x, y, r}]`) calls `Backdrop.squish(i)` and `snd('boing')`;
  - a tap on a place still wins over a cloud;
  - hold-walking is unchanged, because cloud taps only act on `down` in the upper half above the street band.
- **Debug hooks:**
  - `__bella.stars.st.hops` counts the hops;
  - `__bella.pond.overlap()` returns the summed bubble overlap in px.

- [ ] **Step 1: Write the failing tests:**
  - `touching a cloud makes Bella hop`:
    - put a cloud right in front of the hero;
    - within 2 s `st.hops` grows by 1, and the hero's `y` went up then came back down.
  - `cloud hop stays on screen while held`: hold at the top and feed 3 clouds in a row. The hero's `y` stays at or above `heroLimits().top - 1`.
  - `pond bubbles push apart`: shoot 12 bubbles quickly. After 0.5 s, `overlap()` is under 4 px in total.
  - `wash bubbles push apart`: in `wash`, rub fast for 1 s. The wash bubbles' overlap is small (the same kind of hook on `__bella.stars`).
  - `tap a street cloud squishes it`: tap a backdrop cloud. Its squish is non-zero, and the scene is still `street`.
  - The render cost is unchanged within budget in the star game, the pond and the street.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `cd tests && npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: squishy clouds that bounce Bella, and bubbles that bump`.

### Task 3: Jar sounds (sound designer, isolated worktree, in parallel with Task 1)

**Files:** `js/audio.js`, `tests/audio.test.js` only

**Interfaces:**
- `clink()`: a tiny glass "tink" for each star landing in the jar. It is very soft, with a slightly random pitch, and plays at most 8 per second.
- `jarPop()`: a soft "whoop" when the after-game jar appears.
- The existing `boing()` is reused for clouds. Check that it suits repeated play, softening it if needed without changing its name.

- [ ] Write the tests: the functions exist and don't throw before or after `init()`, muted and unmuted; and the click test (first and last samples near 0). Implement. Run `node --test audio.test.js`. Commit `feat: add the jar clink and pop`.
- **Coordination:** Task 1 calls `snd('clink')` when a dropped star first touches the pile, and `snd('jarPop')` when the pop-up appears. Both are no-ops until Task 3 is merged.

### Task 4: Publish step 5 to the preview (controller)

- [ ] Bump `VERSION`, check that `FILES` lists the vendored file, run `npm test`, commit.
- [ ] Run `tools/publish-preview.sh . .worktrees/main`. Check that `next/js/vendor/matter.min.js` is copied (the script copies `js/` recursively), then commit on `main`.
- [ ] Ask the owner, then push both. Check the Pages build, that `/` is unchanged, and on `/next/` that stars drop into the jar after a game.
- [ ] Stop for the owner's review. After their OK, the final whole-branch review comes next, then `town` replaces the live game when the owner says so.
