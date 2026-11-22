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
- **Audio must never break the game.** `game.js` calls audio only through `snd(name, ...)`, which wraps everything in try/catch.
- **Every `localStorage` access is inside try/catch** (private mode can throw).
- **Style:** soft watercolor, pastel palette (pink, lilac, sky blue, star yellow, white; see `Art.PAL`), round shapes only, nothing sharp or scary, big glowing pulsing stars.
- **The characters must look like the real toys and must smile.** The owner rejected "grumpy" faces.

## Run and test

```sh
xdg-open index.html                  # works straight from file://
python3 -m http.server 8000          # needed to test the service worker / phone on the LAN
```

**Test before saying something works.** Two ways:

1. **puppeteer-core + headless system Chrome.** puppeteer-core is not a repo dependency, so install it in a scratch folder (`npm i puppeteer-core`). Use `puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--autoplay-policy=no-user-gesture-required'] })`.
   - Sizes used so far: phone 390x844 and 844x390 (DPR 3, `hasTouch`, `isMobile`), tablet 1024x768 and 768x1024 (DPR 2).
   - Collect `console` errors and warnings, `pageerror` and `requestfailed`. The expected result is an empty list.
   - Full play-through:
     1. Tap the play button. It is at `(W/2, 0.65*H)` with radius `0.14*min(W,H)` (`playButton()` in game.js). Taps elsewhere on the start page do nothing.
     2. Hold, and check that `__bella.st.hero.y` goes down; release, and check that it goes up.
     3. Set `__bella.st.sinceWash = 15` to get the mud cloud, then wait for mode `wash`.
     4. Rub by dispatching `PointerEvent`s on `#game`, or call `__bella.cleanAll()`. Check the +5 bonus.
     5. Call `__bella.addPoints(24)` to trigger a milestone. Reload and check `bella.best`.
2. **The owner's real Chrome** through the Claude-in-Chrome extension (allowed). Use it for real fps and for the live site. If your test plays leave a `bella.best` in that browser, remove it afterwards. Leave `bella.muted` alone: the owner may have set it.

**Debug hook `window.__bella`:**
- `st` (the full state; `st.mode`, `st.score`, `st.hero`, `st.cyc`), `pose`.
- `addPoints(n)`, `goHome()`, `getDirty()` (mud amounts), `cleanAll()`.
- `setTime('day'|'sunset'|'night'|'sunrise')`.

Not yet tested: a real phone or tablet, the pause on `visibilitychange`, and multi-touch.

## Architecture and file map

Script order in `index.html` matters: `js/art.js`, `js/characters.js`, `js/audio.js`, `js/game.js`. Each file starts with a header comment that describes its API. Read it first.

| File | Global | What it does |
|---|---|---|
| `js/art.js` | `window.Art` | Watercolor sprites and backgrounds, pre-rendered to canvases (`starSprite`, `cloudSprite`, `bubbleSprite`, `paintSky`, `paintSunsetSky`, `paintNightSky`, `paintHills`, `makeSplotch`/`drawSplotch`, `drawRainbow`, `drawSponge`, `drawPlayButton`, `drawMedal`, `drawMoon`, ...). `PAL` is the palette. |
| `js/characters.js` | `window.Characters` | Puppet rig for Bella and Bongo, drawn in code. |
| `js/audio.js` | `window.Sound` | All sound synthesized with Web Audio, plus Italian voice cues. |
| `js/game.js` | none (exposes `window.__bella`) | Modes, input, scoring, day/night cycle, rendering loop. |
| `index.html`, `style.css` | | Page shell: `canvas#game`, `.paper` grain overlay (SVG feTurbulence, multiply), `#title`, `#home`, `#mute`, the `Bella Title` @font-face. |
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
- `Characters.prerender(ppu)` caches part sprites for the **2 most recent** scales only. game.js passes just two fixed values, `S.ppuFly` and `S.ppuWash`, so the cache is never rebuilt mid-game. Do not pass a continuously changing scale.
- `Characters.anchors`: rest-pose points used to place mud (`bellaHind`, `bellaBelly`, `bellaChest`, `bellaNeck`, `bellaCheek`, `bellaLegBack`, `bellaLegFront`, `bongoCheek`, `bongoTummy`, `bongoArm`, `body`).
- Authoring spaces: Bella is drawn in "bella.png space" (657x700) and mapped into the rig with `R()`; Bongo is drawn in "bongo.png space" (519x700) and mapped with `B()`.
- Bella's horn and butterfly color-cycle like toy lights (`GLOW_STEPS = 24`) and flash on each star. Bongo wears blue crocheted overalls, has a small rabbit-like pom-pom tail, rides in profile and turns his face now and then.
- Bella's legs are jointed: upper leg, round knee (front) or hock (hind), cannon, fetlock, hoof. Each leg is still one path, so joints show no seams. Knee roundness is tuned by `knee` / `kneeOff` in `SHAPE_FRONT` / `SHAPE_HIND`; the joint angles come from `legPose`.

### audio.js
- API: `init`, `isMuted`, `setMuted`, `toggleMute`, `star(n)`, `bubble`, `boing`, `splat`, `fanfare`, `sparkle`, `say(key)`, `setMood('day'|'night')`, `getMood`, `suspend`, `resume`. Keys starting with `_` are test hooks.
- Music: a marimba day song and a music-box night lullaby. `setMood` crossfades between them at a bar boundary.
- Voice: `say('via'|'bravissima'|'laviamo'|'puliti')` uses Web Speech with `it-IT`.
  - Recorded mp3s are opt-in: drop `assets/sounds/<key>.mp3` and add the key to `RECORDED` in audio.js.
  - Unlisted keys are never requested, so missing files cause no 404s.
- `Sound.init()` (via `snd('init')`) runs on **both** pointerdown and pointerup. Mobile browsers unlock audio on pointerup.

### game.js
- **Modes:** `title` → `toFly` → `fly` → `toWash` → `wash` → `clean` → `toFly`. `setMode(m)` toggles `body.playing`, and CSS uses that class to hide `#title` and show `#home`.
- **Mud:** when `st.sinceWash >= 15` a mud cloud spawns. Hitting it splashes splotches at the anchors. The rig is drawn to an offscreen canvas and the mud is drawn on it with `source-atop`. Rubbing cleans it; then +5 bonus stars.
- **Milestones:** 10, 25, 50, then every 50 (`milestoneIn`). Each one gives confetti, a rainbow, `fanfare` and the voice "Bravissima!".
- **Score bar:** a row of stars; every 10 stars fills one big star. No numbers.
- **Day/night:** `CYC = { day: 75, sun: 12, night: 50, rise: 12 }` seconds. `st.cyc` advances only outside `title`. Skies and tinted hills are cached and crossfaded. `updateMood()` calls `setMood`.
- **Storage:** best score in `bella.best`, saved on every point. Mute state in `bella.muted` (written by audio.js). Both also read the old `stella.*` keys as a fallback: the unicorn was first misnamed Stella.
- **Start page:** HTML name, hero, play button and best-score medals.
  - Only the play button starts the game. The play tap also calls `goFullscreen()`.
  - That first touch is marked `sup` and does not count as "hold" until it is lifted.
  - `#home` and leaving full screen (`onFsChange`) both call `goHome()`.
  - iPhone Safari has no page full screen. There, "Add to Home Screen" (manifest `display: fullscreen`) is how to get it.
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
- No test on a real device yet. The `visibilitychange` pause and multi-touch have not been exercised.
