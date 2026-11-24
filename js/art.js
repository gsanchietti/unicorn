/* art.js - the art kit of "Bella e Bongo", in the style of the bedroom-wall mural:
 * dark, slightly uneven ink outlines; colored-pencil and light-watercolor fills
 * with a visible grain; the mural's palette on a cream wall.
 *
 * Everything expensive (gradients, grain, many passes) is pre-rendered ONCE into
 * offscreen canvases ("sprites"). The per-frame helpers (drawSprite, drawSplotch,
 * drawRainbow, drawSponge, drawPlayButton, ...) only blit cached sprites or use
 * cheap paths: no shadowBlur, no filters, no grain per frame.
 *
 * Sprites are canvases of logical size x dpr with extra props .lw / .lh
 * (logical width / height). They are drawn centered on a point.
 * Classic script: defines window.Art.
 *
 * The two style helpers, shared with js/characters.js:
 *
 *   Art.ink(g, width)
 *       Sets the ink stroke style on g: color PAL.ink (#2b2230), round joins and
 *       caps, lineWidth = width, given in g's current units (so it scales with
 *       the context transform; default 2). It only sets state: build the path and
 *       call g.stroke() yourself.
 *
 *   Art.pencil(spriteCanvas, color, seed, strength)
 *       Lays a colored-pencil grain (diagonal hatching in `color`, plus lighter
 *       streaks where the wall shows through) over everything already painted on
 *       the sprite, with 'source-atop': transparent pixels stay transparent. Call
 *       it ONCE per sprite, when the sprite is made, never per frame; call it
 *       after the fills and before the ink lines, so the lines stay dark.
 *       `color` is a #rrggbb hex, usually a deeper shade of the fill. `seed`
 *       (integer) picks the grain variant and its offset, so neighbours differ.
 *       `strength` (optional, default 1) scales the grain's opacity. The grain
 *       keeps the same on-screen size at any pixel ratio: it reads the sprite's
 *       scale from spriteCanvas.lw (logical width), or assumes the device pixel
 *       ratio (capped at 2) when .lw is not set. The grain tiles are cached per
 *       color. The sprite's context state is left untouched.
 *
 *   Art.PAL  the palette. Mural keys: wall, wallNight, river, riverDeep, leaf,
 *            leafDeep, roof, orange, mushroom, mushroomDeep, plum, cloud,
 *            cloudDeep, moon, star, ink. The older pastel keys are kept.
 */
