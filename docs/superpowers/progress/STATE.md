# Fairy town: where the work stands

Updated 2026-11-25 16:58.

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

`cd tests && npm test` passed 140 of 140 at step 5. The full suite takes over 10 minutes. The live game (`/`, `bella-v4`) is unchanged.

## In progress: step 6, hide and seek in the house (stopped 2026-11-25 16:58)

Plan: `plans/2026-11-25-fairy-town-step6-house.md`. Ledger: `progress/2026-11-25-fairy-town-step6-house.md`. Local commits on `town`, **not pushed and not published**.

- **Task 1, the scene** (`37e0f3d`): done. The full suite passed 160 of 160 at that commit.
- **Task 3, sounds** (`62553e5`, docs `bba8a05`): done. The house song, `rustle`, `scurry`, "Trovato!" and "Cucù!".
- **Task 2, Fable art** (`bff4e89`): PARTIAL.
  - Done: the curtain is redrawn, the peek raise goes from 0.35 to 0.5, and Bella is bigger.
  - Left:
    - paint the other 7 pieces of furniture (they are still placeholders);
    - add the house sheet to `render.test.js` and save `house-sheet.jpg`;
    - stand Bella at a painted door;
    - check the peek for all 5 friends (the curtain peek is only a sliver).
- **OPEN:** `holding all the time still catches octopuses [landscape]` failed once in a partial run after `bff4e89`. It passed in the 160/160 run. Run the pond tests first: it may be flaky, or it may come from the pond's new rebuild of `Friends` and the octopus in `enter()`.
- **Then:**
  - re-dispatch Fable for the rest of Task 2 (resume from its report `.superpowers/sdd/2026-11-25-fairy-town-step6-house/task-2-report.md`);
  - run the full suite;
  - Task 4: publish as `bella-next-8`, after asking the owner.

## Next after step 6

1. **The owner tries steps 4, 5 and 6 on `/next/`.** Open points:
   - the octopus's grumpy face (too cross?);
   - the empty sky above Bella in the portrait pond (about 110 px; it comes from the horn-meets-arcs rule);
   - nothing has been heard by ear yet;
   - the lizard looks frog-like, and Bongo is slightly soft in the bakery;
   - the stars have 5 points, but the mural's stars have 6.
2. **Then, when the owner says so, `town` replaces the live game.**
   - First the final whole-branch review (deferred from step 1).
   - The `sw.js` `VERSION` and cache prefix go back to the `bella-v` series.
   - `next/` is removed.

## Execution notes

- Ledgers with every ruling are in this folder. The live ones are in `.superpowers/sdd/<plan>/progress.md`, which is git-ignored.
- The `main` worktree is at `.worktrees/main`. Publish with `sh tools/publish-preview.sh . .worktrees/main`.
- Roles are capped at 3: the implementer (opus or sonnet), the Fable designer, and the sound designer (sonnet, in an isolated worktree, cherry-picked). The controller reviews.
