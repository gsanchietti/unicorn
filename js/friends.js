/* friends.js - the bakery's friends: the plush husky, Pagi the dog, the mouse
 * and the lizard from the bedroom-wall mural. Classic script: window.Friends.
 * Needs window.Art (js/art.js) loaded first.
 *
 * The husky is painted in the wall style from the plush (assets/photos/ref/husky.jpg):
 * a small puppet of cached parts (tail, body, front legs, ears, head, eyes open and
 * shut, open mouth, crumbs), each pre-rendered once in build(); draw() only places
 * them. PAGI, THE MOUSE AND THE LIZARD ARE STILL PLACEHOLDER DRAWINGS (a round
 * body, a head, ears, googly eyes and a smile in each friend's colors, one sprite
 * each). The API below stays as it is, because js/scenes/bakery.js uses it.
 *
 *   Friends.KINDS = ['husky', 'pagi', 'mouse', 'lizard']   the order they visit in
 *   Friends.build(h, DPR)       pre-renders every friend h CSS px tall (sitting, with
 *                               the head; a walking friend is about as tall). The
 *                               scene calls it from its resize(); draw() only blits
 *                               cached canvases and moves them: no shadowBlur, no
 *                               filters, no grain per frame.
 *   Friends.draw(g, kind, x, y, pose)
 *                               draws the friend with its BOTTOM CENTER at (x, y),
 *                               FACING LEFT (toward the counter and the cake; the
 *                               scene mirrors it with scale(-1, 1) to walk out to
 *                               the right). pose = {t, state, p}:
 *                                 t      time in seconds (idle breathing, blinks)
 *                                 state  'walk' | 'sit' | 'eat' | 'happy'
 *                                 p      0..1, the progress of that state: the walk
 *                                        phase (one full step cycle per 1), how far
 *                                        eating has got, how far the happy wiggle is
 *   Everyone smiles at rest. The husky keeps its plush look (big glittery blue eyes,
 *   light-blue inner ears, cream muzzle); Pagi, the mouse and the lizard keep their
 *   big round googly eyes with black pupils. Pagi's collar has no letters (nothing to read).
 */