(function () {
  'use strict';

  var TAU = Math.PI * 2;

  // ---------------------------------------------------------------- palette
  var PAL = {
    pink: '#ffb8d6', pinkDeep: '#f58ab8',
    lilac: '#d3bdf2', lilacDeep: '#a98bd9',
    sky: '#aedcf6', skyDeep: '#6fb7e9',
    yellow: '#ffe581', yellowDeep: '#f6c545',
    white: '#fffbff',
    mud: '#a97f55', mudDark: '#76523a',
    // the mural's colors
    wall: '#f7f1e6', wallNight: '#2f427f',
    river: '#45c3c1', riverDeep: '#1f9c9f',
    leaf: '#84cc7c', leafDeep: '#4fa25a',
    roof: '#d5475c', orange: '#f28d40',
    mushroom: '#ea8493', mushroomDeep: '#c9566f',
    plum: '#93458f',
    cloud: '#a6d6ee', cloudDeep: '#62aed6',
    moon: '#f6e9a4', star: '#f9e98e',
    ink: '#2b2230',
    // washes laid over the hills at night and at sunset (see js/backdrop.js)
    nightTint: '#1f2c63', sunsetTint: '#f28d40',
    confetti: ['#ea8493', '#f8e08a', '#7fc8ea', '#b07cc6', '#f39a4f', '#8fd08a'],
    // outer band first
    rainbow: ['#d5475c', '#f28d40', '#f6dc6e', '#84cc7c', '#45c3c1', '#93458f']
  };

  // ---------------------------------------------------------------- basics
  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  // mulberry32: small deterministic PRNG
  function rng(seed) {
    var a = (seed * 2654435761) >>> 0 || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // A sprite canvas of logical size lw x lh, with the context pre-scaled so
  // callers draw in logical units.
  function newSprite(lw, lh, dpr) {
    var c = makeCanvas(lw * dpr, lh * dpr);
    c.lw = lw;
    c.lh = lh;
    var g = c.getContext('2d');
    g.scale(c.width / lw, c.height / lh);
    return { c: c, g: g };
  }

  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function drawSprite(g, spr, x, y, scale, alpha, rot) {
    if (scale === undefined) scale = 1;
    if (alpha === undefined) alpha = 1;
    var w = spr.lw * scale, h = spr.lh * scale;
    var prev = g.globalAlpha;
    g.globalAlpha = prev * alpha;
    if (rot) {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.drawImage(spr, -w / 2, -h / 2, w, h);
      g.restore();
    } else {
      g.drawImage(spr, x - w / 2, y - h / 2, w, h);
    }
    g.globalAlpha = prev;
  }

  // Pixel ratio for the sprites cached by the per-frame helpers (they get no dpr).
  function sprDpr() { return Math.min(2, window.devicePixelRatio || 1); }

  // Small keyed cache for those sprites; it empties itself rather than grow
  // without bound when the window is resized many times.
  function cached(cache, key, make) {
    if (cache.map[key]) return cache.map[key];
    if (cache.n >= 12) { cache.map = {}; cache.n = 0; }
    cache.n++;
    return (cache.map[key] = make());
  }
  function newCache() { return { map: {}, n: 0 }; }

  // ------------------------------------------------------------ ink & pencil
  function ink(g, width) {
    g.strokeStyle = PAL.ink;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.lineWidth = width === undefined ? 2 : width;
  }

  // Hand-drawn ink line: the path stroked twice, the second pass thinner and a
  // hair off, so the line is slightly uneven. `path()` must begin the path.
  function inkStroke(g, path, w, rand) {
    ink(g, w);
    path(); g.stroke();
    g.save();
    g.translate((rand() - 0.5) * w * 0.7, (rand() - 0.5) * w * 0.7);
    g.lineWidth = w * 0.6;
    path(); g.stroke();
    g.restore();
  }

  // Ink outline AROUND what is already painted on the sprite: stroked behind
  // the fill ('destination-over'), so overlapping parts of a union never show
  // inner lines. `round` is the width of the fill-colored rounding stroke of
  // the shape (0 if none); w is the visible line width.
  function inkAround(g, path, w, round, rand) {
    g.save();
    g.globalCompositeOperation = 'destination-over';
    ink(g, round + w * 2);
    path(); g.stroke();
    g.translate((rand() - 0.5) * w * 0.8, (rand() - 0.5) * w * 0.8);
    path(); g.stroke();
    g.restore();
  }

  // Grain tiles, authored at 2x: 256 device px = 128 CSS px, seamless.
  var GRAIN_T = 256, GRAIN_VARIANTS = 3, grainMasks = [], grainTiles = {};

  // The two alpha masks of a variant: [pencil strokes, streaks of bare wall].
  function grainMask(v) {
    if (grainMasks[v]) return grainMasks[v];
    var rand = rng(v * 13 + 101), T = GRAIN_T, out = [];
    // [count, alpha min, alpha range, width min, width range, length min, length range]
    var spec = [[380, 0.06, 0.13, 1.2, 2.2, 22, 60], [240, 0.07, 0.17, 1.2, 2.6, 18, 50]];
    for (var k = 0; k < 2; k++) {
      var c = makeCanvas(T, T), g = c.getContext('2d'), sp = spec[k];
      g.lineCap = 'round';
      g.strokeStyle = '#000';
      for (var i = 0; i < sp[0]; i++) {
        var x = rand() * T, y = rand() * T, a = -0.95 + (rand() - 0.5) * 0.5;
        var len = sp[5] + rand() * sp[6];
        var dx = Math.cos(a) * len, dy = Math.sin(a) * len;
        g.globalAlpha = sp[1] + rand() * sp[2];
        g.lineWidth = sp[3] + rand() * sp[4];
        g.beginPath();
        for (var ox = -T; ox <= T; ox += T) {
          for (var oy = -T; oy <= T; oy += T) {
            g.moveTo(x + ox, y + oy);
            g.lineTo(x + ox + dx, y + oy + dy);
          }
        }
        g.stroke();
      }
      out.push(c);
    }
    return (grainMasks[v] = out);
  }

  function grainTile(color, v) {
    var key = color + v;
    if (grainTiles[key]) return grainTiles[key];
    var m = grainMask(v), T = GRAIN_T, c = makeCanvas(T, T), g = c.getContext('2d');
    var w = makeCanvas(T, T), wg = w.getContext('2d');
    g.drawImage(m[0], 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, T, T);
    wg.drawImage(m[1], 0, 0);
    wg.globalCompositeOperation = 'source-in';
    wg.fillStyle = '#fffdf6';
    wg.fillRect(0, 0, T, T);
    g.globalCompositeOperation = 'source-over';
    g.drawImage(w, 0, 0);
    return (grainTiles[key] = c);
  }

  function pencil(spr, color, seed, strength) {
    seed = Math.abs(Math.round(seed || 0));
    var g = spr.getContext('2d');
    var k = (spr.lw ? spr.width / spr.lw : sprDpr()) / 2;      // the tiles are 2x
    var tile = grainTile(color, seed % GRAIN_VARIANTS);
    var ox = (seed * 53) % GRAIN_T, oy = (seed * 97) % GRAIN_T;
    g.save();
    g.setTransform(k, 0, 0, k, -ox * k, -oy * k);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = strength === undefined ? 1 : strength;
    g.fillStyle = g.createPattern(tile, 'repeat');
    g.fillRect(ox, oy, spr.width / k, spr.height / k);
    g.restore();
  }

  // ------------------------------------------------------- shape helpers
  // Wobbly round blob path (closed, smooth) - the basis of watercolor blooms.
  function blobPath(g, cx, cy, rx, ry, rand, wobble) {
    var n = 9, pts = [], i;
    var ph = rand() * TAU;
    for (i = 0; i < n; i++) {
      var a = ph + (i / n) * TAU;
      var k = 1 + (rand() - 0.5) * 2 * wobble;
      pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    g.beginPath();
    var mx = (pts[n - 1][0] + pts[0][0]) / 2, my = (pts[n - 1][1] + pts[0][1]) / 2;
    g.moveTo(mx, my);
    for (i = 0; i < n; i++) {
      var p = pts[i], q = pts[(i + 1) % n];
      g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    }
    g.closePath();
  }

  // Rounded star path (10 points, chubby). Corners get rounded by the caller
  // using lineJoin = 'round' with a thick stroke.
  function starPath(g, cx, cy, R, ratio, rot) {
    g.beginPath();
    for (var i = 0; i < 10; i++) {
      var rr = (i % 2 === 0) ? R : R * ratio;
      var a = rot - Math.PI / 2 + i * Math.PI / 5;
      var px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
  }

  function dot(g, x, y, r, color) {
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fillStyle = color;
    g.fill();
  }

  function circles(g, list) {
    g.beginPath();
    for (var j = 0; j < list.length; j++) {
      g.moveTo(list[j][0] + list[j][2], list[j][1]);
      g.arc(list[j][0], list[j][1], list[j][2], 0, TAU);
    }
  }

  function softDot(g, x, y, r, color, a) {
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba(color, a));
    gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function roundRectPath(g, px, py, pw, ph, rad) {
    g.beginPath();
    g.moveTo(px + rad, py);
    g.arcTo(px + pw, py, px + pw, py + ph, rad);
    g.arcTo(px + pw, py + ph, px, py + ph, rad);
    g.arcTo(px, py + ph, px, py, rad);
    g.arcTo(px, py, px + pw, py, rad);
    g.closePath();
  }

  // Cute face shared by stars. s = scale unit (about face size).
  function starFace(g, cx, cy, s) {
    dot(g, cx - s * 0.33, cy + s * 0.1, s * 0.08, rgba(PAL.mushroom, 0.6));
    dot(g, cx + s * 0.33, cy + s * 0.1, s * 0.08, rgba(PAL.mushroom, 0.6));
    dot(g, cx - s * 0.2, cy - s * 0.02, s * 0.06, PAL.ink);
    dot(g, cx + s * 0.2, cy - s * 0.02, s * 0.06, PAL.ink);
    dot(g, cx - s * 0.185, cy - s * 0.04, s * 0.02, '#fff');
    dot(g, cx + s * 0.215, cy - s * 0.04, s * 0.02, '#fff');
    ink(g, s * 0.04);
    g.beginPath();
    g.arc(cx, cy + s * 0.05, s * 0.1, 0.2 * Math.PI, 0.8 * Math.PI);
    g.stroke();
  }

  // ----------------------------------------------------------------- stars
  // Soft yellow five-point star with an ink outline; the glow sits behind it.
  function starSprite(radius, dpr, opts) {
    opts = opts || {};
    var face = !!opts.face, glow = opts.glow !== false, empty = !!opts.empty;
    var pad = (glow && !empty) ? radius * 0.85 : radius * 0.2;
    var size = (radius + pad) * 2;
    var s = newSprite(size, size, dpr), g = s.g, c = size / 2;
    var R = radius * 0.78, sw = radius * 0.28;   // body radius & rounding stroke
    var iw = Math.max(1.3, radius * 0.07), rand = rng(Math.round(radius * 10) + 7);
    function path() { starPath(g, c, c, R, 0.52, 0); }
    g.lineJoin = 'round';

    if (empty) {                                  // a slot: pale, with a faint line
      path();
      g.lineWidth = sw;
      g.strokeStyle = '#fffdf6'; g.fillStyle = '#fffdf6';
      g.stroke(); g.fill();
      pencil(s.c, '#cdbfae', 3, 0.7);
      g.globalCompositeOperation = 'destination-over';
      path();
      g.lineWidth = sw + iw * 1.7;
      g.strokeStyle = rgba(PAL.ink, 0.5);
      g.stroke();
      g.globalCompositeOperation = 'source-over';
      return s.c;
    }

    path();
    g.lineWidth = sw;
    g.strokeStyle = PAL.star; g.fillStyle = PAL.star;
    g.stroke(); g.fill();
    // light watercolor: pigment pooled low on the right, bare wall upper left
    g.globalCompositeOperation = 'source-atop';
    softDot(g, c + radius * 0.3, c + radius * 0.45, radius * 0.95, '#f0bd3c', 0.5);
    softDot(g, c - radius * 0.28, c - radius * 0.32, radius * 0.7, '#ffffff', 0.7);
    g.globalCompositeOperation = 'source-over';
    pencil(s.c, '#e0a92c', Math.round(radius), 1);
    inkAround(g, path, iw, sw, rand);
    if (face) starFace(g, c, c + radius * 0.05, radius * 1.1);
    if (glow) {
      g.globalCompositeOperation = 'destination-over';
      var gr = g.createRadialGradient(c, c, radius * 0.3, c, c, size / 2);
      gr.addColorStop(0, 'rgba(255,232,120,0.9)');
      gr.addColorStop(0.45, 'rgba(255,230,130,0.4)');
      gr.addColorStop(1, 'rgba(255,232,150,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, size, size);
      g.globalCompositeOperation = 'source-over';
    }
    return s.c;
  }

  // ---------------------------------------------------------------- clouds
  // Circle layout of the cloud body, in units of the cloud width.
  var CLOUD = [
    [-0.30, 0.06, 0.17], [-0.15, -0.08, 0.22], [0.07, -0.14, 0.26], [0.28, -0.03, 0.20],
    [0.34, 0.08, 0.15], [0.0, 0.08, 0.22], [-0.18, 0.10, 0.17], [0.18, 0.10, 0.18]
  ];

  // The mural's puffy blue cloud: ink outline, blue at the edges, wall-white
  // and mottled in the middle. opts: seed, face (default true), mud.
  function cloudSprite(width, dpr, opts) {
    opts = opts || {};
    var seed = opts.seed === undefined ? 1 : opts.seed;
    var mud = !!opts.mud, face = opts.face !== false;
    var rand = rng(seed * 7 + (mud ? 3 : 0));
    var w = width;
    var lw = w * 1.06, lh = w * (mud ? 1.04 : 0.85);
    var s = newSprite(lw, lh, dpr), g = s.g;
    var cx = lw / 2, cy = w * 0.48;
    var iw = Math.max(1.5, w * 0.016);
    var i, k;

    // body circles with a little jitter
    var circ = CLOUD.map(function (c) {
      return [cx + (c[0] + (rand() - 0.5) * 0.03) * w, cy + (c[1] + (rand() - 0.5) * 0.02) * w,
        c[2] * w * (0.92 + rand() * 0.1)];
    });
    var drips = [];
    if (mud) {
      var dx = [-0.22, 0.02, 0.24];
      for (i = 0; i < 3; i++) drips.push([cx + (dx[i] + (rand() - 0.5) * 0.04) * w,
        cy + (0.14 + i % 2 * 0.05) * w, w * (0.04 + rand() * 0.015), w * (0.13 + rand() * 0.05)]);
    }
    function body() {
      circles(g, circ);
      for (var j = 0; j < drips.length; j++) {     // round-ended hanging drips
        var d = drips[j];
        g.moveTo(d[0] - d[2], d[1]);               // clockwise, like the body arcs
        g.arc(d[0], d[1], d[2], Math.PI, 0, false);
        g.lineTo(d[0] + d[2], d[1] + d[3]);
        g.arc(d[0], d[1] + d[3], d[2], 0, Math.PI, false);
        g.closePath();
      }
    }
    var deep = mud ? PAL.mudDark : PAL.cloudDeep;

    body();
    g.fillStyle = mud ? '#b78a5d' : PAL.cloud;
    g.fill();

    g.globalCompositeOperation = 'source-atop';
    // pigment pooled toward the bottom, and a few darker dabs
    var lg = g.createLinearGradient(0, cy - w * 0.3, 0, cy + w * 0.3);
    lg.addColorStop(0, rgba(deep, 0));
    lg.addColorStop(1, rgba(deep, mud ? 0.5 : 0.4));
    g.fillStyle = lg;
    g.fillRect(0, 0, lw, lh);
    for (i = 0; i < 6; i++) {
      var bx = cx + (rand() - 0.5) * w * 0.8, by = cy + w * (0.02 + rand() * 0.18);
      blobPath(g, bx, by, w * (0.07 + rand() * 0.07), w * (0.04 + rand() * 0.04), rand, 0.2);
      g.fillStyle = rgba(deep, 0.14);
      g.fill();
    }
    // the middle of each bump is left almost bare
    for (i = 0; i < circ.length; i++) {
      var cc = circ[i];
      softDot(g, cc[0] - cc[2] * 0.1, cc[1] - cc[2] * 0.15, cc[2] * 0.95,
        mud ? '#ffe1b4' : '#ffffff', mud ? 0.4 : 0.8);
    }
    for (i = 0; i < 7; i++) {                       // mottling, like a dry brush
      blobPath(g, cx + (rand() - 0.5) * w * 0.7, cy + (rand() - 0.6) * w * 0.3,
        w * (0.04 + rand() * 0.06), w * (0.025 + rand() * 0.03), rand, 0.25);
      g.fillStyle = mud ? 'rgba(255,225,180,0.14)' : 'rgba(255,255,255,0.3)';
      g.fill();
    }
    if (mud) {  // darker mud speckles
      for (i = 0; i < 9; i++) {
        dot(g, cx + (rand() - 0.5) * w * 0.8, cy + (rand() - 0.4) * w * 0.35,
          w * (0.012 + rand() * 0.02), rgba(PAL.mudDark, 0.35));
      }
    }
    g.globalCompositeOperation = 'source-over';
    pencil(s.c, deep, seed * 5 + 1, mud ? 0.9 : 1);

    // short ink curls that run in from the notches between the top bumps
    g.globalCompositeOperation = 'source-atop';
    ink(g, iw * 0.75);
    g.beginPath();
    [[2, 1.2, 1.0], [3, 1.55, 1.32], [1, 1.02, 0.86]].forEach(function (q) {
      var cc = circ[q[0]], a0 = q[1] * Math.PI;
      g.moveTo(cc[0] + Math.cos(a0) * cc[2], cc[1] + Math.sin(a0) * cc[2]);
      g.arc(cc[0], cc[1], cc[2], a0, q[2] * Math.PI, true);
    });
    g.stroke();
    g.globalCompositeOperation = 'source-over';
    inkAround(g, body, iw, 0, rand);

    // face
    if (face || mud) {
      var fy = cy + w * 0.03;
      if (mud) {
        // wide open eyes with shine, cheeky grin with a pink tongue
        for (k = -1; k <= 1; k += 2) {
          dot(g, cx + k * w * 0.2, fy + w * 0.045, w * 0.04, rgba(PAL.mushroom, 0.55));
          dot(g, cx + k * w * 0.12, fy - w * 0.04, w * 0.042, '#fff');
          ink(g, iw * 0.7);
          g.beginPath(); g.arc(cx + k * w * 0.12, fy - w * 0.04, w * 0.042, 0, TAU); g.stroke();
          dot(g, cx + k * w * 0.12 + w * 0.008, fy - w * 0.035, w * 0.026, PAL.ink);
          dot(g, cx + k * w * 0.12 + w * 0.016, fy - w * 0.045, w * 0.009, '#fff');
        }
        g.beginPath();
        g.moveTo(cx - w * 0.1, fy + w * 0.035);
        g.quadraticCurveTo(cx, fy + w * 0.17, cx + w * 0.1, fy + w * 0.035);
        g.quadraticCurveTo(cx, fy + w * 0.06, cx - w * 0.1, fy + w * 0.035);
        g.closePath();
        g.fillStyle = PAL.ink; g.fill();
        ink(g, w * 0.016); g.stroke();
        g.save(); g.clip();
        dot(g, cx + w * 0.02, fy + w * 0.12, w * 0.04, PAL.mushroom);
        g.restore();
      } else {
        // sleepy happy closed eyes, tiny smile, blush
        for (k = -1; k <= 1; k += 2) {
          dot(g, cx + k * w * 0.19, fy + w * 0.03, w * 0.04, rgba(PAL.mushroom, 0.55));
        }
        ink(g, Math.max(1.4, w * 0.017));
        for (k = -1; k <= 1; k += 2) {
          g.beginPath();
          g.arc(cx + k * w * 0.11, fy - w * 0.03, w * 0.032, 0.15 * Math.PI, 0.85 * Math.PI);
          g.stroke();
        }
        g.beginPath();
        g.arc(cx, fy + w * 0.005, w * 0.045, 0.2 * Math.PI, 0.8 * Math.PI);
        g.stroke();
      }
    }
    s.c.hitR = w * 0.36;
    return s.c;
  }

  // ---------------------------------------------------------------- bubble
  function bubbleSprite(radius, dpr) {
    var size = radius * 2 + 4;
    var s = newSprite(size, size, dpr), g = s.g, c = size / 2;
    var lw = Math.max(1.1, radius * 0.09), rr = radius - lw / 2;
    var fill = g.createRadialGradient(c, c, radius * 0.35, c, c, radius);
    fill.addColorStop(0, 'rgba(255,255,255,0.12)');
    fill.addColorStop(1, rgba(PAL.cloud, 0.6));
    g.fillStyle = fill;
    g.beginPath(); g.arc(c, c, rr, 0, TAU); g.fill();
    pencil(s.c, PAL.cloudDeep, Math.round(radius), 0.6);
    // a wash of pink low on one side, like a soap film
    g.globalCompositeOperation = 'source-atop';
    softDot(g, c + radius * 0.4, c + radius * 0.5, radius * 0.8, PAL.mushroom, 0.3);
    g.globalCompositeOperation = 'source-over';
    ink(g, lw);
    g.globalAlpha = 0.8;
    g.beginPath(); g.arc(c, c, rr, 0, TAU); g.stroke();
    g.globalAlpha = 1;
    // highlights
    g.lineWidth = Math.max(1.5, radius * 0.11);
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.beginPath(); g.arc(c, c, radius * 0.6, Math.PI * 1.1, Math.PI * 1.4); g.stroke();
    dot(g, c + radius * 0.36, c + radius * 0.4, radius * 0.08, 'rgba(255,255,255,0.85)');
    return s.c;
  }

  // ------------------------------------------------------------------ wall
  // The painted wall behind everything: a flat ground with faint, broad brush
  // strokes. stops: [[offset, color], ...] top to bottom; strokes: colors of the
  // brush marks; a: their opacity.
  function paintWall(w, h, dpr, seed, stops, strokes, a) {
    var s = newSprite(w, h, dpr), g = s.g, rand = rng(seed), i;
    var gr = g.createLinearGradient(0, 0, 0, h);
    for (i = 0; i < stops.length; i++) gr.addColorStop(stops[i][0], stops[i][1]);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    var m = Math.min(w, h), n = Math.round(26 + w * h / 30000);
    g.lineCap = 'round';
    for (i = 0; i < n; i++) {
      var x0 = rand() * w * 1.2 - w * 0.2, y0 = rand() * h, len = m * (0.3 + rand() * 0.6);
      var tilt = (rand() - 0.5) * 0.5, bw = m * (0.035 + rand() * 0.07);
      var x1 = x0 + Math.cos(tilt) * len, y1 = y0 + Math.sin(tilt) * len;
      var bend = (rand() - 0.5) * m * 0.12;
      g.strokeStyle = rgba(strokes[i % strokes.length], a * (0.5 + rand()));
      g.lineWidth = bw;
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + bend, x1, y1);
      g.stroke();
      // a couple of bristle lines along the same stroke
      g.lineWidth = Math.max(1, bw * 0.06);
      for (var b = -1; b <= 1; b += 2) {
        var off = b * bw * (0.2 + rand() * 0.2);
        g.beginPath();
        g.moveTo(x0 + len * 0.1, y0 + off);
        g.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + bend + off, x1 - len * 0.1, y1 + off);
        g.stroke();
      }
    }
    return s;
  }

  // A painted sun: pencil-yellow disc, ink outline, short round rays.
  function paintSun(s, x, y, r, fill, deep, glowRgb, glowR, seed) {
    var g = s.g, rand = rng(seed), dpr = s.c.width / s.c.lw;
    var gl = g.createRadialGradient(x, y, r * 0.5, x, y, glowR);
    gl.addColorStop(0, 'rgba(' + glowRgb + ',0.75)');
    gl.addColorStop(0.35, 'rgba(' + glowRgb + ',0.3)');
    gl.addColorStop(1, 'rgba(' + glowRgb + ',0)');
    g.fillStyle = gl;
    g.fillRect(x - glowR, y - glowR, glowR * 2, glowR * 2);
    var size = r * 2.4, d = newSprite(size, size, dpr), dg = d.g, c = size / 2;
    function disc() { blobPath(dg, c, c, r, r, rng(seed + 1), 0.035); }
    disc();
    dg.fillStyle = fill; dg.fill();
    dg.globalCompositeOperation = 'source-atop';
    softDot(dg, c + r * 0.3, c + r * 0.4, r * 1.1, deep, 0.45);
    softDot(dg, c - r * 0.3, c - r * 0.3, r * 0.8, '#ffffff', 0.55);
    dg.globalCompositeOperation = 'source-over';
    pencil(d.c, deep, seed, 1);
    var iw = Math.max(1.6, r * 0.06);
    inkStroke(dg, disc, iw, rand);
    g.drawImage(d.c, x - c, y - c, size, size);
    ink(g, iw);
    for (var i = 0; i < 10; i++) {
      var a = i / 10 * TAU + 0.2 + (rand() - 0.5) * 0.12;
      var r0 = r * 1.32, r1 = r * (1.58 + (i % 2) * 0.16);
      g.beginPath();
      g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      g.stroke();
    }
  }

  // Day: the cream wall, with a small friendly sun (kept clear of the buttons).
  function paintSky(w, h, dpr) {
    var s = paintWall(w, h, dpr, 11, [[0, '#f9f4ea'], [1, PAL.wall]],
      ['#ffffff', '#e6d9c3', '#ffffff', '#eadfce', '#dfeaf0'], 0.25);
    var m = Math.min(w, h);
    paintSun(s, w * 0.76, h * 0.2, m * 0.062, '#f9e488', '#f0bd3c', '255,236,150', m * 0.3, 5);
    return s.c;
  }

  // ----------------------------------------------------------------- hills
  // Periodic height function: integer harmonics over the tile => seamless.
  function hillFn(T, base, amps, phases) {
    return function (x) {
      var y = base;
      for (var i = 0; i < amps.length; i++) {
        y += amps[i][1] * Math.sin(TAU * amps[i][0] * x / T + phases[i]);
      }
      return y;
    };
  }

  // A mural tree (or a bush, without the trunk): puffy green crown, brown trunk.
  function treeSprite(size, dpr, seed, bush) {
    var rand = rng(seed * 17 + 3);
    var lw = size * 1.1, lh = size * (bush ? 0.62 : 1.12);
    var s = newSprite(lw, lh, dpr), g = s.g, cx = lw / 2;
    var cyc = size * (bush ? 0.34 : 0.38), iw = Math.max(1.3, size * 0.028);
    var lay = bush
      ? [[-0.26, 0.06, 0.17], [-0.06, -0.06, 0.2], [0.2, 0.02, 0.19], [0.0, 0.1, 0.18]]
      : [[-0.27, 0.05, 0.19], [-0.1, -0.14, 0.22], [0.16, -0.12, 0.23], [0.3, 0.07, 0.17], [0.02, 0.08, 0.24]];
    var circ = lay.map(function (c) {
      return [cx + (c[0] + (rand() - 0.5) * 0.04) * size, cyc + (c[1] + (rand() - 0.5) * 0.04) * size,
        c[2] * size * (0.92 + rand() * 0.14)];
    });
    function crown() { circles(g, circ); }
    crown();
    g.fillStyle = PAL.leaf; g.fill();
    g.globalCompositeOperation = 'source-atop';
    var lg = g.createLinearGradient(0, cyc - size * 0.3, 0, cyc + size * 0.3);
    lg.addColorStop(0, rgba(PAL.leafDeep, 0)); lg.addColorStop(1, rgba(PAL.leafDeep, 0.55));
    g.fillStyle = lg; g.fillRect(0, 0, lw, lh);
    for (var i = 0; i < circ.length; i++) {
      softDot(g, circ[i][0] - circ[i][2] * 0.15, circ[i][1] - circ[i][2] * 0.2, circ[i][2] * 0.85, '#f4ffd8', 0.5);
    }
    g.globalCompositeOperation = 'source-over';
    pencil(s.c, PAL.leafDeep, seed + 2, 1);
    g.globalCompositeOperation = 'source-atop';
    ink(g, iw * 0.8);
    g.beginPath();
    g.arc(circ[2][0], circ[2][1], circ[2][2], 1.15 * Math.PI, 0.85 * Math.PI, true);
    g.stroke();
    g.globalCompositeOperation = 'source-over';
    inkAround(g, crown, iw, 0, rand);
    if (!bush) {                                   // trunk, behind the crown
      var t = newSprite(lw, lh, dpr), tg = t.g, lean = (rand() - 0.5) * size * 0.1;
      var y0 = cyc + size * 0.1, y1 = lh - iw, tw = size * 0.075;
      tg.beginPath();
      tg.moveTo(cx - tw + lean, y0);
      tg.quadraticCurveTo(cx - tw * 0.6, (y0 + y1) / 2, cx - tw * 1.9, y1);
      tg.lineTo(cx + tw * 1.9, y1);
      tg.quadraticCurveTo(cx + tw * 0.6, (y0 + y1) / 2, cx + tw + lean, y0);
      tg.closePath();
      tg.fillStyle = '#9a6a55'; tg.fill();
      pencil(t.c, '#6b4335', seed, 1);
      ink(tg, iw); tg.stroke();
      g.globalCompositeOperation = 'destination-over';
      g.drawImage(t.c, 0, 0, lw, lh);
      g.globalCompositeOperation = 'source-over';
    }
    return s.c;
  }

  // The ground of the mural, as two seamless bands that scroll at different
  // speeds: layer 'back' is the grass with trees, layer 'front' is the river.
  function paintHills(tileW, h, dpr, opts) {
    opts = opts || {};
    var seed = opts.seed === undefined ? 1 : opts.seed;
    var front = opts.layer === 'front';
    var rand = rng(seed * 31 + (front ? 5 : 1));
    var s = newSprite(tileW, h, dpr), g = s.g;
    var amps, base;
    if (front) { base = h * 0.78; amps = [[1, h * 0.045], [2, h * 0.03], [3, h * 0.012]]; }
    else { base = h * 0.56; amps = [[1, h * 0.085], [2, h * 0.05], [3, h * 0.02]]; }
    var i, o, rep, x, step = 3;
    var fill = front ? PAL.river : PAL.leaf;
    var deep = front ? PAL.riverDeep : PAL.leafDeep;
    var iw = Math.max(1.6, h * 0.012);

    var phases = amps.map(function () { return rand() * TAU; });
    var f0 = hillFn(tileW, base, amps, phases);
    function edge(dy) {                            // the top line, open path
      g.beginPath();
      for (var xr = -step * 2; xr <= tileW + step * 2; xr += step) g[xr === -step * 2 ? 'moveTo' : 'lineTo'](xr, f0(xr) + dy);
    }
    edge(0);
    g.lineTo(tileW + step * 2, h + 2);
    g.lineTo(-step * 2, h + 2);
    g.closePath();
    g.fillStyle = fill;
    g.fill();

    g.globalCompositeOperation = 'source-atop';
    // color pooled lower down, lighter near the top edge
    var gr = g.createLinearGradient(0, base - h * 0.2, 0, h);
    gr.addColorStop(0, rgba(deep, 0)); gr.addColorStop(1, rgba(deep, 0.5));
    g.fillStyle = gr;
    g.fillRect(0, 0, tileW, h);
    edge(h * 0.05);
    g.lineCap = 'round';
    g.lineWidth = h * 0.09;
    g.strokeStyle = 'rgba(255,255,240,0.28)';
    g.stroke();
    // long brush strokes that follow the band (periodic, so they tile too)
    for (i = 0; i < (front ? 9 : 7); i++) {
      var off = h * (0.08 + rand() * (front ? 0.22 : 0.4));
      var xs = rand() * tileW, len = tileW * (0.12 + rand() * 0.2);
      g.lineWidth = h * (0.015 + rand() * 0.03);
      g.strokeStyle = i % 2 ? rgba(deep, 0.22) : 'rgba(255,255,255,0.24)';
      for (rep = -1; rep <= 1; rep++) {
        g.beginPath();
        for (x = 0; x <= len; x += step) g[x === 0 ? 'moveTo' : 'lineTo'](xs + x + rep * tileW, f0(xs + x) + off);
        g.stroke();
      }
    }
    g.globalCompositeOperation = 'source-over';
    pencil(s.c, deep, seed * 3 + (front ? 1 : 0), 1);

    if (front) {
      // white dotted trim under the bank, as on the mushroom houses
      var gap = Math.max(7, h * 0.05), nd = Math.round(tileW / gap);
      for (i = 0; i < nd; i++) {
        x = (i + 0.5) * tileW / nd;
        dot(g, x, f0(x) + h * 0.045 + iw, Math.max(1.2, h * 0.009), 'rgba(255,255,255,0.85)');
      }
      // small ink ripples
      var nr = Math.max(4, Math.round(tileW / 110));
      ink(g, iw * 0.7);
      for (i = 0; i < nr; i++) {
        var rx = (i + 0.2 + rand() * 0.6) * tileW / nr, ry = f0(rx) + h * (0.11 + rand() * 0.12), rw = h * (0.035 + rand() * 0.03);
        if (rx < rw * 3 || rx > tileW - rw * 3) continue;
        g.beginPath();
        g.moveTo(rx - rw * 2, ry);
        g.quadraticCurveTo(rx - rw, ry - rw * 0.9, rx, ry);
        g.quadraticCurveTo(rx + rw, ry + rw * 0.9, rx + rw * 2, ry);
        g.stroke();
      }
    } else {
      // little flowers and grass tufts on the meadow
      var n = Math.max(6, Math.round(tileW / 60));
      for (i = 0; i < n; i++) {
        var fx = (i + 0.2 + rand() * 0.6) * tileW / n;
        var fy = f0(fx) + h * (0.1 + rand() * 0.2);
        var fr = h * (0.012 + rand() * 0.008) + 1.5;
        var petal = ['#ffffff', PAL.star, PAL.mushroom, '#ffffff', PAL.orange][i % 5];
        var offs = [0];
        if (fx < fr * 5) offs.push(tileW);
        if (fx > tileW - fr * 5) offs.push(-tileW);
        for (o = 0; o < offs.length; o++) {
          var ox = fx + offs[o];
          if (i % 3 === 0) {                 // grass tuft: three short ink blades
            ink(g, iw * 0.65);
            g.beginPath();
            g.moveTo(ox - fr * 1.6, fy - fr * 1.8); g.lineTo(ox - fr * 0.5, fy);
            g.moveTo(ox, fy - fr * 2.6); g.lineTo(ox, fy);
            g.moveTo(ox + fr * 1.6, fy - fr * 1.8); g.lineTo(ox + fr * 0.5, fy);
            g.stroke();
          } else {                           // five-petal flower with a thin ink line
            g.beginPath();
            for (var k = 0; k < 5; k++) {
              var a = k / 5 * TAU;
              g.moveTo(ox + Math.cos(a) * fr + fr * 0.75, fy + Math.sin(a) * fr);
              g.arc(ox + Math.cos(a) * fr, fy + Math.sin(a) * fr, fr * 0.75, 0, TAU);
            }
            ink(g, iw * 0.9); g.stroke();
            g.fillStyle = petal; g.fill();
            dot(g, ox, fy, fr * 0.55, i % 5 === 1 ? PAL.orange : '#f0bd3c');
          }
        }
      }
    }
    // the ink line along the top of the band
    inkStroke(g, function () { edge(0); }, iw, rand);

    if (!front) {
      // trees and bushes standing on the meadow, wrapped at the tile edges
      var nt = Math.max(3, Math.round(tileW / 190));
      for (i = 0; i < nt; i++) {
        var bush = i % 3 === 1;
        var ts = h * (bush ? 0.2 : 0.26 + rand() * 0.07);
        var spr = treeSprite(ts, dpr, seed * 10 + i, bush);
        var tx = (i + 0.25 + rand() * 0.5) * tileW / nt;
        var ty = f0(tx) + h * (bush ? 0.02 : 0.035) - spr.lh;
        if (ty < 1) ty = 1;
        for (rep = -1; rep <= 1; rep++) g.drawImage(spr, tx - spr.lw / 2 + rep * tileW, ty, spr.lw, spr.lh);
      }
    }
    return s.c;
  }

  // --------------------------------------------------------------- splotch
  // Unit coordinates: main blob radius 1 at the origin.
  function makeSplotch(rand) {
    var sat = [], drops = [], spots = [], i;
    var n = 5 + Math.floor(rand() * 2), a0 = rand() * TAU;
    for (i = 0; i < n; i++) {
      var a = a0 + i / n * TAU + (rand() - 0.5) * 0.5, d = 0.6 + rand() * 0.3;
      sat.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * 0.85, r: 0.3 + rand() * 0.2 });
    }
    for (i = 0; i < 3 + Math.floor(rand() * 2); i++) {
      var b = rand() * TAU, e = 1.25 + rand() * 0.35;
      drops.push({ x: Math.cos(b) * e, y: Math.sin(b) * e * 0.85, r: 0.07 + rand() * 0.07 });
    }
    for (i = 0; i < 4; i++) {
      var c = rand() * TAU, f = rand() * 0.6;
      spots.push({ x: Math.cos(c) * f, y: Math.sin(c) * f, r: 0.07 + rand() * 0.1 });
    }
    return { sat: sat, drops: drops, spots: spots, shine: { x: -0.3, y: -0.38, r: 0.2 } };
  }

  // The splotch is painted once (ink outline, mud wash, pencil grain) into a
  // sprite kept on the shape; each frame is a single drawImage.
  var SPL_U = 72, SPL_E = 1.95, splotchN = 0;
  function splotchSprite(shape) {
    var U = SPL_U, size = Math.ceil(SPL_E * U * 2), c = makeCanvas(size, size), g = c.getContext('2d');
    var o = size / 2, i, b, iw = U * 0.045, rand = rng(++splotchN * 7 + 1);
    c.lw = size / 2;                              // grain as on a 2x sprite
    function body() {
      var list = [[o, o, U]];
      for (i = 0; i < shape.sat.length; i++) { b = shape.sat[i]; list.push([o + b.x * U, o + b.y * U, b.r * U]); }
      for (i = 0; i < shape.drops.length; i++) { b = shape.drops[i]; list.push([o + b.x * U, o + b.y * U, b.r * U]); }
      circles(g, list);
    }
    body();
    g.fillStyle = PAL.mud;
    g.fill();
    g.globalCompositeOperation = 'source-atop';
    softDot(g, o + U * 0.3, o + U * 0.4, U * 1.5, PAL.mudDark, 0.4);
    for (i = 0; i < shape.spots.length; i++) {
      b = shape.spots[i];
      dot(g, o + b.x * U, o + b.y * U, b.r * U, rgba(PAL.mudDark, 0.5));
    }
    b = shape.shine;
    g.beginPath();
    g.ellipse(o + b.x * U, o + b.y * U, b.r * U * 1.4, b.r * U * 0.8, -0.6, 0, TAU);
    g.fillStyle = 'rgba(255,233,201,0.5)';
    g.fill();
    g.globalCompositeOperation = 'source-over';
    pencil(c, PAL.mudDark, splotchN, 1);
    inkAround(g, body, iw, 0, rand);
    return c;
  }

  function drawSplotch(g, shape, x, y, r, alpha) {
    var spr = shape.spr || (shape.spr = splotchSprite(shape));
    var prev = g.globalAlpha, e = SPL_E * r;
    g.globalAlpha = prev * alpha;
    g.drawImage(spr, x - e, y - e, e * 2, e * 2);
    g.globalAlpha = prev;
  }

  // --------------------------------------------------------------- rainbow
  // Painted once per size (bands in the mural's colors, ink lines between
  // them, pencil grain); each frame blits it, clipped to a wedge while it
  // sweeps in.
  var rainbowCache = newCache();
  function rainbowSprite(radius, band) {
    var dpr = sprDpr(), bands = PAL.rainbow, n = bands.length, i;
    var iw = Math.max(1.5, band * 0.07), ext = 0.07;      // the ends run a little past the half turn
    var rOut = radius + band * 0.46, pad = iw * 2 + 2;
    var lw = (rOut + pad) * 2, lh = rOut + pad + rOut * Math.sin(ext) + pad;
    var s = newSprite(lw, lh, dpr), g = s.g, cx = lw / 2, cy = rOut + pad;
    var rand = rng(Math.round(radius));
    g.lineCap = 'butt';
    for (i = 0; i < n; i++) {
      g.strokeStyle = bands[i];
      g.lineWidth = band * 0.92;
      g.beginPath();
      g.arc(cx, cy, radius - i * band * 0.88, Math.PI - ext, TAU + ext);
      g.stroke();
    }
    // watercolor: lighter along the top of the arch
    g.globalCompositeOperation = 'source-atop';
    softDot(g, cx, cy - radius * 0.75, radius * 0.9, '#ffffff', 0.3);
    g.globalCompositeOperation = 'source-over';
    pencil(s.c, '#6d4a5c', Math.round(radius), 0.9);
    function lines() {
      g.beginPath();
      for (var j = 0; j <= n; j++) {
        var rr = radius + band * 0.46 - j * band * 0.88 - (j === n ? band * 0.04 : 0);
        g.moveTo(cx + Math.cos(Math.PI - ext) * rr, cy + Math.sin(Math.PI - ext) * rr);
        g.arc(cx, cy, rr, Math.PI - ext, TAU + ext);
      }
      var ri = radius + band * 0.46 - n * band * 0.88 - band * 0.04, ro = radius + band * 0.46;
      for (j = -1; j <= 1; j += 2) {             // close the two feet
        var a = j < 0 ? Math.PI - ext : TAU + ext;
        g.moveTo(cx + Math.cos(a) * ri, cy + Math.sin(a) * ri);
        g.lineTo(cx + Math.cos(a) * ro, cy + Math.sin(a) * ro);
      }
    }
    inkStroke(g, lines, iw, rand);
    s.c.cx = cx; s.c.cy = cy; s.c.rOut = rOut + pad;
    return s.c;
  }

  function drawRainbow(g, cx, cy, radius, band, alpha, sweep) {
    if (sweep <= 0 || alpha <= 0) return;
    if (sweep > 1) sweep = 1;
    var spr = cached(rainbowCache, Math.round(radius) + '/' + Math.round(band * 4), function () {
      return rainbowSprite(radius, band);
    });
    var prev = g.globalAlpha;
    g.globalAlpha = prev * alpha;
    if (sweep < 1) {
      g.save();
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, spr.rOut * 1.1, Math.PI - 0.2, Math.PI + Math.PI * sweep);
      g.closePath();
      g.clip();
      g.drawImage(spr, cx - spr.cx, cy - spr.cy, spr.lw, spr.lh);
      g.restore();
    } else {
      g.drawImage(spr, cx - spr.cx, cy - spr.cy, spr.lw, spr.lh);
    }
    g.globalAlpha = prev;
  }

  // ---------------------------------------------------------------- sponge
  var spongeCache = newCache();
  function spongeSprite(r) {
    var size = r * 3, s = newSprite(size, size, sprDpr()), g = s.g, x = size / 2, y = size / 2;
    var w = r * 1.7, h = r * 1.2, cr = r * 0.42, i, iw = Math.max(1.5, r * 0.055), rand = rng(31);
    function body() { roundRectPath(g, x - w / 2, y - h / 2, w, h, cr); }
    body();
    g.fillStyle = '#f7d266'; g.fill();
    g.globalCompositeOperation = 'source-atop';
    softDot(g, x + r * 0.3, y + r * 0.5, r * 1.3, PAL.orange, 0.4);
    softDot(g, x - r * 0.4, y - r * 0.4, r * 0.8, '#ffffff', 0.5);
    g.globalCompositeOperation = 'source-over';
    // holes
    var holes = [[-0.5, -0.2, 0.13], [-0.1, -0.3, 0.1], [0.35, -0.15, 0.14], [0.0, 0.1, 0.15],
      [-0.45, 0.2, 0.09], [0.5, 0.25, 0.1], [0.25, 0.3, 0.07]];
    g.beginPath();
    for (i = 0; i < holes.length; i++) {
      var hl = holes[i];
      g.moveTo(x + (hl[0] + hl[2]) * r, y + hl[1] * r);
      g.arc(x + hl[0] * r, y + hl[1] * r, hl[2] * r, 0, TAU);
    }
    g.fillStyle = 'rgba(214,150,44,0.65)';
    g.fill();
    pencil(s.c, '#d98a2b', 4, 1);
    ink(g, iw * 0.6);
    g.stroke();
    inkStroke(g, body, iw, rand);
    // bubbles on top
    var bub = [[0.55, -0.85, 0.2], [0.25, -1.1, 0.13], [0.85, -1.05, 0.1]];
    for (i = 0; i < bub.length; i++) {
      var b = bub[i];
      g.beginPath(); g.arc(x + b[0] * r, y + b[1] * r, b[2] * r, 0, TAU);
      g.fillStyle = rgba(PAL.cloud, 0.75); g.fill();
      ink(g, iw * 0.7); g.stroke();
      dot(g, x + (b[0] - b[2] * 0.35) * r, y + (b[1] - b[2] * 0.35) * r, b[2] * r * 0.28, '#fff');
    }
    return s.c;
  }

  function drawSponge(g, x, y, r, alpha) {
    var spr = cached(spongeCache, Math.round(r * 2), function () { return spongeSprite(r); });
    drawSprite(g, spr, x, y, 1, alpha, 0);
  }

  // ------------------------------------------------------------ play button
  // A mushroom-pink button with the white dotted trim of the mural's houses.
  var playCache = newCache();
  function playSprite(r) {
    var size = r * 2.4, s = newSprite(size, size, sprDpr()), g = s.g, x = size / 2, y = size / 2;
    var iw = Math.max(2, r * 0.045), rand = rng(53), i;
    function disc() { g.beginPath(); g.arc(x, y, r, 0, TAU); }
    disc();
    g.fillStyle = PAL.mushroom; g.fill();
    g.globalCompositeOperation = 'source-atop';
    var gr = g.createRadialGradient(x, y, r * 0.55, x, y, r);
    gr.addColorStop(0, rgba(PAL.mushroomDeep, 0)); gr.addColorStop(1, rgba(PAL.mushroomDeep, 0.55));
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    softDot(g, x - r * 0.3, y - r * 0.35, r * 0.9, '#ffffff', 0.4);
    g.globalCompositeOperation = 'source-over';
    pencil(s.c, PAL.mushroomDeep, 6, 1);
    var nd = 28;
    for (i = 0; i < nd; i++) {
      var a = i / nd * TAU;
      dot(g, x + Math.cos(a) * r * 0.84, y + Math.sin(a) * r * 0.84, r * 0.032, 'rgba(255,255,255,0.92)');
    }
    inkStroke(g, disc, iw, rand);
    // white rounded triangle, inked
    var tr = r * 0.4, ox = r * 0.06;
    function tri() {
      g.beginPath();
      g.moveTo(x - tr * 0.55 + ox, y - tr);
      g.lineTo(x + tr * 1.0 + ox, y);
      g.lineTo(x - tr * 0.55 + ox, y + tr);
      g.closePath();
    }
    ink(g, r * 0.2 + iw * 1.8);
    tri(); g.stroke();
    g.lineWidth = r * 0.2;
    g.strokeStyle = '#fffdf6'; g.fillStyle = '#fffdf6';
    tri(); g.stroke(); g.fill();
    return s.c;
  }

  function drawPlayButton(g, x, y, r, t) {
    var ph = (t * 0.6) % 1;   // subtle pulse ring, one beat per ~1.7 s
    g.lineWidth = r * 0.06;
    g.strokeStyle = rgba(PAL.mushroomDeep, 0.55 * (1 - ph));
    g.beginPath(); g.arc(x, y, r * (1.06 + 0.2 * ph), 0, TAU); g.stroke();
    drawSprite(g, cached(playCache, Math.round(r * 2), function () { return playSprite(r); }), x, y, 1, 1, 0);
  }

  // ----------------------------------------------------------------- medal
  var medalCache = newCache();
  function medalSprite(r) {
    var size = r * 2.9, s = newSprite(size, size, sprDpr()), g = s.g, x = size / 2, y = size / 2;
    var iw = Math.max(1.4, r * 0.06), rand = rng(71);
    function tail(p) {
      g.beginPath();
      g.moveTo(x + p * r * 0.15, y);
      g.lineTo(x + p * r * 0.78, y + r * 1.2);
      g.lineTo(x + p * r * 0.4, y + r * 1.0);
      g.lineTo(x + p * r * 0.02, y + r * 1.25);
      g.closePath();
    }
    function disc() { g.beginPath(); g.arc(x, y, r, 0, TAU); }
    function star() { starPath(g, x, y + r * 0.03, r * 0.42, 0.52, 0); }
    disc(); g.fillStyle = '#f6d568'; g.fill();
    g.globalCompositeOperation = 'source-atop';
    softDot(g, x + r * 0.3, y + r * 0.4, r * 1.2, PAL.orange, 0.4);
    softDot(g, x - r * 0.35, y - r * 0.4, r * 0.8, '#ffffff', 0.6);
    g.globalCompositeOperation = 'source-over';
    pencil(s.c, '#b9772a', 8, 1);
    inkStroke(g, disc, iw, rand);
    g.beginPath(); g.arc(x, y, r * 0.74, 0, TAU);
    g.lineWidth = iw * 0.6; g.strokeStyle = rgba(PAL.ink, 0.45); g.stroke();
    ink(g, r * 0.14 + iw * 1.6);
    star(); g.stroke();
    g.lineWidth = r * 0.14;
    g.fillStyle = '#fffdf6'; g.strokeStyle = '#fffdf6';
    star(); g.stroke(); g.fill();
    // little ribbon tails, slipped in behind the disc
    g.globalCompositeOperation = 'destination-over';
    [[-1, PAL.roof], [1, PAL.river]].forEach(function (p) {
      tail(p[0]); ink(g, iw); g.stroke();
      g.fillStyle = p[1]; g.fill();
    });
    g.globalCompositeOperation = 'source-over';
    return s.c;
  }

  function drawMedal(g, x, y, r) {
    drawSprite(g, cached(medalCache, Math.round(r * 2), function () { return medalSprite(r); }), x, y, 1, 1, 0);
  }

  // -------------------------------------------------------------- tap hint
  var fingerCache = newCache();
  // Fingertip pointing up; the tip's center is at (lw / 2, tipY). It fades out
  // toward the hand.
  function fingerSprite(r) {
    var fw = r * 0.26, iw = Math.max(1.4, r * 0.05), len = r * 1.15;
    var lw = fw * 2 + iw * 4, lh = fw + len + iw * 2;
    var s = newSprite(lw, lh, sprDpr()), g = s.g, x = lw / 2, y = fw + iw * 2;
    g.beginPath();
    g.moveTo(x - fw, y + len);
    g.lineTo(x - fw, y);
    g.arc(x, y, fw, Math.PI, 0);
    g.lineTo(x + fw, y + len);
    g.fillStyle = '#fbdcc8'; g.fill();
    g.beginPath(); g.ellipse(x, y - fw * 0.25, fw * 0.5, fw * 0.45, 0, 0, TAU);
    g.fillStyle = rgba(PAL.mushroom, 0.55); g.fill();
    pencil(s.c, '#d99a80', 9, 1);
    ink(g, iw);
    g.beginPath();
    g.moveTo(x - fw, y + len);
    g.lineTo(x - fw, y);
    g.arc(x, y, fw, Math.PI, 0);
    g.lineTo(x + fw, y + len);
    g.stroke();
    g.lineWidth = iw * 0.6;
    g.beginPath(); g.ellipse(x, y - fw * 0.25, fw * 0.5, fw * 0.45, 0, 0, TAU); g.stroke();
    // fade the far end
    g.globalCompositeOperation = 'destination-out';
    var fade = g.createLinearGradient(0, y + len * 0.5, 0, y + len);
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = fade;
    g.fillRect(0, y + len * 0.5, lw, len);
    s.c.tipY = y;
    return s.c;
  }

  function drawTapHint(g, x, y, r, t) {
    var i;
    // expanding round ripples
    for (i = 0; i < 3; i++) {
      var p = (t * 0.7 + i / 3) % 1;
      g.beginPath(); g.arc(x, y, r * (0.25 + 0.95 * p), 0, TAU);
      g.lineWidth = r * 0.12 * (1 - p * 0.5);
      g.strokeStyle = rgba(PAL.mushroom, 0.55 * (1 - p));
      g.stroke();
      g.lineWidth = r * 0.035;
      g.strokeStyle = rgba(PAL.ink, 0.55 * (1 - p));
      g.stroke();
    }
    // fingertip pressing down and up
    var press = 0.5 + 0.5 * Math.sin(t * TAU * 0.7);   // 0..1
    var fx = x + r * 0.08, fy = y + r * (0.12 + 0.2 * (1 - press));
    var spr = cached(fingerCache, Math.round(r * 2), function () { return fingerSprite(r); });
    g.save();
    g.translate(fx, fy);
    g.rotate(-0.25);
    g.drawImage(spr, -spr.lw / 2, -spr.tipY, spr.lw, spr.lh);
    g.restore();
  }

  // ------------------------------------------------- night / sunset walls
  // Night: the wall turns deep blue, with painted dots of far-away stars.
  function paintNightSky(w, h, dpr) {
    var s = paintWall(w, h, dpr, 23, [[0, '#293a75'], [0.6, PAL.wallNight], [1, '#3f5797']],
      ['#5670b4', '#1f2c63', '#4a64aa', '#22306a'], 0.22);
    var g = s.g, rand = rng(77), n = Math.round(w * h / 8000);
    for (var i = 0; i < n; i++) {
      var y = rand() * h * 0.85;
      dot(g, rand() * w, y, 0.8 + rand() * 1.5, 'rgba(250,236,170,' + (0.3 + rand() * 0.45) + ')');
    }
    return s.c;
  }

  // Sunset: the wall warms to apricot and the sun sits low, behind the meadow.
  function paintSunsetSky(w, h, dpr) {
    var s = paintWall(w, h, dpr, 41, [[0, '#f6e7dc'], [0.5, '#f9d6ba'], [1, '#f6b98c']],
      ['#fff3e4', '#f2a878', '#fde3cb', '#eea0a0'], 0.18);
    var m = Math.min(w, h);
    paintSun(s, w * 0.3, h * 0.7, m * 0.085, '#f8b45a', '#ea7a3a', '255,190,120', m * 0.5, 9);
    return s.c;
  }

  // ------------------------------------------------ moon, twinkle, firefly
  var moonCache = newCache(), glowCache = {};

  // Cached soft radial glow sprite (white-ish tint given as rgb string).
  function glowSprite(radius, rgb) {
    var key = Math.round(radius) + rgb;
    if (glowCache[key]) return glowCache[key];
    var size = Math.max(4, Math.ceil(radius * 2)), c = makeCanvas(size, size), g = c.getContext('2d');
    var gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, 'rgba(' + rgb + ',0.9)');
    gr.addColorStop(0.3, 'rgba(' + rgb + ',0.35)');
    gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    c.lw = size; c.lh = size;
    return (glowCache[key] = c);
  }

  // The mural's moon: a soft yellow crescent, a sleepy smile, and the red
  // ladder that hangs from it down to a small cloud. Cached per radius; the
  // crescent's center is the sprite's center.
  function moonSprite(r) {
    var dpr = sprDpr();
    var size = r * 6, s = newSprite(size, size, dpr), g = s.g, c = size / 2;
    var iw = Math.max(1.6, r * 0.055), rand = rng(19), i;

    // the crescent, on its own canvas: disc of radius r minus an offset disc
    var m = newSprite(r * 2.6, r * 2.6, dpr), mg = m.g, o = r * 1.3;
    var th = -0.35, d = r * 0.5, ri = r * 0.82, round = r * 0.1, ro = r - round / 2;
    var a = (ro * ro - ri * ri + d * d) / (2 * d), hh = Math.sqrt(ro * ro - a * a);
    var phi = Math.acos(a / ro), psi = Math.atan2(hh, a - d);
    var ix = o + Math.cos(th) * d, iy = o + Math.sin(th) * d;
    function crescent() {
      mg.beginPath();
      mg.arc(o, o, ro, th + phi, th - phi + TAU, false);
      mg.arc(ix, iy, ri, th - psi, th + psi - TAU, true);
      mg.closePath();
    }
    crescent();
    mg.lineJoin = 'round';
    mg.lineWidth = round;
    mg.fillStyle = PAL.moon; mg.strokeStyle = PAL.moon;
    mg.stroke(); mg.fill();
    mg.globalCompositeOperation = 'source-atop';
    softDot(mg, o - r * 0.2, o + r * 0.6, r * 1.1, '#eccb5c', 0.45);
    softDot(mg, o - r * 0.55, o - r * 0.35, r * 0.8, '#ffffff', 0.5);
    mg.globalCompositeOperation = 'source-over';
    pencil(m.c, '#dcb548', 2, 1);
    inkAround(mg, crescent, iw, round, rand);
    // sleepy closed eye, small smile, pink cheek
    dot(mg, o - r * 0.36, o + r * 0.28, r * 0.1, rgba(PAL.mushroom, 0.55));
    ink(mg, Math.max(1.3, r * 0.05));
    mg.beginPath(); mg.arc(o - r * 0.52, o - r * 0.02, r * 0.1, 0.15 * Math.PI, 0.85 * Math.PI); mg.stroke();
    mg.beginPath(); mg.arc(o - r * 0.56, o + r * 0.32, r * 0.11, 0.1 * Math.PI, 0.7 * Math.PI); mg.stroke();

    // glow
    var gl = g.createRadialGradient(c, c, r * 0.6, c, c, r * 2.4);
    gl.addColorStop(0, 'rgba(255,240,170,0.5)');
    gl.addColorStop(0.4, 'rgba(255,235,170,0.2)');
    gl.addColorStop(1, 'rgba(255,235,190,0)');
    g.fillStyle = gl; g.fillRect(0, 0, size, size);

    // small cloud at the foot of the ladder
    var cl = cloudSprite(r * 1.5, dpr, { seed: 9, face: false });
    var x0 = c + r * 0.4, y0 = c + r * 0.72, x1 = c + r * 0.12, y1 = c + r * 2.02;
    g.drawImage(cl, x1 - r * 0.1 - cl.lw / 2, y1 + r * 0.36 - cl.lh / 2, cl.lw, cl.lh);

    // the ladder: two wavy rails and the rungs, red with a dark edge
    var half = r * 0.17, steps = 7, N = 24;
    function at(t) { return [x0 + (x1 - x0) * t + Math.sin(t * TAU * 0.8) * r * 0.1, y0 + (y1 - y0) * t]; }
    function ladder() {
      var p, k;
      g.beginPath();
      for (k = -1; k <= 1; k += 2) {
        for (i = 0; i <= N; i++) { p = at(i / N); g[i ? 'lineTo' : 'moveTo'](p[0] + k * half, p[1]); }
      }
      for (i = 0; i < steps; i++) {
        p = at((i + 0.6) / steps);
        g.moveTo(p[0] - half, p[1]); g.lineTo(p[0] + half, p[1] + r * 0.02);
      }
    }
    ink(g, Math.max(2.6, r * 0.085));
    ladder(); g.stroke();
    g.strokeStyle = PAL.roof;
    g.lineWidth = Math.max(1.3, r * 0.045);
    ladder(); g.stroke();

    g.drawImage(m.c, c - o, c - o, m.c.lw, m.c.lh);
    return s.c;
  }

  // t = seconds: a very gentle breathing and sway.
  function drawMoon(g, x, y, r, t) {
    var spr = cached(moonCache, Math.round(r), function () { return moonSprite(r); });
    var breathe = 1 + 0.02 * Math.sin((t || 0) * 1.2);
    drawSprite(g, spr, x, y, breathe, 1, 0.03 * Math.sin((t || 0) * 0.6));
  }

  // Tiny rounded 4-point twinkle + soft glow (cached glow sprite).
  function drawTwinkle(g, x, y, r, a) {
    if (a <= 0) return;
    var prev = g.globalAlpha, gs = glowSprite(r * 4, '255,240,170');
    g.globalAlpha = prev * a * 0.7;
    g.drawImage(gs, x - r * 2, y - r * 2, r * 4, r * 4);
    g.globalAlpha = prev * a;
    var k = r * 0.28;
    g.beginPath();
    g.moveTo(x, y - r);
    g.quadraticCurveTo(x + k, y - k, x + r, y);
    g.quadraticCurveTo(x + k, y + k, x, y + r);
    g.quadraticCurveTo(x - k, y + k, x - r, y);
    g.quadraticCurveTo(x - k, y - k, x, y - r);
    g.fillStyle = '#fbeea8';
    g.fill();
    g.globalAlpha = prev;
  }

  function drawFirefly(g, x, y, r, a) {
    if (a <= 0) return;
    var prev = g.globalAlpha, gs = glowSprite(r * 6, '255,236,130');
    g.globalAlpha = prev * a;
    g.drawImage(gs, x - r * 3, y - r * 3, r * 6, r * 6);
    g.beginPath(); g.arc(x, y, r * 0.6, 0, TAU);
    g.fillStyle = '#fff4a8'; g.fill();
    g.globalAlpha = prev;
  }

  window.Art = {
    PAL: PAL, makeCanvas: makeCanvas, rng: rng, drawSprite: drawSprite,
    ink: ink, pencil: pencil,
    starSprite: starSprite, cloudSprite: cloudSprite, bubbleSprite: bubbleSprite,
    paintSky: paintSky, paintHills: paintHills,
    makeSplotch: makeSplotch, drawSplotch: drawSplotch,
    drawRainbow: drawRainbow, drawSponge: drawSponge,
    paintNightSky: paintNightSky, paintSunsetSky: paintSunsetSky,
    drawMoon: drawMoon, drawTwinkle: drawTwinkle, drawFirefly: drawFirefly,
    drawPlayButton: drawPlayButton, drawMedal: drawMedal, drawTapHint: drawTapHint
  };
})();
