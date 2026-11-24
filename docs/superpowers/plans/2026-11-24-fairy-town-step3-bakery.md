# Fairy Town Step 3: The Bakery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the pink mushroom bakery on the street. Friends come in one at a time with a wish. Bongo bakes a cake, the child decorates it with cream and toppings, rings the bell, and the friend eats it happily and gives stars.

**Architecture:**
- A new scene, `js/scenes/bakery.js`. Its painted pieces come from a new `js/art-bakery.js` (`window.Bakery`).
- The four friends live in a new `js/friends.js` (`window.Friends`).
- `js/characters.js` gains a standalone Bongo (`Characters.drawBongo`), so he can work in the kitchen.
- The street opens the bakery door.
- `js/audio.js` gains the bakery song, sounds and voice cues.
- Same pattern as step 2: the implementer builds the scene on placeholder art with a fixed API, the Fable designer paints it, and the sound designer adds the audio.

**Tech Stack:** plain HTML/CSS/JS (classic scripts, Canvas 2D, Web Audio, Web Speech). Tests use Node 22 `node:test` with `puppeteer-core` and the system Chrome.

**Spec:** `docs/superpowers/specs/2026-11-22-fairy-town-design.md`, sections "The bakery", "Style" (faces), "How it's built" (friends, audio, save data, navigation) and "Delivery order" step 3. The owner's goal: "reach the step 3".

## Global Constraints

- Every hard rule in `AGENTS.md` holds:
  - nothing to read, no game over, no timers that punish, no wrong answers, points never subtracted;
  - "every cake is loved";
  - one finger, any button at least `0.12 * M` across;
  - 60 fps, with no per-frame `shadowBlur`, filters or grain;
  - works from `file://`, no `getImageData`;
  - classic scripts;
  - audio only through `Core.snd`;
  - `localStorage` only through `Core.load` / `Core.store`.
- **Faces** (spec):
  - the husky keeps its plush look: big glittery blue eyes, light-blue inner ears, cream muzzle;
  - Pagi, the mouse and the lizard keep their big round googly eyes with black pupils;
  - everyone smiles at rest.
- `Characters.prerender` keeps 2 cached scales. Bongo standalone is drawn at the flying scale ppu (`Math.min(H * 0.42, W * 0.52) / Characters.H * DPR`), like the street.
- **Navigation:**
  - `bakery` has `home: 'street'`, `clock: false` (the room has its own lamp light), `music: 'bakery'`;
  - the street enters it from the bakery door (`Core.go('bakery')`);
  - coming home, Bella stands at the bakery door (`args.from === 'bakery'`).
- **Save data:** `bella.cakes` is a JSON array of the last 6 cakes, `{s: shape, c: cream, t: [[k, x, y], ...]}`. `x` and `y` are in 0..1 cake space, with at most 40 toppings stored per cake. It is read in try/catch, and corrupt data counts as `[]`.
- Stars: 3 per served cake, plus 2 when the wish topping is on the cake (confetti and `say('bravissima')`). Everything goes through `Core.addStars`.
- `sw.js`:
  - add `js/art-bakery.js`, `js/friends.js` and `js/scenes/bakery.js` to `FILES`;
  - `VERSION` becomes `bella-next-4` at publish.
- `index.html` script order:
  - `js/art.js`, `js/art-town.js`, `js/art-bakery.js`, `js/characters.js`, `js/friends.js`, `js/audio.js`, `js/core.js`, `js/backdrop.js`, `js/scenes/title.js`, `js/scenes/street.js`, `js/scenes/bakery.js`, `js/scenes/stars.js`,
  - then `Core.start('title')`.
- Commits: conventional, ending with `Assisted-by: Claude Code:<model>`. No Co-Authored-By, no Signed-off-by. Push only with the owner's OK.
- Agent roles:
  - the implementer does Task 1,
  - the Fable designer does Tasks 2 and 3,
  - the sound designer does Task 4,
  - the controller does Task 5.

## Review Focus

