/* art-pond.js - the painted pieces of the bubble pond: the water, lily pads,
 * reeds, the lizard's rock, the nursery cloud and the soap bubbles, in the style
 * of the bedroom-wall mural. Classic script: window.Pond. Needs window.Art
 * (js/art.js) loaded first.
 *
 * The API, the sizes and the anchors below are what js/scenes/pond.js lays the
 * pond out with: keep them when repainting a piece.
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
 *                               octopuses sit along its middle, at 0.65 of their size.
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
  var C = {
    riverLight: '#6fd6cf', pad: '#9bd88c', padDeep: '#4fa25a', blade: '#6dba6a', bladeDeep: '#3d8a4c',
    cattail: '#8d5a36', cattailDeep: '#5c3620',
    petal: '#fbc4d6', petalFront: '#f58fb0', petalDeep: '#c9566f', heart: '#f6dc6e', heartDeep: '#d9a92c',
    stone: '#cfc5d8', stoneDeep: '#8d80a0',
    cloudFill: '#fbfdff', blush: 'rgba(234,132,147,0.5)'
  };

  // A painted piece: a canvas of w x h CSS px at DPR, painted in CSS px.
  function piece(w, h, paint) {
    var c = Art.makeCanvas(w * DPR, h * DPR), g = c.getContext('2d');
    c.lw = w; c.lh = h;
    g.scale(DPR, DPR);
    paint(g, c, w, h);
    return { c: c, w: w, h: h };
  }
  function lw() { return Math.max(1.5, U * 0.008); }
  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  // One part of a piece on its own layer: the fill, what is painted inside it,
  // the pencil grain, then its ink line and what goes over it. So the grain
  // never dulls the ink of the parts below.
  function part(g, c, path, fill, deep, seed, o) {
    o = o || {};
    var t = Art.makeCanvas(c.width, c.height), tg = t.getContext('2d');
    t.lw = c.lw; t.lh = c.lh;
    tg.scale(DPR, DPR);
    path(tg); tg.fillStyle = fill; tg.fill();
    if (o.inside) { tg.save(); tg.clip(); o.inside(tg); tg.restore(); }
    Art.pencil(t, deep, seed, o.grain === undefined ? 0.8 : o.grain);
    if (o.ink !== 0) { path(tg); Art.ink(tg, o.ink || lw()); tg.stroke(); }
    if (o.over) o.over(tg);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(t, 0, 0); g.restore();
  }
  function ell(x, y, rx, ry, rot) {
    return function (g) { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, TAU); };
  }
  function light(g, x, y, r, a) {
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,' + a + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  function shadeDown(g, deep, y0, y1, a, w) {
    var gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, rgba(deep, 0)); gr.addColorStop(1, rgba(deep, a));
    g.fillStyle = gr; g.fillRect(0, y0, w, y1 - y0 + 2);
  }

  // ------------------------------------------------------------- the water
  // The mural's turquoise river: lighter at the top, deep at the bottom, pale
  // streaks, ripples, and under the inked wave line the white dotted trim.
  // Everything repeats every w px; the pencil grain is cross-faded over the join.
  function paintWater() {
    var w = Math.round(U), h = Math.round(U * 0.5), m = Math.round(U * 0.2);
    var amp = U * 0.011, n = 3, base = amp + lw();
    function waveY(x) { return base + Math.sin(x / w * n * TAU) * amp; }
    function wave(g, x0, x1, dy) {
      for (var x = x0; x <= x1; x += 2) g.lineTo(x, waveY(x) + dy);
      g.lineTo(x1, waveY(x1) + dy);
    }
    // the body of water, w + m wide, with its grain
    var wide = piece(w + m, h, function (g, c) {
      g.beginPath(); g.moveTo(-4, h + 4); g.lineTo(-4, waveY(-4)); wave(g, -4, w + m + 4, 0); g.lineTo(w + m + 4, h + 4); g.closePath();
      var gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, C.riverLight); gr.addColorStop(0.3, PAL.river); gr.addColorStop(1, PAL.riverDeep);
      g.fillStyle = gr; g.fill();
      g.save(); g.clip();
      var rand = Art.rng(11), i, k;
      // long soft streaks of light and of deep water
      for (i = 0; i < 9; i++) {
        var x = rand() * w, y = h * (0.14 + rand() * 0.8), rw = U * (0.12 + rand() * 0.16), rh = U * (0.008 + rand() * 0.012);
        g.fillStyle = i % 3 === 2 ? rgba(PAL.riverDeep, 0.3) : 'rgba(255,255,255,0.16)';
        for (k = -1; k <= 2; k++) { g.beginPath(); g.ellipse(x + k * w, y, rw, rh, 0, 0, TAU); g.fill(); }
      }
      g.restore();
      Art.pencil(c, PAL.riverDeep, 41, 0.75);
    });
    return piece(w, h, function (g) {
      g.drawImage(wide.c, 0, 0, w + m, h);
      // cross-fade the grain: the strip past the right edge, fading out, over the left edge
      var s = Art.makeCanvas(m * DPR, h * DPR), sg = s.getContext('2d');
      sg.scale(DPR, DPR);
      sg.drawImage(wide.c, -w, 0, w + m, h);
      sg.globalCompositeOperation = 'destination-in';
      var fade = sg.createLinearGradient(0, 0, m, 0);
      fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
      sg.fillStyle = fade; sg.fillRect(0, 0, m, h);
      g.drawImage(s, 0, 0, m, h);
      // ripples: short pale arcs, drawn across the joins too
      var rand = Art.rng(7), i, k;
      g.lineCap = 'round';
      for (i = 0; i < 10; i++) {
        var x = rand() * w, y = h * (0.24 + rand() * 0.68), rw = U * (0.035 + rand() * 0.05);
        g.strokeStyle = 'rgba(255,255,255,' + (0.4 + rand() * 0.3) + ')';
        g.lineWidth = Math.max(1.3, U * (0.007 + rand() * 0.004));
        for (k = -1; k <= 1; k++) {
          g.beginPath(); g.ellipse(x + k * w, y, rw, rw * 0.24, 0, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
          if (i % 3 === 0) { g.beginPath(); g.ellipse(x + k * w + rw * 0.5, y + rw * 0.3, rw * 0.55, rw * 0.14, 0, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
        }
      }
      // the white dotted trim under the wave line
      var dots = n * 4;
      g.fillStyle = '#ffffff';
      for (i = 0; i < dots; i++) {
        var dx = w * (i + 0.5) / dots;
        g.beginPath(); g.arc(dx, waveY(dx) + U * 0.026, U * 0.0065, 0, TAU); g.fill();
      }
      // a pale line of light just under the ink, then the ink line of the waterline
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = lw() * 0.9;
      g.beginPath(); g.moveTo(-4, waveY(-4) + lw()); wave(g, -4, w + 4, lw()); g.stroke();
      Art.ink(g, lw());
      g.beginPath(); g.moveTo(-4, waveY(-4)); wave(g, -4, w + 4, 0); g.stroke();
    });
  }

  // ------------------------------------------------------------ the pieces
  // A lily pad lying flat: a round leaf with a notch, its veins and a rim of light.
  function padPath(x, y, rx, ry) {
    return function (g) {
      g.beginPath();
      g.ellipse(x, y, rx, ry, 0, 0.04, TAU - 0.36);
      g.quadraticCurveTo(x + rx * 0.55, y - ry * 0.12, x + rx * 0.22, y - ry * 0.05);
      g.quadraticCurveTo(x + rx * 0.6, y, x + rx * Math.cos(0.04), y + ry * Math.sin(0.04));
      g.closePath();
    };
  }
  function paintPad(g, c, x, y, rx, ry, seed) {
    part(g, c, padPath(x, y, rx, ry), C.pad, C.padDeep, seed, {
      inside: function (g) {
        shadeDown(g, C.padDeep, y - ry * 0.2, y + ry, 0.45, c.lw);
        light(g, x - rx * 0.35, y - ry * 0.5, rx * 0.5, 0.3);
        g.strokeStyle = rgba(C.padDeep, 0.75); g.lineWidth = lw() * 0.55; g.lineCap = 'round';
        g.beginPath();
        [-2.6, -1.9, 2.4, 1.6, 0.75, 3.1].forEach(function (a) {
          g.moveTo(x + rx * 0.22, y - ry * 0.05);
          g.lineTo(x + Math.cos(a) * rx * 0.82, y + Math.sin(a) * ry * 0.8);
        });
        g.stroke();
      }
    });
  }
  var PAINT = {
    lily: function () {
      return piece(U * 0.22, U * 0.06, function (g, c, w, h) {
        paintPad(g, c, w / 2, h / 2, w * 0.46, h * 0.5 - lw(), 3);
      });
    },
    // a lily pad with a pink water lily: three pale petals behind, four rosy ones in
    // front, a yellow heart
    lilyFlower: function () {
      return piece(U * 0.22, U * 0.15, function (g, c, w, h) {
        var py = h - U * 0.03, fx = w * 0.47, fy = py - U * 0.008;
        paintPad(g, c, w / 2, py, w * 0.46, U * 0.03 - lw(), 4);
        function petal(a, len, wd, fill, seed) {
          var cxp = fx + Math.sin(a) * len * 0.5, cyp = fy - Math.cos(a) * len * 0.5;
          part(g, c, ell(cxp, cyp, wd, len * 0.56, a), fill, C.petalDeep, seed, {
            ink: lw() * 0.8, grain: 0.55,
            inside: function (g) { light(g, cxp, cyp - len * 0.2, len * 0.45, 0.45); }
          });
        }
        petal(-0.62, U * 0.088, U * 0.019, C.petal, 5);
        petal(0.62, U * 0.088, U * 0.019, C.petal, 6);
        petal(0, U * 0.098, U * 0.021, C.petal, 7);
        petal(-1.12, U * 0.07, U * 0.017, C.petalFront, 8);
        petal(1.12, U * 0.07, U * 0.017, C.petalFront, 9);
        petal(-0.33, U * 0.07, U * 0.018, C.petalFront, 10);
        petal(0.33, U * 0.07, U * 0.018, C.petalFront, 11);
        part(g, c, ell(fx, fy - U * 0.012, U * 0.016, U * 0.012), C.heart, C.heartDeep, 12, { ink: lw() * 0.7, grain: 0.5 });
      });
    },
    // a tuft of reeds: curved blades in two greens and two brown cattails
    reeds: function () {
      return piece(U * 0.18, U * 0.4, function (g, c, w, h) {
        function blade(x0, top, lean, bw, fill, seed) {
          var x1 = x0 + w * lean, y1 = h * (1 - top), mx = x0 + w * lean * 0.2;
          part(g, c, function (g) {
            g.beginPath(); g.moveTo(x0 - bw, h + 2);
            g.quadraticCurveTo(mx - bw * 0.9, h * 0.55, x1, y1);
            g.quadraticCurveTo(mx + bw * 1.1, h * 0.55, x0 + bw, h + 2);
            g.closePath();
          }, fill, C.bladeDeep, seed, {
            ink: lw() * 0.8,
            inside: function (g) { shadeDown(g, C.bladeDeep, h * 0.5, h, 0.4, w); }
          });
        }
        function cattail(x0, top, lean, seed) {
          var x1 = x0 + w * lean, y1 = h * (1 - top), r = U * 0.017, len = U * 0.048;
          // the stalk: a green tube with an ink rim
          g.lineCap = 'round';
          var stalk = function () { g.beginPath(); g.moveTo(x0, h + 2); g.quadraticCurveTo(x0, h * 0.5, x1, y1 - len - U * 0.03); };
          stalk(); Art.ink(g, U * 0.011 + lw() * 1.2); g.stroke();
          stalk(); g.strokeStyle = C.blade; g.lineWidth = U * 0.011; g.stroke();
          part(g, c, function (g) {
            g.beginPath();
            g.moveTo(x1 - r, y1 - len + r); g.arc(x1, y1 - len + r, r, Math.PI, 0);
            g.lineTo(x1 + r, y1 + len - r); g.arc(x1, y1 + len - r, r, 0, Math.PI);
            g.closePath();
          }, C.cattail, C.cattailDeep, seed, {
            ink: lw() * 0.85,
            inside: function (g) {
              g.fillStyle = 'rgba(255,225,190,0.35)';
              g.beginPath(); g.ellipse(x1 - r * 0.4, y1 - len * 0.15, r * 0.3, len * 0.6, 0, 0, TAU); g.fill();
            }
          });
        }
        blade(w * 0.22, 0.56, -0.14, U * 0.013, C.blade, 21);
        blade(w * 0.8, 0.5, 0.14, U * 0.013, PAL.leaf, 22);
        cattail(w * 0.4, 0.8, -0.08, 23);
        blade(w * 0.5, 0.74, 0.16, U * 0.015, PAL.leaf, 24);
        cattail(w * 0.62, 0.62, 0.1, 25);
        blade(w * 0.34, 0.66, -0.2, U * 0.015, C.blade, 26);
        blade(w * 0.66, 0.36, 0.22, U * 0.012, C.blade, 27);
        blade(w * 0.5, 0.3, -0.26, U * 0.012, PAL.leaf, 28);
      });
    },
    // a round, lilac-grey rock with moss on its shoulders; its foot fades into the
    // water behind a ripple. The top (0.92 h above the anchor) stays bare for the lizard.
    rock: function () {
      return piece(U * 0.26, U * 0.11, function (g, c, w, h) {
        var rock = function (g) {
          g.beginPath();
          g.moveTo(w * 0.05, h + 2);
          g.bezierCurveTo(w * 0.01, h * 0.42, w * 0.22, h * 0.07, w * 0.5, h * 0.08);
          g.bezierCurveTo(w * 0.8, h * 0.09, w * 0.99, h * 0.5, w * 0.95, h + 2);
          g.closePath();
        };
        part(g, c, rock, C.stone, C.stoneDeep, 13, {
          inside: function (g) {
            shadeDown(g, C.stoneDeep, h * 0.3, h, 0.55, w);
            light(g, w * 0.4, h * 0.3, w * 0.22, 0.5);
            // moss on both shoulders, scalloped
            g.fillStyle = PAL.leaf;
            g.beginPath();
            [[0.1, 0.62, 0.07], [0.17, 0.44, 0.07], [0.25, 0.3, 0.06], [0.14, 0.82, 0.05],
              [0.82, 0.36, 0.06], [0.89, 0.54, 0.06]].forEach(function (p) {
              g.moveTo(w * p[0] + w * p[2], h * p[1]); g.arc(w * p[0], h * p[1], w * p[2], 0, TAU);
            });
            g.fill();
            // a couple of pebbly freckles and a crease
            g.fillStyle = rgba(C.stoneDeep, 0.5);
            g.beginPath(); g.ellipse(w * 0.62, h * 0.5, w * 0.018, h * 0.035, 0, 0, TAU);
            g.ellipse(w * 0.7, h * 0.66, w * 0.013, h * 0.026, 0, 0, TAU); g.fill();
            g.strokeStyle = rgba(C.stoneDeep, 0.7); g.lineWidth = lw() * 0.6; g.lineCap = 'round';
            g.beginPath(); g.moveTo(w * 0.42, h * 0.46); g.quadraticCurveTo(w * 0.5, h * 0.62, w * 0.47, h * 0.8); g.stroke();
          }
        });
        // the foot sinks into the water
        g.save();
        g.globalCompositeOperation = 'destination-out';
        var gr = g.createLinearGradient(0, h - U * 0.03, 0, h);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.9)');
        g.fillStyle = gr; g.fillRect(0, h - U * 0.03, w, U * 0.03 + 1);
        g.restore();
        g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = lw() * 0.8; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(w * 0.03, h - U * 0.02); g.quadraticCurveTo(w * 0.2, h - U * 0.012, w * 0.38, h - U * 0.02);
        g.moveTo(w * 0.5, h - U * 0.014); g.quadraticCurveTo(w * 0.72, h - U * 0.006, w * 0.97, h - U * 0.02);
        g.stroke();
      });
    }
  };

  // ----------------------------------------------------------- the nursery
  // A long puffy cloud, as the mural's but white: puffs along the top, blue pencil
  // shade underneath, and low in the middle a sleepy, happy face (the octopuses
  // sit above it, along the cloud's middle).
  function paintNursery() {
    return piece(U * 0.8, U * 0.28, function (g, c, w, h) {
      // [x, y, rx, ry] in fractions of w and h: the long body, then the puffs on it
      var puffs = [[0.5, 0.66, 0.4, 0.3], [0.5, 0.74, 0.3, 0.24],
        [0.1, 0.68, 0.075, 0.2], [0.2, 0.5, 0.1, 0.27], [0.36, 0.36, 0.125, 0.31], [0.55, 0.31, 0.13, 0.29],
        [0.72, 0.4, 0.11, 0.29], [0.84, 0.54, 0.09, 0.24], [0.91, 0.7, 0.065, 0.17],
        [0.26, 0.74, 0.12, 0.2], [0.74, 0.76, 0.12, 0.19]];
      function puffPath(grow) {
        g.beginPath();
        puffs.forEach(function (p) {
          var rx = p[2] * w + grow, ry = p[3] * h + grow;
          g.moveTo(p[0] * w + rx, p[1] * h);
          g.ellipse(p[0] * w, p[1] * h, rx, ry, 0, 0, TAU);
        });
      }
      // the ink rim: the union of the puffs grown by the line width, then the fill on top
      puffPath(lw() * 0.6);
      g.fillStyle = PAL.ink; g.fill();
      puffPath(-lw() * 0.4);
      g.fillStyle = C.cloudFill; g.fill();
      g.save(); g.clip();
      shadeDown(g, PAL.cloud, h * 0.45, h * 0.98, 0.85, w);
      light(g, w * 0.42, h * 0.3, w * 0.3, 0.9);
      // a rosy glow where the little ones sleep
      var rg = g.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, w * 0.36);
      rg.addColorStop(0, 'rgba(255,196,214,0.4)'); rg.addColorStop(1, 'rgba(255,196,214,0)');
      g.fillStyle = rg; g.fillRect(0, 0, w, h);
      g.restore();
      Art.pencil(c, PAL.cloudDeep, 17, 0.55);
      // soft curls inside, as the mural's clouds have
      Art.ink(g, lw() * 0.7); g.globalAlpha = 0.4;
      [[0.27, 0.4, 0.07, 3.5, 5.0], [0.46, 0.27, 0.08, 3.5, 5.0], [0.66, 0.3, 0.07, 4.1, 5.7], [0.8, 0.5, 0.05, 4.3, 5.9], [0.15, 0.55, 0.045, 3.3, 4.8]].forEach(function (q) {
        g.beginPath(); g.arc(q[0] * w, q[1] * h + q[2] * w * 0.5, q[2] * w, q[3], q[4]); g.stroke();
      });
      g.globalAlpha = 1;
      // the sleepy, happy face
      var fx = w * 0.5, fy = h * 0.71, e = h * 0.055;
      Art.ink(g, lw());
      g.beginPath(); g.arc(fx - e * 1.9, fy - e * 0.5, e * 0.75, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      g.beginPath(); g.arc(fx + e * 1.9, fy - e * 0.5, e * 0.75, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      g.beginPath(); g.arc(fx, fy + e * 0.5, e * 0.85, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      g.fillStyle = C.blush;
      g.beginPath(); g.ellipse(fx - e * 3.4, fy + e * 0.7, e * 0.85, e * 0.5, 0, 0, TAU);
      g.ellipse(fx + e * 3.4, fy + e * 0.7, e * 0.85, e * 0.5, 0, 0, TAU); g.fill();
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
        var x = d.w * (0.2 + rand() * 0.6), y = U * 0.025 + rand() * d.h * 0.5, r = U * 0.024;
        var gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,248,190,1)'); gr.addColorStop(0.22, 'rgba(255,240,140,0.85)');
        gr.addColorStop(0.4, 'rgba(255,236,120,0.35)'); gr.addColorStop(1, 'rgba(255,236,120,0)');
        g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
    });
  }

  // ------------------------------------------------------------ the bubble
  // A soap bubble: almost clear in the middle (an octopus must show through),
  // a pale blue rim, a rainbow sheen along the inside of the rim, two highlights.
  function paintBubble(r) {
    var size = r * 2 + 4, c = Art.makeCanvas(size * DPR, size * DPR), g = c.getContext('2d'), o = size / 2;
    c.lw = size; c.lh = size;
    g.scale(DPR, DPR);
    var iw = Math.max(1, r * 0.07), rr = r - iw / 2;
    var fill = g.createRadialGradient(o, o, r * 0.3, o, o, r);
    fill.addColorStop(0, 'rgba(255,255,255,0.06)');
    fill.addColorStop(0.72, 'rgba(206,234,247,0.2)');
    fill.addColorStop(1, 'rgba(150,206,236,0.62)');
    g.fillStyle = fill;
    g.beginPath(); g.arc(o, o, rr, 0, TAU); g.fill();
    Art.pencil(c, PAL.cloudDeep, r, 0.3);
    // the sheen: soft arcs of the rainbow just inside the rim
    g.lineCap = 'round'; g.lineWidth = Math.max(1.2, r * 0.1);
    [['rgba(255,150,190,0.45)', 0.14, 0.4], ['rgba(255,226,120,0.45)', 0.48, 0.7], ['rgba(140,224,170,0.4)', 0.78, 0.96],
      ['rgba(190,150,236,0.4)', 1.64, 1.9]].forEach(function (s) {
      g.strokeStyle = s[0];
      g.beginPath(); g.arc(o, o, r * 0.83, s[1] * Math.PI, s[2] * Math.PI); g.stroke();
    });
    Art.ink(g, iw);
    g.globalAlpha = 0.72;
    g.beginPath(); g.arc(o, o, rr, 0, TAU); g.stroke();
    g.globalAlpha = 1;
    // highlights
    g.strokeStyle = 'rgba(255,255,255,0.96)'; g.lineWidth = Math.max(1.5, r * 0.12);
    g.beginPath(); g.arc(o, o, r * 0.6, Math.PI * 1.12, Math.PI * 1.4); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.96)';
    g.beginPath(); g.arc(o + r * 0.1, o - r * 0.62, Math.max(0.8, r * 0.055), 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath(); g.arc(o + r * 0.42, o + r * 0.4, Math.max(0.8, r * 0.075), 0, TAU); g.fill();
    return c;
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
      bubbles[key] = { c: paintBubble(key), r: key };
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
