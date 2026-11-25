/* art-pond.js - the painted pieces of the bubble pond: the water, lily pads,
 * reeds, the lizard's rock, the nursery cloud and the soap bubbles, in the style
 * of the bedroom-wall mural. Classic script: window.Pond. Needs window.Art
 * (js/art.js) loaded first.
 *
 * PLACEHOLDER drawings for now: the designer replaces the bodies of the painting
 * functions. The API, the sizes and the anchors below are what
 * js/scenes/pond.js lays the pond out with, and stay as they are.
 *
 * Sizes: `u` is the scene's size unit in CSS px, u = min(M, 0.9 H). Everything is
 * pre-rendered into canvases at DPR in build() (a bubble when first asked for a
 * radius); the scene only blits them per frame: no shadowBlur, no filters, no
 * grain per frame. Every {c, w, h} below is a canvas c of (w x h CSS px) x DPR.
 *
 *   Pond.build(u, DPR)          (re)builds every piece for this size. The scene
 *                               calls it from its resize().
 *   Pond.waterTile() -> {c, w, h}
 *                               u x 0.5 u: a band of turquoise water with ripples
 *                               and a dotted wave line along its top, repeating
 *                               horizontally. Its TOP edge is the waterline: the
 *                               scene draws it with its top at the waterline
 *                               (0.78 H), side by side every w px, scrolling left;
 *                               below it (screens taller than 0.5 u under the
 *                               waterline) it fills with Art.PAL.riverDeep.
 *   Pond.sprite(kind, night) -> {c, w, h}
 *                               ANCHORED AT BOTTOM CENTER: draw it with
 *                               g.drawImage(c, x - w / 2, y - h, w, h). kind:
 *       'lily'        0.22 u x 0.06 u, a lily pad lying flat on the water. The scene
 *                     puts the anchor 0.03..0.12 u below the waterline.
 *       'lilyFlower'  0.22 u x 0.15 u, a lily pad with a pink water lily on it;
 *                     placed like 'lily'.
 *       'reeds'       0.18 u x 0.4 u, a tuft of reeds with two cattails. The scene
 *                     draws it BEHIND the water band, anchor 0.06 u below the
 *                     waterline, so the water hides its foot.
 *       'rock'        0.26 u x 0.11 u, a round mossy rock sticking out of the water,
 *                     anchor 0.04 u below the waterline. The lizard (Friends.draw
 *                     'lizard', 'sit', drawn 0.19 u tall) sits with its bottom center
 *                     on the rock's top, 0.92 h above the anchor.
 *                     night = true: the same pieces with dimmed colors and a couple of
 *                     fireflies.
 *   Pond.nursery() -> {c, w, h}
 *                               0.8 u x 0.28 u: the big puffy nursery cloud where the
 *                               caught octopuses go, ANCHORED AT ITS CENTER
 *                               (g.drawImage(c, x - w / 2, y - h / 2, w, h)). The scene
 *                               may draw it smaller (in landscape it is at most 0.16 H
 *                               tall) and squashes it for its jiggle. The caught
 *                               octopuses sit along its middle, at half their size.
 *   Pond.bubble(r) -> {c, r}    a soap bubble of radius r CSS px, with a rainbow sheen
 *                               and a highlight. c is a canvas of c.lw x c.lw CSS px
 *                               (x DPR) with the bubble at its center; the scene draws
 *                               it centered and scaled for a growing bubble or the big
 *                               bubble around a caught octopus. Cached per rounded
 *                               radius; at most 4 sizes are kept (the scene uses 2).
 */
