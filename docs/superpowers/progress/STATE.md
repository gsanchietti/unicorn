# Fairy town: where the work stands

Updated 2026-11-25.

## Done (branch `town`, preview at https://gsanchietti.github.io/unicorn/next/)

| Step | Plan | Status |
|---|---|---|
| 1. Style switch and scenes | `plans/2026-11-22-fairy-town-step1-style-and-scenes.md` | Published; owner approved the look |
| Star game adjustments | `plans/2026-11-24-star-game-adjustments.md` | Published |
| 2. The street | `plans/2026-11-24-fairy-town-step2-street.md` | Published |
| 3. The bakery | `plans/2026-11-24-fairy-town-step3-bakery.md` | Published |
| Bakery: give the cake by tapping the friend / big give button | `plans/2026-11-25-bakery-serve.md` | Published |
| 4. The bubble pond | `plans/2026-11-25-fairy-town-step4-pond.md` | Published |
| 5. Physics extras (Matter.js jar, squishy clouds, bumping bubbles) | `plans/2026-11-25-fairy-town-step5-physics.md` | Published (`bella-next-7`, main `851655b`) |

`cd tests && npm test` passes 140 of 140. The full suite takes over 10 minutes. The live game (`/`, `bella-v4`) is unchanged.

## Next

1. **The owner tries steps 4 and 5 on `/next/`.** Open points:
   - the octopus's grumpy face (too cross?);
   - the empty sky above Bella in the portrait pond (about 110 px; it comes from the horn-meets-arcs rule);
   - nothing has been heard by ear yet;
   - the lizard looks frog-like, and Bongo is slightly soft in the bakery;
   - the stars have 5 points, but the mural's stars have 6.
2. **Step 6, the house: hide and seek.** It is in the spec under "Delivery order" step 6, with the "be quick" rule: a peeking friend scurries to another spot after about 5 s, never less than 2.5 s, and nothing is lost. Write its plan:
   - the implementer builds the scene with placeholders,
   - the Fable designer paints the room and the hiding furniture,
   - the sound designer adds the music and sounds,
   - the controller publishes.
3. **Then, when the owner says so, `town` replaces the live game.**
   - First the final whole-branch review (deferred from step 1).
   - The `sw.js` `VERSION` and cache prefix go back to the `bella-v` series.
   - `next/` is removed.

## Execution notes

- Ledgers with every ruling are in this folder. The live ones are in `.superpowers/sdd/<plan>/progress.md`, which is git-ignored.
- The `main` worktree is at `.worktrees/main`. Publish with `sh tools/publish-preview.sh . .worktrees/main`.
- Roles are capped at 3: the implementer (opus or sonnet), the Fable designer, and the sound designer (sonnet, in an isolated worktree, cherry-picked). The controller reviews.
