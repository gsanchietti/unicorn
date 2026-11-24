/* art-town.js - the painted pieces of the street (the fairy town).
 * Classic script: window.Town. Needs window.Art (js/art.js) loaded first.
 *
 * THESE ARE PLACEHOLDERS: simple ink-outlined rounded shapes in the right
 * colors and proportions. The designer replaces the drawing bodies; the API
 * below stays exactly as it is, and js/scenes/street.js relies on nothing else.
 *
 * Sizes: `M` is the size unit in CSS px that the street passes to build(). The
 * pieces are sized from it (see SIZE below: house 0.9 M tall, gate 0.8 M, ...;
 * the street draws the jar 0.35 M tall). Everything is pre-rendered into
 * canvases at DPR once per build; the per-frame helpers only blit cached
 * canvases or use a few cheap paths: no shadowBlur, no filters, no grain per frame.
 *
 *   Town.build(M, DPR)          (re)builds every sprite for this size. The street
 *                               calls it from its resize().
 *   Town.KINDS                  ['square', 'gate', 'house', 'bakery', 'pond', 'tree',
 *                               'bush', 'flowers', 'clothesline', 'fox']
 *   Town.sprite(kind, night) -> {c, w, h}
 *                               c: a canvas (w x h CSS px at DPR); w, h in CSS px.
 *                               ANCHORED AT BOTTOM CENTER: the ground contact is
 *                               (w / 2, h). Draw it with
 *                               g.drawImage(c, x - w / 2, groundY - h, w, h).
 *                               night = true: the night look, windows lit.
 *   Town.lifeSprite(kind) -> {c, w, h}
 *                               things that move, ANCHORED AT THE CENTER:
 *                               'mouseBalloon' (the mouse in its basket under the
 *                               patched balloon), 'butterfly'.
 *   Town.groundTile() -> {c, w, h}
 *                               the street band (grass edge, path), repeating
 *                               horizontally. Its top edge is the ground line: draw
 *                               it with its top at groundY, side by side every w px.
 *   Town.drawJar(g, x, y, h, total, jiggle)
 *                               the star jar on its stand, bottom center at (x, y),
 *                               h tall. It shows min(total, 60) small stars piled
 *                               inside, plus one big star per 50 at the bottom (as
 *                               many as fit). jiggle 0..1: squash-and-wobble amount
 *                               (the wobble's phase comes from jiggle itself, so a
 *                               jiggle easing 1 -> 0 wobbles and settles).
 *   Town.drawSign(g, x, y, r, kind, t)
 *                               a round picture sign centered at (x, y), radius r.
 *                               kind: 'star' (sky gate), 'cake' (bakery), 'octopus'
 *                               (pond). t: time in seconds, for a soft glow pulse.
 */
