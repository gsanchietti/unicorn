# Stella e Bongo

A gentle browser game for small children. Stella the unicorn flies with Bongo the teddy bear on her back and collects stars. There is nothing to read, no game over, and points are never taken away.

**Play online:** https://gsanchietti.github.io/unicorn/

## How to play

- **Tap or hold** the screen: Stella flies up. **Let go**: she floats down gently.
- Touch the **stars** to collect them. Clouds are harmless: Stella just bounces off them.
- After about 15 stars, a muddy cloud splashes them both. **Rub the screen** to wash off the mud. When they are clean you get 5 bonus stars.
- At the top, every 10 stars turn into one big star.
- At 10, 25, 50 stars, and every 50 after that: confetti, a rainbow and "Bravissima!".
- After a while the sky turns to sunset and a cozy night with a smiling moon, then back to day. The music changes from a happy tune to a lullaby.
- The round button at the top right turns the sound on and off. Sound starts after the first tap.

## Run it

Open `index.html` in a browser. That's it: no install and no build step.

To play on a phone or tablet on the same Wi-Fi, serve the folder and open the address shown:

```sh
python3 -m http.server 8000
# then open http://<your-computer-ip>:8000 on the device
```

## The characters

Stella and Bongo are drawn in code in `js/characters.js`, copied from the photos of the real toys in `assets/photos/`. Each character is made of separate parts, so Stella gallops and Bongo turns to the player, waves and smiles. Stella's horn and butterfly slowly change color like toy lights, and flash on every star.

To change how they look, edit `js/characters.js`. Its header describes the parts and the poses.

`assets/stella.png` and `assets/bongo.png` are cut-outs of the photos, used as references while drawing. To make cut-outs of new photos, use `tools/cutout.py`. It removes the background and adds a soft outline:

```sh
python3 -m venv .venv
.venv/bin/pip install "rembg[cpu]" pillow numpy        # once; the first run downloads a large model

.venv/bin/python tools/cutout.py assets/photos/stella.jpg assets/stella.png --turn transverse
.venv/bin/python tools/cutout.py assets/photos/bongo.jpg  assets/bongo.png
```

`--turn` rotates or flips the photo so the character stands upright facing right: `none`, `left`, `right`, `flip`, `transverse`, `transpose`.

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
- `js/characters.js`: Stella and Bongo, drawn and animated
- `js/game.js`: the game itself
- `assets/photos/`: photos of the real toys; `assets/*.png`: their cut-outs, used as drawing references
- `tools/cutout.py`: background removal for new photos

## License

GPL-3.0. See `LICENSE`.