(function () {
  'use strict';

  var Art = window.Art, PAL = Art.PAL;
  var TAU = Math.PI * 2;
  var U = 100, DPR = 1;
  var water = null, nurse = null, spr = {}, sprN = {}, bubbles = {}, nBubbles = 0;

  // A painted piece: a canvas of w x h CSS px at DPR, painted in CSS px.
  function piece(w, h, paint) {
    var c = Art.makeCanvas(w * DPR, h * DPR), g = c.getContext('2d');
    c.lw = w; c.lh = h;
    g.scale(DPR, DPR);
    paint(g, c, w, h);
    return { c: c, w: w, h: h };
  }
  function lw() { return Math.max(1.5, U * 0.008); }
  function blob(g, x, y, rx, ry, fill, rot) {
    g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
    g.fillStyle = fill; g.fill();
  }

  // ------------------------------------------------------------- the water
  function paintWater() {
    var w = Math.round(U), h = Math.round(U * 0.5);
    return piece(w, h, function (g, c) {
      var gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, PAL.river); gr.addColorStop(1, PAL.riverDeep);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      Art.pencil(c, PAL.riverDeep, 41, 0.7);
      // ripples: short pale arcs, in whole repeats of the tile so it joins up
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineCap = 'round';
      g.lineWidth = Math.max(1.5, U * 0.01);
      var rand = Art.rng(7), i;
      for (i = 0; i < 9; i++) {
        var x = rand() * w, y = h * (0.2 + rand() * 0.7), rw = U * (0.04 + rand() * 0.05);
        for (var k = -1; k <= 1; k++) {
          g.beginPath(); g.ellipse(x + k * w, y, rw, rw * 0.25, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
        }
      }
      // the dotted wave line along the top (4 waves per tile)
      var amp = U * 0.012, n = 4;
      Art.ink(g, lw());
      g.beginPath();
      for (i = 0; i <= 64; i++) {
        var px = w * i / 64, py = amp + 1 + Math.sin(px / w * n * TAU) * amp;
        if (i) g.lineTo(px, py); else g.moveTo(px, py);
      }
      g.stroke();
      g.fillStyle = '#ffffff';
      for (i = 0; i < n * 3; i++) {
        var dx = w * (i + 0.5) / (n * 3);
        g.beginPath(); g.arc(dx, amp * 3.6 + Math.sin(dx / w * n * TAU) * amp, U * 0.006, 0, TAU); g.fill();
      }
    });
  }

  // ------------------------------------------------------------ the pieces
  var PAINT = {
    lily: function () {
      return piece(U * 0.22, U * 0.06, function (g, c, w, h) {
        g.beginPath();
        g.ellipse(w / 2, h / 2, w * 0.46, h * 0.4, 0, 0.15, TAU - 0.15);
        g.lineTo(w / 2, h / 2);
        g.closePath();
        g.fillStyle = PAL.leaf; g.fill();
        Art.pencil(c, PAL.leafDeep, 3, 1);
        Art.ink(g, lw()); g.stroke();
      });
    },
    lilyFlower: function () {
      return piece(U * 0.22, U * 0.15, function (g, c, w, h) {
        var py = h - U * 0.03;
        g.beginPath();
        g.ellipse(w / 2, py, w * 0.46, U * 0.024, 0, 0.15, TAU - 0.15);
        g.lineTo(w / 2, py);
        g.closePath();
        g.fillStyle = PAL.leaf; g.fill();
        Art.ink(g, lw()); g.stroke();
        for (var i = -2; i <= 2; i++) {
          blob(g, w / 2 + i * U * 0.018, py - U * 0.045, U * 0.022, U * 0.045, i % 2 ? PAL.pink : PAL.mushroom, i * 0.35);
          g.stroke();
        }
        blob(g, w / 2, py - U * 0.035, U * 0.02, U * 0.014, PAL.yellow);
        g.stroke();
        Art.pencil(c, PAL.mushroomDeep, 5, 0.6);
      });
    },
    reeds: function () {
      return piece(U * 0.18, U * 0.4, function (g, c, w, h) {
        g.lineCap = 'round';
        var blades = [[0.3, 0.75, -0.2], [0.45, 0.95, -0.05], [0.58, 0.85, 0.12], [0.72, 0.65, 0.3]];
        blades.forEach(function (b) {
          var x0 = w * b[0], top = h * (1 - b[1]), x1 = x0 + w * b[2];
          g.beginPath(); g.moveTo(x0 - U * 0.012, h); g.quadraticCurveTo(x0, h * 0.5, x1, top);
          g.quadraticCurveTo(x0 + U * 0.01, h * 0.5, x0 + U * 0.012, h); g.closePath();
          g.fillStyle = PAL.leaf; g.fill();
          Art.ink(g, lw() * 0.8); g.stroke();
        });
        [[0.45, 0.82], [0.62, 0.7]].forEach(function (k) {
          blob(g, w * k[0] + U * 0.01, h * (1 - k[1]), U * 0.016, U * 0.045, PAL.mudDark);
          Art.ink(g, lw() * 0.8); g.stroke();
        });
        Art.pencil(c, PAL.leafDeep, 9, 0.8);
      });
    },
    rock: function () {
      return piece(U * 0.26, U * 0.11, function (g, c, w, h) {
        g.beginPath();
        g.moveTo(w * 0.06, h);
        g.bezierCurveTo(w * 0.04, h * 0.3, w * 0.35, h * 0.06, w * 0.55, h * 0.08);
        g.bezierCurveTo(w * 0.85, h * 0.1, w * 0.98, h * 0.55, w * 0.94, h);
        g.closePath();
        g.fillStyle = '#b8a9c2'; g.fill();
        blob(g, w * 0.42, h * 0.2, w * 0.18, h * 0.1, PAL.leaf);
        Art.pencil(c, '#7f6d8c', 13, 1);
        g.beginPath();
        g.moveTo(w * 0.06, h);
        g.bezierCurveTo(w * 0.04, h * 0.3, w * 0.35, h * 0.06, w * 0.55, h * 0.08);
        g.bezierCurveTo(w * 0.85, h * 0.1, w * 0.98, h * 0.55, w * 0.94, h);
        Art.ink(g, lw()); g.stroke();
      });
    }
  };

  // ----------------------------------------------------------- the nursery
  // A long puffy cloud: puffs along the top, a flat-ish bottom, a sleepy smile.
  function paintNursery() {
    return piece(U * 0.8, U * 0.28, function (g, c, w, h) {
      var puffs = [[0.13, 0.62, 0.11], [0.27, 0.45, 0.15], [0.45, 0.36, 0.18], [0.63, 0.42, 0.16],
        [0.79, 0.52, 0.13], [0.88, 0.66, 0.09], [0.5, 0.66, 0.2], [0.3, 0.68, 0.15], [0.7, 0.68, 0.15]];
      function puffPath(grow) {
        g.beginPath();
        puffs.forEach(function (p) {
          var r = p[2] * w * 0.5 + grow;
          g.moveTo(p[0] * w + r, p[1] * h);
          g.ellipse(p[0] * w, p[1] * h, r, Math.min(r, h * 0.42), 0, 0, TAU);
        });
      }
      // the ink rim: the union of the puffs grown by the line width, then the fill on top
      puffPath(lw() * 0.6);
      g.fillStyle = PAL.ink; g.fill();
      puffPath(-lw() * 0.4);
      g.fillStyle = '#fbfdff'; g.fill();
      Art.pencil(c, PAL.cloud, 17, 0.8);
      // a sleepy, happy face
      var fx = w * 0.5, fy = h * 0.56, e = h * 0.07;
      Art.ink(g, lw());
      g.beginPath(); g.arc(fx - e * 1.6, fy, e * 0.6, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      g.beginPath(); g.arc(fx + e * 1.6, fy, e * 0.6, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      g.beginPath(); g.arc(fx, fy + e * 0.5, e * 0.8, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
      blob(g, fx - e * 2.9, fy + e * 0.9, e * 0.7, e * 0.4, 'rgba(234,132,147,0.45)');
      blob(g, fx + e * 2.9, fy + e * 0.9, e * 0.7, e * 0.4, 'rgba(234,132,147,0.45)');
    });
  }

  // The night look: the day piece under a blue wash, with a couple of fireflies.
  function nightOf(d, seed) {
    return piece(d.w, d.h + U * 0.08, function (g) {
      g.drawImage(d.c, 0, U * 0.08, d.w, d.h);
      g.globalCompositeOperation = 'source-atop';
      g.globalAlpha = 0.45; g.fillStyle = PAL.nightTint; g.fillRect(0, 0, d.w, d.h + U * 0.08);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      var rand = Art.rng(seed);
      for (var i = 0; i < 2; i++) {
        var x = d.w * (0.2 + rand() * 0.6), y = U * 0.02 + rand() * d.h * 0.5, r = U * 0.022;
        var gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,244,168,0.95)'); gr.addColorStop(0.3, 'rgba(255,236,120,0.6)'); gr.addColorStop(1, 'rgba(255,236,120,0)');
        g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
    });
  }

  // ------------------------------------------------------------- the API
  function build(u, dpr) {
    U = u; DPR = dpr;
    water = paintWater();
    var k, i = 0;
    for (k in PAINT) {
      spr[k] = PAINT[k]();
      sprN[k] = nightOf(spr[k], 20 + i++);
    }
    nurse = paintNursery();
    bubbles = {}; nBubbles = 0;
  }

  function bubble(r) {
    var key = Math.max(2, Math.round(r));
    if (!bubbles[key]) {
      if (nBubbles >= 4) { bubbles = {}; nBubbles = 0; }
      nBubbles++;
      bubbles[key] = { c: Art.bubbleSprite(key, DPR), r: key };
    }
    return bubbles[key];
  }

  window.Pond = {
    build: build,
    waterTile: function () { return water; },
    sprite: function (kind, night) { return (night ? sprN : spr)[kind]; },
    nursery: function () { return nurse; },
    bubble: bubble
  };
})();
