<!-- Copy of the execution ledger (.superpowers/sdd/2026-11-25-bakery-serve/progress.md), saved in git so work can resume. -->
# SDD ledger — plan: docs/superpowers/plans/2026-11-25-bakery-serve.md

Spec: docs/superpowers/specs/2026-11-22-fairy-town-design.md (bakery; changed by owner feedback 2026-11-25)
Branch: town. Base 3dee277. Owner: 'tap the friend and also keep the button but make it obvious'.

Ruling: give button composed from existing sprites (current cake canvas + small friend), no new art — avoids a Fable round for one icon — cost if wrong: owner asks for a painted icon.
Ruling: single implementer task, sonnet; controller review.

## Progress
Task 1: dispatched (base 3dee277, implementer sonnet)
Task 1: review — portrait give button too small/cramped at right edge (r 31, face tiny); friend rect overlaps cake. Ruling: move it under the friend in the open band below the counter, r = min(0.12M, band/2), and change the 'nearer friend than cake' assertion to 'x within the friend's x-range ±r and right of the cake' — cost if wrong: test-only semantics. Fix round 1 dispatched (FIX_BASE 259c5d9).
Task 1: fix round 1/5 (2 addressed: portrait give button r 46.8 under the friend; friend rect no longer covers cake; commits 259c5d9..ef11e10). Task 1: complete (review clean).
Task 2: local publish done (town bella-next-5; main 4a02b6e); push waits for owner OK.
Task 2: complete (pushed main 4a02b6e, town de07c93 with owner OK; Pages built; /next/ bella-next-5 with friendRect; / unchanged).
