# AGENTS.md

Read this before changing anything in this repo. It holds what earlier sessions learned.

## Project and audience

"Bella e Bongo" is a gentle browser game for the owner's 5-year-old daughter.
Bella, a pink/mauve unicorn toy, flies with Bongo, a cream teddy, on her back and collects stars.

- Live site: https://gsanchietti.github.io/unicorn/ (GitHub Pages, built from `main`, path `/`).
- Repo: `git@github.com:gsanchietti/unicorn.git`. License: GPL-3.0 (`LICENSE`).
- The real toys are in `assets/photos/` (`bella.jpg`, `bongo.jpg`). `assets/bella.png` and `assets/bongo.png` are cut-outs used only as drawing references. The game does not load them.

## Hard rules (never change these)

- **Nothing for the child to read.** Use icons, sounds and voice only. The HTML name `#title` ("Bella e Bongo") on the start page is for parents.
- **No game over, no lives, and points are never subtracted.**
- **One-touch control:** hold to fly up, release to float down. Touch-first pointer events that also work with a mouse. Large touch targets.
- **60 fps on phones.** Pre-render anything expensive into offscreen canvases. Per frame there is no `shadowBlur` and no canvas filters.
- **Respect `prefers-reduced-motion`.** Keep the mute button (`#mute`).
- **Plain HTML/CSS/JS:** no build step, no ES modules (classic `<script>` tags that define `window.*` globals), no npm dependencies at runtime.
- **It must work from `file://`.** So: no `fetch()` of local files, and no `getImageData` on canvases (they can be tainted). The service worker registers only over http(s), and the game must work without it.
- **Audio must never break the game.** The core and the scenes call audio only through `Core.snd(name, ...)`, which wraps everything in try/catch.
- **Every `localStorage` access is inside try/catch** (private mode can throw).
- **Style (the bedroom-wall mural):** dark slightly uneven ink outlines (`Art.ink`), colored-pencil fill with a visible grain (`Art.pencil`), the mural palette on a cream wall (`Art.PAL`: wall, river, leaf, roof, orange, mushroom, plum, cloud, moon, star, ink), round shapes only, nothing sharp or scary, big glowing pulsing stars. The old pastel keys of `Art.PAL` still exist but the look is the mural.
- **The characters must look like the real toys and must smile.** The owner rejected "grumpy" faces.

## Run and test

```sh
xdg-open index.html                  # works straight from file://
python3 -m http.server 8000          # needed to test the service worker / phone on the LAN
```

**Test before saying something works.** Run the automated tests, then check by eye when needed:

```sh
cd tests && npm install && npm test   # headless system Chrome (CHROME_PATH to override), a few minutes
```

`tests/helpers.js` has the static server and page helpers (`playStars(page)` goes start page → street → sky gate → star game, flying; `playBakery(page)` goes start page → street → bakery door, until the first friend sits and the shape buttons are up); `tests/game.test.js` plays the game through the `window.__bella` hook at 390x844 and 844x390 and asserts no console errors. `tests/render.test.js` saves a screenshot of every look (day, sunset, night, wash, milestone, character sheet, start page, street day/night/landscape/jar, bakery pick/decorate/eat/landscape) to `tests/out/` (git-ignored; `RENDER_OUT` overrides the folder) and checks the render budget (average canvas cost per frame, `BUDGET_MS`). Look at those screenshots by eye after any art change.

The test `live game and preview stay separate` serves the `main` worktree with `next/` inside. It looks for it at `.worktrees/main` (or `MAIN_WORKTREE`) and is skipped, with a message, if that folder is missing. `tests/render.test.js` saves a screenshot of every look to `tests/out/` (git-ignored; look at them after any art change) and asserts the canvas render cost stays under 8 ms per frame (`__bella.frameMs()`).

Other ways:

