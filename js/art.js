/* art.js - soft watercolor picture-book art for "Stella e Bongo".
 *
 * Everything expensive (gradients, many passes, blur-like layering) is
 * pre-rendered ONCE into offscreen canvases ("sprites"). The per-frame
 * helpers (drawSprite, drawSplotch, drawRainbow, ...) only use cheap paths:
 * no shadowBlur, no filters.
 *
 * Sprites are canvases of logical size x dpr with extra props .lw / .lh
 * (logical width / height). They are drawn centered on a point.
 * Classic script: defines window.Art.
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
    nightTint: '#8a86d6', sunsetTint: '#ffc9a8',
    confetti: ['#ff9ec4', '#ffe581', '#a9dcf7', '#cdb4f2', '#ffc3dc', '#c4efd6'],
    // outer band first
    rainbow: ['#ff9fc2', '#ffbf9d', '#ffe58a', '#b9e8bd', '#a4d6f5', '#c9aff0']
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

  // Watercolor bloom: a few jittered translucent layers + a slightly darker
  // "wet edge" ring, like pigment pooling at the border of a wet patch.
  function bloom(g, cx, cy, r, color, alpha, rand) {
    var i;
    for (i = 0; i < 3; i++) {
      blobPath(g, cx + (rand() - 0.5) * r * 0.12, cy + (rand() - 0.5) * r * 0.12,
        r * (0.9 + rand() * 0.15), r * (0.8 + rand() * 0.15) * 0.85, rand, 0.12);
      g.fillStyle = rgba(color, alpha * 0.45);
      g.fill();
    }
    blobPath(g, cx, cy, r, r * 0.85, rand, 0.12);
    g.lineWidth = Math.max(1, r * 0.025);
    g.strokeStyle = rgba(color, alpha * 0.3);
    g.stroke();
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

  // Cute face shared by stars. s = scale unit (about face size).
  function starFace(g, cx, cy, s) {
    dot(g, cx - s * 0.2, cy - s * 0.02, s * 0.055, '#5b3d6e');
    dot(g, cx + s * 0.2, cy - s * 0.02, s * 0.055, '#5b3d6e');
    dot(g, cx - s * 0.19, cy - s * 0.035, s * 0.016, '#fff');
    dot(g, cx + s * 0.21, cy - s * 0.035, s * 0.016, '#fff');
    g.beginPath();
    g.arc(cx, cy + s * 0.05, s * 0.1, 0.2 * Math.PI, 0.8 * Math.PI);
    g.lineWidth = s * 0.035;
    g.lineCap = 'round';
    g.strokeStyle = '#5b3d6e';
    g.stroke();
    dot(g, cx - s * 0.33, cy + s * 0.1, s * 0.075, rgba(PAL.pinkDeep, 0.55));
    dot(g, cx + s * 0.33, cy + s * 0.1, s * 0.075, rgba(PAL.pinkDeep, 0.55));
  }

  // ----------------------------------------------------------------- stars
  function starSprite(radius, dpr, opts) {
    opts = opts || {};
    var face = !!opts.face, glow = opts.glow !== false, empty = !!opts.empty;
    var pad = (glow && !empty) ? radius * 0.85 : radius * 0.2;
    var size = (radius + pad) * 2;
    var s = newSprite(size, size, dpr), g = s.g, c = size / 2;
    var R = radius * 0.8, sw = radius * 0.3;   // body radius & rounding stroke
    g.lineJoin = 'round';

    if (empty) {
      starPath(g, c, c, R, 0.52, 0);
      g.lineWidth = sw;
      g.strokeStyle = rgba(PAL.white, 0.35);
      g.fillStyle = rgba(PAL.white, 0.3);
      g.stroke(); g.fill();
      starPath(g, c, c, R, 0.52, 0);
      g.lineWidth = Math.max(1.5, radius * 0.07);
      g.strokeStyle = rgba(PAL.lilacDeep, 0.5);
      g.stroke();
      return s.c;
    }

    if (glow) {
      var gr = g.createRadialGradient(c, c, radius * 0.3, c, c, size / 2);
      gr.addColorStop(0, 'rgba(255,238,140,0.85)');
      gr.addColorStop(0.45, 'rgba(255,230,140,0.35)');
      gr.addColorStop(1, 'rgba(255,230,160,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, size, size);
    }
    // deeper rim, then body, then a warm-to-light watercolor wash
    starPath(g, c, c, R, 0.52, 0);
    g.lineWidth = sw + radius * 0.08;
    g.strokeStyle = PAL.yellowDeep; g.fillStyle = PAL.yellowDeep;
    g.stroke(); g.fill();
    starPath(g, c, c, R, 0.52, 0);
    g.lineWidth = sw;
    var bg = g.createLinearGradient(c, c - radius, c, c + radius);
    bg.addColorStop(0, '#fff1a0'); bg.addColorStop(1, '#ffd95e');
    g.strokeStyle = bg; g.fillStyle = bg;
    g.stroke(); g.fill();
    // soft white highlight blob, upper left
    var hg = g.createRadialGradient(c - radius * 0.25, c - radius * 0.3, 0, c - radius * 0.25, c - radius * 0.3, radius * 0.6);
    hg.addColorStop(0, 'rgba(255,255,255,0.65)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hg;
    g.beginPath(); g.arc(c - radius * 0.25, c - radius * 0.3, radius * 0.6, 0, TAU); g.fill();
    if (face) starFace(g, c, c + radius * 0.05, radius * 1.1);
    return s.c;
  }

  // ---------------------------------------------------------------- clouds
  // Circle layout of the cloud body, in units of the cloud width.
  var CLOUD = [
    [-0.30, 0.06, 0.17], [-0.15, -0.08, 0.22], [0.07, -0.14, 0.26], [0.28, -0.03, 0.20],
    [0.34, 0.08, 0.15], [0.0, 0.08, 0.22], [-0.18, 0.10, 0.17], [0.18, 0.10, 0.18]
  ];

  function cloudSprite(width, dpr, opts) {
    opts = opts || {};
    var seed = opts.seed === undefined ? 1 : opts.seed;
    var mud = !!opts.mud, face = opts.face !== false;
    var rand = rng(seed * 7 + (mud ? 3 : 0));
    var w = width;
    var lw = w * 1.06, lh = w * (mud ? 1.04 : 0.85);
    var s = newSprite(lw, lh, dpr), g = s.g;
    var cx = lw / 2, cy = w * 0.48;
    var i, k;

    // body circles with a little jitter
    var circ = CLOUD.map(function (c) {
      return [cx + (c[0] + (rand() - 0.5) * 0.03) * w, cy + (c[1] + (rand() - 0.5) * 0.02) * w,
        c[2] * w * (0.94 + rand() * 0.12)];
    });
    var drips = [];
    if (mud) {
      var dx = [-0.22, 0.02, 0.24];
      for (i = 0; i < 3; i++) drips.push([cx + (dx[i] + (rand() - 0.5) * 0.04) * w,
        cy + (0.14 + i % 2 * 0.05) * w, w * (0.04 + rand() * 0.015), w * (0.13 + rand() * 0.05)]);
    }
    function body() {
      g.beginPath();
      for (var j = 0; j < circ.length; j++) {
        g.moveTo(circ[j][0] + circ[j][2], circ[j][1]);
        g.arc(circ[j][0], circ[j][1], circ[j][2], 0, TAU);
      }
      for (j = 0; j < drips.length; j++) {         // round-ended hanging drips
        var d = drips[j];
        g.moveTo(d[0] - d[2], d[1]);               // clockwise, like the body arcs
        g.arc(d[0], d[1], d[2], Math.PI, 0, false);
        g.lineTo(d[0] + d[2], d[1] + d[3]);
        g.arc(d[0], d[1] + d[3], d[2], 0, Math.PI, false);
        g.closePath();
      }
    }
    var base = mud ? PAL.mud : PAL.white;
    var shade = mud ? PAL.mudDark : PAL.lilac;
    var rimC = mud ? '#6a452e' : PAL.lilacDeep;

    // outer wet edge: stroke under the fill so inner overlaps never show lines
    body();
    g.lineJoin = 'round';
    g.lineWidth = w * 0.035;
    g.strokeStyle = rgba(rimC, mud ? 0.55 : 0.5);
    g.stroke();
    body();
    g.fillStyle = mud ? '#b78a5d' : '#ffffff';
    g.fill();

    g.save();
    body();
    g.clip();
    // watercolor shading: pooled color near the bottom + dabs
    var lg = g.createLinearGradient(0, cy - w * 0.3, 0, cy + w * 0.3);
    lg.addColorStop(0, rgba(shade, 0));
    lg.addColorStop(0.55, rgba(shade, mud ? 0.25 : 0.2));
    lg.addColorStop(1, rgba(shade, mud ? 0.6 : 0.55));
    g.fillStyle = lg;
    g.fillRect(0, 0, lw, lh);
    for (i = 0; i < 6; i++) {
      var bx = cx + (rand() - 0.5) * w * 0.8, by = cy + w * (0.02 + rand() * 0.18);
      blobPath(g, bx, by, w * (0.07 + rand() * 0.07), w * (0.04 + rand() * 0.04), rand, 0.2);
      g.fillStyle = rgba(mud ? PAL.mudDark : PAL.lilacDeep, 0.12);
      g.fill();
    }
    // light puffs on top of each bump
    for (i = 0; i < circ.length; i++) {
      var cc = circ[i];
      var hg = g.createRadialGradient(cc[0] - cc[2] * 0.3, cc[1] - cc[2] * 0.4, 0,
        cc[0] - cc[2] * 0.3, cc[1] - cc[2] * 0.4, cc[2] * 0.7);
      hg.addColorStop(0, mud ? 'rgba(255,225,180,0.4)' : 'rgba(255,255,255,0.95)');
      hg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = hg;
      g.fillRect(cc[0] - cc[2], cc[1] - cc[2], cc[2] * 2, cc[2] * 2);
    }
    if (mud) {  // darker mud speckles
      for (i = 0; i < 9; i++) {
        dot(g, cx + (rand() - 0.5) * w * 0.8, cy + (rand() - 0.4) * w * 0.35,
          w * (0.012 + rand() * 0.02), rgba(PAL.mudDark, 0.35));
      }
    }
    g.restore();

    // face
    if (face || mud) {
      var fy = cy + w * 0.03, ink = mud ? '#4b2f20' : '#6a5590';
      g.lineCap = 'round';
      if (mud) {
        // wide open eyes with shine, cheeky grin with a pink tongue
        for (k = -1; k <= 1; k += 2) {
          dot(g, cx + k * w * 0.12, fy - w * 0.04, w * 0.042, '#fff');
          dot(g, cx + k * w * 0.12 + w * 0.008, fy - w * 0.035, w * 0.026, ink);
          dot(g, cx + k * w * 0.12 + w * 0.016, fy - w * 0.045, w * 0.009, '#fff');
          dot(g, cx + k * w * 0.2, fy + w * 0.045, w * 0.04, rgba(PAL.pinkDeep, 0.5));
        }
        g.beginPath();
        g.moveTo(cx - w * 0.1, fy + w * 0.035);
        g.quadraticCurveTo(cx, fy + w * 0.17, cx + w * 0.1, fy + w * 0.035);
        g.quadraticCurveTo(cx, fy + w * 0.06, cx - w * 0.1, fy + w * 0.035);
        g.closePath();
        g.fillStyle = ink; g.fill();
        g.lineWidth = w * 0.016; g.strokeStyle = ink; g.stroke();
        g.save(); g.clip();
        dot(g, cx + w * 0.02, fy + w * 0.12, w * 0.04, '#ff8fb5');
        g.restore();
      } else {
        // sleepy happy closed eyes, tiny smile, blush
        g.lineWidth = w * 0.018;
        g.strokeStyle = ink;
        for (k = -1; k <= 1; k += 2) {
          g.beginPath();
          g.arc(cx + k * w * 0.11, fy - w * 0.03, w * 0.032, 0.15 * Math.PI, 0.85 * Math.PI);
          g.stroke();
          dot(g, cx + k * w * 0.19, fy + w * 0.03, w * 0.04, rgba(PAL.pinkDeep, 0.5));
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
    var fill = g.createRadialGradient(c, c, radius * 0.5, c, c, radius);
    fill.addColorStop(0, 'rgba(255,255,255,0)');
    fill.addColorStop(0.8, 'rgba(190,225,255,0.18)');
    fill.addColorStop(1, 'rgba(255,190,225,0.35)');
    g.fillStyle = fill;
    g.beginPath(); g.arc(c, c, radius, 0, TAU); g.fill();
    // iridescent rim
    var rim = g.createLinearGradient(c - radius, c - radius, c + radius, c + radius);
    rim.addColorStop(0, 'rgba(255,170,215,0.85)');
    rim.addColorStop(0.35, 'rgba(255,240,150,0.7)');
    rim.addColorStop(0.65, 'rgba(160,220,250,0.85)');
    rim.addColorStop(1, 'rgba(205,175,245,0.85)');
    g.lineWidth = Math.max(2, radius * 0.1);
    g.strokeStyle = rim;
    g.beginPath(); g.arc(c, c, radius - g.lineWidth / 2, 0, TAU); g.stroke();
    // highlights
    g.lineCap = 'round';
    g.lineWidth = Math.max(2, radius * 0.1);
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.beginPath(); g.arc(c, c, radius * 0.66, Math.PI * 1.1, Math.PI * 1.4); g.stroke();
    dot(g, c + radius * 0.4, c + radius * 0.45, radius * 0.07, 'rgba(255,255,255,0.8)');
    return s.c;
  }

  // ------------------------------------------------------------------- sky
  function paintSky(w, h, dpr) {
    var s = newSprite(w, h, dpr), g = s.g, rand = rng(11), i;
    var gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#b4defa');
    gr.addColorStop(0.45, '#d6c9f4');
    gr.addColorStop(0.8, '#f6d1ea');
    gr.addColorStop(1, '#ffdce6');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);

    // watercolor blooms
    var cols = [PAL.sky, PAL.lilac, PAL.pink, PAL.white, PAL.lilac, PAL.sky];
    var m = Math.min(w, h);
    for (i = 0; i < 18; i++) {
      bloom(g, rand() * w, rand() * h, m * (0.14 + rand() * 0.22), cols[i % cols.length],
        0.22 + rand() * 0.16, rand);
    }
    // light, broad brush strokes
    g.lineCap = 'round';
    for (i = 0; i < 9; i++) {
      var y0 = rand() * h * 0.8, x0 = rand() * w * 0.6 - w * 0.1, len = w * (0.3 + rand() * 0.4);
      g.beginPath();
      g.moveTo(x0, y0);
      g.bezierCurveTo(x0 + len * 0.3, y0 - h * 0.04, x0 + len * 0.6, y0 + h * 0.05, x0 + len, y0 - h * 0.01);
      g.lineWidth = h * (0.025 + rand() * 0.04);
      g.strokeStyle = 'rgba(255,255,255,' + (0.08 + rand() * 0.08) + ')';
      g.stroke();
    }
    // soft friendly sun glow (kept away from the mute button corner)
    var sx = w * 0.76, sy = h * 0.2, sr = m * 0.42;
    var sg = g.createRadialGradient(sx, sy, 0, sx, sy, sr);
    sg.addColorStop(0, 'rgba(255,248,205,0.95)');
    sg.addColorStop(0.25, 'rgba(255,238,170,0.55)');
    sg.addColorStop(1, 'rgba(255,238,190,0)');
    g.fillStyle = sg;
    g.fillRect(0, 0, w, h);
    blobPath(g, sx, sy, m * 0.075, m * 0.075, rand, 0.05);
    g.fillStyle = 'rgba(255,240,160,0.8)';
    g.fill();
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

  function paintHills(tileW, h, dpr, opts) {
    opts = opts || {};
    var seed = opts.seed === undefined ? 1 : opts.seed;
    var front = opts.layer === 'front';
    var rand = rng(seed * 31 + (front ? 5 : 1));
    var s = newSprite(tileW, h, dpr), g = s.g;
    var amps, base;
    if (front) { base = h * 0.8; amps = [[2, h * 0.07], [3, h * 0.045], [5, h * 0.02]]; }
    else { base = h * 0.6; amps = [[1, h * 0.12], [2, h * 0.07], [3, h * 0.03]]; }
    var i, p, step = 3;
    var top = front ? PAL.pink : PAL.lilac;
    var low = front ? '#ffd6e8' : '#e3d4f8';
    var deep = front ? PAL.pinkDeep : PAL.lilacDeep;

    var phases = amps.map(function () { return rand() * TAU; });
    function curve(f, dy) {
      g.beginPath();
      g.moveTo(-step, h + 2);
      for (var x = -step; x <= tileW + step; x += step) g.lineTo(x, f(x) + dy);
      g.lineTo(tileW + step, h + 2);
      g.closePath();
    }
    var f0 = hillFn(tileW, base, amps, phases);
    // main wash
    curve(f0, 0);
    var gr = g.createLinearGradient(0, base - amps[0][1], 0, h);
    gr.addColorStop(0, top); gr.addColorStop(1, low);
    g.fillStyle = gr;
    g.fill();
    // a few jittered low-alpha passes (uneven pigment, wobbly outline)
    for (p = 0; p < 3; p++) {
      var ph2 = phases.map(function (q) { return q + (rand() - 0.5) * 0.35; });
      var amp2 = amps.map(function (a) { return [a[0], a[1] * (0.9 + rand() * 0.2)]; });
      curve(hillFn(tileW, base + (rand() - 0.5) * h * 0.02, amp2, ph2), 0);
      g.fillStyle = rgba(deep, 0.1);
      g.fill();
    }
    // brush strokes inside the hill (periodic curves, so they tile too)
    g.lineCap = 'round';
    for (i = 0; i < 5; i++) {
      var off = h * (0.06 + rand() * 0.12), fi = hillFn(tileW, base, amps, phases);
      var xs = rand() * tileW, len = tileW * (0.1 + rand() * 0.15);
      for (var rep = -1; rep <= 1; rep++) {
        g.beginPath();
        for (var x = 0; x <= len; x += step) {
          var xx = xs + x;
          g[x === 0 ? 'moveTo' : 'lineTo'](xx + rep * tileW, fi(xx) + off);
        }
        g.lineWidth = h * (0.02 + rand() * 0.02) * 0.7;
        g.strokeStyle = 'rgba(255,255,255,0.18)';
        g.stroke();
      }
    }
    // soft light rim along the top edge
    g.beginPath();
    for (var xr = -step; xr <= tileW + step; xr += step) g[xr < 0 ? 'moveTo' : 'lineTo'](xr, f0(xr) + h * 0.006);
    g.lineWidth = Math.max(2, h * 0.014);
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.stroke();

    // small round flowers / dots (front layer), wrapped at both tile edges
    if (front) {
      var n = Math.max(6, Math.round(tileW / 70));
      for (i = 0; i < n; i++) {
        var fx = (i + 0.2 + rand() * 0.6) * tileW / n;
        var fy = f0(fx) + h * (0.05 + rand() * 0.1);
        var fr = h * (0.012 + rand() * 0.012) + 2;
        var petal = [PAL.white, PAL.yellow, PAL.lilac, PAL.white][i % 4];
        var offs = [0];
        if (fx < fr * 4) offs.push(tileW);
        if (fx > tileW - fr * 4) offs.push(-tileW);
        for (var o = 0; o < offs.length; o++) {
          var ox = fx + offs[o];
          if (i % 3 === 0) {               // plain round dot
            dot(g, ox, fy, fr * 0.8, rgba(petal, 0.9));
          } else {                         // five-petal flower
            for (var k = 0; k < 5; k++) {
              var a = k / 5 * TAU;
              dot(g, ox + Math.cos(a) * fr, fy + Math.sin(a) * fr, fr * 0.75, rgba(petal, 0.92));
            }
            dot(g, ox, fy, fr * 0.6, i % 4 === 1 ? PAL.pinkDeep : PAL.yellowDeep);
          }
        }
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

  function drawSplotch(g, shape, x, y, r, alpha) {
    var prev = g.globalAlpha, i, b;
    g.globalAlpha = prev * alpha;
    // union as ONE path => overlaps never double the alpha
    g.beginPath();
    g.moveTo(x + r, y);
    g.arc(x, y, r, 0, TAU);
    for (i = 0; i < shape.sat.length; i++) {
      b = shape.sat[i];
      g.moveTo(x + (b.x + b.r) * r, y + b.y * r);
      g.arc(x + b.x * r, y + b.y * r, b.r * r, 0, TAU);
    }
    for (i = 0; i < shape.drops.length; i++) {
      b = shape.drops[i];
      g.moveTo(x + (b.x + b.r) * r, y + b.y * r);
      g.arc(x + b.x * r, y + b.y * r, b.r * r, 0, TAU);
    }
    g.fillStyle = PAL.mud;
    g.fill();
    // darker spots + small shine (one path each, drawn with reduced alpha)
    g.globalAlpha = prev * alpha * 0.45;
    g.beginPath();
    for (i = 0; i < shape.spots.length; i++) {
      b = shape.spots[i];
      g.moveTo(x + (b.x + b.r) * r, y + b.y * r);
      g.arc(x + b.x * r, y + b.y * r, b.r * r, 0, TAU);
    }
    g.fillStyle = PAL.mudDark;
    g.fill();
    g.globalAlpha = prev * alpha * 0.4;
    b = shape.shine;
    g.beginPath();
    g.ellipse(x + b.x * r, y + b.y * r, b.r * r * 1.4, b.r * r * 0.8, -0.6, 0, TAU);
    g.fillStyle = '#ffe9c9';
    g.fill();
    g.globalAlpha = prev;
  }

  // --------------------------------------------------------------- rainbow
  function drawRainbow(g, cx, cy, radius, band, alpha, sweep) {
    if (sweep <= 0) return;
    if (sweep > 1) sweep = 1;
    var prev = g.globalAlpha, bands = PAL.rainbow;
    var end = Math.PI + Math.PI * sweep;
    g.lineCap = 'round';
    for (var pass = 0; pass < 2; pass++) {
      // pass 0: wide soft halo, pass 1: the painted band
      g.lineWidth = pass ? band * 0.92 : band * 1.25;
      g.globalAlpha = prev * alpha * (pass ? 0.8 : 0.3);
      for (var i = 0; i < bands.length; i++) {
        g.strokeStyle = bands[i];
        g.beginPath();
        g.arc(cx, cy, radius - i * band * 0.88, Math.PI, end);
        g.stroke();
      }
    }
    g.globalAlpha = prev;
  }

  // ---------------------------------------------------------------- sponge
  function drawSponge(g, x, y, r, alpha) {
    var prev = g.globalAlpha, w = r * 1.7, h = r * 1.2, cr = r * 0.42, i;
    g.globalAlpha = prev * alpha;
    function rr(px, py, pw, ph, rad) {
      g.beginPath();
      g.moveTo(px + rad, py);
      g.arcTo(px + pw, py, px + pw, py + ph, rad);
      g.arcTo(px + pw, py + ph, px, py + ph, rad);
      g.arcTo(px, py + ph, px, py, rad);
      g.arcTo(px, py, px + pw, py, rad);
      g.closePath();
    }
    // shadow-ish deeper underside then the body
    rr(x - w / 2, y - h / 2 + r * 0.08, w, h, cr);
    g.fillStyle = PAL.yellowDeep; g.fill();
    rr(x - w / 2, y - h / 2, w, h * 0.93, cr);
    g.fillStyle = PAL.yellow; g.fill();
    // holes
    var holes = [[-0.5, -0.2, 0.13], [-0.1, -0.3, 0.1], [0.35, -0.15, 0.14], [0.0, 0.1, 0.15],
      [-0.45, 0.2, 0.09], [0.5, 0.25, 0.1], [0.25, 0.3, 0.07]];
    g.fillStyle = 'rgba(224,170,50,0.55)';
    g.beginPath();
    for (i = 0; i < holes.length; i++) {
      var hl = holes[i];
      g.moveTo(x + (hl[0] + hl[2]) * r, y + hl[1] * r);
      g.arc(x + hl[0] * r, y + hl[1] * r, hl[2] * r, 0, TAU);
    }
    g.fill();
    // top highlight
    g.beginPath();
    g.ellipse(x - r * 0.3, y - h * 0.36, r * 0.4, r * 0.09, -0.05, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fill();
    // bubbles on top
    var bub = [[0.55, -0.85, 0.2], [0.25, -1.1, 0.13], [0.85, -1.05, 0.1]];
    for (i = 0; i < bub.length; i++) {
      var b = bub[i];
      g.beginPath(); g.arc(x + b[0] * r, y + b[1] * r, b[2] * r, 0, TAU);
      g.fillStyle = 'rgba(255,255,255,0.45)'; g.fill();
      g.lineWidth = Math.max(1.5, r * 0.04);
      g.strokeStyle = 'rgba(140,200,245,0.9)'; g.stroke();
      g.beginPath(); g.arc(x + (b[0] - b[2] * 0.35) * r, y + (b[1] - b[2] * 0.35) * r, b[2] * r * 0.22, 0, TAU);
      g.fillStyle = '#fff'; g.fill();
    }
    g.globalAlpha = prev;
  }

  // ------------------------------------------------------------ play button
  function drawPlayButton(g, x, y, r, t) {
    var ph = (t * 0.6) % 1;   // subtle pulse ring, one beat per ~1.7 s
    g.lineWidth = r * 0.07;
    g.strokeStyle = 'rgba(255,255,255,' + (0.7 * (1 - ph)) + ')';
    g.beginPath(); g.arc(x, y, r * (1.05 + 0.2 * ph), 0, TAU); g.stroke();
    // soft base glow
    dot(g, x, y + r * 0.06, r * 1.08, 'rgba(240,130,180,0.25)');
    // body
    var gr = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    gr.addColorStop(0, '#ffc9e0'); gr.addColorStop(1, PAL.pinkDeep);
    g.beginPath(); g.arc(x, y, r, 0, TAU);
    g.fillStyle = gr; g.fill();
    g.lineWidth = r * 0.07; g.strokeStyle = '#fff';
    g.beginPath(); g.arc(x, y, r - r * 0.035, 0, TAU); g.stroke();
    // white rounded triangle
    var tr = r * 0.42;
    g.beginPath();
    g.moveTo(x - tr * 0.55 + r * 0.06, y - tr);
    g.lineTo(x + tr * 1.0 + r * 0.06, y);
    g.lineTo(x - tr * 0.55 + r * 0.06, y + tr);
    g.closePath();
    g.lineJoin = 'round'; g.lineWidth = r * 0.2;
    g.strokeStyle = '#fff'; g.fillStyle = '#fff';
    g.stroke(); g.fill();
    // shine
    g.beginPath();
    g.ellipse(x - r * 0.3, y - r * 0.62, r * 0.28, r * 0.1, -0.5, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.fill();
  }

  // ----------------------------------------------------------------- medal
  function drawMedal(g, x, y, r) {
    // little ribbon tails
    g.lineJoin = 'round';
    [[-1, PAL.pinkDeep], [1, PAL.skyDeep]].forEach(function (p) {
      g.beginPath();
      g.moveTo(x + p[0] * r * 0.15, y);
      g.lineTo(x + p[0] * r * 0.75, y + r * 1.15);
      g.lineTo(x + p[0] * r * 0.4, y + r * 0.95);
      g.lineTo(x + p[0] * r * 0.0, y + r * 1.2);
      g.closePath();
      g.fillStyle = p[1]; g.strokeStyle = p[1]; g.lineWidth = r * 0.12;
      g.stroke(); g.fill();
    });
    var gr = g.createLinearGradient(x - r, y - r, x + r, y + r);
    gr.addColorStop(0, '#fff0a0'); gr.addColorStop(1, '#f2bd3e');
    g.beginPath(); g.arc(x, y, r, 0, TAU);
    g.fillStyle = gr; g.fill();
    g.lineWidth = r * 0.1; g.strokeStyle = '#f0b637'; g.stroke();
    g.beginPath(); g.arc(x, y, r * 0.72, 0, TAU);
    g.lineWidth = r * 0.05; g.strokeStyle = 'rgba(255,255,255,0.7)'; g.stroke();
    // star on it
    starPath(g, x, y + r * 0.03, r * 0.42, 0.52, 0);
    g.lineJoin = 'round'; g.lineWidth = r * 0.16;
    g.fillStyle = '#fffaf0'; g.strokeStyle = '#fffaf0';
    g.stroke(); g.fill();
    g.beginPath(); g.ellipse(x - r * 0.4, y - r * 0.55, r * 0.22, r * 0.08, -0.7, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.fill();
  }

  // -------------------------------------------------------------- tap hint
  function drawTapHint(g, x, y, r, t) {
    var i;
    // expanding round ripples
    for (i = 0; i < 3; i++) {
      var p = (t * 0.7 + i / 3) % 1;
      g.beginPath(); g.arc(x, y, r * (0.25 + 0.95 * p), 0, TAU);
      g.lineWidth = r * 0.12 * (1 - p * 0.5);
      g.strokeStyle = 'rgba(255,255,255,' + (0.85 * (1 - p)) + ')';
      g.stroke();
      g.lineWidth = r * 0.04;
      g.strokeStyle = 'rgba(245,138,184,' + (0.6 * (1 - p)) + ')';
      g.stroke();
    }
    // fingertip pressing down and up
    var press = 0.5 + 0.5 * Math.sin(t * TAU * 0.7);   // 0..1
    var fx = x + r * 0.08, fy = y + r * (0.12 + 0.2 * (1 - press));
    var fw = r * 0.26;
    g.save();
    g.translate(fx, fy);
    g.rotate(-0.25);
    g.lineJoin = 'round'; g.lineCap = 'round';
    // finger body: capsule going down-right, tip at origin
    g.beginPath();
    g.moveTo(-fw, 0);
    g.arc(0, 0, fw, Math.PI, 0);
    g.lineTo(fw, r * 1.1);
    g.lineTo(-fw, r * 1.1);
    g.closePath();
    g.fillStyle = '#ffdccb'; g.fill();
    g.lineWidth = r * 0.05; g.strokeStyle = '#f2b5a0'; g.stroke();
    // nail
    g.beginPath(); g.ellipse(0, -fw * 0.25, fw * 0.5, fw * 0.45, 0, 0, TAU);
    g.fillStyle = 'rgba(255,200,215,0.9)'; g.fill();
    g.restore();
  }

  // ------------------------------------------------- night / sunset skies
  // Shared recipe: vertical gradient + blooms + brush strokes.
  function paintGradientSky(w, h, dpr, seed, stops, bloomCols, bloomAlpha, strokeA) {
    var s = newSprite(w, h, dpr), g = s.g, rand = rng(seed), i;
    var gr = g.createLinearGradient(0, 0, 0, h);
    for (i = 0; i < stops.length; i++) gr.addColorStop(stops[i][0], stops[i][1]);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    var m = Math.min(w, h);
    for (i = 0; i < 18; i++) {
      bloom(g, rand() * w, rand() * h, m * (0.14 + rand() * 0.22), bloomCols[i % bloomCols.length],
        bloomAlpha * (0.7 + rand() * 0.6), rand);
    }
    g.lineCap = 'round';
    for (i = 0; i < 9; i++) {
      var y0 = rand() * h * 0.8, x0 = rand() * w * 0.6 - w * 0.1, len = w * (0.3 + rand() * 0.4);
      g.beginPath();
      g.moveTo(x0, y0);
      g.bezierCurveTo(x0 + len * 0.3, y0 - h * 0.04, x0 + len * 0.6, y0 + h * 0.05, x0 + len, y0 - h * 0.01);
      g.lineWidth = h * (0.025 + rand() * 0.04);
      g.strokeStyle = 'rgba(255,255,255,' + (strokeA * (0.7 + rand() * 0.6)) + ')';
      g.stroke();
    }
    return s;
  }

  function paintNightSky(w, h, dpr) {
    var s = paintGradientSky(w, h, dpr, 23, [
      [0, '#8d95dc'], [0.5, '#a58fd6'], [0.85, '#d9a2cf'], [1, '#f0b6cf']
    ], [PAL.lilacDeep, '#8f9be0', PAL.lilac, PAL.pink], 0.2, 0.06);
    var g = s.g, rand = rng(77), n = Math.round(w * h / 9000);
    // faint painted dots of far-away stars
    for (var i = 0; i < n; i++) {
      var y = rand() * h * 0.85;
      dot(g, rand() * w, y, 0.8 + rand() * 1.6, 'rgba(255,250,235,' + (0.25 + rand() * 0.4) + ')');
    }
    return s.c;
  }

  function paintSunsetSky(w, h, dpr) {
    var s = paintGradientSky(w, h, dpr, 41, [
      [0, '#c5b4ee'], [0.35, '#eeb6d8'], [0.7, '#ffc9b0'], [1, '#ffe0b8']
    ], [PAL.pink, '#ffc9a8', PAL.lilac, PAL.yellow], 0.24, 0.1);
    var g = s.g, m = Math.min(w, h), sx = w * 0.3, sy = h * 0.72;
    var sg = g.createRadialGradient(sx, sy, 0, sx, sy, m * 0.55);
    sg.addColorStop(0, 'rgba(255,236,170,0.85)');
    sg.addColorStop(0.3, 'rgba(255,205,170,0.45)');
    sg.addColorStop(1, 'rgba(255,200,180,0)');
    g.fillStyle = sg;
    g.fillRect(0, 0, w, h);
    return s.c;
  }

  // ------------------------------------------------ moon, twinkle, firefly
  var moonCache = {}, glowCache = {};

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

  // Moon: full soft disc with a gentle crescent shading, sleepy face. Cached
  // per radius (at the device pixel ratio of the first call's context scale).
  function moonSprite(r) {
    var key = Math.round(r);
    if (moonCache[key]) return moonCache[key];
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    var size = r * 5, s = newSprite(size, size, dpr), g = s.g, c = size / 2;
    var gl = g.createRadialGradient(c, c, r * 0.8, c, c, size / 2);
    gl.addColorStop(0, 'rgba(255,240,170,0.6)');
    gl.addColorStop(0.4, 'rgba(255,235,170,0.22)');
    gl.addColorStop(1, 'rgba(255,235,190,0)');
    g.fillStyle = gl; g.fillRect(0, 0, size, size);
    var bg = g.createRadialGradient(c - r * 0.3, c - r * 0.3, r * 0.1, c, c, r);
    bg.addColorStop(0, '#fff8cf'); bg.addColorStop(1, '#ffe27f');
    dot(g, c, c, r, bg);
    g.lineWidth = r * 0.05; g.strokeStyle = 'rgba(246,197,69,0.6)';
    g.beginPath(); g.arc(c, c, r - r * 0.025, 0, TAU); g.stroke();
    // soft craters
    dot(g, c + r * 0.4, c - r * 0.35, r * 0.13, 'rgba(246,197,69,0.25)');
    dot(g, c + r * 0.5, c + r * 0.25, r * 0.09, 'rgba(246,197,69,0.25)');
    dot(g, c - r * 0.45, c + r * 0.4, r * 0.1, 'rgba(246,197,69,0.2)');
    // sleepy closed eyes, small smile, pink cheeks
    var ink = '#7a5a8e';
    g.lineCap = 'round'; g.lineWidth = r * 0.055; g.strokeStyle = ink;
    for (var k = -1; k <= 1; k += 2) {
      g.beginPath(); g.arc(c + k * r * 0.3, c - r * 0.05, r * 0.1, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      dot(g, c + k * r * 0.5, c + r * 0.2, r * 0.12, rgba(PAL.pinkDeep, 0.5));
    }
    g.beginPath(); g.arc(c, c + r * 0.12, r * 0.13, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
    moonCache[key] = s.c;
    return s.c;
  }

  // t = seconds: a very gentle breathing of the glow.
  function drawMoon(g, x, y, r, t) {
    var spr = moonSprite(r);
    var breathe = 1 + 0.03 * Math.sin((t || 0) * 1.2);
    drawSprite(g, spr, x, y, breathe, 1, 0.04 * Math.sin((t || 0) * 0.6));
  }

  // Tiny rounded 4-point twinkle + soft glow (cached glow sprite).
  function drawTwinkle(g, x, y, r, a) {
    if (a <= 0) return;
    var prev = g.globalAlpha, gs = glowSprite(r * 4, '255,246,210');
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
    g.fillStyle = '#fffbe8';
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
    starSprite: starSprite, cloudSprite: cloudSprite, bubbleSprite: bubbleSprite,
    paintSky: paintSky, paintHills: paintHills,
    makeSplotch: makeSplotch, drawSplotch: drawSplotch,
    drawRainbow: drawRainbow, drawSponge: drawSponge,
    paintNightSky: paintNightSky, paintSunsetSky: paintSunsetSky,
    drawMoon: drawMoon, drawTwinkle: drawTwinkle, drawFirefly: drawFirefly,
    drawPlayButton: drawPlayButton, drawMedal: drawMedal, drawTapHint: drawTapHint
  };
})();
