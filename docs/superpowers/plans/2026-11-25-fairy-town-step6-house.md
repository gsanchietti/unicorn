# Fairy Town Step 6: Hide and Seek in the House Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the orange house on the street. Inside, the friends hide behind the furniture, and she finds them with one finger:
- a tap on a hiding spot makes it wiggle;
- a friend there pops out giggling and gives a star;
- a friend who peeks out doesn't wait forever: after a few seconds it scurries to another spot.

**Architecture:**
- A new scene, `js/scenes/house.js`.
- Its painted pieces come from a new `js/art-house.js` (`window.House`). Each furniture spot has a **back** and a **front** layer; a friend is drawn between them, so only a peek (ears, a tail) shows.
- The friends use the existing `Friends.draw` (husky, Pagi, mouse, lizard) and `Friends.octopus` (red side).
- Same pattern as before:
  - the implementer builds the scene on placeholders with a fixed API,
  - the Fable designer paints,
  - the sound designer adds audio in parallel, in an isolated worktree.

**Tech Stack:** plain HTML/CSS/JS (classic scripts, Canvas 2D). Tests use Node 22 `node:test` with `puppeteer-core`.

**Spec:** `docs/superpowers/specs/2026-11-22-fairy-town-design.md`, "Delivery order" step 6 (hide and seek, with the owner's "be quick" rule), plus "Style" and "Constraints".

## Global Constraints

- Every hard rule in `AGENTS.md` holds:
  - nothing to read, no game over, no wrong taps (an empty spot just wiggles), points never subtracted;
  - one finger; every spot's tap target at least `0.14 * M` across;
  - 60 fps with nothing expensive per frame;
  - `file://` works, no `getImageData`, classic scripts;
  - audio only through `Core.snd`, storage only through `Core.load` / `Core.store`.
- **Be quick** (owner, spec):
  - one friend at a time peeks out (ears or tail show, its spot rustles);
  - if she doesn't tap it within `wait`, it scurries **in plain sight**, giggling, to another free spot and hides there;
  - `wait` starts at 5 s, goes down by 0.5 s for each friend found in a row (without a scurry in between), never below 2.5 s, and resets to 5 s when everyone has been found;
  - nothing is lost when a friend scurries: no fail sound, no points taken.
- **Generous:** a tap on a spot where a friend hides but isn't peeking also finds it (a surprise pop-out).
- **Stars:** 1 per friend found, through `Core.addStars`, exactly once per find. When all 5 are found:
  - they all pop out and cheer together;
  - confetti, `fanfare`, `say('bravissima')`;
  - +2 bonus stars;
  - after 3 s they run off and hide again in new spots.
- **Navigation:**
  - `house` has `home: 'street'`, `clock: false`, `music: 'house'`;
  - the street's `house` place opens it (`Core.go('house')`);
  - coming back with `args.from === 'house'`, Bella stands at its door;
  - the house is no longer a closed place.
- **Friends cache:** `Friends.build(h, DPR)` must become a no-op when called again with the same `h` and `DPR`. Every scene that draws friends (bakery, pond, house) calls it in `enter()` with its own `h`, so a scene never shows another scene's friend size.
- `sw.js`:
  - add `js/art-house.js` and `js/scenes/house.js` to `FILES`;
  - `VERSION` goes up at publish.
- `index.html`: `js/art-house.js` after `js/art-pond.js`; `js/scenes/house.js` after `js/scenes/pond.js`.
- Commits: conventional, ending with `Assisted-by: Claude Code:<model>`. Push only with the owner's OK.

## Review Focus

1. **Tapping the peeking spot at the very moment the friend starts to scurry:** found exactly once, never found and scurried both. Test: `a tap during the scurry start finds once`.
2. **Tapping many spots fast:** each wiggles, no double stars, and never more than one friend scurrying at a time. Test: `rapid taps on every spot`.
3. **Leaving mid-round and coming back:** a fresh round, nothing lost or doubled, and the street puts Bella at the house. Test: `home mid-round and back starts fresh`.
4. **Resize or rotation:** the spots re-lay out on screen, every friend stays assigned to its spot, and the tap targets stay on screen. Test: `resize keeps spots and friends`.
5. **The bakery after the house** (and the pond after the house): each shows its own friend size. Test: `friend sizes stay right across scenes`.

---

### Task 1: House scene, hide and seek, navigation (implementer)

**Files:**
- Create: `js/scenes/house.js`, and `js/art-house.js` with **placeholder** drawings (Task 2 replaces the bodies, not the API)
- Modify:
  - `js/friends.js`: only the same-size no-op in `build` (and `buildOctopus`);
  - `js/scenes/bakery.js` and `js/scenes/pond.js`: call `Friends.build` in `enter()`;
  - `js/scenes/street.js`: the house opens; arrive at its door;
  - `index.html`, `sw.js` (`FILES` only), `README.md`, `AGENTS.md`.
- Test:
  - `tests/game.test.js`, plus a `playHouse(page)` helper in `tests/helpers.js`;
  - `tests/render.test.js` (house shots and cost).

**Interfaces:**
- **`window.House`** (`js/art-house.js`). It pre-renders in `House.build(u, DPR)`.
  - `House.room(W, H) -> canvas`: the full-screen room. A cream-orange wall with a window and a rug, matching the orange house from the street.
  - `House.SPOTS = ['sofa', 'curtain', 'basket', 'wardrobe', 'plant', 'table', 'armchair', 'toybox']`.
  - `House.spot(kind) -> {back: {c, w, h}, front: {c, w, h}, hide: {x, y, h}}`.
    - `back` and `front` are anchored at bottom center.
    - `hide` gives where a friend's bottom center sits, and its height, relative to the spot's bottom center, so that a hidden friend is fully covered by `front`.
    - `peek` raises the friend by `0.35 * hide.h`, so the ears or tail show above or beside `front`.
- **Layout:**
  - `u = Math.min(M, 0.9 * H)`;
  - 8 spots in 2 rows (portrait) or 1 to 2 rows (landscape), on the floor line and on a shelf, each scaled to fit;
  - Bella stands small by the door on the left at the flying-scale ppu (`Math.min(H * 0.42, W * 0.52) / Characters.H * DPR`), and is `happy` on each find.
- **Flow** (`st.mode`):
  - `hide`: the friends run to random distinct spots (1.2 s, scurry);
  - `seek`: every 0.8–1.5 s, if nobody is peeking, one unfound hidden friend starts peeking (`snd('rustle')`, the spot wiggles a little).
    - Its `peekT` counts up. When `peekT >= wait`, it scurries to a free spot (`snd('scurry')`, `snd('giggle')`, 0.9 s visible run) and stops peeking. `inRow = 0`.
    - **Tap a spot:** it wiggles (`snd('rustle')`). If a friend hides there, peeking or not, it is found:
      - it pops up with `snd('giggle')` and `say('trovato')` (at most every 3 s);
      - +1 star flies to the top-left row;
      - it stands next to Bella and waves until the round ends;
      - `inRow++`, and `wait = Math.max(2.5, 5 - 0.5 * inRow)`.
  - `party`: all 5 found. The cheer, the +2 bonus, `say('bravissima')`. After 3 s → `hide`, a new round with `wait = 5` and `inRow = 0`.
- **The 5 friends:** husky, Pagi, mouse, lizard, octopus (red, smiling). They use `Friends.draw(g, kind, x, y, {t, state: 'sit'|'walk'|'happy', p})` and `Friends.octopus(...)` at the house's friend height (`0.22 u`).
- **Debug hook** `window.__bella.house`:
  - `st`: `{mode, found, inRow, wait, round, enters}`;
  - `spots()`: `[{id, kind, x, y, r, friend, peek, peekT}]` on screen (`friend` is a kind or `null`);
  - `peek(id)`: forces that spot's friend to peek now.
- **Test helper** `playHouse(page)`: `tapPlay`, wait for `street`, call `__bella.street.enter('house')`, then wait for scene `house` and mode `seek`.

- [ ] **Step 1: Write the failing tests** (both sizes unless noted):
  - `the house opens from the street`: `playHouse`. Then `#home` is visible, and `goHome()` lands at the house door (`|st.x - house.x| < 0.05 * worldW()`).
  - `tap a peeking friend finds it and gives a star`: `peek(id)`, then tap its spot. `found` grows by 1 and `Core.stars()` by 1.
  - `tap a hidden friend also finds it`: tap a spot with a friend that isn't peeking. Found +1.
  - `an empty spot just wiggles`: tap an empty spot. `found` and the stars are unchanged, and there are no errors.
  - `a slow tap lets the friend scurry`:
    - `peek(id)`, then wait `wait + 1.2` s;
    - that friend is now in another spot, `inRow === 0`, and the stars are unchanged.
  - `quick finds shorten the wait, never below 2.5 s`: find 4 in a row quickly. `wait === 3`. Then, through the hook, set `inRow = 10` and find 1 more: `wait === 2.5`.
  - `finding all five makes a party and a new round` (portrait):
    - find all 5: mode `party`, and the stars grew by 7 in total (5 + 2);
    - within 4 s mode `seek`, `round` grew by 1, `wait === 5`.
  - `a tap during the scurry start finds once`, `rapid taps on every spot`, `home mid-round and back starts fresh`, `resize keeps spots and friends`, `friend sizes stay right across scenes`: these are the Review Focus tests. For the last one, read a friend-height hook (`__bella.bakery.friendH`) after visiting the house, then the bakery.
  - **Changes to existing tests:** the street's closed-places test is removed (no closed places are left), or kept for nothing. Remove it.
  - `tests/render.test.js`:
    - shots `house-seek`, `house-peek`, `house-party`, `house-landscape`;
    - the house's render cost is under 8 ms.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `cd tests && npm test`. Expected: all pass, with no console errors.
- [ ] **Step 5: Docs.**
  - `README.md`: how to play hide and seek.
  - `AGENTS.md`: file map, script order, the house section, the hook, and the `Friends.build` rule.
- [ ] **Step 6: Commit** `feat: hide and seek in the house`.

### Task 2: The house in the wall style (Fable designer)

**Files:**
- Modify: `js/art-house.js` (replace placeholder bodies)
- Reference:
  - `assets/photos/ref/mural-house.jpg`: the orange house with the red roof, so the room is its inside: warm orange walls, round window, wooden floor.
  - `mural-mushrooms.jpg` (dotted trims).
- Test: `tests/render.test.js`, which adds a house sheet `tests/out/house-sheet.png`:
  - every spot's back and front, side by side;
  - each spot again with a placeholder friend at `hide` and at peek, so the cover reads right.

**Interfaces:** the `House` API exactly as in Task 1. The house render stays under 8 ms.

**What it looks like:**
- Cozy and round, the mural style (ink, pencil grain), nothing scary.
- The hiding furniture:
  - a plump sofa with cushions;
  - long curtains by the window, where friends peek at the side;
  - a wicker basket with a blanket;
  - a wardrobe with a door a little open;
  - a big potted plant;
  - a table with a long cloth;
  - an armchair;
  - a toy box with a lid.
- The fronts must hide a friend fully at `hide`, and show ears or a tail at peek.

- [ ] **Step 1: Add** the sheet. Run it on the placeholders.
- [ ] **Step 2: Draw.** Compare with the mural, and check every friend at peek.
- [ ] **Step 3: Run** `cd tests && npm test`. Expected: all pass.
- [ ] **Step 4: Save** `docs/superpowers/review/step6/` (`house-sheet.jpg`, `house-seek.jpg`, `house-peek.jpg`, `house-party.jpg`).
- [ ] **Step 5: Commit** `feat: paint the house and its hiding places`.

### Task 3: House music, sounds and voices (sound designer, isolated worktree, in parallel with Task 1)

**Files:** `js/audio.js`, `tests/audio.test.js` only. The controller adds the README and AGENTS lines.

**Interfaces:** the calls from Task 1:
- `setPlace('house')`: a sneaky-playful tiptoe day song (pizzicato and soft bells), in the same family. The night lullaby stays shared.
- `rustle()`: soft fabric or leaf rustle, about 0.3 s, rate-limited to 4/s.
- `scurry()`: quick soft tippy-taps, about 0.8 s.
- Voices `trovato: 'Trovato!'` and `cucu: 'Cucù!'` in `VOICE_TEXT` (not `RECORDED`). Task 1 plays `say('cucu')` when a friend starts peeking, at most every 6 s.
- The existing `giggle`, `fanfare` and `bravissima` are reused.

- [ ] Write the tests (the functions exist and never throw, the song switches within 2 bars, the voices are present, the click test). Implement. Run `node --test audio.test.js`. Commit `feat: add the house song, rustles and scurries`.

### Task 4: Publish step 6 to the preview (controller)

- [ ] Bump `VERSION`, check `FILES`, run `npm test`, commit.
- [ ] Run `tools/publish-preview.sh . .worktrees/main`, then commit on `main`.
- [ ] Ask the owner, then push both. Check the Pages build, that `/` is unchanged, and find one friend on `/next/`.
- [ ] Stop for the owner's review.