(function () {
  'use strict';

  var Art = window.Art, PAL = Art.PAL;
  var TAU = Math.PI * 2;

  var KINDS = ['square', 'gate', 'house', 'bakery', 'pond', 'tree', 'bush', 'flowers', 'clothesline', 'fox'];
  // [width, height] in units of M
  var SIZE = {
    square: [0.9, 0.1], gate: [0.62, 0.8], house: [0.7, 0.9], bakery: [0.76, 0.92],
    pond: [0.95, 0.2], tree: [0.46, 0.72], bush: [0.32, 0.17], flowers: [0.28, 0.12],
    clothesline: [0.62, 0.42], fox: [0.26, 0.46],
    mouseBalloon: [0.24, 0.36], butterfly: [0.08, 0.07], ground: [1.2, 0.6]
  };

  var U = 100, DPR = 1, LW = 2;      // size unit, pixel ratio, ink width (CSS px)
  var spr = {}, sprN = {}, life = {}, ground = null;
  var jarCache = {}, jarN = 0, signCache = {};

  // ------------------------------------------------------------------ helpers
  function mk(w, h) {
    var c = Art.makeCanvas(w * DPR, h * DPR);
    c.lw = w; c.lh = h;
    var g = c.getContext('2d');
    g.scale(DPR, DPR);
    return { c: c, g: g, w: w, h: h };
  }
  function rrect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function ell(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); }
  function circ(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
  // fill the current path, then ink it
  function paint(g, color, w) {
    g.fillStyle = color; g.fill();
    Art.ink(g, w === undefined ? LW : w); g.stroke();
  }
  function puff(g, x, y, w, h) {   // a puffy cloud: a flat base and round bumps, one path
    var bumps = [[-0.3, 0.5, 0.4], [-0.05, 0.66, 0.5], [0.24, 0.56, 0.44]];
    g.beginPath();
    bumps.forEach(function (b) {
      var cx = x + b[0] * w, cy = y - b[1] * h, r = b[2] * h;
      g.moveTo(cx + r, cy); g.arc(cx, cy, r, 0, TAU);
    });
    var r0 = h * 0.3;
    g.moveTo(x - w / 2 + r0, y - h * 0.6);
    g.arcTo(x + w / 2, y - h * 0.6, x + w / 2, y, r0);
    g.arcTo(x + w / 2, y, x - w / 2, y, r0);
    g.arcTo(x - w / 2, y, x - w / 2, y - h * 0.6, r0);
    g.arcTo(x - w / 2, y - h * 0.6, x + w / 2, y - h * 0.6, r0);
    g.closePath();
  }
  // windows as [x, y, r] in fractions of the sprite width / height / width
  var WINDOWS = {
    house: [[0.188, 0.6, 0.06], [0.572, 0.6, 0.06], [0.78, 0.34, 0.05]],
    bakery: [[0.38, 0.6, 0.045], [0.62, 0.6, 0.045]]
  };
  function windows(g, kind, w, h, lit) {
    (WINDOWS[kind] || []).forEach(function (d) {
      circ(g, w * d[0], h * d[1], w * d[2]);
      paint(g, lit ? '#ffe27a' : '#bfe3f2', LW * 0.8);
    });
  }

  // ----------------------------------------------------------- the pieces
  // Each draws in CSS px into a w x h box, ground at y = h, center x = w / 2.
  var DRAW = {
    square: function (g, w, h) {
      ell(g, w / 2, h * 0.55, w * 0.48, h * 0.4);
      paint(g, '#e9dcc4');
      ell(g, w / 2, h * 0.5, w * 0.3, h * 0.22);
      paint(g, '#f3ead8', LW * 0.7);
    },
    gate: function (g, w, h) {
      var lx = w * 0.5, top = h * 0.03, rw = w * 0.16;
      g.lineWidth = LW * 2.2;
      g.strokeStyle = PAL.roof;
      g.beginPath();
      g.moveTo(lx - rw / 2, h * 0.75); g.lineTo(lx - rw / 2 + w * 0.04, top);
      g.moveTo(lx + rw / 2, h * 0.75); g.lineTo(lx + rw / 2 + w * 0.04, top);
      for (var i = 1; i < 9; i++) {
        var yy = h * 0.75 - (h * 0.72) * i / 9, sh = w * 0.04 * i / 9;
        g.moveTo(lx - rw / 2 + sh, yy); g.lineTo(lx + rw / 2 + sh, yy);
      }
      g.stroke();
      puff(g, w / 2, h * 0.98, w * 0.96, h * 0.34);
      paint(g, PAL.cloud, LW * 1.2);
    },
    house: function (g, w, h) {
      var bw = w * 0.64, bx = w * 0.06, by = h * 0.42;
      rrect(g, w * 0.66, h * 0.16, w * 0.24, h * 0.84, w * 0.04);   // tower
      paint(g, '#f5a65e');
      g.beginPath(); g.moveTo(w * 0.62, h * 0.2); g.quadraticCurveTo(w * 0.78, -h * 0.02, w * 0.94, h * 0.2); g.closePath();
      paint(g, PAL.roof);
      rrect(g, bx, by, bw, h - by - LW, w * 0.04);
      paint(g, PAL.orange);
      g.beginPath(); g.moveTo(bx - w * 0.05, by + h * 0.02); g.quadraticCurveTo(bx + bw / 2, h * 0.06, bx + bw + w * 0.05, by + h * 0.02); g.closePath();
      paint(g, PAL.roof);
      rrect(g, bx + bw * 0.38, h * 0.74, bw * 0.26, h * 0.26 - LW, bw * 0.13);
      paint(g, '#a9643c');
      windows(g, 'house', w, h, false);
    },
    bakery: function (g, w, h) {
      rrect(g, w * 0.3, h * 0.42, w * 0.4, h * 0.58 - LW, w * 0.12);   // stem
      paint(g, '#f8eed8');
      g.beginPath();
      g.moveTo(w * 0.03, h * 0.5);
      g.bezierCurveTo(w * 0.05, -h * 0.08, w * 0.95, -h * 0.08, w * 0.97, h * 0.5);
      g.quadraticCurveTo(w * 0.5, h * 0.4, w * 0.03, h * 0.5);
      g.closePath();
      paint(g, PAL.mushroom);
      g.fillStyle = '#fff7f2';
      [[0.25, 0.3], [0.45, 0.16], [0.68, 0.24], [0.82, 0.38], [0.15, 0.42], [0.55, 0.34]].forEach(function (d) {
        circ(g, w * d[0], h * d[1], w * 0.035); g.fill();
      });
      circ(g, w * 0.5, h * 0.82, w * 0.11);
      paint(g, PAL.yellowDeep);
      windows(g, 'bakery', w, h, false);
    },
    pond: function (g, w, h) {
      ell(g, w / 2, h * 0.6, w * 0.48, h * 0.36);
      paint(g, PAL.river);
      ell(g, w * 0.28, h * 0.6, w * 0.08, h * 0.1); paint(g, PAL.leaf, LW * 0.7);
      ell(g, w * 0.74, h * 0.66, w * 0.07, h * 0.09); paint(g, PAL.leaf, LW * 0.7);
      g.beginPath(); g.arc(w * 0.52, h * 0.5, h * 0.3, Math.PI, TAU); g.closePath();
      paint(g, '#e0574f');
      g.fillStyle = PAL.ink;
      circ(g, w * 0.49, h * 0.38, h * 0.05); g.fill();
      circ(g, w * 0.56, h * 0.38, h * 0.05); g.fill();
    },
    tree: function (g, w, h) {
      rrect(g, w * 0.43, h * 0.55, w * 0.14, h * 0.45 - LW, w * 0.05);
      paint(g, '#a9734c');
      circ(g, w / 2, h * 0.36, w * 0.46);
      paint(g, PAL.leaf);
    },
    bush: function (g, w, h) {
      puff(g, w / 2, h - LW, w * 0.94, h * 0.9);
      paint(g, PAL.leafDeep);
    },
    flowers: function (g, w, h) {
      var cols = [PAL.mushroom, PAL.yellowDeep, PAL.plum, PAL.cloudDeep];
      for (var i = 0; i < 4; i++) {
        var x = w * (0.15 + i * 0.23), y = h * (0.3 + (i % 2) * 0.18);
        Art.ink(g, LW * 0.7); g.beginPath(); g.moveTo(x, y); g.lineTo(x, h); g.stroke();
        circ(g, x, y, h * 0.2); paint(g, cols[i], LW * 0.7);
      }
    },
    clothesline: function (g, w, h) {
      rrect(g, w * 0.04, h * 0.05, w * 0.05, h * 0.95 - LW, w * 0.02); paint(g, '#a9734c');
      rrect(g, w * 0.91, h * 0.05, w * 0.05, h * 0.95 - LW, w * 0.02); paint(g, '#a9734c');
      Art.ink(g, LW * 0.7);
      g.beginPath(); g.moveTo(w * 0.07, h * 0.12); g.quadraticCurveTo(w * 0.5, h * 0.26, w * 0.93, h * 0.12); g.stroke();
      [[0.22, PAL.cloudDeep], [0.45, PAL.mushroom], [0.7, PAL.yellow]].forEach(function (c) {
        rrect(g, w * (c[0] - 0.07), h * 0.17, w * 0.14, h * 0.3, w * 0.03); paint(g, c[1], LW * 0.8);
      });
    },
    fox: function (g, w, h) {
      Art.ink(g, LW * 0.6);
      g.beginPath(); g.moveTo(w * 0.55, h * 0.62); g.lineTo(w * 0.3, h * 0.22); g.moveTo(w * 0.55, h * 0.62); g.lineTo(w * 0.72, h * 0.16); g.stroke();
      circ(g, w * 0.3, h * 0.13, w * 0.2); paint(g, PAL.roof);
      circ(g, w * 0.72, h * 0.1, w * 0.2); paint(g, PAL.cloudDeep);
      ell(g, w * 0.45, h * 0.84, w * 0.26, h * 0.15); paint(g, PAL.orange);
      circ(g, w * 0.6, h * 0.64, w * 0.15); paint(g, PAL.orange);
      g.fillStyle = PAL.ink; circ(g, w * 0.64, h * 0.62, w * 0.025); g.fill();
    }
  };
  var LIFE = {
    mouseBalloon: function (g, w, h) {
      ell(g, w / 2, h * 0.36, w * 0.46, h * 0.34); paint(g, PAL.yellow);
      rrect(g, w * 0.42, h * 0.2, w * 0.16, h * 0.14, w * 0.03); paint(g, PAL.mushroom, LW * 0.6);
      Art.ink(g, LW * 0.6);
      g.beginPath(); g.moveTo(w * 0.2, h * 0.6); g.lineTo(w * 0.34, h * 0.82); g.moveTo(w * 0.8, h * 0.6); g.lineTo(w * 0.66, h * 0.82); g.stroke();
      circ(g, w / 2, h * 0.8, w * 0.1); paint(g, '#c9c3cf', LW * 0.6);
      rrect(g, w * 0.3, h * 0.82, w * 0.4, h * 0.16, w * 0.04); paint(g, '#b9864f', LW * 0.8);
    },
    butterfly: function (g, w, h) {
      ell(g, w * 0.3, h * 0.45, w * 0.24, h * 0.36); paint(g, PAL.mushroom, LW * 0.5);
      ell(g, w * 0.7, h * 0.45, w * 0.24, h * 0.36); paint(g, PAL.mushroom, LW * 0.5);
      rrect(g, w * 0.46, h * 0.2, w * 0.08, h * 0.65, w * 0.04); paint(g, PAL.ink, LW * 0.3);
    }
  };

  function makeSprite(kind, night) {
    var sz = SIZE[kind], w = Math.round(sz[0] * U), h = Math.round(sz[1] * U);
    var s = mk(w, h);
    DRAW[kind](s.g, w, h);
    Art.pencil(s.c, '#8a6a5a', KINDS.indexOf(kind) + 3, 0.35);
    if (night) {
      s.g.save();
      s.g.globalCompositeOperation = 'source-atop';
      s.g.globalAlpha = 0.45;
      s.g.fillStyle = PAL.nightTint;
      s.g.fillRect(0, 0, w, h);
      s.g.restore();
      windows(s.g, kind, w, h, true);              // lit windows, over the night wash
    }
    return { c: s.c, w: w, h: h };
  }

  function makeGround() {
    var w = Math.round(SIZE.ground[0] * U), h = Math.round(SIZE.ground[1] * U), s = mk(w, h), g = s.g;
    var rim = U * 0.03, path = U * 0.13, i;
    g.fillStyle = PAL.leaf; g.fillRect(0, 0, w, h);
    g.fillStyle = '#efdcb5'; g.fillRect(0, rim, w, path);
    g.fillStyle = '#d9c39a';
    for (i = 0; i < 7; i++) { ell(g, w * (i + 0.5) / 7, rim + path * (0.3 + 0.4 * (i % 2)), U * 0.012, U * 0.008); g.fill(); }
    Art.ink(g, LW);
    g.beginPath(); g.moveTo(0, LW / 2); g.lineTo(w, LW / 2); g.stroke();
    Art.ink(g, LW * 0.6);
    g.beginPath(); g.moveTo(0, rim + path); g.lineTo(w, rim + path); g.stroke();
    return { c: s.c, w: w, h: h };
  }

  function build(m, dpr) {
    U = m; DPR = dpr;
    LW = Math.max(1.2, U * 0.006);
    spr = {}; sprN = {}; life = {}; jarCache = {}; jarN = 0; signCache = {};
    KINDS.forEach(function (k) { spr[k] = makeSprite(k, false); sprN[k] = makeSprite(k, true); });
    Object.keys(LIFE).forEach(function (k) {
      var sz = SIZE[k], w = Math.round(sz[0] * U), h = Math.round(sz[1] * U), s = mk(w, h);
      LIFE[k](s.g, w, h);
      life[k] = { c: s.c, w: w, h: h };
    });
    ground = makeGround();
  }

  // ------------------------------------------------------------------- jar
  var STAR_MAX = 60;
  function jarSprite(h, total) {
    var key = Math.round(h) + ':' + Math.min(total, STAR_MAX) + ':' + Math.floor(total / 50);
    if (jarCache[key]) return jarCache[key];
    if (jarN >= 8) { jarCache = {}; jarN = 0; }
    jarN++;
    var w = Math.round(h * 0.62), s = mk(w, h), g = s.g;
    var standH = h * 0.26, jarW = h * 0.56, jarX = (w - jarW) / 2, jarTop = h * 0.08, bodyTop = h * 0.16;
    var jarBot = h - standH;
    // stand
    rrect(g, w * 0.14, jarBot, w * 0.72, standH - LW, w * 0.06); paint(g, '#cfc6d6');
    // glass back
    rrect(g, jarX, bodyTop, jarW, jarBot - bodyTop, jarW * 0.22);
    g.fillStyle = 'rgba(214,236,246,0.55)'; g.fill();
    // stars, from the bottom up
    var inW = jarW * 0.84, x0 = jarX + (jarW - inW) / 2, rs = inW / 15;
    var big = Math.floor(total / 50), small = Math.min(total, STAR_MAX), rb = rs * 2.1;
    var perBig = Math.max(1, Math.floor(inW / (rb * 2.1))), y = jarBot - LW - rb;
    big = Math.min(big, perBig * 2);
    var sB = Art.starSprite(rb, DPR, { glow: false }), sS = Art.starSprite(rs, DPR, { glow: false });
    var rnd = Art.rng(7), i;
    for (i = 0; i < big; i++) {
      var col = i % perBig;
      if (i && !col) y -= rb * 1.8;
      Art.drawSprite(g, sB, x0 + rb + col * (inW - 2 * rb) / Math.max(1, perBig - 1), y, 1, 1, (rnd() - 0.5) * 0.6);
    }
    var per = Math.floor(inW / (rs * 2.1)), sy = (big ? y - rb - rs * 0.6 : jarBot - LW - rs * 1.1);
    for (i = 0; i < small; i++) {
      var c = i % per, row = Math.floor(i / per), off = row % 2 ? rs : 0;
      var sx = x0 + rs * 1.1 + off + c * (inW - 2.2 * rs - rs) / Math.max(1, per - 1);
      Art.drawSprite(g, sS, sx + (rnd() - 0.5) * rs * 0.4, sy - row * rs * 1.75 + (rnd() - 0.5) * rs * 0.3, 1, 1, (rnd() - 0.5) * 0.8);
    }
    // glass front: outline, highlight, neck and lid
    rrect(g, jarX, bodyTop, jarW, jarBot - bodyTop, jarW * 0.22);
    Art.ink(g, LW * 1.1); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = jarW * 0.06; g.lineCap = 'round';
    g.beginPath(); g.moveTo(jarX + jarW * 0.16, bodyTop + jarW * 0.3); g.lineTo(jarX + jarW * 0.16, jarBot - jarW * 0.3); g.stroke();
    rrect(g, jarX + jarW * 0.14, jarTop, jarW * 0.72, bodyTop - jarTop + LW, jarW * 0.08); paint(g, PAL.lilac);
    return (jarCache[key] = s);
  }

  function drawJar(g, x, y, h, total, jiggle) {
    total = Math.max(0, Math.floor(total || 0));
    var s = jarSprite(h, total), j = jiggle || 0;
    var k = j * Math.sin(j * Math.PI * 5);
    var sx = 1 + 0.08 * k, sy = 1 - 0.08 * k;
    g.save();
    g.translate(x, y);
    g.scale(sx, sy);
    g.drawImage(s.c, -s.w / 2, -s.h, s.w, s.h);
    g.restore();
  }

  // ----------------------------------------------------------------- signs
  function signSprite(r, kind) {
    var key = Math.round(r * 10) + kind;
    if (signCache[key]) return signCache[key];
    var size = r * 2.8, s = mk(size, size), g = s.g, c = size / 2;
    circ(g, c, c, r); paint(g, '#fffaf0', LW * 1.2);
    if (kind === 'star') {
      var st = Art.starSprite(r * 0.62, DPR, { glow: false });
      Art.drawSprite(g, st, c, c, 1, 1, 0);
    } else if (kind === 'cake') {
      rrect(g, c - r * 0.5, c - r * 0.05, r, r * 0.5, r * 0.1); paint(g, PAL.mushroom, LW * 0.8);
      rrect(g, c - r * 0.36, c - r * 0.42, r * 0.72, r * 0.4, r * 0.1); paint(g, PAL.pink, LW * 0.8);
      circ(g, c, c - r * 0.52, r * 0.1); paint(g, PAL.roof, LW * 0.6);
    } else {
      g.beginPath(); g.arc(c, c + r * 0.15, r * 0.48, Math.PI, TAU); g.closePath(); paint(g, '#e0574f', LW * 0.8);
      g.fillStyle = PAL.ink; circ(g, c - r * 0.16, c - r * 0.05, r * 0.07); g.fill(); circ(g, c + r * 0.16, c - r * 0.05, r * 0.07); g.fill();
      rrect(g, c - r * 0.55, c + r * 0.15, r * 1.1, r * 0.3, r * 0.15); paint(g, PAL.river, LW * 0.8);
    }
    // the soft glow ring, drawn per frame with a pulsing alpha
    var gl = mk(size, size), gg = gl.g, gr = gg.createRadialGradient(c, c, r * 0.9, c, c, r * 1.4);
    gr.addColorStop(0, 'rgba(255,240,170,0.9)'); gr.addColorStop(1, 'rgba(255,240,170,0)');
    gg.fillStyle = gr; gg.fillRect(0, 0, size, size);
    return (signCache[key] = { sign: s, glow: gl });
  }

  function drawSign(g, x, y, r, kind, t) {
    var s = signSprite(r, kind), size = s.sign.w;
    var a = g.globalAlpha;
    g.globalAlpha = a * (0.35 + 0.25 * Math.sin((t || 0) * 2.2));
    g.drawImage(s.glow.c, x - size / 2, y - size / 2, size, size);
    g.globalAlpha = a;
    g.drawImage(s.sign.c, x - size / 2, y - size / 2, size, size);
  }

  window.Town = {
    KINDS: KINDS,
    build: build,
    sprite: function (kind, night) { return (night ? sprN : spr)[kind]; },
    lifeSprite: function (kind) { return life[kind]; },
    groundTile: function () { return ground; },
    drawJar: drawJar,
    drawSign: drawSign
  };
})();
