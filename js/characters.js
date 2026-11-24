/* characters.js - Bella (pink unicorn toy) and Bongo (teddy in blue crocheted
 * overall shorts), drawn from scratch as an animated cut-out puppet rig.
 *
 * Shapes are traced from assets/bella.png and assets/bongo.png and drawn in the
 * style of the bedroom-wall mural, like the rest of the world (js/art.js): flat
 * colored-pencil fills with a visible grain (Art.pencil), a little lighter at
 * the edges, and dark, slightly uneven ink outlines (Art.ink). The faces stay
 * those of the toys: Bella's blue eye with lashes, Bongo's black bead eyes, and
 * both smile.
 *
 * Every part is pre-rendered once into its own sprite; the grain is baked in
 * there, never per frame. Per frame, draw() places cached sprites with
 * translate / rotate around joints and adds a few small live paths: Bella's
 * four legs (jointed: upper leg, knee / hock, cannon, fetlock; one path each,
 * so the joints never show seams; filled with a cached pencil-grain pattern),
 * eyes and smiles.
 * Classic script: window.Characters. Needs window.Art (js/art.js) loaded first.
 *
 *   Characters.W, Characters.H          rig frame size (rig units)
 *   Characters.prerender(pxPerUnit)     build / fetch cache (2 most recent scales)
 *   Characters.draw(g, pose, pxPerUnit) pose = {t, run, wave, happy, look, glow, face}
 *   Characters.anchors                  named points (rig units, rest pose)
 *
 * Authoring conventions: Bella is authored in "bella.png space" (657x700,
 * facing right) and mapped into the rig with R(); Bongo in "bongo.png space"
 * (519x700) mapped with B(). Sprite-local coordinates have the joint at (0,0).
 */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var W = 1000, H = 1100;
  var PAD = 20;                          // sprite margin for the ink line (rig units)

  // png-space -> rig mapping
  var SK = 1.28, SX = 50, SY = 200;      // Bella
  var BK = 0.68, BX = 268, BY = 178;     // Bongo
  function R(x, y) { return [x * SK + SX, y * SK + SY]; }
  function B(x, y) { return [x * BK + BX, y * BK + BY]; }

  // ------------------------------------------------------------ palette
  var Art = window.Art, INK = Art.PAL.ink;
  var INK_RGB = [1, 3, 5].map(function (i) { return parseInt(INK.substr(i, 2), 16); }).join(',');
  var C = {
    pBase: '#e7b3d2', pDeep: '#b877ad', pFar: '#d39cc0',
    hoof: '#dc86b2', hoofFar: '#c878a6', hoofDeep: '#a9558d',
    mane: '#f784b8', maneHi: '#ffd0e4', maneDeep: '#d9478f',
    fur: '#f8eed8', furFar: '#e9d9b8', furDeep: '#c9aa78',
    blue: '#2b6cb0', blueDark: '#17447c'
  };
  // ink line widths: silhouette / inner lines, in Bella's png space, Bongo's
  // space and rig units (all about 7 and 4.5 rig units)
  var LW = 5.5, LI = 3.5, BW = 10.3, BI = 6.6, RW = 7;

  // ------------------------------------------------------------ helpers
  function cv(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Smooth closed path through points (Catmull-Rom -> bezier), starts a new path.
  function smooth(g, pts, f, noBegin) {
    f = f === undefined ? 0.18 : f;
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

  // Points along the same smooth closed curve (k samples per segment).
  function samplePath(pts, f, k) {
    var n = pts.length, out = [], i, j;
    for (i = 0; i < n; i++) {
      var p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      var c1x = p1[0] + (p2[0] - p0[0]) * f, c1y = p1[1] + (p2[1] - p0[1]) * f;
      var c2x = p2[0] - (p3[0] - p1[0]) * f, c2y = p2[1] - (p3[1] - p1[1]) * f;
      for (j = 0; j < k; j++) {
        var t = j / k, u = 1 - t;
        out.push([u * u * u * p1[0] + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * p2[0],
          u * u * u * p1[1] + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * p2[1]]);
      }
    }
    return out;
  }

  function clockwise(pts) {             // same winding as g.arc(), so unions fill solid
    var a = 0, n = pts.length;
    for (var i = 0; i < n; i++) { var p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; }
    return a >= 0 ? pts : pts.slice().reverse();
  }

  function circlesPath(g, cs, noBegin) {
    if (!noBegin) g.beginPath();
    for (var i = 0; i < cs.length; i++) {
      g.moveTo(cs[i][0] + cs[i][2], cs[i][1]);
      g.arc(cs[i][0], cs[i][1], cs[i][2], 0, TAU);
    }
  }

  function ellipsePath(g, x, y, rx, ry, rot) {
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
  }

  // ---- wall-style helpers (prerender only)
  // Paints one piece on its own transparent layer, then lays it on g: lets a
  // piece grain its fill and ink its own silhouette without touching what is
  // already on the sprite. paint(lg) gets a context with g's transform.
  function layer(g, paint) {
    var c = cv(g.canvas.width, g.canvas.height), lg = c.getContext('2d');
    lg.setTransform(g.getTransform());
    lg.lineJoin = 'round'; lg.lineCap = 'round';
    paint(lg);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(c, 0, 0);
    g.restore();
  }
  // Pencil grain over everything painted so far on g's canvas. The canvas has
  // no .lw yet, so Art.pencil sizes the grain for the device pixel ratio: it
  // looks the same as on the world's sprites, whatever the rig scale.
  function grain(g, color, seed, strength) { Art.pencil(g.canvas, color, seed, strength); }
  // Ink line on top of the path: stroked twice, the second pass thinner and a
  // hair off, so the line is slightly uneven. path() must begin the path.
  function inkLine(g, path, w, seed) {
    var rnd = mulberry(seed * 7 + 3);
    Art.ink(g, w);
    path(); g.stroke();
    g.save();
    g.translate((rnd() - 0.5) * w * 0.7, (rnd() - 0.5) * w * 0.7);
    g.lineWidth = w * 0.6;
    path(); g.stroke();
    g.restore();
  }
  // Ink line AROUND what is painted (stroked behind the fill): for unions of
  // overlapping shapes, whose inner lines must not show. w = visible width.
  function inkAround(g, path, w, seed) {
    var rnd = mulberry(seed * 7 + 3);
    g.save();
    g.globalCompositeOperation = 'destination-over';
    Art.ink(g, w * 2);
    path(); g.stroke();
    g.translate((rnd() - 0.5) * w * 0.8, (rnd() - 0.5) * w * 0.8);
    path(); g.stroke();
    g.restore();
  }
  // The fill a little lighter along its edge, w wide.
  function paleEdge(g, path, w, a) {
    g.save();
    path(); g.clip();
    path();
    g.lineWidth = w * 2; g.strokeStyle = 'rgba(255,252,244,' + a + ')'; g.lineJoin = 'round';
    g.stroke();
    g.restore();
  }

  function dot(g, x, y, r, fill) {
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = fill; g.fill();
  }

  function lin(g, x0, y0, x1, y1, stops) {
    var gr = g.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < stops.length; i++) gr.addColorStop(stops[i][0], stops[i][1]);
    return gr;
  }

  function rad(g, x, y, r0, r1, stops) {
    var gr = g.createRadialGradient(x, y, r0, x, y, r1);
    for (var i = 0; i < stops.length; i++) gr.addColorStop(stops[i][0], stops[i][1]);
    return gr;
  }

  function softSpot(g, x, y, r, rgb, a) {
    g.fillStyle = rad(g, x, y, 0, r, [[0, 'rgba(' + rgb + ',' + a + ')'], [1, 'rgba(' + rgb + ',0)']]);
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // tiny embossed 6-petal "snowflake" flower, the pattern on Bella's coat
  function snow(g, x, y, r, a) {
    g.fillStyle = 'rgba(255,255,255,' + a + ')';
    g.beginPath();
    g.arc(x, y, r * 0.55, 0, TAU);
    for (var k = 0; k < 6; k++) {
      var an = k * TAU / 6;
      g.moveTo(x + Math.cos(an) * r + r * 0.42, y + Math.sin(an) * r);
      g.arc(x + Math.cos(an) * r, y + Math.sin(an) * r, r * 0.42, 0, TAU);
    }
    g.fill();
  }

  // coat pattern: sparse bigger snowflakes + many tiny ones, inside a clip
  function coatDots(g, seed, x0, y0, x1, y1, nBig, nSmall, skip) {
    var rnd = mulberry(seed), i, x, y;
    for (i = 0; i < nSmall; i++) {
      x = x0 + rnd() * (x1 - x0); y = y0 + rnd() * (y1 - y0);
      if (skip && skip(x, y)) continue;
      snow(g, x, y, 1.3 + rnd() * 1.1, 0.5 + rnd() * 0.35);
    }
    for (i = 0; i < nBig; i++) {
      x = x0 + rnd() * (x1 - x0); y = y0 + rnd() * (y1 - y0);
      if (skip && skip(x, y)) continue;
      snow(g, x, y, 2.9 + rnd() * 1.5, 0.72 + rnd() * 0.25);
    }
  }

  // petal flower; iw = width of an ink line around the petals (none if omitted)
  function flower(g, x, y, r, petal, center, n, iw) {
    n = n || 5;
    var cs = [];
    for (var k = 0; k < n; k++) {
      var a = k * TAU / n - Math.PI / 2;
      cs.push([x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.5]);
    }
    circlesPath(g, cs);
    if (iw) { Art.ink(g, iw * 2); g.stroke(); }
    g.fillStyle = petal; g.fill();
    dot(g, x, y, r * 0.38, center);
  }

  // ------------------------------------------------------- sprite builder
  // bb = local bounding box [x0,y0,x1,y1] (joint at 0,0). draw(g) paints in
  // local coords. Result: canvas with .ox/.oy/.lw/.lh.
  function makeSpr(ppu, bb, draw, res) {
    res = res || 1;
    var x0 = bb[0] - PAD, y0 = bb[1] - PAD, w = bb[2] - bb[0] + PAD * 2, h = bb[3] - bb[1] + PAD * 2;
    var c = cv(w * ppu * res, h * ppu * res), g = c.getContext('2d');
    g.scale(c.width / w, c.height / h);
    g.translate(-x0, -y0);
    g.lineJoin = 'round'; g.lineCap = 'round';
    draw(g);
    c.ox = x0; c.oy = y0; c.lw = w; c.lh = h;
    return c;
  }

  // part authored in bella.png space; pivot in png coords
  function sPart(ppu, pivot, bb, draw) {
    var pv = R(pivot[0], pivot[1]), a = R(bb[0], bb[1]), b = R(bb[2], bb[3]);
    var spr = makeSpr(ppu, [a[0] - pv[0], a[1] - pv[1], b[0] - pv[0], b[1] - pv[1]], function (g) {
      g.translate(-pv[0], -pv[1]); g.translate(SX, SY); g.scale(SK, SK); draw(g);
    });
    return { s: spr, x: pv[0], y: pv[1] };
  }

  function bPart(ppu, pivot, bb, draw) {
    var pv = B(pivot[0], pivot[1]), a = B(bb[0], bb[1]), b = B(bb[2], bb[3]);
    var spr = makeSpr(ppu, [a[0] - pv[0], a[1] - pv[1], b[0] - pv[0], b[1] - pv[1]], function (g) {
      g.translate(-pv[0], -pv[1]); g.translate(BX, BY); g.scale(BK, BK); draw(g);
    });
    return { s: spr, x: pv[0], y: pv[1] };
  }

  // ============================================================ BELLA ====
  // Short ink curls where one round tuft tucks behind the next, as on the
  // mural's clouds: for each circle, a short arc starting where its edge
  // dives under an earlier circle.
  function tuftCurls(g, cs, w, len) {
    var N = 40, i, j, k;
    function under(i, a) {
      var x = cs[i][0] + Math.cos(a) * cs[i][2], y = cs[i][1] + Math.sin(a) * cs[i][2];
      for (j = 0; j < i; j++) if (Math.hypot(x - cs[j][0], y - cs[j][1]) < cs[j][2] - 0.5) return true;
      return false;
    }
    Art.ink(g, w);
    for (i = 1; i < cs.length; i++) {
      var prev = under(i, 0);
      for (k = 1; k <= N; k++) {
        var a = k / N * TAU, cur = under(i, a);
        if (cur && !prev) { g.beginPath(); g.arc(cs[i][0], cs[i][1], cs[i][2], a - TAU / N, a + len); g.stroke(); }
        prev = cur;
      }
    }
  }

  // Fluffy mass made of circles (mane, tail): flat pencil fill, a few hair
  // strands, one ink line around the whole bunch.
  function fluff(g, cs, base, deep, light, seed, strands) {
    layer(g, function (g) {
      var rnd = mulberry(seed), i;
      function path() { circlesPath(g, cs); }
      path();
      g.fillStyle = base; g.fill();
      g.save();
      g.clip();
      g.lineCap = 'round';
      g.globalAlpha = 0.6;
      for (i = 0; i < (strands || 16); i++) {
        var c = cs[Math.floor(rnd() * cs.length)];
        var a = rnd() * TAU, d = rnd() * c[2] * 0.8;
        var x = c[0] + Math.cos(a) * d, y = c[1] + Math.sin(a) * d;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x - 8 + rnd() * 6, y + 12 + rnd() * 8, x - 4 + rnd() * 14, y + 26 + rnd() * 14);
        g.lineWidth = 2.2 + rnd() * 1.8;
        g.strokeStyle = rnd() < 0.5 ? light : deep;
        g.stroke();
      }
      g.restore();
      paleEdge(g, path, 5, 0.3);
      grain(g, deep, seed);
      tuftCurls(g, cs, LI * 0.9, 0.75);
      inkAround(g, path, LW, seed);
    });
  }

  function drawMane(g) {
    fluff(g, [[480, 72, 15], [458, 82, 20], [436, 100, 24], [417, 125, 26], [404, 154, 26], [398, 184, 23],
      [402, 210, 17], [410, 228, 11]], C.mane, C.maneDeep, C.maneHi, 5);
  }
  // white-lilac tinsel cloud of the tail
  function drawTailClear(g) {
    fluff(g, [[92, 300, 52], [66, 338, 40], [108, 256, 34], [84, 378, 36], [122, 372, 36], [52, 298, 26], [128, 292, 36], [134, 240, 20]],
      '#f3eaf8', '#b49ad2', '#ffffff', 9, 22);
  }
  function drawTailPink(g) {
    fluff(g, [[140, 286, 22], [126, 318, 27], [124, 354, 27], [116, 386, 20], [146, 262, 15],
      [104, 340, 20], [118, 296, 18]], C.mane, C.maneDeep, C.maneHi, 7, 18);
  }

  // Bella's torso (traced): rounded rump on the left, deep chest on the right
  var BODY = [[190, 251], [158, 258], [135, 281], [123, 320], [127, 365], [148, 394], [200, 404], [270, 403],
    [340, 403], [410, 401], [465, 397], [508, 379], [532, 346], [538, 310], [529, 279], [506, 255],
    [462, 236], [410, 234], [350, 256], [300, 261], [240, 254]];

  function drawBody(g) {
    function path() { smooth(g, BODY, 0.16); }
    path();
    g.fillStyle = C.pBase; g.fill();
    paleEdge(g, path, 9, 0.3);
    grain(g, C.pDeep, 21);
    g.save();
    path(); g.clip();
    coatDots(g, 21, 126, 250, 540, 405, 26, 90, function (x, y) { return Math.hypot(x - 464, y - 322) < 58; });
    g.restore();
    inkLine(g, path, LW, 21);
  }

  // Butterfly decal: one fused silhouette of four round wings (2 fore, 2 hind),
  // tilted like on the toy, centered at png (464,322). Builds the path only.
  var BF = [464, 322];
  function wingPath(g) {
    g.save();
    g.translate(BF[0], BF[1]); g.rotate(0.42); g.scale(0.98, 0.98);
    g.beginPath();
    g.moveTo(0, -2); g.bezierCurveTo(8, -34, 44, -44, 50, -22); g.bezierCurveTo(54, -6, 30, 4, 0, 5); g.closePath();
    g.moveTo(0, 5); g.bezierCurveTo(26, 6, 40, 24, 28, 38); g.bezierCurveTo(16, 46, 2, 30, 0, 14); g.closePath();
    g.moveTo(0, -2); g.lineTo(0, 5); g.bezierCurveTo(-30, 4, -54, -6, -50, -22); g.bezierCurveTo(-44, -44, -8, -34, 0, -2); g.closePath();
    g.moveTo(0, 5); g.lineTo(0, 14); g.bezierCurveTo(-2, 30, -16, 46, -28, 38); g.bezierCurveTo(-40, 24, -26, 6, 0, 5); g.closePath();
    g.restore();
  }

  // The decal is its own sprite: the colored light is only a halo BEHIND it,
  // so the wings always stay cream with their rainbow rim.
  function drawButterfly(g) {
    g.lineJoin = 'round';
    // ink around the rim, then the rainbow rim: red, orange, yellow bands; blue on the left side
    wingPath(g); Art.ink(g, 12.5 + LI * 1.5); g.stroke();
    [['#e8574a', 12.5], ['#f4a13a', 9], ['#f7dc50', 5.6]].forEach(function (b) {
      wingPath(g); g.strokeStyle = b[0]; g.lineWidth = b[1]; g.stroke();
    });
    g.save();
    g.beginPath(); g.rect(380, 250, 80, 150); g.clip();
    wingPath(g); g.strokeStyle = '#4ab0e8'; g.lineWidth = 9; g.stroke();
    wingPath(g); g.strokeStyle = '#8fd0f2'; g.lineWidth = 5.6; g.stroke();
    g.restore();
    // cream wings
    wingPath(g);
    g.fillStyle = '#fbf5df';
    g.fill();
    grain(g, '#c9a85e', 8, 0.55);
    // veins + body
    g.save();
    g.translate(BF[0], BF[1]); g.rotate(0.42); g.scale(0.98, 0.98);
    g.lineCap = 'round'; g.lineWidth = 1.5; g.strokeStyle = 'rgba(150,116,84,0.6)';
    [[20, -12, 42, -27], [18, -6, 44, -10], [14, 14, 25, 29], [-20, -12, -42, -27], [-18, -6, -44, -10], [-14, 14, -23, 29]].forEach(function (v) {
      g.beginPath(); g.moveTo(v[0] * 0.3, v[1] * 0.3); g.lineTo(v[2], v[3]); g.stroke();
    });
    g.restore();
    wingPath(g); Art.ink(g, LI * 0.55); g.stroke();
    g.save();
    g.translate(BF[0], BF[1]); g.rotate(0.42); g.scale(0.98, 0.98);
    g.beginPath(); g.ellipse(0, 6, 3.6, 22, 0, 0, TAU);
    g.fillStyle = '#eadcb8'; g.fill();
    Art.ink(g, LI * 0.6); g.stroke();
    g.restore();
    // little flowers around the decal
    flower(g, 424, 289, 9.5, '#ef5f8c', '#ffd25a', 5, LI * 0.6);
    flower(g, 436, 272, 5, '#a78bd6', '#ffe08a', 5);
    dot(g, 505, 300, 3.6, '#2fb5b0'); dot(g, 511, 320, 3, '#5aa6e0');
    flower(g, 500, 356, 6, '#5b6fb0', '#f3d46a', 5);
    flower(g, 462, 368, 5, '#6a6fb0', '#f3d46a', 5);
    dot(g, 421, 340, 3.2, '#f2c24a');
  }

  // Neck + head (one piece, traced). Pivot at the middle of the collar line.
  // The neck rises almost straight up with a gentle arch; the head hangs
  // forward and down, with a rounded, slightly darker muzzle.
  var NECK = [[401, 236], [402, 205], [409, 172], [423, 138], [444, 106], [472, 80], [502, 63], [530, 57],
    [553, 63], [570, 77], [581, 97], [590, 118], [600, 138], [613, 151], [627, 160], [633, 173],
    [630, 187], [621, 198], [605, 204], [589, 201], [577, 193], [562, 192], [546, 189], [531, 181],
    [518, 187], [509, 206], [510, 234], [519, 258], [527, 280], [508, 262], [462, 248]];

  function collarAt(t, up) {              // point on the collar curve, shifted "up" along the neck
    var a = [401, 236], b = [468, 244], c = [527, 281];
    var x = (1 - t) * (1 - t) * a[0] + 2 * t * (1 - t) * b[0] + t * t * c[0];
    var y = (1 - t) * (1 - t) * a[1] + 2 * t * (1 - t) * b[1] + t * t * c[1];
    return [x - up * 0.25, y - up];
  }
  function collarLine(g, up) {
    g.beginPath();
    for (var i = 0; i <= 12; i++) { var p = collarAt(i / 12, up); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }
  }

  function drawNeckHead(g) {
    var i;
    // ear: pointed but rounded, standing up behind the horn base
    var ear = [[516, 68], [520, 46], [533, 27], [544, 38], [551, 60], [538, 74]];
    var earIn = [[524, 62], [527, 47], [534, 37], [540, 46], [543, 60], [534, 66]];
    layer(g, function (g) {
      function earPath() { smooth(g, ear, 0.2); }
      earPath();
      g.fillStyle = C.pBase; g.fill();
      smooth(g, earIn, 0.2);
      g.fillStyle = '#e58fb8'; g.fill();
      grain(g, C.pDeep, 31);
      inkLine(g, earPath, LW * 0.9, 31);
    });
    layer(g, function (g) {
      function neckPath() { smooth(g, NECK, 0.15); }
      neckPath();
      g.fillStyle = C.pBase; g.fill();
      g.save();
      g.clip();
      // light watercolor: the muzzle a touch deeper, a blush below the eye
      softSpot(g, 612, 180, 34, '212,112,164', 0.5);
      softSpot(g, 566, 158, 21, '255,110,160', 0.4);
      // collar band, sitting just above the collar line
      g.lineCap = 'round'; g.lineJoin = 'round';
      collarLine(g, 10);
      g.lineWidth = 21; g.strokeStyle = '#f29cc6'; g.stroke();
      g.restore();
      paleEdge(g, neckPath, 7, 0.3);
      grain(g, C.pDeep, 33);
      g.save();
      neckPath(); g.clip();
      coatDots(g, 33, 404, 100, 520, 222, 7, 20, function (x, y) { return y < 150 && x > 440 && x < 520; });
      collarLine(g, 21); Art.ink(g, LI * 0.7); g.stroke();
      g.restore();
      inkLine(g, neckPath, LW, 33);
    });

    // small nostril near the muzzle tip
    ellipsePath(g, 619, 169, 3, 4.4, 0.55);
    g.fillStyle = INK; g.fill();
    // brow garland of tiny embossed flowers (poll -> horn base)
    for (i = 0; i < 5; i++) flower(g, 522 + i * 8.4, 73 + i * 3.6, 4.8, '#fbc4dc', '#fff2f8', 5);
    // colored flower gems on the cheek and neck (pink, yellow, teal)
    flower(g, 506, 90, 9.5, '#f0507e', '#ffc3d3', 6, LI * 0.55);
    g.save(); g.translate(474, 105); g.rotate(-0.35);       // yellow butterfly-shaped gem
    circlesPath(g, [[-6, -4, 6], [6, -4, 6], [-4.5, 5, 4.4], [4.5, 5, 4.4]]);
    Art.ink(g, LI * 1.1); g.stroke();
    g.fillStyle = '#ffd23f'; g.fill();
    dot(g, 0, 0, 2.6, '#f0a020'); g.restore();
    flower(g, 458, 127, 9.5, '#22aeb0', '#9eeee8', 6, LI * 0.55);
    // white flowers along the collar band
    for (i = 0; i < 9; i++) {
      var fp = collarAt(0.06 + i * 0.105, 11);
      flower(g, fp[0], fp[1], 5.6, '#fff8fc', i % 3 === 1 ? '#ffd24a' : '#f06fa8', 5);
    }
  }

  // Horn, tinted: color c ([r,g,b]); long slim spiral cone from the forehead
  var HORN_PNG = [569, 78], HORN_ANG = -0.74, HORN_LEN = 76;
  function drawHorn(g, c) {
    g.save();
    g.translate(HORN_PNG[0], HORN_PNG[1]);
    g.rotate(HORN_ANG);
    function cone() {
      g.beginPath();
      g.moveTo(-3, -13);
      g.lineTo(HORN_LEN, -2.2);
      g.arc(HORN_LEN, 0, 2.2, -Math.PI / 2, Math.PI / 2);
      g.lineTo(-3, 13);
      g.quadraticCurveTo(-10, 0, -3, -13);
      g.closePath();
    }
    cone();
    g.fillStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
    g.fill();
    g.save(); g.clip();
    g.lineWidth = 3.6; g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineCap = 'round';
    for (var k = 0; k < 7; k++) {                      // spiral bands
      g.beginPath();
      g.moveTo(4 + k * 11, -15); g.quadraticCurveTo(12 + k * 11, 0, 12 + k * 11, 15);
      g.stroke();
    }
    g.restore();
    grain(g, '#7d4f92', 3, 0.55);                     // one grain color for all 24 tints
    inkLine(g, cone, LI * 0.9, 3);
    g.restore();
  }

  // Hoof (rig units; origin = fetlock joint, leg comes from above, toe forward)
  function drawHoof(g, far) {
    var pts = [[-18, -8], [-22, 16], [-20, 40], [2, 46], [31, 45], [38, 36], [28, 12], [18, -9], [0, -14]];
    function path() { smooth(g, pts, 0.17); }
    path();
    g.fillStyle = far ? C.hoofFar : C.hoof;
    g.fill();
    paleEdge(g, path, 5, far ? 0.12 : 0.28);
    grain(g, C.hoofDeep, far ? 6 : 5);
    inkLine(g, path, RW * 0.9, 5);
  }

  // Pencil-grain tile that fills Bella's live leg paths (see legDraw). Its
  // side is one period of Art.pencil's grain, so the pattern repeats seamlessly.
  function legTile(color, deep, seed) {
    var t = Math.round(128 * Math.min(2, window.devicePixelRatio || 1));
    var c = cv(t, t), g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, t, t);
    Art.pencil(c, deep, seed);
    return g.createPattern(c, 'repeat');
  }

  // ============================================================= BONGO ====
  // Sherpa-fleece shape: a smooth blob whose silhouette is scalloped with
  // round tufts (like the mural's clouds), cream pencil fill, a few pencil
  // curls inside, one ink line around it.
  function furShape(g, pts, f, seed, o) {
    o = o || {};
    pts = clockwise(pts);
    var rnd = mulberry(seed), i;
    var poly = samplePath(pts, f, 10), n = poly.length;
    var cx = 0, cy = 0, minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (i = 0; i < n; i++) {
      cx += poly[i][0]; cy += poly[i][1];
      minx = Math.min(minx, poly[i][0]); maxx = Math.max(maxx, poly[i][0]);
      miny = Math.min(miny, poly[i][1]); maxy = Math.max(maxy, poly[i][1]);
    }
    cx /= n; cy /= n;
    // tufts along the outline
    var tufts = [], acc = 0, next = 0, tr = o.tuft || 17;
    for (i = 0; i < n; i++) {
      var p = poly[i], q = poly[(i + 1) % n];
      acc += Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (acc >= next) {
        var r = tr * (0.8 + rnd() * 0.4);
        var dx = cx - p[0], dy = cy - p[1], d = Math.hypot(dx, dy) || 1;
        tufts.push([p[0] + dx / d * r * 0.62, p[1] + dy / d * r * 0.62, r]);
        next = acc + r * (1.25 + rnd() * 0.3);
      }
    }
    layer(g, function (g) {
      function whole() { g.beginPath(); smooth(g, pts, f, true); circlesPath(g, tufts, true); }
      whole();
      g.fillStyle = o.far ? C.furFar : C.fur; g.fill();
      g.save();
      g.clip();
      var w = maxx - minx, h = maxy - miny, big = Math.max(w, h);
      // light watercolor: a warmer tone low on one side
      softSpot(g, minx + w * 0.78, maxy - h * 0.06, big * 0.55, '204,166,116', o.shade === undefined ? 0.3 : o.shade);
      // a few pencil curls
      g.lineCap = 'round';
      var count = Math.round(w * h / (o.dens || 520));
      for (i = 0; i < count; i++) {
        var x = minx + rnd() * w, y = miny + rnd() * h, cr = 5 + rnd() * 5, a0 = rnd() * TAU, sw = 1.8 + rnd() * 1.6;
        g.beginPath(); g.arc(x, y, cr, a0, a0 + sw);
        g.lineWidth = 2.8; g.strokeStyle = 'rgba(160,122,78,' + (0.4 + rnd() * 0.25) + ')'; g.stroke();
      }
      g.restore();
      grain(g, C.furDeep, seed);
      inkAround(g, whole, o.ink || BW, seed);
    });
  }

  // Bongo rides in PROFILE (facing right, like Bella). Authored in the same
  // 519x700-ish space as the front head, so both head sprites share a scale.
  // capsule-like limb outline from S (root) to H (tip), half-widths w0 -> w1
  function limb(S, H, w0, w1) {
    var dx = H[0] - S[0], dy = H[1] - S[1], d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
    function P(t, w, k) { return [S[0] + dx * t + nx * w + ux * k, S[1] + dy * t + ny * w + uy * k]; }
    return [P(0, 0, -w0), P(0, -w0 * 0.75, -w0 * 0.6), P(0.3, -w0, 0), P(0.75, -w1, 0), P(1, -w1 * 0.8, w1 * 0.55), P(1, 0, w1),
      P(1, w1 * 0.8, w1 * 0.55), P(0.75, w1, 0), P(0.3, w0, 0), P(0, w0 * 0.75, -w0 * 0.6)];
  }
  var S_SHOULDER = [298, 334], S_HAND = [420, 380];
  var ARM_S = limb(S_SHOULDER, S_HAND, 36, 33);
  // near leg: hangs down Bella's flank from the cuff of the shorts, big round foot
  var LEG_S = [[262, 492], [346, 490], [360, 540], [384, 584], [398, 626], [372, 662], [300, 664], [262, 634], [254, 566]];

  // crochet stitches: staggered rows of little "v" loops
  function crochet(g, x0, y0, x1, y1, seed) {
    var rnd = mulberry(seed), r, x, row = 0;
    g.lineCap = 'round';
    g.lineWidth = 3.6; g.strokeStyle = C.blueDark;
    for (r = y0; r < y1; r += 15, row++) {
      var off = (row % 2) * 7.5;
      g.beginPath();
      for (x = x0 + off; x < x1; x += 15) {
        var jx = x + (rnd() - 0.5) * 2, jy = r + (rnd() - 0.5) * 2;
        g.moveTo(jx - 4.4, jy - 3.6); g.quadraticCurveTo(jx, jy + 5.5, jx + 4.4, jy - 3.6);
      }
      g.stroke();
    }
  }

  // Overall SHORTS seen from the side: bib on the tummy, strap over the
  // shoulder with a red button, open-mesh band, and the cuff the near leg comes out of.
  var OVER_S = [[150, 440], [154, 372], [176, 350], [226, 346], [254, 336], [260, 300], [266, 274], [302, 268], [338, 274],
    [352, 330], [360, 400], [362, 470], [366, 520], [352, 548], [300, 556], [248, 550], [196, 538], [162, 506]];

  function drawBongoTorsoSide(g) {
    var body = [[248, 230], [300, 240], [336, 282], [352, 352], [354, 432], [338, 504], [292, 538], [222, 542],
      [170, 512], [150, 440], [156, 350], [184, 274]];
    furShape(g, body, 0.17, 43, { shade: 0.25 });
    layer(g, function (g) {
      function strap() { g.beginPath(); g.moveTo(274, 288); g.quadraticCurveTo(232, 196, 168, 356); }
      function bib() { smooth(g, OVER_S, 0.13); }
      // strap: from the bib corner, over the shoulder, down the back
      g.lineCap = 'round'; g.lineJoin = 'round';
      strap();
      g.lineWidth = 25; g.strokeStyle = C.blue; g.stroke();
      bib();
      g.fillStyle = C.blue; g.fill();
      g.save(); g.clip();
      crochet(g, 140, 262, 376, 564, 77);
      // open-mesh band: the cream fur shows through the holes
      var mr = mulberry(12), r, cc, row = 0;
      for (r = 414; r <= 496; r += 20.5, row++) {
        for (cc = 0; cc < 12; cc++) {
          var hx = 154 + cc * 20.5 + (row % 2) * 10 + (mr() - 0.5) * 3, hy = r + (mr() - 0.5) * 3;
          dot(g, hx, hy, 7.6, C.blueDark);
          dot(g, hx, hy, 5.6, '#f1e6cd');
        }
      }
      // waistband, mesh edge and leg-cuff ridges
      g.lineWidth = 4; g.strokeStyle = C.blueDark;
      [346, 394, 516, 532].forEach(function (y) {
        g.beginPath(); g.moveTo(140, y); g.quadraticCurveTo(256, y + 6, 376, y); g.stroke();
      });
      g.restore();
      grain(g, '#123463', 77);
      g.save();                                 // ink edges of the strap, behind the blue
      g.globalCompositeOperation = 'destination-over';
      strap(); Art.ink(g, 25 + BI * 2); g.stroke();
      g.restore();
      inkLine(g, bib, BW * 0.9, 77);
    });
    // red button on the bib corner
    var bx = 278, by = 290;
    dot(g, bx, by, 18.5, INK);
    dot(g, bx, by, 14.5, '#e23c44');
    dot(g, bx - 3.8, by - 3.8, 2.3, INK); dot(g, bx + 3.8, by - 3.8, 2.3, INK);
    dot(g, bx - 3.8, by + 3.8, 2.3, INK); dot(g, bx + 3.8, by + 3.8, 2.3, INK);
  }

  function ring(x, y, rx, ry, n) {
    var pts = [], q;
    for (q = 0; q < n; q++) pts.push([x + Math.cos(q / n * TAU) * rx, y + Math.sin(q / n * TAU) * ry]);
    return pts;
  }
  // the tan inside of an ear
  function earInner(g, x, y, r) {
    ellipsePath(g, x, y + 2, r * 0.5, r * 0.52, 0);
    g.fillStyle = '#e3c9a0'; g.fill();
  }
  // Short-pile muzzle: smoother and paler than the fleece, thin ink line.
  function muzzle(g, m, seed) {
    layer(g, function (g) {
      function path() { ellipsePath(g, m[0], m[1], m[2], m[3], 0); }
      path();
      g.fillStyle = '#fdf6e6'; g.fill();
      grain(g, '#d9bd8e', seed, 0.6);
      inkLine(g, path, BI * 0.85, seed);
    });
  }
  function nose(g, pts, hx, hy, hr, ha) {
    smooth(g, pts, 0.2);
    g.fillStyle = '#241b21'; g.fill();
    Art.ink(g, BI * 0.6); g.stroke();
    ellipsePath(g, hx, hy, hr, hr * 0.4, ha);
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.fill();
  }

  // Profile head: round skull, the big pale muzzle sticking out in front with
  // the black nose on its tip, the near ear on the upper back of the head.
  var MZS = [378, 178, 60, 47];
  function drawBongoHeadSide(g) {
    furShape(g, ring(306, 46, 34, 34, 10), 0.18, 54, { tuft: 13, shade: 0.4 });       // far ear, peeking over
    furShape(g, ring(268, 142, 124, 114, 12), 0.18, 51, { shade: 0.26 });             // skull
    softSpot(g, 322, 188, 30, '246,140,150', 0.5);                                    // rosy cheek
    muzzle(g, MZS, 52);
    nose(g, [[410, 138], [426, 134], [440, 142], [444, 156], [434, 166], [420, 162], [410, 150]], 424, 142, 8, 0.2);
    // near ear on top, in front of the skull
    furShape(g, ring(204, 66, 42, 42, 10), 0.18, 53, { tuft: 13, shade: 0.2 });
    earInner(g, 206, 66, 42);
  }

  // Head (traced): big and round, wider than tall; round ears; a large round
  // pale muzzle low on the face with the black nose on its top edge.
  var HEAD = [[256, 30], [326, 40], [380, 80], [404, 140], [396, 196], [356, 238], [256, 256], [156, 238],
    [116, 196], [108, 140], [132, 80], [186, 40]];
  var MZ = [256, 168, 62, 55];
  function drawBongoHead(g) {
    furShape(g, ring(124, 108, 40, 40, 10), 0.18, 53, { tuft: 13, shade: 0.2 });
    earInner(g, 124, 108, 40);
    furShape(g, ring(388, 108, 40, 40, 10), 0.18, 54, { tuft: 13, shade: 0.2 });
    earInner(g, 388, 108, 40);
    furShape(g, HEAD, 0.18, 51, { shade: 0.26 });
    // rosy cheeks (always a little)
    softSpot(g, 172, 186, 30, '246,140,150', 0.5);
    softSpot(g, 340, 186, 30, '246,140,150', 0.5);
    muzzle(g, MZ, 52);
    // black nose on the top edge of the muzzle (rounded triangle)
    nose(g, [[228, 110], [256, 104], [284, 110], [290, 122], [274, 136], [256, 141], [238, 136], [222, 122]], 247, 113, 11, -0.15);
  }

  // ================================================================ rig ===
  var NECK_PNG = [462, 250];
  var PN = R(NECK_PNG[0], NECK_PNG[1]);       // neck pivot (rig)
  var HORN = R(HORN_PNG[0], HORN_PNG[1]);
  var BFLY = R(BF[0], BF[1]);                 // butterfly decal center (its halo glows)
  var GLOW_STEPS = 24;
  var HORN_MID = [Math.cos(HORN_ANG) * HORN_LEN * 0.55 * SK, Math.sin(HORN_ANG) * HORN_LEN * 0.55 * SK];

  // horn / butterfly light colors: pink -> lilac -> sky -> mint -> yellow -> pink
  var HUES = [[255, 84, 160], [176, 124, 255], [84, 180, 255], [80, 216, 176], [255, 204, 56]];
  function hueRGB(i) {
    var p = i / GLOW_STEPS * HUES.length, a = Math.floor(p) % HUES.length, b = (a + 1) % HUES.length, f = p - Math.floor(p);
    return [0, 1, 2].map(function (k) { return Math.round(HUES[a][k] + (HUES[b][k] - HUES[a][k]) * f); });
  }

  function glowSpr(c, radius, core) {
    var s = Math.ceil(radius * 2), cc = cv(s, s), g = cc.getContext('2d');
    var col = c.join(',');
    g.fillStyle = rad(g, s / 2, s / 2, 0, s / 2, [[0, 'rgba(255,255,255,' + core + ')'], [0.2, 'rgba(' + col + ',0.7)'],
      [0.55, 'rgba(' + col + ',0.26)'], [1, 'rgba(' + col + ',0)']]);
    g.fillRect(0, 0, s, s);
    return cc;
  }

  var HEAD_PIV = [268, 238];                  // Bongo's neck (profile space)
  var cache = [];     // 2 most recent scales

  function build(ppu) {
    var P = {}, i;
    P.tailClear = sPart(ppu, [150, 290], [20, 212, 170, 420], drawTailClear);
    P.tailPink = sPart(ppu, [150, 290], [80, 240, 172, 412], drawTailPink);
    P.mane = sPart(ppu, [440, 230], [366, 40, 520, 246], drawMane);
    P.body = sPart(ppu, [330, 330], [116, 226, 546, 412], drawBody);
    P.bfly = sPart(ppu, BF, [404, 262, 524, 382], drawButterfly);
    P.neck = sPart(ppu, NECK_PNG, [392, 26, 630, 290], drawNeckHead);
    P.hoofNear = makeSpr(ppu, [-26, -18, 42, 50], function (g) { drawHoof(g, false); });
    P.hoofFar = makeSpr(ppu, [-26, -18, 42, 50], function (g) { drawHoof(g, true); });

    P.legNear = legTile(C.pBase, C.pDeep, 23);
    P.legFar = legTile(C.pFar, C.pDeep, 24);
    P.inv = 1 / ppu;

    P.bArm = bPart(ppu, S_SHOULDER, [250, 280, 472, 432], function (g) { furShape(g, ARM_S, 0.2, 61, { tuft: 14 }); });
    P.bArmFar = bPart(ppu, S_SHOULDER, [250, 280, 472, 432], function (g) { furShape(g, ARM_S, 0.2, 62, { tuft: 14, far: true }); });
    P.bTail = bPart(ppu, [176, 492], [96, 440, 196, 546], function (g) {
      var pts = [], n = 10;
      for (var q = 0; q < n; q++) { var a = q / n * TAU; pts.push([146 + Math.cos(a) * 36, 492 + Math.sin(a) * 35]); }
      furShape(g, pts, 0.18, 44, { tuft: 14 });
    });
    P.bLeg = bPart(ppu, [304, 506], [236, 474, 414, 680], function (g) { furShape(g, LEG_S, 0.17, 41); });
    P.bTorso = bPart(ppu, [256, 530], [132, 214, 384, 572], drawBongoTorsoSide);
    P.bHeadS = bPart(ppu, HEAD_PIV, [128, -6, 456, 276], drawBongoHeadSide);
    P.bHead = bPart(ppu, [256, 236], [70, 14, 442, 274], drawBongoHead);       // front face, for looking at the player

    // tinted lights: horn + glow halos, 24 hue steps (rendered once)
    P.horn = []; P.hornGlow = []; P.bflyGlow = [];
    var hp = HORN;
    for (i = 0; i < GLOW_STEPS; i++) {
      var col = hueRGB(i);
      P.horn.push(makeSpr(ppu, [-24, -90, 100, 26], function (g) {
        g.translate(-hp[0], -hp[1]); g.translate(SX, SY); g.scale(SK, SK); drawHorn(g, col);
      }));
      P.hornGlow.push(makeSpr(ppu, [-90, -90, 90, 90], function (g) { g.drawImage(glowSpr(col, 64, 0.85), -90, -90, 180, 180); }, 0.5));
      var hc = hueRGB((i + 8) % GLOW_STEPS);
      P.bflyGlow.push(makeSpr(ppu, [-104, -104, 104, 104], function (g) { g.drawImage(glowSpr(hc, 64, 0.6), -104, -104, 208, 208); }, 0.5));
    }
    return P;
  }

  function prerender(ppu) {
    var key = Math.round(ppu * 1000), i;
    for (i = 0; i < cache.length; i++) {
      if (cache[i].key === key) {
        var hit = cache.splice(i, 1)[0];
        cache.unshift(hit);
        return hit;
      }
    }
    var e = { key: key, ppu: ppu, P: build(ppu) };
    cache.unshift(e);
    if (cache.length > 2) cache.length = 2;
    return e;
  }

  // ------------------------------------------------------------ animation
  function smoothstep(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }

  function blink(t, off) {
    var p = (t + off) % 4.3;
    if (p > 0.2) return 0;
    return Math.sin(p / 0.2 * Math.PI);
  }

  function place(g, spr, x, y, r) {
    g.save();
    g.translate(x, y);
    if (r) g.rotate(r);
    g.drawImage(spr, spr.ox, spr.oy, spr.lw, spr.lh);
    g.restore();
  }
  // ---- Bella's legs: jointed, built live each frame.
  // Skeleton per leg: hip -> knee (carpus in front, hock behind) -> fetlock ->
  // hoof. Each leg is ONE Path2D made of overlapping same-winding pieces
  // (tapered upper leg, round knee, cannon, round fetlock, short pastern), so
  // it is stroked once in ink and then filled once: the fill hides every inner
  // line and the joints can never show a seam or a gap, whatever the angles.
  var LEGS = {
    // hip (png), rest angles [upper, lower] (rad from straight down, + = forward), gallop phase
    nf: { hip: R(478, 318), rest: [0.40, 0.10], ph: 0.0, front: true, far: false, A: 196, B: 150 },
    ff: { hip: R(480, 336), rest: [-0.14, -0.34], ph: 0.5, front: true, far: true, A: 196, B: 150 },
    nh: { hip: R(196, 326), rest: [0.06, 0.52], ph: Math.PI + 0.35, front: false, far: false, A: 222, B: 144 },
    fh: { hip: R(176, 336), rest: [-0.46, -0.16], ph: Math.PI + 0.85, front: false, far: true, A: 222, B: 144 }
  };
  var PASTERN = 27;
  // half-widths along each bone, [front side, back side]
  var SHAPE_FRONT = {
    upF: [54, 46, 35, 28, 24], upB: [54, 44, 31, 24, 21.5],     // forearm: fuller in front
    caF: [20.5, 18.5, 18], caB: [20.5, 18.5, 18],
    paF: [17, 18], paB: [17.5, 18],
    knee: 27.5, kneeOff: 4.5,                                    // round knee, bump to the front
    fet: 22, fetOff: -3
  };
  var SHAPE_HIND = {
    upF: [68, 58, 43, 32, 25], upB: [68, 57, 41, 31, 26],       // thigh and gaskin
    caF: [22, 19.5, 19], caB: [22, 19.5, 19],
    paF: [17.5, 18.5], paB: [18, 18.5],
    knee: 28.5, kneeOff: -6.5,                                   // hock: bump points backward
    fet: 22.5, fetOff: -3
  };
  var LX = new Float64Array(5), LY = new Float64Array(5), RX = new Float64Array(5), RY = new Float64Array(5);
  var NRM = [0, 0];

  // One tapered bone as a closed clockwise sub-path; leaves its unit normal (front side) in NRM.
  function bone(p, x0, y0, x1, y1, wf, wb, k) {
    var n = wf.length, dx = x1 - x0, dy = y1 - y0, d = Math.sqrt(dx * dx + dy * dy) || 1,
      nx = dy / d, ny = -dx / d, i, t;
    for (i = 0; i < n; i++) {
      t = i / (n - 1);
      LX[i] = x0 + dx * t + nx * wf[i] * k; LY[i] = y0 + dy * t + ny * wf[i] * k;
      RX[i] = x0 + dx * t - nx * wb[i] * k; RY[i] = y0 + dy * t - ny * wb[i] * k;
    }
    p.moveTo(LX[0], LY[0]);
    for (i = 1; i < n - 1; i++) p.quadraticCurveTo(LX[i], LY[i], (LX[i] + LX[i + 1]) / 2, (LY[i] + LY[i + 1]) / 2);
    p.lineTo(LX[n - 1], LY[n - 1]); p.lineTo(RX[n - 1], RY[n - 1]);
    for (i = n - 2; i > 0; i--) p.quadraticCurveTo(RX[i], RY[i], (RX[i] + RX[i - 1]) / 2, (RY[i] + RY[i - 1]) / 2);
    p.lineTo(RX[0], RY[0]);
    p.closePath();
    NRM[0] = nx; NRM[1] = ny;
  }
  function ball(p, x, y, r) { p.moveTo(x + r, y); p.arc(x, y, r, 0, TAU); p.closePath(); }

  function legPose(L, ph, run, by) {
    var c = ph + L.ph, s = Math.sin(c), bump, a1, a2;
    if (L.front) {
      // reach forward almost straight, then fold the knee (cannon swings back) while recovering
      bump = 0.5 + 0.5 * Math.cos(c + 0.9); bump *= bump;
      a1 = 0.3 + 0.58 * s; a2 = a1 - (0.1 + 1.05 * bump);
    } else {
      // push out behind almost straight, then flex the hock (it points backward) to swing under the belly
      bump = 0.5 + 0.5 * Math.cos(c + 0.75); bump *= bump;
      a1 = -0.14 + 0.52 * s; a2 = a1 + 0.16 + 0.95 * bump;
    }
    var idle = 1 - run;
    a1 = L.rest[0] * idle + a1 * run;
    a2 = L.rest[1] * idle + a2 * run;
    var k = L.far ? 0.86 : 1, sh = L.front ? SHAPE_FRONT : SHAPE_HIND;
    var hx = L.hip[0], hy = L.hip[1] + by;
    var kx = hx + Math.sin(a1) * L.A, ky = hy + Math.cos(a1) * L.A;
    var fx = kx + Math.sin(a2) * L.B, fy = ky + Math.cos(a2) * L.B;
    // hoof: mostly level, toe tips down when the leg is folded or trailing; the pastern follows it
    var hr = L.front ? -a2 * 0.4 + Math.max(0, a1 - a2) * 1.1 : -a2 * 0.35 + Math.max(0, -a2) * 1.3 + Math.max(0, a2 - a1 - 0.3) * 0.5;
    var a3 = 0.22 - hr * 0.75 + a2 * 0.25;
    var ex = fx + Math.sin(a3) * PASTERN, ey = fy + Math.cos(a3) * PASTERN;

    var p = new Path2D(), n1x, n1y, n2x, n2y, kcx, kcy, fcx, fcy;
    bone(p, hx, hy, kx, ky, sh.upF, sh.upB, k); n1x = NRM[0]; n1y = NRM[1];
    bone(p, kx, ky, fx, fy, sh.caF, sh.caB, k); n2x = NRM[0]; n2y = NRM[1];
    bone(p, fx, fy, ex, ey, sh.paF, sh.paB, k);
    kcx = kx + (n1x + n2x) * 0.5 * sh.kneeOff * k; kcy = ky + (n1y + n2y) * 0.5 * sh.kneeOff * k;
    fcx = fx + n2x * sh.fetOff * k; fcy = fy + n2y * sh.fetOff * k;
    ball(p, kcx, kcy, sh.knee * k);
    ball(p, fcx, fcy, sh.fet * k);

    // near legs: white coat dots
    var dots = null, i, t, q;
    if (!L.far) {
      dots = new Path2D();
      for (i = 0; i < 6; i++) {
        q = i % 2 ? -9 : 8;
        if (i < 3) { t = 0.32 + i * 0.2; t = [hx + (kx - hx) * t + n1x * q * 1.5, hy + (ky - hy) * t + n1y * q * 1.5]; }
        else { t = 0.3 + (i - 3) * 0.27; t = [kx + (fx - kx) * t + n2x * q * 0.8, ky + (fy - ky) * t + n2y * q * 0.8]; }
        dots.moveTo(t[0] + 3, t[1]); dots.arc(t[0], t[1], i < 3 ? 3.4 : 2.6, 0, TAU);
      }
    }
    return { p: p, dots: dots, hx: hx, hy: hy, fx: ex, fy: ey, hr: hr, far: L.far, sn: Math.sin(a1), cs: Math.cos(a1) };
  }

  // Ink outline first (double width), fill on top: only the outer half of the
  // line survives, so the overlapping pieces read as one shape. The fill is a
  // pencil-grain pattern made once per scale (legTile); its matrix pins the
  // grain to the hip and turns it with the upper leg, at device-pixel size.
  var PATM = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  function legDraw(g, lp, P) {
    var pat = lp.far ? P.legFar : P.legNear, st;
    if (pat.setTransform) {
      PATM.a = lp.cs * P.inv; PATM.b = -lp.sn * P.inv; PATM.c = lp.sn * P.inv; PATM.d = lp.cs * P.inv;
      PATM.e = lp.hx; PATM.f = lp.hy;
      pat.setTransform(PATM);
    }
    g.lineWidth = RW * 2;
    if (lp.far) {
      g.strokeStyle = INK; g.stroke(lp.p);
      g.fillStyle = pat; g.fill(lp.p);
    } else {
      // the line fades out at the top, so thigh and shoulder melt into the torso
      st = g.createLinearGradient(lp.hx, lp.hy, lp.fx, lp.fy);
      st.addColorStop(0, 'rgba(' + INK_RGB + ',0)'); st.addColorStop(0.15, 'rgba(' + INK_RGB + ',0)');
      st.addColorStop(0.23, INK); st.addColorStop(1, INK);
      g.strokeStyle = st; g.stroke(lp.p);
      g.fillStyle = pat; g.fill(lp.p);
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.fill(lp.dots);
    }
    place(g, lp.far ? P.hoofFar : P.hoofNear, lp.fx, lp.fy, lp.hr);
  }

  var SEAT = B(250, 530);

  // Bongo glances at the player now and then: about 1.5 s every 4-7 s, eased over 0.25 s
  function autoFace(t) {
    var u = ((t % 16.5) + 16.5) % 16.5, f = 0, w = [[4.4, 6.1], [10.8, 12.4]], i;
    for (i = 0; i < 2; i++) {
      var a = Math.min((u - w[i][0]) / 0.25, (w[i][1] - u) / 0.25);
      if (a > f) f = a;
    }
    return f > 1 ? 1 : f;
  }

  function draw(g, pose, ppu) {
    var E = prerender(ppu), P = E.P;
    pose = pose || {};
    var t = pose.t || 0, run = pose.run || 0, wave = smoothstep(pose.wave || 0),
      happy = pose.happy || 0, look = pose.look || 0;
    var glow = pose.glow === undefined ? 0.5 : pose.glow;
    var ph = t * TAU * 2.0;
    var br = Math.sin(t * 1.9) * (1 - run * 0.5);
    var by = run * 9 * Math.sin(ph + 2.2) + br * 1.6;        // one soft bound per stride + breathing
    var rock = run * 0.035 * Math.sin(ph + 0.4);             // nose lifts as the forelegs reach out
    var k, bl = Math.max(blink(t, 1.7), happy);

    g.save();
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (rock) { g.translate(460, 720); g.rotate(-rock); g.translate(-460, -720); }

    var lFF = legPose(LEGS.ff, ph, run, by), lFH = legPose(LEGS.fh, ph, run, by),
      lNF = legPose(LEGS.nf, ph, run, by), lNH = legPose(LEGS.nh, ph, run, by);

    // --- sprites in z order: [sprite, x, y, rot]
    var items = [];
    var ta = -0.12 * run + (0.05 + 0.14 * run) * Math.sin(ph - 0.8) + 0.04 * Math.sin(t * 1.4);
    var ta2 = -0.14 * run + (0.06 + 0.16 * run) * Math.sin(ph - 1.3) + 0.05 * Math.sin(t * 1.3 + 1);
    items.push([P.tailClear.s, P.tailClear.x, P.tailClear.y + by, ta2]);
    var bodyItem = [P.body.s, P.body.x, P.body.y + by, 0];
    items.push(bodyItem);

    var na = -look * 0.08 + run * (0.05 * Math.sin(ph + 1.4) + 0.03) + 0.014 * Math.sin(t * 1.3 + 0.5) - happy * 0.03;
    var ma = na * 0.8 + (0.03 + 0.1 * run) * Math.sin(ph - 0.6) + 0.03 * Math.sin(t * 1.7);
    items.push([P.mane.s, P.mane.x, P.mane.y + by, ma]);
    items.push([P.tailPink.s, P.tailPink.x, P.tailPink.y + by, ta]);

    var nx = PN[0], ny = PN[1] + by;
    var neckItem = [P.neck.s, nx, ny, na];
    items.push(neckItem);

    // Bongo rides in profile: the whole bear sways around his seat, limbs and head follow loosely
    var bounce = -run * 6 * (0.5 + 0.5 * Math.sin(ph + 3.4));
    var bo = by + bounce - br * 0.8;
    var sway = 0.02 * Math.sin(t * 1.25) + run * 0.05 * Math.sin(ph + 2.6) - run * 0.05;
    var cs = Math.cos(sway), sn = Math.sin(sway);
    function bItem(part, rot, px, py) {
      var dx = (px === undefined ? part.x : px) - SEAT[0], dy = (py === undefined ? part.y : py) - SEAT[1];
      return [part.s, SEAT[0] + dx * cs - dy * sn, SEAT[1] + bo + dx * sn + dy * cs, sway + rot];
    }
    // face: 0 = profile, 1 = turned to the player (auto every few seconds, or set by the caller)
    var face = pose.face === undefined ? autoFace(t) : pose.face;
    face = Math.max(face < 0 ? 0 : face > 1 ? 1 : face, Math.min(1, (pose.wave || 0) * 3));
    var fs = smoothstep(face);
    var smile = Math.max(happy, wave * 0.7, pose.face === undefined ? fs * 0.6 : 0);
    var arm = 0.04 * Math.sin(t * 1.7) + run * 0.07 * Math.sin(ph + 1.6) - sway * 0.8 - happy * 0.3;
    var armW = -1.65 + 0.28 * Math.sin(t * 10);
    arm += (armW - arm) * wave;
    var ha = 0.03 * Math.sin(t * 1.6) + run * 0.05 * Math.sin(ph + 1.2) - happy * 0.04 - sway * 0.5;
    var lg = 0.05 * Math.sin(t * 1.5 + 0.6) + run * 0.14 * Math.sin(ph + 0.9);
    items.push(bItem(P.bTail, 0.12 * Math.sin(t * 2.2) + run * 0.25 * Math.sin(ph + 2.2)));
    items.push(bItem(P.bArmFar, arm * 0.4 - 0.16 + run * 0.06 * Math.sin(ph + 2.4), P.bArmFar.x + 16, P.bArmFar.y - 16));
    items.push(bItem(P.bLeg, lg));
    items.push(bItem(P.bTorso, 0));
    // the two heads share the neck pivot; the outgoing one squashes away under the incoming one
    var hp = B(HEAD_PIV[0], HEAD_PIV[1]);
    var sq = 1 - 0.16 * Math.sin(Math.PI * fs);
    var headS = null, headF = null;
    if (fs < 0.999) { headS = bItem(P.bHeadS, ha + 0.1 * fs); headS[4] = sq; headS[5] = Math.min(1, 2 * (1 - fs)); items.push(headS); }
    if (fs > 0.001) { headF = bItem(P.bHead, ha * 0.8 + 0.06 * (1 - fs) - 0.09 * wave, hp[0] - (14 + 22 * wave) * BK * fs, hp[1]); headF[4] = sq; headF[5] = Math.min(1, 2 * fs); items.push(headF); }
    items.push(bItem(P.bArm, arm));              // near arm: on her mane, or waving in front of the head

    // far legs, then sprites in order with live overlays at their z
    var n = items.length;
    legDraw(g, lFH, P); legDraw(g, lFF, P);
    for (k = 0; k < n; k++) {
      var it = items[k];
      if (it === headS || it === headF) {
        g.save();
        g.translate(it[1], it[2]); g.rotate(it[3]); g.scale(it[4], 1);
        g.globalAlpha = it[5];
        g.drawImage(it[0], it[0].ox, it[0].oy, it[0].lw, it[0].lh);
        if (it === headS) bongoFaceSide(g, bl, smile); else bongoFace(g, bl, smile);
        g.restore();
        continue;
      }
      place(g, it[0], it[1], it[2], it[3]);
      if (it === bodyItem) {
        legDraw(g, lNH, P); legDraw(g, lNF, P);
        bflyLight(g, P, t, by, glow);
      }
      if (it === neckItem) {
        // horn + glow + eye + smile ride on the neck matrix
        g.save();
        g.translate(nx, ny); g.rotate(na);
        hornLight(g, P, t, glow);
        bellaFace(g, t, happy);
        g.restore();
      }
    }
    g.restore();
  }

  function hueIndex(t, off) {
    var p = ((t / 12 + off / GLOW_STEPS) % 1 + 1) % 1 * GLOW_STEPS;
    var i = Math.floor(p);
    return [i % GLOW_STEPS, (i + 1) % GLOW_STEPS, p - i];
  }

  function hornLight(g, P, t, glow) {
    var h = hueIndex(t, 0), pulse = 1 + 0.06 * Math.sin(t * 3);
    var ga = 0.3 + 0.7 * glow, sc = (0.8 + 0.5 * glow) * pulse;
    var gs = P.hornGlow[h[0]], gs2 = P.hornGlow[h[1]];
    g.save();
    g.translate(HORN[0] - PN[0], HORN[1] - PN[1]);
    g.save();
    g.translate(HORN_MID[0], HORN_MID[1]); g.scale(sc, sc);
    g.globalAlpha = ga * (1 - h[2]);
    g.drawImage(gs, gs.ox, gs.oy, gs.lw, gs.lh);
    g.globalAlpha = ga * h[2];
    g.drawImage(gs2, gs2.ox, gs2.oy, gs2.lw, gs2.lh);
    g.restore();
    g.globalAlpha = 1;
    var hs = P.horn[h[0]], hs2 = P.horn[h[1]];
    g.drawImage(hs, hs.ox, hs.oy, hs.lw, hs.lh);
    g.globalAlpha = h[2];
    g.drawImage(hs2, hs2.ox, hs2.oy, hs2.lw, hs2.lh);
    g.restore();
    g.globalAlpha = 1;
  }

  // colored halo behind the butterfly decal, then the (never tinted) decal
  function bflyLight(g, P, t, by, glow) {
    var h = hueIndex(t, 0), pulse = 1 + 0.07 * Math.sin(t * 3.2 + 1);
    var ga = (0.3 + 0.7 * glow) * pulse, sc = 0.82 + 0.3 * glow;
    if (ga > 1) ga = 1;
    var gs = P.bflyGlow[h[0]], gs2 = P.bflyGlow[h[1]];
    g.save();
    g.translate(BFLY[0], BFLY[1] + by);
    g.save();
    g.scale(sc, sc);
    g.globalAlpha = ga * (1 - h[2]);
    g.drawImage(gs, gs.ox, gs.oy, gs.lw, gs.lh);
    g.globalAlpha = ga * h[2];
    g.drawImage(gs2, gs2.ox, gs2.oy, gs2.lw, gs2.lh);
    g.restore();
    g.globalAlpha = 1;
    g.drawImage(P.bfly.s, P.bfly.s.ox, P.bfly.s.oy, P.bfly.s.lw, P.bfly.s.lh);
    g.restore();
  }

  // Bella's gentle eye and her smile (local = neck pivot coords, rig scale)
  var S_EYE = R(564, 122), S_MOUTH = [R(626, 189), R(614, 198), R(602, 189)];
  function bellaFace(g, t, happy) {
    var x = S_EYE[0] - PN[0], y = S_EYE[1] - PN[1];
    var open = 1 - Math.max(blink(t, 0), happy);
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (open > 0.25) {
      var rx = 13.5, ry = 17 * open;
      g.save();
      g.translate(x, y); g.rotate(0.2);
      g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU);
      g.fillStyle = '#fbfdff'; g.fill();
      g.save(); g.clip();
      g.beginPath(); g.ellipse(1.5, 2, 11, 13.5, 0, 0, TAU);
      g.fillStyle = lin(g, 0, -12, 0, 15, [[0, '#2a6fb8'], [0.55, '#55aae2'], [1, '#aee2f6']]); g.fill();
      dot(g, 1.5, 2.5, 7.4, '#22223f');
      dot(g, -3, -4, 4.4, 'rgba(255,255,255,0.97)');
      dot(g, 5.5, 8, 2.2, 'rgba(255,255,255,0.85)');
      // relaxed upper lid
      g.beginPath(); g.moveTo(-rx - 2, -ry * 0.2); g.quadraticCurveTo(-1, -ry * 1.05, rx + 2, -ry * 0.42);
      g.lineTo(rx + 2, -ry - 2); g.lineTo(-rx - 2, -ry - 2); g.closePath();
      g.fillStyle = C.pBase; g.fill();
      g.restore();
      g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU);
      g.lineWidth = 2.4; g.strokeStyle = INK; g.stroke();
      // lash line along the lid, sweeping out softly at the back corner
      g.beginPath(); g.moveTo(-rx - 7, -ry * 0.2 - 5); g.quadraticCurveTo(-rx - 3, -ry * 0.2, -rx + 1, -ry * 0.36);
      g.quadraticCurveTo(-1, -ry * 1.0, rx + 0.5, -ry * 0.42);
      g.lineWidth = 3.6; g.strokeStyle = INK; g.stroke();
      g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(-rx + 1.5, -ry * 0.5); g.quadraticCurveTo(-rx - 3, -ry * 0.62, -rx - 6.5, -ry * 0.62 - 5); g.stroke();
      g.beginPath(); g.moveTo(-rx + 5, -ry * 0.72); g.quadraticCurveTo(-rx + 2, -ry * 0.9, -rx, -ry * 0.9 - 6); g.stroke();
      g.restore();
    } else {
      // closed: a happy upward-curved lash line
      g.lineWidth = 4; g.strokeStyle = INK;
      g.beginPath(); g.arc(x, y + 9, 14, Math.PI * 1.16, Math.PI * 1.84); g.stroke();
      g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(x - 12, y); g.quadraticCurveTo(x - 16, y - 1, x - 19, y - 6); g.stroke();
      g.beginPath(); g.moveTo(x - 7, y - 3.5); g.quadraticCurveTo(x - 10, y - 6, x - 11, y - 11); g.stroke();
    }
    // smile: a short soft curve at the muzzle tip, turning up toward the cheek
    var m0 = S_MOUTH[0], m1 = S_MOUTH[1], m2 = S_MOUTH[2];
    var ax = m0[0] - PN[0], ay = m0[1] - PN[1], cx = m1[0] - PN[0], cy = m1[1] - PN[1] + happy * 8,
      bx = m2[0] - PN[0] - happy * 5, by = m2[1] - PN[1] - happy * 6;
    if (happy > 0.3) {
      g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(cx, cy + 6, bx, by); g.quadraticCurveTo(cx, cy - 12, ax, ay);
      g.fillStyle = 'rgba(214,70,120,' + ((happy - 0.3) / 0.7) + ')'; g.fill();
    }
    g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(cx, cy, bx, by);
    g.quadraticCurveTo(bx - 3, by - 3, bx - 3.5, by - 6.5);
    g.lineWidth = 4.2; g.strokeStyle = INK; g.stroke();
  }

  // Bongo's front face: eyes, brows and smile (local = front head pivot coords)
  var B_HEAD = B(256, 236);
  function bongoFace(g, bl, smile) {
    var s = BK;
    function ex(x, y) { var p = B(x, y); return [p[0] - B_HEAD[0], p[1] - B_HEAD[1]]; }
    var le = ex(206, 126), re = ex(306, 126), m = ex(256, 140);
    g.lineCap = 'round'; g.lineJoin = 'round';
    // small raised brows: open, friendly
    g.lineWidth = 4 * s; g.strokeStyle = 'rgba(122,88,58,0.75)';
    [[le, -1], [re, 1]].forEach(function (q) {
      var p = q[0], d = q[1], lift = (6 + smile * 5) * s;
      g.beginPath(); g.moveTo(p[0] - 10 * s, p[1] - 17 * s - lift + 3 * s * d * -1);
      g.quadraticCurveTo(p[0], p[1] - 24 * s - lift, p[0] + 10 * s, p[1] - 17 * s - lift + 3 * s * d);
      g.stroke();
    });
    if (bl > 0.5) {
      g.lineWidth = 6 * s; g.strokeStyle = INK;
      [le, re].forEach(function (p) {
        g.beginPath(); g.arc(p[0], p[1] + 7 * s, 11 * s, Math.PI * 1.13, Math.PI * 1.87); g.stroke();
      });
    } else {
      [le, re].forEach(function (p) {
        dot(g, p[0], p[1], 9 * s, '#1e161a');
        dot(g, p[0] - 3 * s, p[1] - 3.5 * s, 3.6 * s, 'rgba(255,255,255,0.95)');
        dot(g, p[0] + 3.5 * s, p[1] + 3.5 * s, 1.6 * s, 'rgba(255,255,255,0.6)');
        g.beginPath(); g.arc(p[0], p[1] + 3 * s, 15 * s, 0.25 * Math.PI, 0.75 * Math.PI);
        g.lineWidth = 2.4 * s; g.strokeStyle = 'rgba(160,120,96,0.45)'; g.stroke();
      });
    }
    if (smile > 0.05) {
      var c1 = ex(172, 188), c2 = ex(340, 188);
      dot(g, c1[0], c1[1], 20 * s * smile, 'rgba(244,130,140,0.4)');
      dot(g, c2[0], c2[1], 20 * s * smile, 'rgba(244,130,140,0.4)');
    }
    // stitched mouth: line down from the nose into a clear U smile
    var hw = (30 + 8 * smile) * s, top = 26 * s, dp = (30 + 12 * smile) * s;
    var my = m[1] + top;                               // y of the mouth corners
    g.lineWidth = 6.6 * s; g.strokeStyle = INK;
    if (smile > 0.5) {
      g.beginPath();
      g.moveTo(m[0] - hw, my); g.quadraticCurveTo(m[0], my + dp * 2, m[0] + hw, my);
      g.quadraticCurveTo(m[0], my + dp * 0.5, m[0] - hw, my);
      g.fillStyle = 'rgba(206,84,108,' + ((smile - 0.5) * 2) + ')'; g.fill();
    }
    g.beginPath(); g.moveTo(m[0], m[1]); g.lineTo(m[0], my + dp * 0.5); g.stroke();
    g.beginPath();
    g.moveTo(m[0] - hw, my - 3 * s);
    g.quadraticCurveTo(m[0] - hw * 0.9, my + dp * 0.5, m[0], my + dp * 0.5);
    g.quadraticCurveTo(m[0] + hw * 0.9, my + dp * 0.5, m[0] + hw, my - 3 * s);
    g.stroke();
  }

  // Bongo's profile face: one small eye, a brow, and the smile on the side of the muzzle
  function bongoFaceSide(g, bl, smile) {
    var s = BK;
    function ex(x, y) { return [(x - HEAD_PIV[0]) * s, (y - HEAD_PIV[1]) * s]; }
    var e = ex(338, 122), lift = (6 + smile * 5) * s;
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = 4 * s; g.strokeStyle = 'rgba(122,88,58,0.75)';
    g.beginPath(); g.moveTo(e[0] - 11 * s, e[1] - 15 * s - lift); g.quadraticCurveTo(e[0], e[1] - 24 * s - lift, e[0] + 10 * s, e[1] - 19 * s - lift); g.stroke();
    if (bl > 0.5) {
      g.lineWidth = 6 * s; g.strokeStyle = INK;
      g.beginPath(); g.arc(e[0], e[1] + 7 * s, 11 * s, Math.PI * 1.13, Math.PI * 1.87); g.stroke();
    } else {
      dot(g, e[0], e[1], 9.5 * s, '#1e161a');
      dot(g, e[0] + 2.5 * s, e[1] - 3.5 * s, 3.6 * s, 'rgba(255,255,255,0.95)');
      dot(g, e[0] - 3 * s, e[1] + 3.5 * s, 1.6 * s, 'rgba(255,255,255,0.6)');
      g.beginPath(); g.arc(e[0], e[1] + 3 * s, 15 * s, 0.25 * Math.PI, 0.75 * Math.PI);
      g.lineWidth = 2.4 * s; g.strokeStyle = 'rgba(160,120,96,0.45)'; g.stroke();
    }
    if (smile > 0.05) { var c = ex(322, 190); dot(g, c[0], c[1], 20 * s * smile, 'rgba(244,130,140,0.4)'); }
    // stitch down the front of the muzzle, then the smile running back and up
    var a = ex(430, 164), b = ex(424, 188 + smile * 3), q = ex(396, 210 + smile * 14), c2 = ex(368, 190 - smile * 5);
    if (smile > 0.5) {
      g.beginPath(); g.moveTo(b[0], b[1]); g.quadraticCurveTo(q[0], q[1] + 16 * s, c2[0], c2[1]); g.quadraticCurveTo(q[0], q[1] - 12 * s, b[0], b[1]);
      g.fillStyle = 'rgba(206,84,108,' + ((smile - 0.5) * 2) + ')'; g.fill();
    }
    g.lineWidth = 6.6 * s; g.strokeStyle = INK;
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    g.quadraticCurveTo(q[0], q[1], c2[0], c2[1]);
    g.quadraticCurveTo(c2[0] - 5 * s, c2[1] - 5 * s, c2[0] - 4 * s, c2[1] - 10 * s);
    g.stroke();
  }

  // ------------------------------------------------------------- anchors
  // Rest-pose points in rig units. "follows" notes which part moves them.
  var A = {
    bellaHind: R(172, 318),        // body (bobs slightly)
    bellaBelly: R(320, 372),       // body
    bellaChest: R(512, 352),       // body, just under the butterfly light
    bellaNeck: R(452, 176),        // neck (swings a little around neck base)
    bellaCheek: R(556, 166),       // head (follows the neck)
    bellaLegBack: R(200, 428),     // top of the near hind leg (moves little)
    bellaLegFront: R(500, 420),    // top of the near front leg (moves little)
    bongoCheek: B(318, 190),        // Bongo head (profile cheek)
    bongoTummy: B(300, 404),        // Bongo torso (side of the overalls)
    bongoArm: B(360, 346),          // Bongo's near arm (reaching to the mane)
    body: { x: 450, y: 560, r: 330 }
  };

  window.Characters = {
    W: W, H: H, anchors: A,
    prerender: function (ppu) { prerender(ppu); },
    draw: draw
  };
})();
