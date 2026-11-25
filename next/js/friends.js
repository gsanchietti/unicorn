/* friends.js - the bakery's friends: the plush husky, Pagi the dog, the mouse
 * and the lizard from the bedroom-wall mural. Classic script: window.Friends.
 * Needs window.Art (js/art.js) loaded first.
 *
 * Each friend is a small puppet of cached parts (tail, body, front legs, ears,
 * head, eyes open and shut, open mouth, crumbs), pre-rendered once in build();
 * draw() only places them. The husky is painted from the plush
 * (assets/photos/ref/husky.jpg), with tufts of fur along its outline. Pagi, the
 * mouse and the lizard come from the mural (assets/photos/ref/mural-*.jpg): smooth
 * ink outlines and big googly eyes that bulge over the top of the head. The mouse
 * has the colors of the street's mouseBalloon (js/art-town.js).
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
 *   Friends.buildOctopus(h, DPR)
 *                               pre-renders the pond's reversible octopus h CSS px tall
 *                               (about 1.15 h wide). Not a bakery friend: it is not in
 *                               KINDS. The pond scene calls it from its resize().
 *   Friends.octopus(g, x, y, pose)
 *                               draws it CENTERED at (x, y). pose = {t, side, flip, giggle}:
 *                                 t       time in seconds (a soft breathing squash)
 *                                 side    'blue' | 'red': the side it shows at flip 0
 *                                 flip    0..1 turns it inside out to the other side: the
 *                                         head sinks and the tentacles fold up around it,
 *                                         lining out (0..0.5); then the other head pops
 *                                         out, laughing, with a hop and a big overshoot,
 *                                         in a ring of red and pink sparkles that reaches
 *                                         about 1.5 h from the center (0.5..1)
 *                                 giggle  0..1 shakes it, the red side with closed,
 *                                         happy eyes
 *                               The blue side is gently grumpy (droopy half-shut eyes,
 *                               a small soft pout, never scary); the red side smiles.
 *                               Only cached canvases and transforms per frame.
 *   Everyone smiles at rest (except the octopus's blue side). The husky keeps its plush look (big glittery blue eyes,
 *   light-blue inner ears, cream muzzle); Pagi, the mouse and the lizard keep their
 *   big round googly eyes with black pupils. Pagi's collar has no letters (nothing to read).
 */