1. **Rapid taps everywhere during the friend's walk-in, Bongo's oven slide, serving or eating:** nothing breaks, nothing is served twice, and stars are given once per cake. Test: Task 1, `taps during serving give stars once`.
2. **A finger that keeps rubbing cream for a long time, or 200 topping taps:**
   - frames stay cheap, because cream goes into the cake canvas on input, never per frame;
   - toppings stop growing at the cap of 80, with a sparkle instead.
   - Test: Task 1, `long decorating stays within budget` (render cost under 8 ms after 200 taps and 5 s of rubbing).
3. **Leaving with home mid-cake, then coming back:**
   - the street shows Bella at the bakery door;
   - re-entering starts a fresh friend visit;
   - no stars are given for the unserved cake, and nothing is lost from the total.
   - Test: Task 1, `home mid-cake goes to the street door and back starts fresh`.
4. **Resize or rotation while decorating:** the cake and its decorations keep their relative positions (cake space 0..1), and buttons stay on screen. Test: Task 1, `resize while decorating keeps the cake`.
5. **Corrupt or huge `bella.cakes` in storage:** ignored or trimmed to 6, with no errors, and the window shows at most 6 cakes. Test: Task 1, `corrupt cakes in storage are ignored`.

---

### Task 1: Bakery scene, flow and navigation (implementer)

**Files:**
- Create:
  - `js/scenes/bakery.js`;
  - `js/art-bakery.js` and `js/friends.js` with **placeholder** drawings (Task 2/3 replace the bodies, not the API).
- Modify:
  - `js/scenes/street.js`: the bakery door opens; arrive at the door from `bakery`;
  - `index.html`, `sw.js` (`FILES` only), `README.md`, `AGENTS.md`.
- Test:
  - `tests/game.test.js`, plus a `playBakery(page)` helper in `tests/helpers.js`;
  - `tests/render.test.js` (bakery shots and cost).

**Interfaces:**
- **`window.Bakery`** (`js/art-bakery.js`). Sprites are pre-rendered at DPR in `Bakery.build(u, DPR)`; `u` is the scene's size unit.
  - `Bakery.room(W, H, night) -> canvas`: the full-screen back wall, window and shelf. `night` is unused in this step, so pass false.
  - `Bakery.sprite(kind) -> {c, w, h}`, anchored at bottom center. `kind` is one of: `'counter'`, `'oven'`, `'stool'`, `'bell'`, `'wishBubble'`.
  - `Bakery.cakeBase(shape) -> {c, w, h, clip(g)}`.
    - `shape` is `'round'|'heart'|'tall'`.
    - `clip(g)` sets a clip path for the cake's top and sides in the base's own pixel space, for cream.
  - `Bakery.creamStamp(color) -> {c, r}`: a soft round blob stamped along the finger's path. `color` is `'pink'|'choc'|'lemon'|'mint'`.
  - `Bakery.topping(kind) -> {c, w, h}`, anchored at the center. `kind` is `'strawberry'|'chocdrop'|'sprinkles'|'flower'|'star'|'candle'`.
  - `Bakery.icon(id) -> {c, r}`: a round button face for `shape:<s>`, `cream:<c>`, `top:<k>` and `bell`.
- **`window.Friends`** (`js/friends.js`):
  - `Friends.KINDS = ['husky', 'pagi', 'mouse', 'lizard']`.
  - `Friends.build(h, DPR)`: pre-renders every friend `h` CSS px tall.
  - `Friends.draw(g, kind, x, y, pose)`, bottom center at (x, y). `pose = {t, state: 'walk'|'sit'|'eat'|'happy', p}`, with `p` 0..1 the progress of that state (the walk phase, or how far eating has got).
- **`Characters.drawBongo(g, pose, ppu)`** (added in Task 2):
  - Bongo alone, standing, bottom center at the origin, facing right; scale with `ppu` as `Characters.draw` does.
  - `pose = {t, walk, stride, carry, face}`, with `carry` 0..1 for arms out holding a tray.
  - Frame: `Characters.BONGO_H` rig units tall.
  - Until Task 2 exists, `bakery.js` draws a placeholder when `Characters.drawBongo` is missing.
