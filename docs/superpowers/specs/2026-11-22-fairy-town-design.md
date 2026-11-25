# Fairy town: a small world with several games

Status: approved by the owner, 2026-11-22.

## Intent

The game is for the owner's 5-year-old daughter. She asked for more than one game: a small world to wander in, where the current flying game is one of several places. Bella the unicorn and Bongo the teddy arrive in a little fairy town. They go into a bakery where Bongo decorates cakes and serves them to friends. At a pond they catch squishy octopuses with soap bubbles from Bella's horn.

The world should feel like **her bedroom wall come alive**. The owner sent photos of the hand-painted mural in her room and of two of her plush toys. Everything gets redrawn in that style.

## Goals

- **The street:** a fairy-town street seen from the side, a few screens wide. Bella (with Bongo on her back) trots along it. Every house or place is a door to a game.
- **Three games in the first full version:**
  1. **Stars:** the existing flying game, unchanged in rules.
  2. **Bakery:** decorate cakes and serve them to friends.
  3. **Bubble pond:** catch octopuses in soap bubbles shot from Bella's horn.
- **Physics extras the owner liked:**
  - Squishy clouds that wobble and push Bella into a small hop.
  - Bubbles that bump each other.
  - A star jar that fills up with every star.
- **One art style for everything,** copied from the mural (see Style).
- **Shared progress:** stars earned anywhere add to one total, shown in the jar.

## Non-goals

- No text for the child to read. The start page name "Bella e Bongo" is for parents.
- No game over, no lives, no timers that punish, no wrong answers. Points are never taken away.
- No accounts, no network features, no ads, no in-app purchases.
- No big open world. A handful of places is enough; it can grow later.
- Pasta-making is out of the first version. It may come later as a second counter in the bakery.

## Anti-goals (a failure even if it works)

- **Anything frightening or sad.** No chasing, no "dying", no losing friends. Octopuses are never hurt: a bubble flips them to their happy side and they float up giggling.
- **Mixed styles.** If Bella and Bongo still look like the old pastel drawings next to an ink-outlined town, it fails the "wall come alive" feel.
- **Getting lost.** She must always know how to get back: one home button, the same everywhere.
- **Fiddly controls.** Everything must work with one finger and big targets, for a child who can't read and has small, imprecise hands.

## Constraints (carried over, not negotiable)

- Plain HTML/CSS/JS. No build step, classic scripts (no modules). It must still run when `index.html` is opened from disk.
- Touch-first pointer events, 60 fps on mid-range phones, canvas rendering, a DPR-scaled canvas (max 2), prefers-reduced-motion respected, the mute button kept.
- Works offline and installs to the home screen: the service worker (`sw.js`) caches every file. Each release bumps `VERSION`, and new files are added to `FILES`.
- **Audio:**
  - All sounds are synthesized in code (Web Audio). Italian voice cues come from Web Speech.
  - Audio must never break the game.
  - The sound must not need re-unlocking between places, so everything stays on one page.
