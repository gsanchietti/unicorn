# Fairy town: where the work stands

Saved 2026-11-24, when the owner asked to stop.

## Done (branch `town`, preview at https://gsanchietti.github.io/unicorn/next/)

| Step | Plan | Status |
|---|---|---|
| 1. Style switch and scenes | `plans/2026-11-22-fairy-town-step1-style-and-scenes.md` | Done, published. Owner approved the look. |
| Star game adjustments: horse tail, avoidable mud, levels | `plans/2026-11-24-star-game-adjustments.md` | Done, published. |
| 2. The street (sky gate, star jar) | `plans/2026-11-24-fairy-town-step2-street.md` | Done, published. |
| 3. The bakery (husky, Pagi, mouse, lizard) | `plans/2026-11-24-fairy-town-step3-bakery.md` | Done and pushed. The owner said stop before the live check (see below). |

- **Last pushes:**
  - `town` is at `50b0a0d`;
  - `main` is at `33e5eac` (`next/` = step 3, preview cache `bella-next-4`).
  - The live game (`/`, `bella-v4`) has not changed since the `next/` guard.
- **Tests:** `cd tests && npm test` passes 88 of 88.

## Resume here

1. **Check the step 3 preview went live.**
   - `gh api repos/gsanchietti/unicorn/pages/builds/latest` should report `built` for `33e5eac`.
   - `/next/sw.js` should say `bella-next-4`.
   - `/` should still load `js/game.js`.
   - Play one cake on `/next/` with no console errors. A puppeteer play-through works: `__bella.street.enter('bakery')`, then the bakery hook `__bella.bakery`.
2. **The owner tries the bakery.** Points to ask about:
   - the lizard sits upright and looks a little frog-like;
   - Bongo looks slightly soft in the bakery (drawn about 1.7x up from the flying-scale cache);
   - the heart cake is seen from above, the other cakes from the front;
   - none of the sounds has been heard by a person yet;
   - the medal row on the start page sits over the ground on wide screens;
   - the stars have 5 points, but the mural's stars have 6.
3. **Then step 4, the bubble pond.** Write its plan from the spec section "The bubble pond", in the same pattern:
   - the implementer builds the scene with placeholders,
   - the Fable designer paints the octopus (red happy side and blue grumpy side) and the pond,
   - the sound designer adds the pond song and sounds,
   - the controller publishes `bella-next-5`.
4. **Step 5, the physics extras.** After that, and when the owner says so, `town` replaces the live game. The step 1 final whole-branch review is due before that merge.

## Execution notes

- Ledgers with every ruling are copied in this folder. The live ones are in `.superpowers/sdd/<plan>/progress.md`, which is git-ignored.
- The `main` worktree lives at `.worktrees/main`, which is git-ignored. Publish with `sh tools/publish-preview.sh . .worktrees/main`.
- Agent roles are capped at 3: the implementer (opus or sonnet), the Fable designer (art), and the sound designer (sonnet). The controller does the reviews.
- Parallel work is fine only on different files. The sound designer can run in an isolated worktree, and the controller cherry-picks its commit.