(function () {
  'use strict';

  var Art = window.Art;
  var TAU = Math.PI * 2;
  var KINDS = ['husky', 'pagi', 'mouse', 'lizard'];
  var LOOK = {
    husky: { body: '#f4f4f6', deep: '#9aa3b5', ear: '#a8d8f0', muzzle: '#fbf1dc', eye: '#4aa3e0', earShape: 'point' },
    pagi: { body: '#b47c52', deep: '#7c5235', ear: '#8a5a3a', muzzle: '#e8c39a', eye: '#2b2230', earShape: 'long', collar: '#f6dc6e' },
    mouse: { body: '#a88f7c', deep: '#76604f', ear: '#f2b6c4', muzzle: '#e9d8c8', eye: '#2b2230', earShape: 'round' },
    lizard: { body: '#f49a7c', deep: '#e26a6a', ear: null, muzzle: '#f8c39a', eye: '#2b2230', earShape: 'none' }
  };

  var S = {}, H = 100;

  function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
  function inked(g, fill, w) { g.fillStyle = fill; g.fill(); Art.ink(g, w); g.stroke(); }

  function paintFriend(kind, h, dpr) {
    var L = LOOK[kind], w = h * 0.9;
    var c = Art.makeCanvas(w * dpr, h * dpr), g = c.getContext('2d');
    c.lw = w; c.lh = h;
    g.scale(dpr, dpr);
    g.lineJoin = 'round'; g.lineCap = 'round';
    var lw = Math.max(1.2, h * 0.018), hx = w * 0.42, hy = h * 0.32, hr = h * 0.22;
    // tail
    if (kind === 'lizard' || kind === 'mouse') {
      g.beginPath(); g.moveTo(w * 0.7, h * 0.9);
      g.bezierCurveTo(w * 0.98, h * 0.9, w * 0.98, h * 0.6, w * 0.86, h * 0.55);
      Art.ink(g, lw * (kind === 'lizard' ? 4 : 1.6)); g.stroke();
      g.strokeStyle = L.body; g.lineWidth = lw * (kind === 'lizard' ? 2.4 : 0.5); g.stroke();
    }
    // body
    g.beginPath(); g.ellipse(w * 0.52, h * 0.74, w * 0.3, h * 0.25, 0, 0, TAU); inked(g, L.body, lw);
    g.beginPath(); g.ellipse(w * 0.46, h * 0.78, w * 0.15, h * 0.15, 0, 0, TAU); g.fillStyle = L.muzzle; g.fill();
    // feet
    g.beginPath(); g.ellipse(w * 0.36, h * 0.96, w * 0.1, h * 0.04, 0, 0, TAU); inked(g, L.body, lw * 0.8);
    g.beginPath(); g.ellipse(w * 0.6, h * 0.96, w * 0.1, h * 0.04, 0, 0, TAU); inked(g, L.body, lw * 0.8);
    // ears
    if (L.earShape === 'point') {
      [-1, 1].forEach(function (sd) {
        g.beginPath(); g.moveTo(hx + sd * hr * 0.75, hy - hr * 0.4); g.lineTo(hx + sd * hr * 0.6, hy - hr * 1.35); g.lineTo(hx + sd * hr * 0.1, hy - hr * 0.8); g.closePath();
        inked(g, L.body, lw);
        g.beginPath(); g.moveTo(hx + sd * hr * 0.6, hy - hr * 0.55); g.lineTo(hx + sd * hr * 0.55, hy - hr * 1.05); g.lineTo(hx + sd * hr * 0.28, hy - hr * 0.75); g.closePath();
        g.fillStyle = L.ear; g.fill();
      });
    } else if (L.earShape === 'round') {
      [-1, 1].forEach(function (sd) { circle(g, hx + sd * hr * 0.85, hy - hr * 0.75, hr * 0.5); inked(g, L.ear, lw); });
    }
    // head
    circle(g, hx, hy, hr); inked(g, L.body, lw);
    if (L.earShape === 'long') {
      [-1, 1].forEach(function (sd) {
        g.beginPath(); g.ellipse(hx + sd * hr * 0.95, hy + hr * 0.25, hr * 0.28, hr * 0.7, sd * 0.2, 0, TAU); inked(g, L.ear, lw);
      });
      g.beginPath(); g.moveTo(hx - hr * 0.7, hy + hr * 0.95); g.quadraticCurveTo(hx, hy + hr * 1.2, hx + hr * 0.7, hy + hr * 0.95);
      Art.ink(g, lw * 2.6); g.stroke(); g.strokeStyle = L.collar; g.lineWidth = lw * 1.5; g.stroke();
    }
    // muzzle, nose, smile
    g.beginPath(); g.ellipse(hx - hr * 0.2, hy + hr * 0.38, hr * 0.42, hr * 0.3, 0, 0, TAU); inked(g, L.muzzle, lw * 0.7);
    circle(g, hx - hr * 0.3, hy + hr * 0.25, hr * 0.1); g.fillStyle = '#2b2230'; g.fill();
    g.beginPath(); g.arc(hx - hr * 0.22, hy + hr * 0.38, hr * 0.22, 0.2, Math.PI - 0.2); Art.ink(g, lw * 0.8); g.stroke();
    // eyes: googly (white, black pupil), or the husky's glittery blue
    [-0.45, 0.15].forEach(function (ex) {
      var x = hx + ex * hr, y = hy - hr * 0.2, r = hr * (kind === 'husky' ? 0.22 : 0.27);
      if (kind === 'husky') {
        circle(g, x, y, r); inked(g, L.eye, lw * 0.7);
        circle(g, x - r * 0.3, y - r * 0.3, r * 0.35); g.fillStyle = '#ffffff'; g.fill();
        circle(g, x + r * 0.35, y + r * 0.3, r * 0.15); g.fill();
      } else {
        circle(g, x, y, r); inked(g, '#ffffff', lw * 0.7);
        circle(g, x - r * 0.25, y + r * 0.1, r * 0.5); g.fillStyle = '#2b2230'; g.fill();
        circle(g, x - r * 0.38, y - r * 0.05, r * 0.15); g.fillStyle = '#ffffff'; g.fill();
      }
    });
    Art.pencil(c, L.deep, KINDS.indexOf(kind) + 3, 0.5);
    return { c: c, w: w, h: h };
  }

  // ============================================================ the husky
  // Authored in a 90 x 100 space (a friend is about 0.9 h wide and h tall),
  // sitting, facing left, three-quarters to the player, as the plush sits.
  var HW = 2.1, HI = 1.2, HPAD = 4;        // ink widths (silhouette, inner) and sprite margin
  var HC = {
    white: '#fbfaf6', whiteDeep: '#b9bdcc', grey: '#bdbfcd', greyDeep: '#8389a2',
    ear: '#7fd0f4', earDeep: '#3aa3dc', muzzle: '#fdf2dc', muzzleDeep: '#dcc39a',
    eye: '#3aa7ea', eyeDeep: '#1b78c8', nose: '#241b21'
  };
  var NECK = [44, 58];
  var HCX = 41;                             // the x that stands on the friend's anchor: a little left of the
                                            // sprite's middle, so the head stays clear of the cake in front
  var hk = null;                            // the husky's parts

  function smoothPath(g, pts, f, noBegin) {
    var n = pts.length, i;
    if (!noBegin) g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (i = 0; i < n; i++) {
      var p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      g.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * f, p1[1] + (p2[1] - p0[1]) * f,
        p2[0] - (p3[0] - p1[0]) * f, p2[1] - (p3[1] - p1[1]) * f, p2[0], p2[1]);
    }
    g.closePath();
  }
  function clockwise(pts) {                 // the winding of g.arc(), so unions fill solid
    var a = 0, n = pts.length;
    for (var i = 0; i < n; i++) { var p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; }
    return a >= 0 ? pts : pts.slice().reverse();
  }
  function ringPts(x, y, rx, ry, n) {
    var pts = [];
    for (var q = 0; q < n; q++) pts.push([x + Math.cos(q / n * TAU) * rx, y + Math.sin(q / n * TAU) * ry]);
    return pts;
  }
  function spot(g, x, y, r, rgb, a) {
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // One part: a canvas around the box bb = [x0, y0, x1, y1] (husky space), placed by
  // its pivot. k = px per husky unit.
  function part(k, dpr, bb, pivot, paintIt) {
    var x0 = bb[0] - HPAD, y0 = bb[1] - HPAD, w = bb[2] - bb[0] + 2 * HPAD, h = bb[3] - bb[1] + 2 * HPAD;
    var c = Art.makeCanvas(w * k * dpr, h * k * dpr), g = c.getContext('2d');
    c.lw = w * k; c.lh = h * k;
    g.scale(c.width / w, c.height / h);
    g.translate(-x0, -y0);
    g.lineJoin = 'round'; g.lineCap = 'round';
    paintIt({ c: c, g: g });
    return { c: c, dx: (x0 - pivot[0]) * k, dy: (y0 - pivot[1]) * k, w: w * k, h: h * k, px: (pivot[0] - HCX) * k, py: (pivot[1] - 100) * k };
  }
  // One painted piece of a part, on its own layer: fill, clipped extras, pencil
  // grain, then the ink line (around the whole union when o.around).
  var hSeed = 40;
  function piece(P, path, fill, deep, o) {
    o = o || {};
    var c = Art.makeCanvas(P.c.width, P.c.height), g = c.getContext('2d');
    c.lw = P.c.lw;
    g.setTransform(P.g.getTransform());
    g.lineJoin = 'round'; g.lineCap = 'round';
    path(g); g.fillStyle = fill; g.fill();
    if (o.inside) { g.save(); path(g); g.clip(); o.inside(g); g.restore(); }
    if (deep) Art.pencil(c, deep, hSeed++, o.grain === undefined ? 0.7 : o.grain);
    if (o.over) { g.save(); path(g); g.clip(); o.over(g); g.restore(); }
    if (o.ink !== 0) {
      if (o.around) {
        g.save();
        g.globalCompositeOperation = 'destination-over';
        Art.ink(g, (o.ink || HW) * 2);
        path(g); g.stroke();
        g.restore();
      } else {
        Art.ink(g, o.ink || HW); path(g); g.stroke();
        g.save(); g.translate(0.25, -0.2); g.lineWidth = (o.ink || HW) * 0.6; path(g); g.stroke(); g.restore();
      }
    }
    if (o.top) o.top(g);
    P.g.save(); P.g.setTransform(1, 0, 0, 1, 0, 0); P.g.drawImage(c, 0, 0); P.g.restore();
  }
  // Plush: a smooth blob with round tufts along its outline, one ink line around it.
  function plush(P, pts, fill, deep, o) {
    o = o || {};
    pts = clockwise(pts);
    var f = 0.18, tr = o.tuft || 3, rnd = Art.rng(o.seed || 1), tufts = [], i, j;
    var n = pts.length, cx = 0, cy = 0, poly = [];
    for (i = 0; i < n; i++) {
      var p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      var c1x = p1[0] + (p2[0] - p0[0]) * f, c1y = p1[1] + (p2[1] - p0[1]) * f;
      var c2x = p2[0] - (p3[0] - p1[0]) * f, c2y = p2[1] - (p3[1] - p1[1]) * f;
      for (j = 0; j < 10; j++) {
        var t = j / 10, m = 1 - t;
        poly.push([m * m * m * p1[0] + 3 * m * m * t * c1x + 3 * m * t * t * c2x + t * t * t * p2[0],
          m * m * m * p1[1] + 3 * m * m * t * c1y + 3 * m * t * t * c2y + t * t * t * p2[1]]);
      }
    }
    for (i = 0; i < poly.length; i++) { cx += poly[i][0]; cy += poly[i][1]; }
    cx /= poly.length; cy /= poly.length;
    var acc = 0, next = 0;
    for (i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      acc += Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (acc >= next) {
        var r = tr * (0.8 + rnd() * 0.4), dx = cx - a[0], dy = cy - a[1], d = Math.hypot(dx, dy) || 1;
        tufts.push([a[0] + dx / d * r * 0.6, a[1] + dy / d * r * 0.6, r]);
        next = acc + r * (1.3 + rnd() * 0.3);
      }
    }
    piece(P, function (g) {
      g.beginPath();
      smoothPath(g, pts, f, true);
      for (var q = 0; q < tufts.length; q++) { g.moveTo(tufts[q][0] + tufts[q][2], tufts[q][1]); g.arc(tufts[q][0], tufts[q][1], tufts[q][2], 0, TAU); }
    }, fill, deep, { around: true, ink: o.ink, grain: o.grain, inside: o.inside, over: o.over, top: o.top });
  }
  // a few short pencil strokes of fur, in a clipped piece
  function furMarks(g, seed, x0, y0, x1, y1, n, col) {
    var rnd = Art.rng(seed);
    g.strokeStyle = col; g.lineWidth = 0.7; g.lineCap = 'round';
    for (var i = 0; i < n; i++) {
      var x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0), r = 1.6 + rnd() * 1.6, a = rnd() * TAU;
      g.beginPath(); g.arc(x, y, r, a, a + 1.6 + rnd()); g.stroke();
    }
  }
  var EYES = [[30.5, 39.5, 7.2], [51, 38.5, 6.4]];
  function buildHusky(h, dpr) {
    var k = h / 100, P = {};
    hSeed = 40;
    // the tail: a fluffy plume curling up behind, grey with a white tip
    P.tail = part(k, dpr, [58, 54, 90, 98], [65, 88], function (S) {
      plush(S, [[61, 91], [70, 94], [80, 87], [85, 74], [82, 62], [75, 60], [73, 68], [72, 78], [63, 82]], HC.grey, HC.greyDeep, {
        seed: 3, tuft: 3.2,
        inside: function (g) { spot(g, 79, 62, 12, '251,250,246', 1); spot(g, 79, 62, 8, '251,250,246', 1); }
      });
    });
    // the body, sitting: grey back, white chest and tummy, a white hind paw
    P.body = part(k, dpr, [24, 54, 78, 100], [45, 100], function (S) {
      plush(S, [[36, 60], [46, 56], [57, 59], [66, 68], [72, 82], [71, 93], [62, 98], [42, 98], [31, 93], [28, 78], [30, 66]], HC.grey, HC.greyDeep, {
        seed: 5, tuft: 3.2,
        inside: function (g) {
          g.fillStyle = HC.white;
          g.beginPath(); g.ellipse(40, 82, 15, 23, 0.12, 0, TAU); g.fill();
          spot(g, 70, 94, 16, '131,137,162', 0.35);
        },
        over: function (g) {
          furMarks(g, 9, 28, 62, 56, 96, 16, 'rgba(150,156,180,0.6)');
          furMarks(g, 10, 56, 62, 72, 96, 10, 'rgba(110,116,146,0.55)');
        }
      });
      plush(S, ringPts(62, 94.5, 9, 4.6, 8), HC.white, HC.whiteDeep, { seed: 6, tuft: 2.4, ink: HW * 0.85 });
    });
    // one front leg (drawn twice): white, a round paw with two toe lines
    P.leg = part(k, dpr, [-8, -4, 8, 27], [0, 0], function (S) {
      plush(S, [[-4.6, -1], [4.6, -1], [5.2, 12], [6.6, 20], [5.4, 25], [-5.4, 25], [-6.8, 20], [-5.2, 12]], HC.white, HC.whiteDeep, {
        seed: 7, tuft: 2.4, ink: HW * 0.85,
        over: function (g) {
          Art.ink(g, HI * 0.7); g.globalAlpha = 0.6;
          g.beginPath(); g.moveTo(-1.8, 21.5); g.lineTo(-1.8, 25); g.moveTo(1.8, 21.5); g.lineTo(1.8, 25); g.stroke();
          g.globalAlpha = 1;
        }
      });
    });
    // one ear (the other is its mirror): grey, light blue inside
    P.ear = part(k, dpr, [-11, -22, 11, 5], [0, 0], function (S) {
      plush(S, [[-8.5, 3], [-8.5, -8], [-3, -18.5], [2.5, -19.5], [7.5, -9], [8.5, 3]], HC.grey, HC.greyDeep, { seed: 8, tuft: 2.2 });
      piece(S, function (g) { smoothPath(g, [[-4.6, 3], [-4.8, -6.5], [-1, -14], [2.2, -14.5], [4.6, -7], [5, 3]], 0.2); }, HC.ear, HC.earDeep, {
        ink: HI * 0.8, grain: 0.8,
        inside: function (g) { spot(g, -1, -9, 7, '255,255,255', 0.45); }
      });
    });
    // the head: big and round, wider than tall; grey cap with the husky's white
    // mask, rosy cheeks, cream muzzle, black nose, stitched smile
    P.head = part(k, dpr, [10, 10, 72, 66], NECK, function (S) {
      var skull = [[41, 13], [53, 15], [63, 22], [68.5, 33], [68, 44], [62, 54], [52, 60.5], [40, 62], [28, 60.5], [18.5, 54], [13.5, 44], [13.5, 33], [19, 22], [29, 15]];
      plush(S, skull, HC.white, HC.whiteDeep, {
        seed: 11, tuft: 3.3, grain: 0.55,
        inside: function (g) {
          g.fillStyle = HC.grey;
          g.beginPath();
          g.moveTo(6, 52);
          g.quadraticCurveTo(13, 27, 30, 27.5);
          g.quadraticCurveTo(38, 28, 40.5, 37);
          g.quadraticCurveTo(43, 27.5, 51, 27);
          g.quadraticCurveTo(66, 27, 73, 52);
          g.lineTo(90, 52); g.lineTo(90, 0); g.lineTo(0, 0); g.lineTo(0, 52);
          g.closePath(); g.fill();
          spot(g, 30, 16, 14, '255,255,255', 0.3);
          spot(g, 22, 50, 6.5, '244,140,160', 0.55);
          spot(g, 58, 49.5, 6, '244,140,160', 0.5);
        },
        over: function (g) {
          furMarks(g, 12, 16, 14, 66, 28, 14, 'rgba(110,116,146,0.5)');
          furMarks(g, 13, 16, 44, 64, 60, 10, 'rgba(160,166,188,0.55)');
        }
      });
      piece(S, function (g) { g.beginPath(); g.ellipse(38.5, 51.5, 11.5, 8.6, 0, 0, TAU); }, HC.muzzle, HC.muzzleDeep, {
        ink: HI * 0.85, grain: 0.5,
        inside: function (g) { spot(g, 35, 48, 8, '255,255,255', 0.6); }
      });
      var g = S.g;
      // the smile: a line down from the nose into a wide curve
      Art.ink(g, HI);
      g.beginPath(); g.moveTo(37.5, 48); g.lineTo(37.5, 54.4); g.stroke();
      g.beginPath(); g.moveTo(29.6, 50.6); g.quadraticCurveTo(31, 54.8, 37.5, 54.6); g.quadraticCurveTo(44, 54.8, 45.8, 50.2); g.stroke();
      // the nose
      smoothPath(g, [[33.2, 44.6], [37.5, 43.8], [41.8, 44.6], [42, 46.8], [39.4, 49.2], [37.5, 49.8], [35.6, 49.2], [33, 46.8]], 0.2);
      g.fillStyle = HC.nose; g.fill();
      g.beginPath(); g.ellipse(36.2, 45.4, 1.7, 0.75, -0.15, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fill();
    });
    // the eyes, open: a glittery blue ring, a big black pupil, two lights
    P.eyes = part(k, dpr, [21, 30, 60, 49], NECK, function (S) {
      EYES.forEach(function (e, i) {
        var x = e[0], y = e[1], r = e[2];
        piece(S, function (g) { g.beginPath(); g.arc(x, y, r, 0, TAU); }, HC.eye, null, {
          ink: HI * 0.9,
          inside: function (g) {
            spot(g, x - r * 0.3, y - r * 0.4, r, '150,225,255', 0.9);
            var rnd = Art.rng(21 + i), cols = ['#ffffff', '#c9f1ff', HC.eyeDeep, '#8fe0ff'];
            for (var q = 0; q < 46; q++) {
              var a = rnd() * TAU, d = r * (0.66 + rnd() * 0.3);
              g.fillStyle = cols[q % 4];
              g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.22 + rnd() * 0.3, 0, TAU); g.fill();
            }
            g.fillStyle = '#17121a';
            g.beginPath(); g.arc(x - r * 0.04, y + r * 0.03, r * 0.66, 0, TAU); g.fill();
            g.fillStyle = '#ffffff';
            g.beginPath(); g.arc(x - r * 0.3, y - r * 0.28, r * 0.2, 0, TAU); g.fill();
            g.fillStyle = 'rgba(255,255,255,0.75)';
            g.beginPath(); g.arc(x + r * 0.26, y + r * 0.3, r * 0.1, 0, TAU); g.fill();
          }
        });
      });
    });
    // the eyes shut: two happy arcs
    P.shut = part(k, dpr, [21, 30, 60, 49], NECK, function (S) {
      var g = S.g;
      Art.ink(g, HI * 1.25);
      EYES.forEach(function (e) {
        g.beginPath(); g.arc(e[0], e[1] + e[2] * 0.75, e[2] * 0.95, Math.PI * 1.17, Math.PI * 1.83); g.stroke();
      });
    });
    // the open mouth, over the smile
    P.mouth = part(k, dpr, [28, 49, 48, 60], NECK, function (S) {
      piece(S, function (g) {
        g.beginPath(); g.moveTo(30.6, 51.4); g.quadraticCurveTo(37.5, 54.4, 44.6, 51); g.quadraticCurveTo(43.5, 59.4, 37.5, 59.2); g.quadraticCurveTo(31.6, 59.4, 30.6, 51.4); g.closePath();
      }, '#b8475f', null, {
        ink: HI * 0.9,
        inside: function (g) { g.fillStyle = '#f490a8'; g.beginPath(); g.ellipse(37.5, 58.6, 4.2, 2.8, 0, 0, TAU); g.fill(); }
      });
    });
    // crumbs around the muzzle while eating
    P.crumbs = part(k, dpr, [18, 50, 36, 68], NECK, function (S) {
      var g = S.g, cols = ['#f7dba3', '#d9a865', '#ef8fa8'];
      [[22, 56, 1.1], [26, 61, 0.9], [31, 63, 1.2], [21, 63, 0.8], [28, 66, 0.9]].forEach(function (q, i) {
        g.beginPath(); g.arc(q[0], q[1], q[2], 0, TAU); g.fillStyle = cols[i % 3]; g.fill();
        Art.ink(g, 0.35); g.stroke();
      });
    });
    P.k = k;
    return P;
  }

  function blit(g, p, x, y, rot, mirror) {
    if (!rot && !mirror) { g.drawImage(p.c, x + p.dx, y + p.dy, p.w, p.h); return; }
    g.save();
    g.translate(x, y);
    if (rot) g.rotate(rot);
    if (mirror) g.scale(-1, 1);
    g.drawImage(p.c, p.dx, p.dy, p.w, p.h);
    g.restore();
  }
  function drawHusky(g, x, y, pose) {
    var P = hk, k = P.k;
    var t = pose.t || 0, p = pose.p || 0, st = pose.state, sin = Math.sin;
    var breath = sin(t * 2);
    var rock = 0, bob = 0, headRot = 0.025 * sin(t * 1.3), headDy = -0.35 * breath, ears = 0.04 * sin(t * 1.7);
    var tail = 0.07 * sin(t * 2.4), la = 0, lb = 0, liftA = 0, liftB = 0;
    var shut = ((t + 0.6) % 3.7) < 0.14, mouth = false, crumbs = false;
    if (st === 'walk') {                       // a soft waddle from paw to paw
      var ph = p * TAU;
      rock = 0.075 * sin(ph);
      bob = Math.abs(sin(ph)) * 2.4;
      headRot += -rock * 0.55 + 0.02 * sin(ph * 2);
      la = 0.34 * sin(ph); lb = -la;
      liftA = Math.max(0, Math.cos(ph)) * 2.2; liftB = Math.max(0, -Math.cos(ph)) * 2.2;
      tail += 0.2 * sin(ph + 1);
    } else if (st === 'eat') {                 // muzzle down, chewing, a happy squint
      var chew = Math.abs(sin(t * 12));
      headRot = -0.3 - 0.05 * chew;
      headDy = 3.2 + 1.2 * chew;
      shut = true; mouth = chew > 0.55; crumbs = true;
      tail = 0.24 * sin(t * 9);
      ears = -0.1;
    } else if (st === 'happy') {               // a wiggle with the ears up
      var ease = 1 - p * 0.5;
      rock = sin(t * 14) * 0.085 * ease;
      bob = Math.abs(sin(p * TAU * 2)) * 5;
      headRot = -rock * 0.4 + 0.06;
      headDy = -1.4;
      ears = 0.3;
      tail = 0.4 * sin(t * 16);
      la = -0.25 + 0.12 * sin(t * 14); lb = -0.25 - 0.12 * sin(t * 14);
      liftA = liftB = 1.6;
      shut = true; mouth = true;
    }
    g.save();
    g.translate(x, y - bob * k);
    if (rock) g.rotate(rock);
    blit(g, P.tail, P.tail.px, P.tail.py, tail, false);
    g.save();
    g.scale(1, 1 + 0.012 * breath);
    blit(g, P.body, P.body.px, P.body.py, 0, false);
    g.restore();
    blit(g, P.leg, (50 - HCX) * k, (73.5 - 100 - liftB) * k, lb, false);
    blit(g, P.leg, (37 - HCX) * k, (74 - 100 - liftA) * k, la, false);
    // the head and all that rides on it, around the neck
    g.translate(P.head.px, P.head.py + headDy * k);
    g.rotate(headRot);
    blit(g, P.ear, (59 - NECK[0]) * k, (19.5 - NECK[1] - ears * 4) * k, 0.42 - ears, true);
    blit(g, P.ear, (23.5 - NECK[0]) * k, (21 - NECK[1] - ears * 4) * k, -0.45 + ears, false);
    g.drawImage(P.head.c, P.head.dx, P.head.dy, P.head.w, P.head.h);
    var e = shut ? P.shut : P.eyes;
    g.drawImage(e.c, e.dx, e.dy, e.w, e.h);
    if (mouth) g.drawImage(P.mouth.c, P.mouth.dx, P.mouth.dy, P.mouth.w, P.mouth.h);
    if (crumbs) {
      var fl = (t * 7) % 1;
      g.globalAlpha = 1 - fl * 0.7;
      g.drawImage(P.crumbs.c, P.crumbs.dx - fl * 2 * k, P.crumbs.dy + fl * 6 * k, P.crumbs.w, P.crumbs.h);
      g.globalAlpha = 1;
    }
    g.restore();
  }

  function build(h, dpr) {
    H = h;
    KINDS.forEach(function (k) { if (k !== 'husky') S[k] = paintFriend(k, h, dpr); });
    hk = buildHusky(h, dpr);
  }

  function draw(g, kind, x, y, pose) {
    if (kind === 'husky') { if (hk) drawHusky(g, x, y, pose); return; }
    var s = S[kind];
    if (!s) return;
    var t = pose.t || 0, p = pose.p || 0, st = pose.state;
    var bob = 0, rot = 0, sx = 1, sy = 1;
    if (st === 'walk') {
      bob = Math.abs(Math.sin(p * TAU)) * s.h * 0.05;
      rot = Math.sin(p * TAU) * 0.06;
    } else if (st === 'eat') {
      var ch = Math.abs(Math.sin(t * 12));
      sy = 1 - 0.04 * ch; sx = 1 + 0.02 * ch;
    } else if (st === 'happy') {
      rot = Math.sin(t * 14) * 0.12 * (1 - p * 0.5);
      bob = Math.abs(Math.sin(p * TAU * 2)) * s.h * 0.06;
    } else {
      sy = 1 + 0.015 * Math.sin(t * 2);
    }
    g.save();
    g.translate(x, y - bob);
    if (rot) g.rotate(rot);
    g.scale(sx, sy);
    g.drawImage(s.c, -s.w / 2, -s.h, s.w, s.h);
    g.restore();
  }

  window.Friends = { KINDS: KINDS, build: build, draw: draw };
})();