1. **Ad-hoc puppeteer-core + headless system Chrome.** puppeteer-core is not a repo dependency, so install it in a scratch folder (`npm i puppeteer-core`). Use `puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--autoplay-policy=no-user-gesture-required'] })`.
   - Sizes used so far: phone 390x844 and 844x390 (DPR 3, `hasTouch`, `isMobile`), tablet 1024x768 and 768x1024 (DPR 2).
   - Collect `console` errors and warnings, `pageerror` and `requestfailed`. The expected result is an empty list.
   - Full play-through:
     1. Tap the play button. It is at `(W/2, 0.65*H)` with radius `0.14*min(W,H)` (`playButton()` in `js/scenes/title.js`). Taps elsewhere on the start page do nothing. It leads to the street.
     2. On the street, hold the left or right half and check that `__bella.street.st.x` moves. Call `__bella.street.enter('gate')` (or tap the gate at `sx, sy` from `__bella.street.places()`) to enter the star game.
     3. Hold, and check that `__bella.stars.st.hero.y` goes down; release, and check that it goes up.
     4. Set `__bella.stars.st.sinceWash = 15` to get the mud cloud, then wait for mode `wash`.
     5. Rub by dispatching `PointerEvent`s on `#game`, or call `__bella.stars.cleanAll()`. Check the +5 bonus.
     6. Call `__bella.stars.addPoints(24)` to trigger a milestone. Reload and check `bella.best` and `bella.stars`.
     7. Back on the street, call `__bella.street.enter('bakery')`, wait for `__bella.bakery.st.mode === 'pick'`, tap a `shape:*` button from `__bella.bakery.buttons()`, rub across `__bella.bakery.cakeRect()`, tap `top:*` then the cake, tap `serve` (or the center of `friendRect()`), and check `Core.stars()` grew by 3 (5 with the wish topping) and `bella.cakes`.
2. **The owner's real Chrome** through the Claude-in-Chrome extension (allowed). Use it for real fps and for the live site. If your test plays leave a `bella.best`, `bella.stars` or `bella.cakes` in that browser, remove them afterwards. Leave `bella.muted` alone: the owner may have set it.