- **Scene flow** (`st.mode`):
  1. `arrive`: the next friend walks in from the right (2 s) to the stool, sits, and the wish bubble appears with one random topping.
  2. `pick`: three shape buttons. A tap → `oven`.
  3. `oven`: the oven door opens, `snd('ding')`, and Bongo slides the cake onto the counter (1.2 s) → `decorate`.
  4. `decorate`: buttons for 4 creams, 6 toppings and the bell. The selected tool is highlighted. It starts on `cream:pink`.
     - **Cream tool:** pointer moves over the cake stamp `creamStamp` into the cake's own canvas along the path, clipped by `clip`, with `snd('squish')` at most every 0.15 s.
     - **Topping tool:** a tap on the cake adds the topping at that cake-space point (bounce in 0.3 s, `snd('plop')`, a small sparkle). Taps off the cake do nothing. Past 80 toppings a tap only sparkles.
     - **Bell:** `snd('bell')` → `serve`. It needs no decoration: a plain cake is loved too.
  5. `serve`: Bongo carries the cake on a tray to the friend (1.5 s) → `eat`.
  6. `eat`: the friend eats (2.5 s, crumbs), `say('chebuona')`, then `happy` (1 s, wiggle):
     - 3 stars fly from the friend to the top-left star row, `Core.addStars(3)`;
     - if the wish topping is on the cake: +2 more, confetti and `say('bravissima')`;
     - `say('grazie')`;
     - the cake is saved to `bella.cakes` (last 6);
     - → `leave`.
  7. `leave`: the friend walks out to the right (1.5 s), and the next friend in `KINDS` order comes → `arrive`.
- **Layout:**
  - `u = Math.min(M, 0.9 * H)`;
  - counter top at `0.62 H`, the cake centered on it about `0.36 u` wide;
  - the friend's stool on the right third, the oven on the left;
  - buttons in one row (or two rows on portrait) at the bottom, each at least `0.12 * M`;
  - the window on the back wall shows the last 6 saved cakes as small cached thumbnails, built once on `enter`.
- **Debug hook** `window.__bella.bakery`:
  - `st`: `{mode, friend, wish, shape, tool, toppings, creamDabs, served, enters}`;
  - `buttons()`: `[{id, x, y, r}]`;
  - `cakeRect()`: `{x, y, w, h}` on screen.
- **Test helper** `playBakery(page)`: `tapPlay`, wait for `street`, call `__bella.street.enter('bakery')`, then wait for scene `bakery` and mode `pick`.

- [ ] **Step 1: Write the failing tests** in `tests/game.test.js`. They run at both sizes unless noted.
  - `the bakery door opens the bakery`: `playBakery`. Then the scene is `bakery`, `st.friend === 'husky'` on the first visit, and `st.wish` is one of the 6 toppings.
  - `pick a cake, decorate it, ring the bell, get stars` (portrait):
    - tap `shape:round`, then wait for `decorate`;
    - drag across `cakeRect()`: `creamDabs` grows;
    - tap `top:<wish>`, then tap the cake center: `toppings.length === 1`;
    - read `Core.stars()`, tap `bell`, wait for `arrive` of the next friend;
    - `Core.stars()` grew by exactly 5, and `st.friend === 'pagi'`;
    - `bella.cakes` holds 1 cake with `s: 'round'`.
  - `a plain cake is loved too`: `shape:tall`, then `bell` right away. The stars grew by exactly 3.
  - `taps during serving give stars once`: after `bell`, click 30 times at random spots through `serve` and `eat`. The stars grew by 3 or 5 exactly once, and `served` grew by 1.
  - `long decorating stays within budget` (portrait):
    - 200 topping taps (with `toppings.length === 80` at the end) and 5 s of cream dragging;
    - then `frameMs()` over 120 frames is under 8 ms.
  - `home mid-cake goes to the street door and back starts fresh`:
    - in `decorate`, `goHome()`. The scene is `street`, and `|st.x - bakery.x| < 0.05 * worldW()`;
    - the stars are unchanged;
    - enter the bakery again: mode `arrive` or `pick`, with `toppings.length === 0`.
  - `resize while decorating keeps the cake`:
    - add 3 toppings, then resize 390x844 ↔ 844x390;
    - the topping cake-space coordinates are unchanged;
    - every button's `(x ± r, y ± r)` lies inside the viewport.
  - `corrupt cakes in storage are ignored`:
    - set `bella.cakes` to `'{oops'` and enter the bakery: no errors;
    - set it to an array of 50 cakes, enter, serve 1: the stored array length is 6.
  - **Changes to existing tests:** the street test for closed places now only covers the pond. Add `home from the bakery lands at its door`.
  - `tests/render.test.js`:
    - shots `bakery-pick`, `bakery-decorate` (with cream and 10 toppings), `bakery-eat` and `bakery-landscape`;
    - the bakery's render cost is under 8 ms.
