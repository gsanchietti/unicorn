# Bakery: Make Serving the Cake Obvious Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A child who can't read must see how to give the cake to the friend. She can tap the friend, or press a big pulsing "give" button next to the friend. Both serve the cake.

**Architecture:**
- Only `js/scenes/bakery.js` changes, plus the tests.
- The "give" button is composed at draw time from sprites that already exist: a small copy of the current cake canvas and the friend drawn small. No new art file is needed.
- The bell stays as the serving *sound*, plus the bell sprite on the counter. It is no longer a button in the tool row.

**Tech Stack:** plain JS (classic scripts, Canvas 2D). Tests use Node 22 `node:test` with `puppeteer-core`.

**Spec:** `docs/superpowers/specs/2026-11-22-fairy-town-design.md` "The bakery" step 4 ("Serve: tap the bell"). This is changed by the owner's feedback of 2026-11-25:
- "on the bakery is not clear how to give the cake to the friend";
- the owner chose "tap the friend and also keep the button but make it obvious".

## Global Constraints

- Every hard rule in `AGENTS.md` holds: nothing to read, one finger, big targets (the give button at least `0.16 * M` across), 60 fps with nothing expensive per frame, and audio only through `Core.snd`.
- Stars stay exactly once per cake.
- A plain, undecorated cake can still be served: every cake is loved.

## Review Focus

1. **Tapping the friend during `arrive`, `pick`, `oven`, `serve`, `eat` or `leave`:** nothing happens. Only `decorate` serves. Test: `tapping the friend only serves while decorating`.
2. **A cream drag that ends on the friend:** it does not serve, because only a pointer `down` on the friend serves. Test: `a cream drag onto the friend does not serve`.
3. **Two quick taps, one on the friend and one on the give button:** the cake is served once. Covered by the existing `taps during serving give stars once`, which now also taps the friend.

---

### Task 1: Tap the friend, and a clear give button (implementer)

**Files:**
- Modify: `js/scenes/bakery.js`, `tests/game.test.js`, `tests/render.test.js`, `AGENTS.md` and `README.md` (bakery sections)

**Interfaces / behavior:**
- **Button id `serve`** replaces `bell` in `buttons()`.
  - It is no longer in the tool row. It sits next to the friend: on the counter in front of the stool, or just left of the friend, whichever is clear of the cake and the friend in both portrait and landscape.
  - Radius at least `0.08 * M`, and bigger than a tool button.
  - Its face is a round cream button with:
    - the current cake (its offscreen canvas, drawn small) on the left,
    - a soft arrow or a row of three dots pointing to the right,
    - the friend's head (`Friends.draw`, small, clipped to the upper part) on the right.
  - It means "the cake goes to the friend", with no words.
  - From the first decoration, it pulses gently (scale 1 ± 0.05 at about 1.5 Hz; with reduced motion, a still glow ring).
- **The friend is a tap target in `decorate`.**
  - Hook: `friendRect()` returns `{x, y, w, h}` on screen, or `null` outside `arrive`..`leave`.
  - A pointer `down` inside it serves, exactly like the give button: `snd('bell')`, the bell sprite rings, then → `serve`.
  - Only `down` serves; `move` and `up` never do.
- **The friend looks eager.** From the first decoration, while in `decorate`, the friend sprite bounces softly (a small squash and hop, about 1 Hz, drawn with transforms only). With reduced motion it stays still.
- **Hint.** After 4 s without input in `decorate` with at least one decoration, or after 10 s without input and no decoration:
  - draw `Art.drawTapHint` over the friend,
  - and alternate it with the give button every 1.5 s.
  - Any pointer `down` hides it, and the idle timer restarts.
  - Hook: `st.hint` (true while shown).
- The bell sprite stays on the counter. It is only a picture now.

- [ ] **Step 1: Write the failing tests** in `tests/game.test.js` (both sizes unless noted):
  - Rename `tapButton(page, 'bell')` to `tapButton(page, 'serve')` everywhere.
  - `tap the friend serves the cake`:
    - `playBakery`, pick `shape:round`, wait for `decorate`;
    - read `Core.stars()`, click the center of `friendRect()`, then wait for the next `arrive`;
    - the stars grew by 3 or 5, and `served` grew by 1.
  - `the give button sits by the friend and is big`:
    - in `decorate`, `buttons()` has `serve`, with `r >= 0.08 * M`, larger than every `cream:*` / `top:*` radius;
    - its center is nearer `friendRect()`'s center than `cakeRect()`'s center;
    - it lies inside the viewport;
    - it overlaps neither the cake nor any tool button.
  - `tapping the friend only serves while decorating`: tap the friend in `arrive` and `pick`. The mode is unchanged and `served` is unchanged.
  - `a cream drag onto the friend does not serve` (portrait):
    - with `cream:pink`, drag from the cake center to the friend's center and release;
    - the mode stays `decorate`.
  - `the hint shows after a pause`:
    - add one topping, wait 4.5 s: `st.hint === true`;
    - tap the cake: `st.hint === false`.
  - Extend `taps during serving give stars once` so its random clicks include the friend's center.
  - `tests/render.test.js`:
    - update the bell id;
    - add the shot `bakery-serve-hint` (decorate with 2 toppings, after 4.5 s idle).
- [ ] **Step 2: Run** `cd tests && node --test game.test.js`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** in `js/scenes/bakery.js`, and update its header (layout, buttons, hook).
- [ ] **Step 4: Run** `cd tests && npm test`. Expected: all pass, with no console errors and the bakery render under 8 ms. Look at `bakery-decorate.png`, `bakery-serve-hint.png` and `bakery-landscape.png`.
- [ ] **Step 5: Docs.** Update the bakery parts of `AGENTS.md` (decorate buttons, the hook's `friendRect` and `hint`, serving) and `README.md` (how to play: tap the friend or the give button).
- [ ] **Step 6: Commit** `feat: give the cake by tapping the friend or the big give button`.

### Task 2: Publish (controller)

- [ ] `VERSION = 'bella-next-5'`, `npm test`, then commit `chore: bump preview cache to bella-next-5`.
- [ ] `tools/publish-preview.sh . .worktrees/main`, then commit `chore: update fairy town preview` on `main`.
- [ ] Ask the owner, then push both. Check the Pages build, that `/` is unchanged, and serve one cake on `/next/` by tapping the friend.
