# Stella e Bongo

A gentle browser game for small children. Stella the unicorn flies with Bongo the teddy bear on her back and collects stars. There is nothing to read, no game over, and points are never taken away.

**Play online:** https://gsanchietti.github.io/unicorn/

## How to play

- **Tap or hold** the screen: Stella flies up. **Let go**: she floats down gently.
- Touch the **stars** to collect them. Clouds are harmless: Stella just bounces off them.
- After about 15 stars, a muddy cloud splashes them both. **Rub the screen** to wash off the mud. When they are clean you get 5 bonus stars.
- At the top, every 10 stars turn into one big star.
- At 10, 25, 50 stars, and every 50 after that: confetti, a rainbow and "Bravissima!".
- The round button at the top right turns the sound on and off. Sound starts after the first tap.

## Run it

Open `index.html` in a browser. That's it: no install and no build step.

To play on a phone or tablet on the same Wi-Fi, serve the folder and open the address shown:

```sh
python3 -m http.server 8000
# then open http://<your-computer-ip>:8000 on the device
```

## Swap in new photos

The characters are `assets/stella.png` and `assets/bongo.png`: transparent PNGs with a soft light outline. You can replace them with any transparent PNG. Stella should face right.

To make them from ordinary photos, use `tools/cutout.py`. It removes the background and adds the outline:

```sh
python3 -m venv .venv
.venv/bin/pip install "rembg[cpu]" pillow numpy        # once; the first run downloads a large model

.venv/bin/python tools/cutout.py assets/photos/stella.jpg assets/stella.png --turn transverse
.venv/bin/python tools/cutout.py assets/photos/bongo.jpg  assets/bongo.png
```

- `--turn` rotates or flips the photo so the character stands upright facing right: `none`, `left`, `right`, `flip`, `transverse`, `transpose`.
- Photos on a plain, light background cut out best.
- If Bongo looks too big or sits in the wrong place on Stella's back, change `BONGO_X`, `BONGO_BOTTOM` and `BONGO_H` near the top of `js/game.js`. The mud spots are placed in `SPLOT_DEF`, in `composeHero()`.

## Use recorded voices

The voice cues use the browser's Italian voice. To use your own recordings, put the MP3 files in `assets/sounds/` and list their names in `RECORDED` in `js/audio.js`:

| File | Says | When |
|---|---|---|
| `via.mp3` | "Si vola!" | the game starts |
| `bravissima.mp3` | "Bravissima!" | milestones |
| `laviamo.mp3` | "Laviamoli!" | the washing starts |
| `puliti.mp3` | "Che puliti!" | they are clean |

## Files

- `index.html`, `style.css`: the page, paper texture and mute button
- `js/art.js`: watercolor drawings (sky, hills, stars, clouds, mud, rainbow, bubbles)
- `js/audio.js`: sounds and music made in code, plus voice cues
- `js/game.js`: the game itself
- `assets/`: character pictures; `assets/photos/` holds the original photos
- `tools/cutout.py`: background removal for new photos

## License

GPL-3.0. See `LICENSE`.