(function () {
  'use strict';

  var Art = window.Art;
  var TAU = Math.PI * 2;
  var KINDS = ['husky', 'pagi', 'mouse', 'lizard'];

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

  // ============================================================ the wall friends
  // Pagi, the mouse and the lizard: the same puppet as the husky, in the same
  // 90 x 100 space, but with the mural's smooth outlines (no tufts) and googly eyes.
  var WC = {
    pagi: '#b9794e', pagiDeep: '#7a4a30', pagiEar: '#a5683f', collar: '#f6dc6e', collarDeep: '#d9a92c',
    mouse: '#a9684a', mouseDeep: '#6e3d28', mouseEar: '#f4a3c0', mouseEarDeep: '#d9709a', tummy: '#f3dcc4',
    hand: '#f7b3c4', handDeep: '#e07f9c', noseP: '#f58ab8',
    liz: '#f58d45', lizDeep: '#d2601e', lizHead: '#ee7590', lizHeadDeep: '#cf4a6c',
    mouth: '#b8475f', tongue: '#f490a8', pupil: '#17121a'
  };
  var wall = {};                            // kind -> its parts

  function sm(pts, f) { return function (g) { smoothPath(g, pts, f === undefined ? 0.18 : f); }; }
  function ell(x, y, rx, ry, rot) { return function (g) { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }; }
  // a smooth blob joined with round bits (toes, fingers): one outline around all
  function union(pts, rounds) {
    pts = clockwise(pts);
    return function (g) {
      g.beginPath();
      smoothPath(g, pts, 0.18, true);
      rounds.forEach(function (c) { g.moveTo(c[0] + c[2], c[1]); g.arc(c[0], c[1], c[2], 0, TAU); });
    };
  }
  // The outline of a tapering tube along the bezier b = [p0, c1, c2, p3].
  function tube(b, w0, w1) {
    var L = [], R = [], n = 9;
    for (var i = 0; i <= n; i++) {
      var t = i / n, m = 1 - t;
      var x = m * m * m * b[0][0] + 3 * m * m * t * b[1][0] + 3 * m * t * t * b[2][0] + t * t * t * b[3][0];
      var y = m * m * m * b[0][1] + 3 * m * m * t * b[1][1] + 3 * m * t * t * b[2][1] + t * t * t * b[3][1];
      var dx = 3 * m * m * (b[1][0] - b[0][0]) + 6 * m * t * (b[2][0] - b[1][0]) + 3 * t * t * (b[3][0] - b[2][0]);
      var dy = 3 * m * m * (b[1][1] - b[0][1]) + 6 * m * t * (b[2][1] - b[1][1]) + 3 * t * t * (b[3][1] - b[2][1]);
      var d = Math.hypot(dx, dy) || 1, w = (w0 + (w1 - w0) * t) / 2;
      L.push([x - dy / d * w, y + dx / d * w]); R.push([x + dy / d * w, y - dx / d * w]);
    }
    return L.concat(R.reverse());
  }
  function inkLine(g, w, a, draw) {
    Art.ink(g, w); g.globalAlpha = a; g.beginPath(); draw(g); g.stroke(); g.globalAlpha = 1;
  }
  // Googly eyes, open and shut. eyes = [[x, y, r], ...], the far one first. Open:
  // white, with a black pupil looking at the cake. Shut: a lid in the skin color
  // with a happy arc.
  function googly(P, k, dpr, neck, eyes, lid, lidDeep) {
    var bb = [Infinity, Infinity, -Infinity, -Infinity];
    eyes.forEach(function (e) {
      bb = [Math.min(bb[0], e[0] - e[2]), Math.min(bb[1], e[1] - e[2]), Math.max(bb[2], e[0] + e[2]), Math.max(bb[3], e[1] + e[2])];
    });
    P.eyes = part(k, dpr, bb, neck, function (S) {
      eyes.forEach(function (e) {
        var x = e[0], y = e[1], r = e[2];
        piece(S, ell(x, y, r, r), '#ffffff', null, {
          ink: HI * 1.15,
          inside: function (g) {
            spot(g, x + r * 0.5, y + r * 0.7, r * 1.1, '170,180,215', 0.4);
            g.fillStyle = WC.pupil;
            g.beginPath(); g.arc(x - r * 0.3, y + r * 0.26, r * 0.4, 0, TAU); g.fill();
            g.fillStyle = '#ffffff';
            g.beginPath(); g.arc(x - r * 0.43, y + r * 0.12, r * 0.13, 0, TAU); g.fill();
          }
        });
      });
    });
    P.shut = part(k, dpr, bb, neck, function (S) {
      eyes.forEach(function (e) {
        var x = e[0], y = e[1], r = e[2];
        piece(S, ell(x, y, r, r), lid, lidDeep, {
          ink: HI * 1.15,
          inside: function (g) { spot(g, x - r * 0.3, y - r * 0.4, r, '255,255,255', 0.25); },
          top: function (g) {
            inkLine(g, HI * 1.25, 1, function (g) { g.arc(x, y + r * 0.62, r * 0.78, Math.PI * 1.2, Math.PI * 1.8); });
          }
        });
      });
    });
  }
  // The smile from a to b (bending through c) and the open mouth that covers it.
  function smile(g, a, c, b) {
    inkLine(g, HI * 1.1, 1, function (g) { g.moveTo(a[0], a[1]); g.quadraticCurveTo(c[0], c[1], b[0], b[1]); });
    // the dimple at the cheek
    inkLine(g, HI * 0.9, 1, function (g) { g.arc(b[0] - 0.4, b[1] + 0.5, 2, -1.9, -0.2); });
  }
  function mouthPart(P, k, dpr, neck, a, c, b, drop) {
    var top = Math.min(a[1], b[1]) - 1, bot = Math.max(a[1], b[1], c[1]) + drop;
    P.mouth = part(k, dpr, [a[0], top, b[0], bot], neck, function (S) {
      var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      var path = function (g) {
        g.beginPath(); g.moveTo(a[0], a[1]);
        g.quadraticCurveTo(mx, my + 1.6, b[0], b[1]);
        g.quadraticCurveTo(c[0] + (b[0] - c[0]) * 0.35, c[1] + drop, c[0], c[1] + drop * 0.9);
        g.quadraticCurveTo(c[0] + (a[0] - c[0]) * 0.75, c[1] + drop * 0.7, a[0], a[1]);
        g.closePath();
      };
      piece(S, path, WC.mouth, null, {
        ink: HI * 0.95,
        inside: function (g) {
          g.fillStyle = WC.tongue;
          g.beginPath(); g.ellipse(c[0], (my + c[1] + drop) / 2 + drop * 0.55, (b[0] - a[0]) * 0.24, drop * 0.75, 0, 0, TAU); g.fill();
        }
      });
    });
  }
  function crumbsPart(P, k, dpr, neck, x, y) {
    P.crumbs = part(k, dpr, [x - 8, y - 8, x + 10, y + 10], neck, function (S) {
      var g = S.g, cols = ['#f7dba3', '#d9a865', '#ef8fa8'];
      [[-5, -5, 1.1], [-1, 0, 0.9], [4, 2, 1.2], [-6, 2, 0.8], [1, 5, 0.9]].forEach(function (q, i) {
        g.beginPath(); g.arc(x + q[0], y + q[1], q[2], 0, TAU); g.fillStyle = cols[i % 3]; g.fill();
        Art.ink(g, 0.35); g.stroke();
      });
    });
  }
  function toes(g, x, y) {
    inkLine(g, HI * 0.7, 0.6, function (g) { g.moveTo(x - 1.8, y - 3.5); g.lineTo(x - 1.8, y); g.moveTo(x + 1.8, y - 3.5); g.lineTo(x + 1.8, y); });
  }

  // ---- Pagi: the brown dog, with his long ears, his big black nose and his collar
  function buildPagi(h, dpr) {
    var k = h / 100, neck = [44, 60], P = { k: k, neck: neck };
    hSeed = 200;
    P.tail = part(k, dpr, [58, 54, 90, 100], [64, 93], function (S) {
      piece(S, sm(tube([[60, 94], [78, 97], [70, 74], [82, 60]], 7.5, 3.4), 0.16), WC.pagi, WC.pagiDeep);
    });
    P.body = part(k, dpr, [24, 54, 76, 100], [45, 100], function (S) {
      piece(S, sm([[39, 60], [49, 58.5], [57, 63], [63.5, 74], [68, 87], [66, 95.5], [57, 98.5], [38, 98.5], [31, 94], [30.5, 80], [33, 68]]), WC.pagi, WC.pagiDeep, {
        inside: function (g) { spot(g, 38, 76, 13, '255,226,190', 0.3); spot(g, 68, 94, 15, '90,50,30', 0.3); },
        over: function (g) {      // the haunch
          inkLine(g, HI, 0.85, function (g) { g.moveTo(54.5, 76); g.bezierCurveTo(62, 77, 66, 86, 62.5, 92); });
        }
      });
      piece(S, ell(60.5, 94.6, 9, 4.3), WC.pagi, WC.pagiDeep, { ink: HW * 0.85, over: function (g) { toes(g, 55, 98.6); } });
      // the collar: a yellow band and a round tag, no letters
      piece(S, sm(tube([[30.5, 60.5], [36, 67.5], [50, 67], [57.5, 59.5]], 6.2, 6.2), 0.14), WC.collar, WC.collarDeep, {
        ink: HW * 0.85, inside: function (g) { spot(g, 38, 62, 7, '255,255,255', 0.45); }
      });
      piece(S, ell(40, 69.6, 2.7, 2.7), '#ffeea0', WC.collarDeep, { ink: HI * 0.9, grain: 0.4 });
    });
    P.leg = part(k, dpr, [-8, -4, 8, 27], [0, 0], function (S) {
      piece(S, sm([[-3.7, -1], [3.7, -1], [4, 12], [5.6, 19.5], [4.8, 24.6], [-5, 24.6], [-6.6, 19.5], [-4, 12]]), WC.pagi, WC.pagiDeep, {
        ink: HW * 0.85, over: function (g) { toes(g, -0.6, 25); }
      });
    });
    P.legs = [[49, 73.5], [37.5, 74]];
    // one long ear, used twice: up behind the head, and flopping toward the muzzle
    P.ear = part(k, dpr, [-9, -30, 9, 5], [0, 0], function (S) {
      piece(S, sm([[-3.6, 3], [-4.2, -7], [-6.2, -17], [-4.6, -25], [0.6, -27.5], [5.6, -24], [6.4, -16], [4.6, -7], [3.8, 3]]), WC.pagiEar, WC.pagiDeep, {
        inside: function (g) { spot(g, -1, -17, 7, '255,220,190', 0.3); },
        over: function (g) { inkLine(g, HI * 0.8, 0.6, function (g) { g.moveTo(0.6, -3); g.quadraticCurveTo(-1.6, -13, 1, -21.5); }); }
      });
    });
    P.ears = [{ x: 57, y: 28, rot: 0.72, mirror: true }, { x: 34, y: 27, rot: -1.2, mirror: false }];
    P.earAmp = 1.5;
    P.head = part(k, dpr, [5, 18, 68, 64], neck, function (S) {
      piece(S, sm([[36, 23.5], [47, 21.5], [57, 24.5], [63.5, 33], [64, 44], [58.5, 54], [47, 59.5], [34, 60.5], [22, 58], [14.5, 53], [11.5, 46], [16, 40.5], [24.5, 38], [28, 29]]), WC.pagi, WC.pagiDeep, {
        inside: function (g) {
          spot(g, 26, 49, 14, '255,226,190', 0.38);
          spot(g, 52, 49, 6.5, '244,120,130', 0.4);
          spot(g, 62, 56, 14, '90,50,30', 0.22);
        }
      });
      var g = S.g;
      smile(g, [17, 52], [29, 59.5], [42, 50.5]);
      // the nose: big, black, at the tip of the muzzle
      piece(S, ell(15.5, 44.6, 7.8, 6, -0.22), '#2e262c', null, {
        ink: HI,
        inside: function (g) { spot(g, 13, 41.6, 6, '255,255,255', 0.42); spot(g, 19, 48, 5, '120,110,130', 0.35); }
      });
    });
    googly(P, k, dpr, neck, [[49.5, 27, 7.8], [33, 28, 8.6]], WC.pagi, WC.pagiDeep);
    mouthPart(P, k, dpr, neck, [18, 52.2], [29, 58.5], [41, 51], 3.4);
    crumbsPart(P, k, dpr, neck, 18, 60);
    return P;
  }

  // ---- the mouse, out of its balloon basket: big pink ears, a pointed snout
  function buildMouse(h, dpr) {
    var k = h / 100, neck = [44, 61], P = { k: k, neck: neck };
    hSeed = 300;
    P.tail = part(k, dpr, [56, 56, 92, 100], [62, 94], function (S) {
      piece(S, sm(tube([[58, 95], [82, 99], [90, 76], [76, 70]], 3.4, 2), 0.16), WC.hand, WC.handDeep, { ink: HI, grain: 0.5 });
    });
    P.body = part(k, dpr, [24, 54, 76, 100], [45, 100], function (S) {
      piece(S, sm([[38, 61], [48, 59.5], [57, 64], [63, 75], [66, 88], [63.5, 96], [56, 98.5], [38, 98.5], [31, 94.5], [29.5, 81], [32, 69]]), WC.mouse, WC.mouseDeep, {
        inside: function (g) {
          g.fillStyle = WC.tummy;
          g.beginPath(); g.ellipse(40.5, 83, 12, 16.5, 0.1, 0, TAU); g.fill();
          spot(g, 68, 94, 15, '80,40,30', 0.3);
        },
        over: function (g) {
          inkLine(g, HI, 0.85, function (g) { g.moveTo(55, 78); g.bezierCurveTo(62, 79, 65.5, 87, 62, 92.5); });
        }
      });
      piece(S, ell(59.5, 95, 9.4, 3.9), WC.hand, WC.handDeep, { ink: HW * 0.85, grain: 0.5, over: function (g) { toes(g, 54, 98.6); } });
    });
    // one short arm with a pink hand
    P.leg = part(k, dpr, [-8, -4, 8, 23], [0, 0], function (S) {
      piece(S, sm([[-3.2, -1], [3.2, -1], [3.5, 8], [3.2, 15.5], [-3.2, 15.5], [-3.5, 8]]), WC.mouse, WC.mouseDeep, { ink: HW * 0.85 });
      piece(S, union(ringPts(0, 17, 4, 3.4, 8), [[-3.2, 19], [0, 20.2], [3.2, 19]].map(function (q) { return [q[0], q[1], 1.6]; })), WC.hand, WC.handDeep, { around: true, ink: HW * 0.8, grain: 0.5 });
    });
    P.legs = [[48.5, 71.5], [37.5, 72]];
    P.ear = part(k, dpr, [-15, -27, 15, 5], [0, 0], function (S) {
      piece(S, ell(0, -11.5, 12.6, 13.2), WC.mouse, WC.mouseDeep);
      piece(S, ell(0.4, -10.6, 8.4, 9), WC.mouseEar, WC.mouseEarDeep, {
        ink: HI * 0.8, grain: 0.6,
        inside: function (g) { spot(g, -2, -14, 8, '255,255,255', 0.4); }
      });
    });
    P.ears = [{ x: 59, y: 30, rot: 0.75, mirror: true }, { x: 38, y: 25, rot: -0.3, mirror: false }];
    P.earAmp = 0.7;
    P.head = part(k, dpr, [4, 16, 68, 66], neck, function (S) {
      piece(S, sm([[36, 24], [47, 22], [57, 25.5], [63.5, 34], [63.5, 45], [57.5, 55], [46, 60.5], [33, 61], [22, 57.5], [12.5, 52.5], [8.6, 48.6], [11, 44.6], [19, 41], [25, 36.5], [29, 29]]), WC.mouse, WC.mouseDeep, {
        inside: function (g) {
          spot(g, 24, 50, 13, '255,226,200', 0.42);
          spot(g, 51, 50, 6.5, '244,120,140', 0.45);
          spot(g, 62, 57, 14, '80,40,30', 0.22);
        },
        over: function (g) {      // whiskers
          inkLine(g, HI * 0.6, 0.55, function (g) {
            g.moveTo(21, 47.5); g.quadraticCurveTo(26, 44.6, 31.5, 45); g.moveTo(21.5, 49.6); g.quadraticCurveTo(27, 48.6, 32, 50.4);
          });
        }
      });
      var g = S.g;
      smile(g, [17.5, 53.6], [29, 60.4], [41.5, 52]);
      piece(S, ell(9, 48, 3.5, 3.3), WC.noseP, null, { ink: HI, inside: function (g) { spot(g, 8, 46.8, 2.6, '255,255,255', 0.6); } });
    });
    googly(P, k, dpr, neck, [[49.5, 27.5, 7.6], [33.5, 28.5, 8.4]], WC.mouse, WC.mouseDeep);
    mouthPart(P, k, dpr, neck, [18.5, 53.8], [29, 59.4], [40.5, 52.4], 3);
    crumbsPart(P, k, dpr, neck, 17, 61);
    return P;
  }

  // ---- the lizard: pink head, orange body, sitting up on its tail
  function buildLizard(h, dpr) {
    var k = h / 100, neck = [44, 61], P = { k: k, neck: neck };
    hSeed = 400;
    P.tail = part(k, dpr, [54, 58, 94, 102], [60, 93], function (S) {
      piece(S, sm(tube([[56, 93], [82, 101], [92, 80], [80, 68]], 12.5, 2.6), 0.16), WC.liz, WC.lizDeep, {
        inside: function (g) { spot(g, 82, 72, 12, '255,214,120', 0.5); }
      });
    });
    P.body = part(k, dpr, [24, 54, 76, 102], [45, 100], function (S) {
      piece(S, sm([[38, 61], [48, 59.5], [57, 64], [62.5, 75], [64.5, 88], [61, 96.5], [54, 98.5], [38, 98.5], [31, 94.5], [29.5, 81], [32, 69]]), WC.liz, WC.lizDeep, {
        inside: function (g) {
          spot(g, 40, 62, 26, '238,117,144', 1); spot(g, 40, 60, 16, '238,117,144', 1);
          spot(g, 39, 84, 13, '255,226,170', 0.55);
          spot(g, 68, 94, 15, '170,60,20', 0.3);
        },
        over: function (g) {
          inkLine(g, HI, 0.85, function (g) { g.moveTo(54.5, 79); g.bezierCurveTo(61, 80, 64, 87, 61, 92.5); });
        }
      });
      // the hind foot, with three round toes
      piece(S, union(ringPts(60, 95.4, 7.4, 3.6, 8), [[52, 96.4, 2.4], [54.6, 98.4, 2.4], [58.4, 99, 2.4]]), WC.liz, WC.lizDeep, { around: true, ink: HW * 0.85 });
    });
    // one short arm with three round fingers
    P.leg = part(k, dpr, [-9, -4, 9, 24], [0, 0], function (S) {
      piece(S, union([[-3.3, -1], [3.3, -1], [3.6, 8], [3.8, 15.5], [0, 17], [-3.8, 15.5], [-3.6, 8]], [[-4, 17.6, 2.3], [0, 19.4, 2.3], [4, 17.6, 2.3]]), WC.liz, WC.lizDeep, { around: true, ink: HW * 0.85 });
    });
    P.legs = [[48.5, 71.5], [37.5, 72]];
    P.ears = [];
    P.earAmp = 0;
    P.head = part(k, dpr, [3, 22, 70, 66], neck, function (S) {
      piece(S, sm([[31, 31], [43, 28.5], [55, 30], [63, 36.5], [65, 46], [59.5, 55.5], [46, 60.5], [31, 61], [18, 58.5], [9.5, 53.5], [7, 46.5], [11, 40.5], [20, 36]]), WC.lizHead, WC.lizHeadDeep, {
        inside: function (g) {
          spot(g, 64, 50, 17, '245,141,69', 0.85);
          spot(g, 22, 44, 13, '255,214,220', 0.4);
          spot(g, 54, 52, 6, '226,60,90', 0.4);
        }
      });
      var g = S.g;
      smile(g, [10.5, 50], [30, 59.5], [50, 50]);
      g.fillStyle = Art.PAL.ink;                 // nostrils
      g.beginPath(); g.arc(12.6, 43.6, 0.9, 0, TAU); g.arc(17.6, 41.4, 0.9, 0, TAU); g.fill();
    });
    googly(P, k, dpr, neck, [[53.5, 27, 8.2], [35, 27.5, 9]], WC.lizHead, WC.lizHeadDeep);
    mouthPart(P, k, dpr, neck, [12, 50.8], [30, 58.4], [48.5, 50.6], 3);
    crumbsPart(P, k, dpr, neck, 14, 61);
    return P;
  }

  function drawWall(g, P, x, y, pose) {
    var k = P.k;
    var t = pose.t || 0, p = pose.p || 0, st = pose.state, sin = Math.sin;
    var breath = sin(t * 2);
    var rock = 0, bob = 0, headRot = 0.025 * sin(t * 1.3), headDy = -0.35 * breath, ears = 0.04 * sin(t * 1.7);
    var tail = 0.07 * sin(t * 2.4), la = 0, lb = 0, liftA = 0, liftB = 0;
    var shut = ((t + 0.6) % 3.7) < 0.14, mouth = false, crumbs = false, i;
    if (st === 'walk') {                       // a soft waddle from paw to paw
      var ph = p * TAU;
      rock = 0.075 * sin(ph);
      bob = Math.abs(sin(ph)) * 2.4;
      headRot += -rock * 0.55 + 0.02 * sin(ph * 2);
      la = 0.34 * sin(ph); lb = -la;
      liftA = Math.max(0, Math.cos(ph)) * 2.2; liftB = Math.max(0, -Math.cos(ph)) * 2.2;
      tail += 0.2 * sin(ph + 1);
      ears += 0.08 * sin(ph * 2);
    } else if (st === 'eat') {                 // muzzle down, chewing, a happy squint
      var chew = Math.abs(sin(t * 12));
      headRot = -0.26 - 0.05 * chew;
      headDy = 3 + 1.2 * chew;
      shut = true; mouth = chew > 0.55; crumbs = true;
      tail = 0.2 * sin(t * 9);
      ears = -0.1;
    } else if (st === 'happy') {               // a wiggle with the ears up
      var ease = 1 - p * 0.5;
      rock = sin(t * 14) * 0.085 * ease;
      bob = Math.abs(sin(p * TAU * 2)) * 5;
      headRot = -rock * 0.4 + 0.06;
      headDy = -1.4;
      ears = 0.3;
      tail = 0.3 * sin(t * 16);
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
    blit(g, P.leg, (P.legs[0][0] - HCX) * k, (P.legs[0][1] - 100 - liftB) * k, lb, false);
    blit(g, P.leg, (P.legs[1][0] - HCX) * k, (P.legs[1][1] - 100 - liftA) * k, la, false);
    // the head and all that rides on it, around the neck
    g.translate(P.head.px, P.head.py + headDy * k);
    g.rotate(headRot);
    ears *= P.earAmp;
    for (i = 0; i < P.ears.length; i++) {
      var e = P.ears[i];
      blit(g, P.ear, (e.x - P.neck[0]) * k, (e.y - P.neck[1] - ears * 3) * k, e.rot + (e.rot > 0 ? -ears : ears), e.mirror);
    }
    g.drawImage(P.head.c, P.head.dx, P.head.dy, P.head.w, P.head.h);
    var ey = shut ? P.shut : P.eyes;
    g.drawImage(ey.c, ey.dx, ey.dy, ey.w, ey.h);
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
    hk = buildHusky(h, dpr);
    wall.pagi = buildPagi(h, dpr);
    wall.mouse = buildMouse(h, dpr);
    wall.lizard = buildLizard(h, dpr);
  }

  function draw(g, kind, x, y, pose) {
    if (kind === 'husky') { if (hk) drawHusky(g, x, y, pose); return; }
    if (wall[kind]) drawWall(g, wall[kind], x, y, pose);
  }

  // ========================================================== the octopus
  // The reversible octopus of the bubble pond (not a bakery friend: not in KINDS),
  // painted from the toy (assets/photos/ref/octopus.jpg): a big round head on a
  // skirt of 8 short round tentacles (4 in front, 4 peeking from behind), with the
  // other side's color showing as a lining under the tentacle tips, as on the toy.
  // Authored in a 115 x 100 space. Cached per side: the skirt and the head (blue:
  // gently grumpy, droopy half-shut eyes and a small pout, no teeth; red: the toy's
  // dot eyes and small smile; red giggling: eyes shut in happy arcs, mouth open),
  // and one burst of red and pink sparkles for the pop.
  // The flip really turns it inside out: the head sinks while the tentacles fold
  // UP around it, showing their lining (0..0.5); then the new head pops out of that
  // cup, laughing, with a big overshoot and a hop, and the tentacles fall back down
  // in the new color (0.5..1).
  var oc = null;
  var OW = 115, OH = 100, OPAD = 6;        // the authoring box and the sprite margin (units)
  var OSK = 68, OHD = 73;                  // the y the skirt hinges on, and the head's bottom
  var OCTO = {
    blue: '#5b8ee6', blueDeep: '#2f57ad', blueLid: '#4576d3',
    red: '#e2473f', redDeep: '#a82a2c',
    cheek: 'rgba(255,176,180,0.8)', mouth: '#7a1f2e', tongue: '#ff8fa0',
    burst: ['#e2473f', '#ff9db8', '#ffd3de', '#ff7f96', '#fff3c9']
  };

  function buildOctopus(h, dpr) {
    var k = h / OH, lw = (OW + 2 * OPAD) * k, lh = (OH + 2 * OPAD) * k;
    var cx = OW / 2;
    var IW = Math.max(3.2, 1.5 / k), ID = Math.max(2.5, 1.2 / k);     // ink: silhouette, face
    function sheet() {
      var c = Art.makeCanvas(lw * dpr, lh * dpr), g = c.getContext('2d');
      c.lw = lw; c.lh = lh;
      g.scale(dpr * k, dpr * k); g.translate(OPAD, OPAD);
      return c;
    }
    // One painted part on its own layer (fill, shading, pencil grain, then ink),
    // so the grain never dulls the ink of the parts under it.
    function part(dst, path, fill, deep, seed, o) {
      o = o || {};
      var c = sheet(), g = c.getContext('2d');
      path(g); g.fillStyle = fill; g.fill();
      if (o.inside) { g.save(); g.clip(); o.inside(g); g.restore(); }
      Art.pencil(c, deep, seed, o.grain === undefined ? 0.75 : o.grain);
      if (o.ink !== 0) { path(g); Art.ink(g, o.ink || IW); g.stroke(); }
      if (o.over) o.over(g);
      var d = dst.getContext('2d');
      d.save(); d.setTransform(1, 0, 0, 1, 0, 0); d.drawImage(c, 0, 0); d.restore();
    }
    function ell(x, y, rx, ry, rot) {
      return function (g) { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, TAU); };
    }
    function glow(g, x, y, r, a) {
      var gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,' + a + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    function shade(g, deep, y0, y1, a) {
      var gr = g.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, hexA(deep, 0)); gr.addColorStop(1, hexA(deep, a));
      g.fillStyle = gr; g.fillRect(-OPAD, y0, OW + 2 * OPAD, y1 - y0 + OPAD);
    }
    function hexA(hex, a) {
      var n = parseInt(hex.slice(1), 16);
      return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }

    // ---- the skirt: 4 tentacles peeking from behind, then 4 plump ones in front
    var BACK = [[9.5, 70, 10, 9.5, 0.5], [105.5, 70, 10, 9.5, -0.5], [34.5, 83.5, 9.5, 9.5, 0], [80.5, 83.5, 9.5, 9.5, 0]];
    var FRONT = [[21.5, 79.5, 13.5, 13, 0.22], [93.5, 79.5, 13.5, 13, -0.22], [45.5, 81.5, 13.5, 13, 0.06], [69.5, 81.5, 13.5, 13, -0.06]];
    function skirt(body, deep, lining, liningDeep, seed) {
      var c = sheet();
      function row(list, dark, s0) {
        // the lining of the other side shows under each tip
        list.forEach(function (b, i) {
          part(c, ell(b[0] + b[4] * 5, b[1] + 4.4, b[2] * 0.96, b[3] * 0.96, b[4]), lining, liningDeep, s0 + i, { ink: IW * 0.8, grain: 0.5 });
        });
        list.forEach(function (b, i) {
          part(c, ell(b[0], b[1], b[2], b[3], b[4]), body, deep, s0 + 4 + i, {
            ink: IW * 0.85,
            inside: function (g) {
              if (dark) { g.fillStyle = hexA(deep, 0.4); g.fillRect(-OPAD, 0, OW + 2 * OPAD, OH + OPAD); }
              else { shade(g, deep, b[1] - 2, b[1] + b[3], 0.3); glow(g, b[0] - b[2] * 0.3, b[1] - b[3] * 0.25, b[2] * 0.7, 0.3); }
            }
          });
        });
      }
      row(BACK, true, seed);
      row(FRONT, false, seed + 8);
      // where the tentacles join, under the head
      part(c, ell(cx, 67, 40, 11), body, deep, seed + 17, {
        ink: 0, inside: function (g) { g.fillStyle = hexA(deep, 0.35); g.fillRect(-OPAD, 0, OW + 2 * OPAD, OH); }
      });
      return c;
    }

    // ---- the head and its three faces
    function headPath(g) {
      g.beginPath();
      g.moveTo(17.5, 44);
      g.bezierCurveTo(15.5, 14, 37, 3.5, cx, 3.5);
      g.bezierCurveTo(78, 3.5, 99.5, 14, 97.5, 44);
      g.bezierCurveTo(96.5, 63, 81, OHD, cx, OHD);
      g.bezierCurveTo(34, OHD, 18.5, 63, 17.5, 44);
      g.closePath();
    }
    function head(body, deep, seed, mood) {
      var c = sheet();
      part(c, headPath, body, deep, seed, {
        inside: function (g) {
          shade(g, deep, 40, 76, 0.38);
          glow(g, 40, 22, 30, 0.42);
          g.fillStyle = 'rgba(255,255,255,0.3)';
          g.beginPath(); g.ellipse(36, 17, 9.5, 5.2, -0.55, 0, TAU); g.fill();
        }
      });
      var g = c.getContext('2d'), ex = 18.5, INK = Art.PAL.ink;
      function cheeks(rx, ry) {
        g.fillStyle = OCTO.cheek;
        g.beginPath(); g.ellipse(cx - 30, 56.5, rx, ry, 0, 0, TAU); g.ellipse(cx + 30, 56.5, rx, ry, 0, 0, TAU); g.fill();
      }
      if (mood === 'grumpy') {
        // puffed, sulky cheeks
        g.fillStyle = hexA(OCTO.blueDeep, 0.28);
        g.beginPath(); g.ellipse(cx - 30, 58, 7, 4.6, 0, 0, TAU); g.ellipse(cx + 30, 58, 7, 4.6, 0, 0, TAU); g.fill();
        [-1, 1].forEach(function (sd) {
          var x = cx + sd * ex, y = 47.5;
          // the eye, with a heavy lid over its top half: droopy, sleepy-grumpy
          g.fillStyle = INK; g.beginPath(); g.ellipse(x, y, 6.2, 6.8, 0, 0, TAU); g.fill();
          g.save();
          g.beginPath(); g.ellipse(x, y, 7.4, 8, 0, 0, TAU); g.clip();
          g.fillStyle = OCTO.blueLid;
          g.beginPath();
          g.moveTo(x - sd * 9, y - 10); g.lineTo(x + sd * 9, y - 10);
          g.lineTo(x + sd * 9, y - 0.3); g.lineTo(x - sd * 9, y + 0.7);
          g.closePath(); g.fill();
          g.restore();
          g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x + 1.8, y + 2.6, 1.5, 0, TAU); g.fill();
          Art.ink(g, ID);
          g.beginPath(); g.moveTo(x - sd * 8.6, y + 0.8); g.lineTo(x + sd * 8.8, y - 0.4); g.stroke();
          // a soft bag under the eye
          Art.ink(g, ID * 0.5); g.globalAlpha = 0.45;
          g.beginPath(); g.moveTo(x - 4.6, y + 9.4); g.quadraticCurveTo(x, y + 11, x + 4.6, y + 9.4); g.stroke();
          g.globalAlpha = 1;
        });
        // a small frown and a pouty lower lip
        Art.ink(g, ID);
        g.beginPath(); g.moveTo(cx - 7.6, 62.5); g.quadraticCurveTo(cx, 54, cx + 7.6, 62.5); g.stroke();
        Art.ink(g, ID * 0.7);
        g.beginPath(); g.moveTo(cx - 3, 65); g.quadraticCurveTo(cx, 66.8, cx + 3, 65); g.stroke();
      } else if (mood === 'giggle') {
        cheeks(7.6, 4.8);
        Art.ink(g, ID * 1.1);
        [-1, 1].forEach(function (sd) {
          var x = cx + sd * ex;
          g.beginPath(); g.moveTo(x - 6.8, 49.5); g.quadraticCurveTo(x, 38.5, x + 6.8, 49.5); g.stroke();
        });
        var mouth = function () {
          g.beginPath(); g.moveTo(cx - 11, 52.5);
          g.bezierCurveTo(cx - 9.5, 68.5, cx + 9.5, 68.5, cx + 11, 52.5);
          g.quadraticCurveTo(cx, 55.5, cx - 11, 52.5); g.closePath();
        };
        mouth(); g.fillStyle = OCTO.mouth; g.fill();
        g.save(); g.clip();
        g.fillStyle = OCTO.tongue; g.beginPath(); g.ellipse(cx, 65.5, 6.2, 4.2, 0, 0, TAU); g.fill();
        g.restore();
        mouth(); Art.ink(g, ID); g.stroke();
      } else {
        cheeks(6.6, 4.1);
        [-1, 1].forEach(function (sd) {
          var x = cx + sd * ex, y = 47;
          g.fillStyle = INK; g.beginPath(); g.ellipse(x, y, 5.8, 6.8, 0, 0, TAU); g.fill();
          g.fillStyle = '#ffffff';
          g.beginPath(); g.arc(x + 1.7, y - 2.5, 2.1, 0, TAU); g.fill();
          g.beginPath(); g.arc(x - 1.9, y + 2.4, 0.95, 0, TAU); g.fill();
        });
        Art.ink(g, ID);
        g.beginPath(); g.moveTo(cx - 6.6, 53); g.quadraticCurveTo(cx, 61.5, cx + 6.6, 53); g.stroke();
      }
      return c;
    }

    // ---- the pop: a ring of red and pink sparkles and dots
    function burst() {
      var s = 3.4 * h, c = Art.makeCanvas(s * dpr, s * dpr), g = c.getContext('2d');
      c.lw = s; c.lh = s;
      g.scale(dpr, dpr); g.translate(s / 2, s / 2);
      var rand = Art.rng(77), n = 12, i;
      for (i = 0; i < n; i++) {
        var a = i / n * TAU + (rand() - 0.5) * 0.25, r = h * (0.98 + (i % 2) * 0.3 + rand() * 0.1);
        var x = Math.cos(a) * r, y = Math.sin(a) * r, q = h * (i % 2 ? 0.1 : 0.15);
        g.fillStyle = OCTO.burst[i % OCTO.burst.length];
        g.beginPath();
        if (i % 3 === 2) g.arc(x, y, q * 0.55, 0, TAU);
        else {
          // a chubby 4-point sparkle
          g.save(); g.translate(x, y); g.rotate(a + 0.4);
          g.moveTo(0, -q);
          g.quadraticCurveTo(q * 0.22, -q * 0.22, q, 0); g.quadraticCurveTo(q * 0.22, q * 0.22, 0, q);
          g.quadraticCurveTo(-q * 0.22, q * 0.22, -q, 0); g.quadraticCurveTo(-q * 0.22, -q * 0.22, 0, -q);
          g.restore();
        }
        g.fill();
        Art.ink(g, Math.max(1, h * 0.016)); g.stroke();
      }
      return c;
    }

    oc = {
      h: h, k: k,
      skirt: {
        blue: skirt(OCTO.blue, OCTO.blueDeep, OCTO.red, OCTO.redDeep, 30),
        red: skirt(OCTO.red, OCTO.redDeep, OCTO.blue, OCTO.blueDeep, 50)
      },
      head: {
        blue: head(OCTO.blue, OCTO.blueDeep, 31, 'grumpy'),
        red: head(OCTO.red, OCTO.redDeep, 32, 'happy'),
        giggle: head(OCTO.red, OCTO.redDeep, 32, 'giggle')
      },
      burst: burst()
    };
  }

  // A damped spring from 0 to 1 (p 0..1): it overshoots, then settles.
  function octSpring(p, damp, freq) { return 1 - Math.exp(-damp * p) * Math.cos(freq * p); }
  // pose = {t, side, flip, giggle}: see the header.
  function drawOctopus(g, x, y, pose) {
    if (!oc) return;
    var t = pose.t || 0, f = pose.flip || 0, gig = pose.giggle || 0, h = oc.h;
    var side = pose.side === 'red' ? 'red' : 'blue', other = side === 'red' ? 'blue' : 'red';
    f = f < 0 ? 0 : f > 1 ? 1 : f;
    var show = f < 0.5 ? side : other;
    var br = Math.sin(t * 2.6);
    var sx = 1 + 0.03 * br, sy = 1 - 0.03 * br, rot = 0, hop = 0;
    var hsx = 1, hsy = 1, hy = 0, ssx = 1 + 0.035 * Math.sin(t * 3.4 + 1), ssy = 1, skin = show, burstP = -1;
    if (f > 0 && f < 1) {
      if (f < 0.5) {
        // the head sinks and the tentacles fold up around it, lining out
        var q = f / 0.5, e = q * q * (3 - 2 * q);
        hsx = 1 + 0.3 * e; hsy = 1 - 0.72 * e;
        ssy = 1 - 2.5 * e; ssx *= 1 + 0.14 * e;
        if (ssy < 0) skin = other;
        sx *= 1 + 0.06 * e; sy *= 1 - 0.1 * e;
        rot = Math.sin(t * 40) * 0.05 * (1 - e);
      } else {
        // the pop: the new head jumps out of the cup and the tentacles fall back
        var p = (f - 0.5) / 0.5, b = octSpring(p, 5, 9), sb = octSpring(p, 6, 7);
        var big = 1 + 0.26 * Math.sin(Math.PI * Math.min(1, p * 1.5)) * (1 - p);
        hsx = 1.3 - 0.3 * b; hsy = 0.28 + 0.72 * b;
        ssy = -1.5 + 2.5 * sb; ssx *= 1.14 - 0.14 * sb;
        sx *= big * (1.06 - 0.06 * b); sy *= big * (0.9 + 0.1 * b);
        hop = -Math.sin(Math.PI * p) * h * 0.1;
        burstP = p;
      }
    }
    var laugh = show === 'red' && (gig > 0.3 || burstP >= 0);
    if (gig > 0 && show === 'red') {
      rot += Math.sin(t * 28) * 0.13 * gig;
      sy *= 1 + 0.05 * gig * Math.sin(t * 19);
      hy = -Math.abs(Math.sin(t * 14)) * h * 0.035 * gig;
    } else if (show === 'blue' && f === 0) {
      rot = Math.sin(t * 1.3) * 0.035;                 // a slow sulky sway
    }
    var sk = oc.skirt[skin], hd = show === 'blue' ? oc.head.blue : (laugh ? oc.head.giggle : oc.head.red);
    var k = oc.k, lw = sk.lw, lh = sk.lh, py = (OSK - OH / 2) * k, ph = (OHD - OH / 2) * k;
    g.save();
    g.translate(x, y + hop);
    if (burstP >= 0) {
      var bs = 0.42 + 0.6 * (1 - (1 - burstP) * (1 - burstP)), bw = oc.burst.lw * bs;
      g.globalAlpha = burstP < 0.12 ? burstP / 0.12 : Math.min(1, (1 - burstP) * 1.8);
      g.rotate(burstP * 0.5);
      g.drawImage(oc.burst, -bw / 2, -bw / 2, bw, bw);
      g.rotate(-burstP * 0.5);
      g.globalAlpha = 1;
    }
    if (rot) g.rotate(rot);
    g.scale(sx, sy);
    if (ssy >= 0) {
      g.save(); g.translate(0, py); g.scale(ssx, ssy < 0.04 ? 0.04 : ssy);
      g.drawImage(sk, -lw / 2, -lh / 2 - py, lw, lh);
      g.restore();
    }
    g.save(); g.translate(0, ph + hy); g.scale(hsx, hsy);
    g.drawImage(hd, -lw / 2, -lh / 2 - ph, lw, lh);
    g.restore();
    if (ssy < 0) {
      g.translate(0, py); g.scale(ssx, ssy > -0.04 ? -0.04 : ssy);
      g.drawImage(sk, -lw / 2, -lh / 2 - py, lw, lh);
    }
    g.restore();
  }

  window.Friends = { KINDS: KINDS, build: build, draw: draw, buildOctopus: buildOctopus, octopus: drawOctopus };
})();