- [ ] **Step 2: Run** `cd tests && npm test`. Expected: the new tests FAIL (no `bakery` scene).
- [ ] **Step 3: Implement** the placeholders, the scene and the street change.
- [ ] **Step 4: Run** `cd tests && npm test`. Expected: all pass, with no console errors. Look at `tests/out/bakery-*.png`.
- [ ] **Step 5: Docs.**
  - `README.md`: how to play the bakery.
  - `AGENTS.md`: file map, the bakery flow and hook, `bella.cakes`, and the script order.
- [ ] **Step 6: Commit** `feat: open the bakery: bake, decorate and serve cakes`.

### Task 2: The bakery and the husky in the wall style, and Bongo on his own (Fable designer)

**Files:**
- Modify:
  - `js/art-bakery.js` (replace placeholder bodies, same API);
  - `js/friends.js` (the husky; the others stay placeholders until Task 3);
  - `js/characters.js` (`drawBongo`, `BONGO_H`).
- Reference:
  - `assets/photos/ref/husky.jpg`;
  - `mural-mushrooms.jpg` (the bakery is the inside of the pink mushroom house: round windows, curved walls);
  - `assets/photos/bongo.jpg`.
- Test: `tests/render.test.js`, which adds:
  - a bakery sheet `tests/out/bakery-sheet.png` with every sprite, all three cake bases with some cream, every topping and every icon;
  - a friends sheet `tests/out/friends.png` with each kind in each state at 3 phases;
  - Bongo walk, carry and face frames on the character sheet.

**Interfaces:**
- Consumes: the `Bakery`, `Friends` and `drawBongo` APIs exactly as in Task 1, plus `Art.ink`, `Art.pencil` and `Art.PAL`.
- Produces: the same APIs.
  - `Characters.draw` is unchanged, and the anchors stay within ±10 rig units.
  - `drawBongo` reuses Bongo's cached part sprites, so no extra scale is built.
  - `drawBongo` and `Friends.draw` each stay under 1 ms.

**What it looks like:**
- **The room:** inside the pink mushroom house.
  - A cream-pink curved wall with white dotted trim.
  - A round window showing the last cakes.
  - A wooden counter with a pink cloth edge.
  - A round, friendly, warm-orange oven with a little window.
- **Cakes:** soft pastel sponge with a plate; `tall` has two tiers. Cream stamps look like piped colored pencil, slightly glossy.
- **Toppings:** round, bright, cheerful.
- **The husky:** the plush from the photo. White and grey, light-blue inner ears, big glittery blue eyes, cream muzzle. Smiling.
  - Walk: a soft waddle.
  - Sit: on the stool.
  - Eat: muzzle down with crumbs and a happy squint.
  - Happy: a wiggle with ears up.
- **Bongo standalone:** the same toy as on Bella's back, standing on two legs in his blue overalls. He can walk, carry a tray, and turn his face to the front.