**Debug hook `window.__bella`:**
- `scene()`: the current scene name (`'title'`, `'street'`, `'bakery'`, `'stars'`).
- `goHome()`: same as a click on `#home` (goes to the scene's `home`, one level back, with the fade).
- `street`: `st` (`{x, camX, target, walking, dir, jarShow, jiggle}`: Bella's world x, the camera's left edge, the place she walks to or `null`, ...), `places()` (`[{kind, x, sx, sy, r}]`: world x, screen center and radius of each tap target), `worldW()`, `enter(kind)` (same as a tap on that place: `'square'`, `'gate'`, `'house'`, `'bakery'`, `'pond'`).
- `bakery`: `st` (`{mode, mt, friend, wish, shape, tool, toppings, creamDabs, served, enters, saved}`: the mode and seconds in it, the friend's kind, the wished topping, the cake's shape, the selected button id, `[{k, x, y, a}]` in cake space 0..1, cream stamps so far, cakes served since load, `enter()` calls, cakes in the window), `buttons()` (`[{id, x, y, r}]` shown now: `shape:*` in `pick`; `cream:*`, `top:*`, `serve` in `decorate`), `cakeRect()` (`{x, y, w, h}` on screen, or `null`), `friendRect()` (`{x, y, w, h}` on screen, or `null` while away); `st.hint` is true while the tap hint shows.
- `stars`: `st` (the star game state; `st.mode`, `st.score`, `st.best`, `st.hero`, `st.held` = a finger is down now), `pose`, `addPoints(n)`, `getDirty()` (mud amounts), `cleanAll()`, `speedK()`, `enters` (count of `enter()` calls).
- `setTime('day'|'sunset'|'night'|'sunrise')`.

Not yet tested on a real phone or tablet. The `visibilitychange` pause and two-finger touch are covered only by the headless tests (synthetic events).

## Architecture and file map

Script order in `index.html` matters: `js/art.js`, `js/art-town.js`, `js/art-bakery.js`, `js/characters.js`, `js/friends.js`, `js/audio.js`, `js/core.js`, `js/backdrop.js`, `js/scenes/title.js`, `js/scenes/street.js`, `js/scenes/bakery.js`, `js/scenes/stars.js`, then an inline `Core.start('title')`. Each file starts with a header comment that describes its API. Read it first.

| File | Global | What it does |
|---|---|---|
| `js/art.js` | `window.Art` | Ink-and-pencil sprites and backgrounds in the bedroom-wall mural style, pre-rendered to canvases (`starSprite`, `cloudSprite`, `bubbleSprite`, `paintSky`, `paintSunsetSky`, `paintNightSky`, `paintHills`, `makeSplotch`/`drawSplotch`, `drawRainbow`, `drawSponge`, `drawPlayButton`, `drawMedal`, `drawMoon`, ...). `ink` and `pencil` are the two style helpers (also for the characters). `PAL` is the palette. |
| `js/art-town.js` | `window.Town` | The street's painted pieces, pre-rendered per size: `build(M, DPR)`, `KINDS`, `sprite(kind, night)` (anchored at bottom center), `lifeSprite(kind)` (centered), `groundTile()`, `drawJar(g, x, y, h, total, jiggle)`, `drawSign(g, x, y, r, kind, t)`. Placeholder drawings until the designer paints them. |
| `js/art-bakery.js` | `window.Bakery` | The bakery's painted pieces, pre-rendered per size: `build(u, DPR)`, `COUNTER`, `room(W, H, night)`, `windowRect(W, H)`, `sprite(kind)` (`counter`, `oven`, `stool`, `bell`, `wishBubble`), `cakeBase(shape)` (with `clip(g)` in its pixel space), `creamStamp(color)`, `topping(kind)`, `icon(id)`. Placeholder drawings until the designer paints them; the header fixes sizes and anchors. |
| `js/characters.js` | `window.Characters` | Puppet rig for Bella and Bongo, drawn in code. |
| `js/friends.js` | `window.Friends` | The bakery's friends (husky, Pagi, mouse, lizard): `KINDS`, `build(h, DPR)`, `draw(g, kind, x, y, {t, state, p})`, bottom center, facing left. Placeholder drawings until the designer paints them. |
| `js/audio.js` | `window.Sound` | All sound synthesized with Web Audio, plus Italian voice cues. |
| `js/core.js` | `window.Core` | Canvas, size/DPR, rAF loop, pointers, `#mute` and `#home`, full screen, `visibilitychange` pause, save data, scene switching with a fade. |
| `js/backdrop.js` | `window.Backdrop` | Sky, hills, far clouds, moon, twinkles, fireflies and the day/night cycle, shared by every place. |
| `js/scenes/title.js` | (registers `title`) | Start page: hero, play button, best-score medals. |
| `js/scenes/street.js` | (registers `street`) | The street, the hub: Bella trots left and right, the sky gate into the star game, the star jar on the town square, the bakery door, the closed pond, life (fox, clothesline, mouse balloon, butterflies). |
| `js/scenes/bakery.js` | (registers `bakery`) | The bakery: a friend's visit, picking a cake, cream and toppings, giving the cake, eating, stars, the saved cakes in the window. |
| `js/scenes/stars.js` | (registers `stars`) | The star game: modes, scoring, mud and washing, score bar. |
| `index.html`, `style.css` | | Page shell: `canvas#game`, `.paper` painted-wall overlay (SVG feTurbulence, multiply), `#title`, `#home`, `#mute`, the `Bella Title` @font-face. |
| `sw.js`, `manifest.webmanifest` | | Offline play and install to the home screen. |
| `tools/icons.html` | | Renders app icons from the game's own art. |
| `tools/cutout.py` | | Background removal for new photos. |
| `assets/fonts/title.woff2`, `OFL.txt` | | Title font (subset of Comfortaa Bold, renamed). |
| `assets/icons/` | | `favicon-16/32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`. |

### characters.js
- The rig frame is `Characters.W x H` (1000 x 1100 rig units).
- `Characters.draw(g, pose, pxPerUnit)`. Pose fields:
  - `t`: time.
  - `run`: gallop, 0..1.
  - `wave`, `happy`.
  - `look`.
  - `glow`: horn and butterfly flash.
  - `face`: `undefined` lets Bongo turn to the player every few seconds; `0` is profile; `1` is front.
- `Characters.prerender(ppu)` caches part sprites for the **2 most recent** scales only. The star game passes just two fixed values, `S.ppuFly` and `S.ppuWash`, and the start page and the street draw at the same flying scale, so the cache is never rebuilt mid-game. Do not pass a continuously changing scale.
- `Characters.anchors`: rest-pose points used to place mud (`bellaHind`, `bellaBelly`, `bellaChest`, `bellaNeck`, `bellaCheek`, `bellaLegBack`, `bellaLegFront`, `bongoCheek`, `bongoTummy`, `bongoArm`, `body`).
- Authoring spaces: Bella is drawn in "bella.png space" (657x700) and mapped into the rig with `R()`; Bongo is drawn in "bongo.png space" (519x700) and mapped with `B()`.
- Bella's horn and butterfly color-cycle like toy lights (`GLOW_STEPS = 24`) and flash on each star. Bongo wears blue crocheted overalls, has a small rabbit-like pom-pom tail, rides in profile and turns his face now and then.
- Bella's legs are jointed: upper leg, round knee (front) or hock (hind), cannon, fetlock, hoof. Each leg is still one path, so joints show no seams. Knee roundness is tuned by `knee` / `kneeOff` in `SHAPE_FRONT` / `SHAPE_HIND`; the joint angles come from `legPose`.

### audio.js
- API: `init`, `isMuted`, `setMuted`, `toggleMute`, `star(n)`, `bubble`, `boing`, `splat`, `fanfare`, `sparkle`, `clipClop`, `door`, `ding`, `squish` (rate-limited 0.15 s), `plop`, `bell`, `munch`, `say(key)`, `setMood('day'|'night')`, `getMood`, `setPlace('street'|'bakery'|'stars')`, `suspend`, `resume`. Keys starting with `_` are test hooks.
- Music: a marimba day song for the star game, a calmer marimba street song for the street and start page, a music-box and pizzicato bakery song, and a music-box night lullaby shared by all. `setPlace` picks the day song, `setMood` switches day/night; both crossfade at a bar boundary, and before `init()` the choice is remembered.
- Voice: `say('via'|'bravissima'|'laviamo'|'puliti'|'andiamo'|'chebuona'|'grazie')` uses Web Speech with `it-IT`.
  - Recorded mp3s are opt-in: drop `assets/sounds/<key>.mp3` and add the key to `RECORDED` in audio.js.
  - Unlisted keys are never requested, so missing files cause no 404s.
- `Sound.init()` (via `Core.snd('init')`) runs on **both** pointerdown and pointerup. Mobile browsers unlock audio on pointerup.

### core.js and scenes
- **Scenes** register with `Core.register(name, scene)`. A scene is `{home, clock, music, enter(args), exit(), update(dt), render(g), pointer(type, p), resize()}`; see the header of `js/core.js`.
  - `Core.go(name, args)` fades out (0.4 s, to the cream wall color), calls `exit()` then `enter(args)`, and fades in. `args` always exists and `args.from` is the previous scene's name (`null` at start). Taps are ignored during the fade, and a second `go` is dropped. `Core.after(sec, fn)` timers are cleared on every scene change.
  - `resize()` runs on the current scene after a resize (150 ms debounce), and before `enter()` when the size changed while the scene was away.
  - `music` (`'street'|'stars'|'bakery'|null`): on every scene switch the core calls `Core.snd('setPlace', music)` when it is set.
  - `pointer(type, p)`: the core captures pointers and sends `'down' | 'move' | 'up'` with `p = {id, x, y, dx, dy}`. Cancel, blur, hiding the page and scene changes send `'up'` for every finger, so nothing stays "held".
- **Buttons:** `#home` shows when the scene's `home` is set (`body.has-home`) and goes there: one level back, `stars` and `bakery` → `street` → `title`. Leaving full screen still goes to `title`. `body.playing` (hides `#title`) is set in every scene but `title`.
- **Day/night:** in `js/backdrop.js`, `CYC = { day: 75, sun: 12, night: 50, rise: 12 }` seconds. The cycle advances only in scenes with `clock: true` (the street and the star game). Skies and tinted hills are cached and crossfaded. Mood changes call `setMood`.
- **Storage:** `Core.load(key, fallbackKeys)` / `Core.store(key, value)`, always in try/catch with an in-memory copy. Best score in `bella.best`, saved on every point. The star total from every game in `bella.stars` (`Core.stars()`, `Core.addStars(n)`; the star game adds every point), which fills the jar; when missing it is seeded once from `bella.best`. The last 6 served cakes in `bella.cakes` (JSON `[{s, c, t: [[kind, x, y], ...]}]`, at most 40 toppings each, x and y in cake space 0..1; read in try/catch, corrupt data counts as `[]`). Mute state in `bella.muted` (written by audio.js). Both also read the old `stella.*` keys as a fallback: the unicorn was first misnamed Stella.
- **Start page** (`title`): HTML name, hero, play button and best-score medals.
  - Only the play button starts the game: `Core.goFullscreen()`, then `Core.go('street', {hero})`.
  - The play finger never counts as "hold" in the next scene: only fingers that go down in a scene reach it.
  - `#home` goes to the scene's `home`; leaving full screen goes to `title`.
  - iPhone Safari has no page full screen. There, "Add to Home Screen" (manifest `display: fullscreen`) is how to get it.
- **Street** (`street`): a side view `worldW = max(4 W, 5.5 M)` wide, ground line `groundY = H - max(0.14 H, 0.16 M)`. Places at fractions of `worldW`: `square` 0.12, `gate` 0.32, `house` 0.50, `bakery` 0.68, `pond` 0.88; Bella stays within 0.04..0.96.
  - Hold the left or right half: Bella trots that way at `min(max(0.35 W, 0.5 M), 1.2 * her height)` px/s (`clipClop` every half stride). A tap inside a place's tap target cancels the hold walk and walks her there; a new hold cancels that walk.
  - `gate`: "Andiamo!" and `Core.go('stars', {hero})`; from `stars` she lands back by the gate. `bakery`: `door` and `Core.go('bakery')`; from `bakery` she lands back at its door. `square`: the jar jiggles and the total rises over it as stars (as the start page's medal row). `house`, `pond`: closed for now (a wiggle, sparkles, `door`).
  - Bella is drawn `min(0.34 H, 0.55 W)` tall, from the star game's flying scale (`ppu`), so `Characters` keeps its 2 scales. Pose `walk` (0..1) and `stride` (walk phase, grows with the distance) are set here; `run` stays 0.
  - The town's size unit is `U = min(M, 0.8 H, 2 * Bella's height, (groundY - 0.18 H) / 1.36)` (the houses stay about twice Bella's height, and the tallest piece, 1.36 U, stays clear of the top-right buttons); `Town.build(U, DPR)` runs in `resize()`. Parallax: backdrop `camX * 0.25`, the mouse balloon 0.5, the street 1, front flowers 1.25.
- **Bakery** (`bakery`): `home: 'street'`, `clock: false`, `music: 'bakery'`. Modes `arrive` (the friend walks in, 2 s, sits, the wish bubble shows one random topping) → `pick` (3 shape buttons) → `oven` (`ding`, the cake slides out, 1.6 s) → `decorate` → `serve` (the give button or a tap on the friend rings the bell; Bongo carries the cake, 1.5 s) → `eat` (2.5 s, then 1 s happy) → `leave` (1.5 s) → `arrive` with the next friend in `Friends.KINDS` order (`off` while away).
  - **Decorate:** buttons for 4 creams, 6 toppings and the big give button `serve` (a cream disk: the cake, three dots, the friend's head; radius >= `0.08 M` and bigger than a tool, on the counter's edge by the friend, clear of the cake; the tools sit below it); the tool starts on `cream:pink`. Cream is stamped into the cake's own canvas on pointer events (never per frame), clipped by `cakeBase(shape).clip`. A topping tap on the cake adds it in cake space; off the cake nothing happens; past 80 toppings a tap only sparkles. A pointer `down` on the friend (`friendRect()`, not on the cake) serves like the give button; only `down` does. The cake needs no decoration: every cake is loved. The give button pulses and the friend hops softly from the first decoration (still with reduced motion). After 4 s idle (10 s with nothing on the cake) `Art.drawTapHint` alternates every 1.5 s between the friend and the give button; any `down` hides it. The bell sprite on the counter is only a picture.
  - **Stars:** 3 per served cake, +2 (confetti, `fanfare`, "Bravissima!") when the wish topping is on it, through `Core.addStars`, exactly once per cake (a guard flag in `reward()`). They fly to the visit's star row at the top left. Then the cake is saved to `bella.cakes`.
  - **Leaving mid-cake** (home) gives nothing and takes nothing; coming back starts a fresh visit by the same friend.
  - **Layout:** `u = min(M, 0.9 H)`, counter top `0.62 H`, oven / Bongo / cake / friend left to right (they overlap a little in portrait), buttons in one or two rows below the counter top, each at least `0.12 M` across. The values are in the header of `js/scenes/bakery.js`.
  - Bongo is drawn alone with `Characters.drawBongo(g, pose, ppu)` at the flying-scale ppu, 0.34 u tall; until it exists the scene draws a placeholder teddy.
- **Star game** (`stars`): modes `toFly` → `fly` → `toWash` → `wash` → `clean` → `toFly` (`off` while away).
  - **Mud:** when `st.sinceWash >= 15` a mud cloud spawns. Hitting it splashes splotches at the anchors. The rig is drawn to an offscreen canvas and the mud is drawn on it with `source-atop`. Rubbing cleans it; then +5 bonus stars.
  - **Milestones:** 10, 25, 50, then every 50 (`milestoneIn`). Each one gives confetti, a rainbow, `fanfare` and the voice "Bravissima!".
  - **Score bar:** a row of stars; every 10 stars fills one big star. No numbers.
- `DPR` is capped at 2.

## Conventions

- **Commits:** conventional commits (`feat:`, `fix:`, `docs:`, `chore:`). Small steps. End every message with the trailer `Assisted-by: Claude Code:<model>`, for example `Assisted-by: Claude Code:claude-opus-5-5`. Never add `Co-Authored-By` or `Signed-off-by`.
- **Commit or push only when the owner asks.**
- `.serena/` stays untracked on purpose, and `.venv/` is gitignored.
- **Agents:** at most 3 roles:
  - a UI/graphic designer (character art goes to a Fable-model subagent),
  - an implementer,
  - a sound designer.

  Give each one a file it owns, and tell it which files it must not touch.
- **Docs:** keep `README.md` in sync when you change how to play, the files, or the tools. Check every name you write against the code: an earlier README cited functions that did not exist.

## Deploying (GitHub Pages)

- Pages serves `main` at `/`. It was enabled with `gh api -X POST repos/gsanchietti/unicorn/pages -f "source[branch]=main" -f "source[path]=/"`.
- **Bump `VERSION` in `sw.js`** (for example `bella-v3` → `bella-v4`) whenever any cached file changes. Add new game files to `FILES` in `sw.js`, or they won't work offline. Phones pick up the new version on the next launch.
- **Cache-bust after a deploy when checking the live site.** In the page, `fetch()` each changed file with `{ cache: 'reload' }`, then `location.reload()`.
  - A `?v=N` query alone is not enough. Once the service worker is installed, it matches with `ignoreSearch: true`. Bump `VERSION` too, or unregister the worker in DevTools.

## Preview flow (the `town` work and `/next/`)

The fairy town work lives on branch `town`; `main` is the live game and stays as it is. To let the owner look at `town` on a phone without touching the live game, a copy of it is published at https://gsanchietti.github.io/unicorn/next/.

1. `git worktree add .worktrees/main main` (once; `.worktrees/` is git-ignored on `town`). Never switch the main checkout away from `town`.
2. `tools/publish-preview.sh . .worktrees/main`. It replaces `next/` on `main` with the game files only (`index.html`, `style.css`, `manifest.webmanifest`, `sw.js`, `js/`, `assets/icons/`, `assets/fonts/`; no photos, tools or tests) and renames the copied manifest app to "Bella e Bongo (prova)". It does not commit.
3. Commit in `.worktrees/main` (`chore: publish fairy town preview at /next/`) and push both branches, only when the owner asks.
4. The preview has its own service worker (`next/sw.js`, scope `/unicorn/next/`) and its own cache `bella-next-N` (`VERSION` in `sw.js` on `town`; bump it when a cached file changes). Both sw delete only their own old caches (`bella-next-*` and `bella-v*`), because the live game and the preview share one origin, and so share `localStorage` (`bella.best`, `bella.muted`).
5. The live `sw.js` on `main` has a guard at the top of its `fetch` handler that ignores `/next/` requests, and its `VERSION` was bumped to `bella-v4` so phones pick the guard up. Do not touch the live game otherwise.
6. When `town` replaces the live game later, its `sw.js` `VERSION` and cache prefix go back to the `bella-v` series.

## Asset tools

- **Icons.** Open `tools/icons.html?size=N&pad=P&crop=head` and screenshot `#icon`. `pad=0.12` is for the maskable icon; `crop=head` (Bella's head on a round badge) is for the 16/32 px favicons. The page sets `document.title = 'ready'` when it is drawn.
  - To render them, use a short puppeteer script: for each icon, set the viewport to size x size at DPR 1, `goto` the file:// URL, `waitForFunction(() => document.title === 'ready')`, then `(await page.$('#icon')).screenshot({ omitBackground: true })`.
  - Sizes: 16 and 32 with crop=head, 180 (`apple-touch-icon.png`), 192, 512, and 512 with pad 0.12 (`icon-maskable-512.png`).
- **Title font.** `assets/fonts/title.woff2` is a subset of Comfortaa Bold containing only the glyphs of "Bella e Bongo".
  - If you change the title text, re-subset it: `pyftsubset Comfortaa-Bold.otf --text="..." --flavor=woff2` (fonttools + brotli; Fedora path `/usr/share/fonts/aajohan-comfortaa-fonts/`).
  - Then rename the name-table entries `Comfortaa` → `Bella Title`, and the CFF font names to `BellaTitle`. OFL forbids keeping the Reserved Font Name on a modified font.
  - Keep `OFL.txt` next to it.
- **Photo cut-outs.** Use `tools/cutout.py` (rembg, default model `birefnet-general`) in a local venv: `python3 -m venv .venv && .venv/bin/pip install "rembg[cpu]" pillow numpy`. See the README for `--turn`. The first run downloads a large model.

## Gotchas learned the hard way

- `isnet-general-use` cut off Bongo's feet. Use `birefnet-general`.
- Filtering the photos into "drawings" with OpenCV looked smudgy and lost detail, so the owner rejected it. The characters are drawn in code instead. Don't retry the filter route.
- Listing voice mp3s that don't exist made a 404 and a console error on every load. That is why `RECORDED` is opt-in.
- Pages had a `favicon.ico` 404 until a real icon was linked.
- Chrome kept serving old JS after a deploy (see Deploying).
- One release was pushed without `index.html` and `style.css`. Run `git status` before you push.
- Web Audio offline renders never finish under headless Chrome's virtual time (`--dump-dom`). Drive audio tests over the DevTools protocol on a real-time page instead.

## Known issues

- Bongo's face blurs briefly during the head turn.
- From the side, the overall strap reads like a bag strap.
- Bella is pinker than the mauve toy.
- At the mint step of its color cycle, the horn turns greenish.
- The knees are round "ball" bumps, a little doll-like. When fully tucked, the front hooves continue the cannon line instead of dangling.
- No test on a real device yet. The `visibilitychange` pause and multi-touch are exercised only with synthetic events in headless Chrome.