- **Data:** saved in localStorage, every access inside try/catch. Existing keys: `bella.best`, `bella.muted`, with the old `stella.*` keys read as a fallback.
- **License:** GPL-3.0. Any library added must be compatible: Matter.js is MIT.
- **Process** (the owner's rules):
  - Commit in small conventional commits ending with the `Assisted-by` trailer. Push only when asked.
  - At most 3 agent roles: designer, implementer, sound designer.
  - The **hardest tasks** go to a **Fable-model subagent**: the style switch, drawing characters, complex animation.
  - Test in headless Chrome, at phone and tablet sizes, before saying anything works.

## Source material

Photos from the owner, in `assets/photos/ref/`. They are resized to at most 1600 px and saved without EXIF data (no location or camera info). The owner agreed they can be public in the repo. They are references only: not in the service worker's `FILES` and not loaded by the game.

| Photo | What it is | Used for |
|---|---|---|
| `husky.jpg` | White and grey plush husky, light-blue inner ears, big glittery blue eyes, cream muzzle, sitting | Bakery friend 1 |
| `octopus.jpg` | Reversible octopus: red with a small smile on one side, blue on the other | The octopuses in the bubble pond |
| `mural-house.jpg` | Orange house with a red roof and a small tower, green round trees, turquoise river, clothesline with little clothes, fox with balloons, small bear on a blue cloud, dog | Street houses, trees, river, decorations |
| `mural-mushrooms.jpg` | Pink and purple bellflower mushroom houses with dotted edges, round yellow windows and doors, curly stems, swirly paths | The bakery (the big pink one) and other town houses |
| `mural-moon.jpg` | Yellow crescent moon with a red ladder, puffy blue clouds, yellow stars, balloons | Night sky, the sky gate to the star game, clouds |
| `mural-mouse-balloon.jpg` | Brown mouse with big eyes in a basket under a yellow patched hot-air balloon | Bakery friend, and floating over the street |
| `mural-girl.jpg` | A girl in a yellow dress with three balloons, seen from behind | Decoration only, unless the owner wants more |
| `mural-pagi.jpg` | Brown dog with long ears, big eyes, black nose and a yellow collar reading "PAGI", with a bee | Bakery friend |
| `mural-lizard.jpg` | Pink-to-orange lizard with big googly eyes, with a butterfly | Bakery friend, or lives by the pond |

Existing: `assets/photos/bella.jpg` and `assets/photos/bongo.jpg` (the two toys), with cut-outs `assets/bella.png` and `assets/bongo.png`.

## Style

The mural's look applies to everything, Bella and Bongo included:

- **Outlines:** dark ink, near-black and slightly uneven, a bit thicker on the silhouette. This replaces today's thin lilac outlines.
- **Fill:** colored pencil and light watercolor, with a visible pencil grain and uneven color. Lighter at the edges, sometimes with white dotted trims (the mushroom houses).
- **Faces (owner's decision):** characters keep the eyes of what they're drawn from.
  - Bella and Bongo keep their **toy eyes**: only their outlines and coloring change, and their faces stay true to the real toys.
  - The plush friends keep their plush eyes: the husky's glittery blue eyes, the octopus's small black dots.
  - The wall characters (Pagi, the mouse, the lizard) keep their big round googly eyes with black pupils.
  - Everyone smiles at rest, except the octopus's blue side (see The bubble pond).
- **Palette:** the mural's turquoise river, leaf green, warm orange, red roof, mushroom pink and purple, sky blue clouds, soft yellow moon and stars, on a white-cream wall-like background.
- **Background:** a wall-like cream ground with painted elements, as on the mural, rather than today's full pastel sky gradient. The day/night cycle stays: at night the background turns deep blue, the moon with its ladder comes out, and windows light up.
- **Kept:** the glow, sparkles, confetti and the rainbow are kept but drawn in the new style. The paper grain overlay is retuned to read like a painted wall.

Bella and Bongo are redrawn by the Fable designer from the photos and the current rig, in the new style. The rig's API stays (`draw(g, pose, ppu)`, anchors, poses), and walking is added as a new pose.

## How it's built

### Approaches considered

1. **One page, one file per place (chosen).**
   - A shared core: loop, input, audio, art helpers, characters, the star total and the jar.
   - Plus one scene file per place: street, bakery, pond, stars.
   - Instant moves between places with a fade, and music that carries on.
   - Fits every constraint above.
2. **A separate HTML page per game.**
   - Rejected: every door reloads the page, audio needs a new tap to unlock, and state goes through localStorage.
3. **A game framework (e.g. Phaser).**
   - Rejected: all art and the character rig would be rebuilt its way, it's heavy to keep offline, and it doesn't fit the hand-drawn code art.

The owner accepted approach 1 (my pick).

### Architecture

**Shared core (`js/core.js`):** owns the canvas, resize/DPR, the rAF loop, pointer input, the mute and home buttons, `visibilitychange`, the service worker registration and the save data.

**Scenes:** each scene registers with the core as an object that defines:
- `enter(from, args)` and `exit()`,
- `update(dt)` and `render(g)`,
- `pointer(type, p)`,
- `resize()` and `music`.

The core switches scenes with a short fade, about 0.4 s.

**Scenes:**

| Scene | File | Origin |
|---|---|---|
| `title` | `js/scenes/title.js` | Start page. Play goes to the street. |
| `street` | `js/scenes/street.js` | New. The hub. |
| `stars` | `js/scenes/stars.js` | Today's `js/game.js`, moved over with its rules unchanged. |
| `bakery` | `js/scenes/bakery.js` | New. |
| `pond` | `js/scenes/pond.js` | New. |

**Shared art (`js/art.js`, restyled):** gains ink-outline and pencil-grain helpers. Each new scene's art lives with it, or in `js/art-town.js` if that's cleaner.

**Characters:**
- `js/characters.js`: Bella and Bongo, restyled.
- `js/friends.js`: husky, Pagi, mouse, lizard, octopus, each with simple poses (idle, happy, eating, walk-in).

**Audio (`js/audio.js`):**
- Gains a street tune, a bakery tune and a pond tune, all in the same cheerful style.
- New sound effects: walking clip-clop, door chime, oven ding, cream squish, topping plop, bell, eating, bubble shot, octopus giggle, flip.
- New voice cues: "Che buona!", "Grazie!", "Preso!", "Andiamo!".

**Physics:** Matter.js (MIT) is vendored as `js/vendor/matter.min.js` and cached by the service worker. It is used only where it earns its place: the star jar, pond bubbles and octopuses. The cloud squish and hop are hand-made springs.

**Navigation:**
- The home button (top right, next to mute) goes back **one level**: from a game to the street, from the street to the start page.
- Leaving full screen still goes to the start page.

**Save data:**
- `bella.stars`: the total of stars from all games, which fills the jar.
- `bella.best`: kept for the star game.
- `bella.cakes`: the last few cakes made, as small data, so they can be shown in the bakery window. Optional.

### The street

- Seen from the side, about 4 screens wide. The camera follows Bella. Parallax layers: wall background, far trees and houses, the street, front flowers.
- **Moving:** hold the left or right half of the screen and Bella trots that way, with a clip-clop. Release and she stops and idles (Bongo looks at the player now and then).
- **Entering:** tap a door or place. Bella walks to it automatically and the scene fades in. Each door has a big picture sign and bobs gently when she's near:
  - **Bakery:** the big pink mushroom house. A cake sign.
  - **Pond:** the turquoise river with lily pads. An octopus peeking out.
  - **Sky gate:** a cloud with the moon's ladder. A star sign. Opens the star game. Afterwards they land back by the gate.
  - **Town square:** the star jar on a little stand. Tapping it makes it jiggle and shows the total as stars, never numbers.
- **Life:** the mouse drifts over in its balloon, the fox's balloons sway, the clothesline flaps, the bee buzzes around Pagi, butterflies float. At night: the moon and ladder, lit windows, fireflies.

### The bakery

The loop repeats until she leaves through the door (home button):

1. **A friend walks in** and sits at the counter, with a picture bubble of a wish, for example a strawberry. It's a hint, not a test. Friends come in turns: husky, Pagi, mouse, lizard.
2. **Pick a cake:** round, heart or tall, in 3–4 pastel colors. That's at most 6 big buttons. Bongo slides it out of the oven, with a "ding".
3. **Decorate:** the main part, with no time limit.
   - Swipe to spread cream in the chosen color.
   - Tap to drop toppings where the finger is: strawberries, chocolate drops, sprinkles, flowers, stars, candles.
   - Everything sticks where it's put, with plops, sparkles and a little bounce.
   - The toppings shelf shows 6–8 big icons.
4. **Serve:** tap the bell. Bongo carries the cake over, and the friend eats it with crumbs and a happy wiggle, then gives stars (3).
   - If the wish topping is on the cake: +2 stars, confetti and "Bravissima!".
   - Every cake is loved.
5. The next friend comes in.

The finished cakes appear small in the bakery window, the last 6. It's optional, and skipped if it costs too much.

### The bubble pond

- **Shooting:** Bella flies over the pond, as in the star game: hold to rise, release to float down. Bubbles leave her horn by themselves, about one every 0.8 s, so the child only steers. This was chosen so a 5-year-old can't fail at "aiming plus flying". A tap can also shoot an extra bubble.
- **Octopuses:** blue-side-up, they bob in the water and pop up in gentle arcs. The blue side is **grumpy**, like the toy's (owner's decision). No photo of it exists, so the designer draws it: the usual reversible-octopus pout, with a small frown and droopy, half-closed eyes. When a bubble touches one, it flips to the red smiling side inside the bubble with a big happy "pop" of color, giggles and floats up to a cloud "nursery" at the top. Each one gives 1 star.
  - The grumpiness is gentle and funny, never scary: soft pouty mouth, no teeth, no angry movement. It never chases or bumps Bella.
  - The flip to happy is the payoff, so it must be big and joyful.
- **Bubbles:** they bump each other and wobble (Matter.js). They pop softly after a few seconds or at the top.
- No misses count, and no octopus is ever left grumpy for long: any still blue after about 20 s flips by itself with a giggle. Every 10 caught: confetti, "Bravissima!", and the nursery cloud does a happy rain of stars.

### Physics extras

- **Squishy clouds** (star game and street sky): when Bella touches a cloud, it squashes and wobbles like jelly (a spring) and pushes her into a small hop upward with a "boing". The hop is capped so she stays on screen, and it works even while held.
- **Star jar** (town square, and shown briefly after each game): a glass jar where every earned star drops in and piles up, simulated with Matter.js.
  - It keeps at most about 60 bodies. Older stars merge into a big star at the bottom every 10, so the jar never overflows and the physics stays cheap.
  - The total is never shown as a number.
- **Bubble bumping:** in the pond, and also in the washing step of the star game.

## Changes after the step 1 preview (owner, 2026-11-24)

The owner approved the new look and asked for these before step 2:

- **Bella's tail** looks like a horse's tail: long flowing hair from the dock, not a pom-pom. It keeps its two colors (pink and lilac-white).
- **Bella's mane** sits on the neck without gaps. Today it looks a little detached.
- **The mud cloud can be avoided.** It flies in at its own height and no longer follows Bella. If she flies around it, it drifts away and comes back a few stars later. Hitting it still leads to the wash, as before.
- **Levels in the star game.** Each full big star in the score bar (every 10 stars) is a new level, and the game gets a little quicker: the world moves 10% faster per level, capped at 1.8x. Bella's up and down control does not change. Every new game starts at level 1. This replaces "unchanged in rules" in Goals for the star game.

## Delivery order

**The current game stays live and unchanged until the new world is ready** (owner's decision). The work happens on a `town` branch, and `main` (the live game at https://gsanchietti.github.io/unicorn/) isn't touched.

Each step is playable and, when done, published as a **preview** at https://gsanchietti.github.io/unicorn/next/, so it can be tried on a phone:
- The preview is a copy of the `town` branch's game files in a `next/` folder on `main`. Only that folder changes.
- It has its own service worker, with its own cache name (`bella-next-…`) and scope (`next/`), so it never touches the live game's offline copy.
- The live game's `sw.js` must not serve or cache anything under `next/`.

When the whole new world is ready and the owner says so, `town` replaces the live game, and `next/` is removed.

After step 1, work stops until the owner has tried the preview and approved the new look of Bella and Bongo. It's the riskiest step, and everything after it is drawn in that style.

1. **Style switch and scenes.** Split into core and scenes, the star game moved over unchanged. Bella, Bongo, the sky, clouds and stars redrawn in the wall style (Fable). The street doesn't exist yet: play goes straight to the star game.
2. **The street,** with the sky gate into the star game, and the town square with a static jar.
3. **The bakery,** with the husky as the first friend, then Pagi, the mouse and the lizard (Fable draws the friends).
4. **The bubble pond,** with the octopuses.
5. **Physics extras:** squishy clouds and hop, the Matter.js star jar, bumping bubbles.
6. **The house: hide and seek** (owner, 2026-11-25). The orange house on the street opens. Inside, the friends (husky, Pagi, mouse, lizard, an octopus) hide behind the sofa, the curtains, a basket, the wardrobe door and other furniture, with a tail or ears peeking out. A tap on a hiding spot makes it wiggle, and the friend pops out giggling: 1 star each. When everyone is found they all cheer, then hide again in new spots. Nothing to read, no wrong taps (an empty spot just wiggles), one finger.

## Left to the builder

- Exact sizes, speeds, colors and timings, tuned by playing at phone and tablet sizes.
- How the art helpers are split between files.
- The scene API details beyond the shape above.
- How music crossfades between places.
- Whether pond bubbles and octopuses use Matter.js, or simpler hand-made circles, if Matter.js costs too much on phones.

## Open questions for the owner (with defaults, so work isn't blocked)

- **Names** of the husky plush, the octopus, the mouse and the lizard. Pagi is named on the mural.
  - Default: no names on screen are needed (nothing to read). Names only appear in voice lines, which can be added later.
- **Who's in the bakery.**
  - Default: all four (husky, Pagi, mouse, lizard) take turns as friends. The mouse also floats over the street in its balloon, and the lizard also sits by the pond.
- **The girl with balloons.**
  - Default: she stays out of the game.