- [ ] **Step 1: Add** the sheets to `tests/render.test.js`. Run them on the placeholders (baseline).
- [ ] **Step 2: Draw.** Compare the sheets and the `bakery-*.png` shots with the photos, and iterate.
- [ ] **Step 3: Run** `cd tests && npm test`. Expected: all pass and within budget.
- [ ] **Step 4: Save** review renders `docs/superpowers/review/step3/` (`bakery-sheet.jpg`, `husky.jpg`, `bongo.jpg`, `bakery-decorate.jpg`).
- [ ] **Step 5: Commit** `feat: paint the bakery, the husky and Bongo on his own`.

### Task 3: Pagi, the mouse and the lizard (Fable designer)

**Files:**
- Modify: `js/friends.js`
- Reference:
  - `assets/photos/ref/mural-pagi.jpg`: a brown dog with long ears, big eyes, a black nose and a yellow collar reading "PAGI". Draw the collar **without letters**: nothing to read.
  - `mural-mouse-balloon.jpg`: the brown mouse with big eyes. It matches the street's `mouseBalloon` look.
  - `mural-lizard.jpg`: the pink-to-orange lizard with big googly eyes.
- Test: the friends sheet from Task 2.

**Interfaces:** the `Friends` API, unchanged. Each friend has all four states. `Friends.draw` stays under 1 ms.

- [ ] **Step 1: Draw** the three friends in all states, in the wall style, smiling, with googly eyes.
- [ ] **Step 2: Run** `cd tests && npm test`. Expected: all pass.
- [ ] **Step 3: Save** `docs/superpowers/review/step3/friends.jpg`.
- [ ] **Step 4: Commit** `feat: bring Pagi, the mouse and the lizard to the bakery`.

### Task 4: Bakery music, sounds and voices (sound designer)

**Files:**
- Modify: `js/audio.js`, `README.md` (voice table), `AGENTS.md` (audio API line)
- Test: `tests/audio.test.js`

**Interfaces:**
- Consumes the calls from Task 1:
  - `setPlace('bakery')`;
  - `ding()`, `squish()`, `plop()`, `bell()`, `munch()`;
  - `say('chebuona')`, `say('grazie')`, and the existing `say('bravissima')`.
- Produces:
  - **The bakery song:** cozy and cheerful, the same family as the day songs, played on music box plus soft pizzicato.
  - **SFX:**
    - `ding()`: oven ding;
    - `squish()`: soft cream;
    - `plop()`: topping lands;
    - `bell()`: shop bell;
    - `munch()`: happy nibbling, about 0.4 s, played a few times while eating. Task 1 calls `snd('munch')` every 0.5 s during `eat`.
  - **Voices** in `VOICE_TEXT`, not in `RECORDED`: `chebuona: 'Che buona!'`, `grazie: 'Grazie!'`.
  - Everything is soft, click-free and inside try/catch.

- [ ] **Step 1: Extend** `tests/audio.test.js`:
  - every new function exists and doesn't throw, before and after `init()`, muted and unmuted;
  - `setPlace('bakery')` switches the active day song within 2 bars (`_song`);
  - the voice texts are present (`_voiceText`).
- [ ] **Step 2: Run** `cd tests && node --test audio.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `cd tests && npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: add the bakery song, kitchen sounds and thank-you voices`.

### Task 5: Publish step 3 to the preview (controller)

- [ ] **Step 1:** Set `VERSION = 'bella-next-4'`, check `FILES`, and run `cd tests && npm test`. Commit `chore: bump preview cache to bella-next-4`.
- [ ] **Step 2:** Run `tools/publish-preview.sh . .worktrees/main` and `git status` there. Commit `chore: publish fairy town step 3 preview`.
- [ ] **Step 3:** Ask the owner before pushing. Then push, wait for the Pages build, and check:
  - `/` is unchanged;
  - a `/next/` play-through reaches the bakery and serves one cake with no console errors.
- [ ] **Step 4:** Stop for the owner to try the bakery.
