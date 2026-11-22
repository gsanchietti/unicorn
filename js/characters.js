/* characters.js - Stella (pink unicorn toy) and Bongo (teddy in blue crocheted
 * overall shorts), drawn from scratch as an animated cut-out puppet rig.
 *
 * Shapes are traced from assets/stella.png and assets/bongo.png. Every part is
 * pre-rendered once into its own sprite (plus a soft white halo sprite for the
 * sticker-like glow). Per frame, draw() places cached sprites with translate /
 * rotate around joints and adds a few small live paths: Stella's four legs
 * (one continuous bendy shape each, so no knee seams), eyes and smiles.
 * Classic script: window.Characters.
 *
 *   Characters.W, Characters.H          rig frame size (rig units)
 *   Characters.prerender(pxPerUnit)     build / fetch cache (2 most recent scales)
 *   Characters.draw(g, pose, pxPerUnit) pose = {t, run, wave, happy, look, glow}
 *   Characters.anchors                  named points (rig units, rest pose)
 *
 * Authoring conventions: Stella is authored in "stella.png space" (657x700,
 * facing right) and mapped into the rig with R(); Bongo in "bongo.png space"
 * (519x700) mapped with B(). Sprite-local coordinates have the joint at (0,0).
 */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var W = 1000, H = 1100;
  var PAD = 20;                          // sprite margin for the halo (rig units)

  // png-space -> rig mapping
  var SK = 1.28, SX = 50, SY = 200;      // Stella
  var BK = 0.68, BX = 222, BY = 192;     // Bongo
  function R(x, y) { return [x * SK + SX, y * SK + SY]; }
  function B(x, y) { return [x * BK + BX, y * BK + BY]; }

  // ------------------------------------------------------------ palette
  var C = {
    line: 'rgba(120,84,150,0.66)',        // soft dark-lilac outline
    lineRGB: '120,84,150',
    pBase: '#ebb9d2', pHi: '#fce5ef', pShade: '#c99abc',
    hoof: '#dc86b2', hoofDeep: '#b9659b',
    mane: '#f784b8', maneHi: '#ffbcd9', maneDeep: '#e560a0',
    fur: '#f6ecd6', furHi: '#fffbf1', furShade: '#e0cfab',
    furLine: 'rgba(128,98,132,0.6)',
    blue: '#2767a8', blueDark: '#194a84', blueHi: '#5a9bd6',
    ink: '#3a2f55'
  };

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

  function outline(g, w, color) {
    g.lineWidth = w || 3;
    g.strokeStyle = color || C.line;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.stroke();
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

  // tiny embossed 6-petal "snowflake" flower, the pattern on Stella's coat
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

  // petal flower
  function flower(g, x, y, r, petal, center, n) {
    n = n || 5;
    for (var k = 0; k < n; k++) {
      var a = k * TAU / n - Math.PI / 2;
      dot(g, x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.5, petal);
    }
    dot(g, x, y, r * 0.38, center);
  }

  // ------------------------------------------------------- sprite builder
  // bb = local bounding box [x0,y0,x1,y1] (joint at 0,0). draw(g) paints in
  // local coords. Result: canvas with .ox/.oy/.lw/.lh and optional .halo.
  function makeSpr(ppu, bb, draw, noHalo, res) {
    res = res || 1;
    var x0 = bb[0] - PAD, y0 = bb[1] - PAD, w = bb[2] - bb[0] + PAD * 2, h = bb[3] - bb[1] + PAD * 2;
    var c = cv(w * ppu * res, h * ppu * res), g = c.getContext('2d');
    g.scale(c.width / w, c.height / h);
    g.translate(-x0, -y0);
    draw(g);
    c.ox = x0; c.oy = y0; c.lw = w; c.lh = h;
    if (!noHalo) c.halo = makeHalo(c, ppu);
    return c;
  }

  // white sticker rim + soft outer glow of the silhouette
  function makeHalo(spr, ppu) {
    var s = cv(spr.width, spr.height), sg = s.getContext('2d');
    sg.drawImage(spr, 0, 0);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = '#fff';
    sg.fillRect(0, 0, s.width, s.height);
    var h = cv(spr.width, spr.height), g = h.getContext('2d');
    var k = ppu * (spr.width / (spr.lw * ppu)), i;
    g.shadowColor = 'rgba(255,255,255,1)';
    g.shadowBlur = 5 * k;                       // tight rim
    for (i = 0; i < 4; i++) g.drawImage(s, 0, 0);
    g.shadowBlur = 13 * k;                      // soft glow
    for (i = 0; i < 2; i++) g.drawImage(s, 0, 0);
    return h;
  }

  // part authored in stella.png space; pivot in png coords
  function sPart(ppu, pivot, bb, draw, noHalo) {
    var pv = R(pivot[0], pivot[1]), a = R(bb[0], bb[1]), b = R(bb[2], bb[3]);
    var spr = makeSpr(ppu, [a[0] - pv[0], a[1] - pv[1], b[0] - pv[0], b[1] - pv[1]], function (g) {
      g.translate(-pv[0], -pv[1]); g.translate(SX, SY); g.scale(SK, SK); draw(g);
    }, noHalo);
    return { s: spr, x: pv[0], y: pv[1] };
  }

  function bPart(ppu, pivot, bb, draw) {
    var pv = B(pivot[0], pivot[1]), a = B(bb[0], bb[1]), b = B(bb[2], bb[3]);
    var spr = makeSpr(ppu, [a[0] - pv[0], a[1] - pv[1], b[0] - pv[0], b[1] - pv[1]], function (g) {
      g.translate(-pv[0], -pv[1]); g.translate(BX, BY); g.scale(BK, BK); draw(g);
    });
    return { s: spr, x: pv[0], y: pv[1] };
  }

  // ============================================================ STELLA ====
  // Fluffy pink mass made of circles (mane, tail).
  function fluff(g, cs, base, hi, deep, seed, strands) {
    var rnd = mulberry(seed), i;
    circlesPath(g, cs);                         // outline underneath: inner arcs get hidden by the fill
    outline(g, 5.5, 'rgba(170,74,146,0.55)');
    g.save();
    circlesPath(g, cs);
    var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    cs.forEach(function (c) {
      minx = Math.min(minx, c[0] - c[2]); maxx = Math.max(maxx, c[0] + c[2]);
      miny = Math.min(miny, c[1] - c[2]); maxy = Math.max(maxy, c[1] + c[2]);
    });
    g.fillStyle = lin(g, minx, miny, maxx, maxy, [[0, hi], [0.5, base], [1, deep]]);
    g.fill();
    g.clip();
    // soft flowing hair strands
    g.lineCap = 'round';
    for (i = 0; i < (strands || 30); i++) {
      var c = cs[Math.floor(rnd() * cs.length)];
      var a = rnd() * TAU, d = rnd() * c[2] * 0.8;
      var x = c[0] + Math.cos(a) * d, y = c[1] + Math.sin(a) * d;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x - 8 + rnd() * 6, y + 12 + rnd() * 8, x - 4 + rnd() * 14, y + 26 + rnd() * 14);
      g.lineWidth = 1.6 + rnd() * 1.6;
      g.strokeStyle = rnd() < 0.55 ? 'rgba(255,255,255,0.36)' : 'rgba(214,66,140,0.2)';
      g.stroke();
    }
    g.restore();
  }

  function drawMane(g) {
    fluff(g, [[480, 72, 15], [458, 82, 20], [436, 100, 24], [417, 125, 26], [404, 154, 26], [398, 184, 23],
      [402, 210, 17], [410, 228, 11]], C.mane, C.maneHi, C.maneDeep, 5);
  }
  // translucent white-lilac tinsel cloud of the tail
  function drawTailClear(g) {
    var cs = [[92, 300, 52], [66, 338, 40], [108, 256, 34], [84, 378, 36], [122, 372, 36], [52, 298, 26], [128, 292, 36], [134, 240, 20]];
    circlesPath(g, cs.map(function (c) { return [c[0], c[1], c[2] + 2.5]; }));   // soft lilac rim
    g.fillStyle = 'rgba(176,140,206,0.5)'; g.fill();
    g.save();
    circlesPath(g, cs);
    g.fillStyle = lin(g, 30, 220, 160, 410, [[0, 'rgba(255,255,255,0.95)'], [0.6, 'rgba(240,226,247,0.92)'], [1, 'rgba(216,192,236,0.92)']]);
    g.fill();
    g.clip();
    g.lineCap = 'round';
    var rnd = mulberry(9);
    for (var i = 0; i < 44; i++) {
      var x = 40 + rnd() * 110, y = 226 + rnd() * 170;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x - 12 + rnd() * 8, y + 14, x - 8 + rnd() * 16, y + 28 + rnd() * 12);
      g.lineWidth = 1.5;
      g.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.8)' : 'rgba(188,160,220,0.4)';
      g.stroke();
    }
    g.restore();
  }
  function drawTailPink(g) {
    fluff(g, [[140, 286, 22], [126, 318, 27], [124, 354, 27], [116, 386, 20], [146, 262, 15],
      [104, 340, 20], [118, 296, 18]], C.mane, C.maneHi, C.maneDeep, 7, 34);
  }

  // Stella's torso (traced): rounded rump on the left, deep chest on the right
  var BODY = [[190, 251], [158, 258], [135, 281], [123, 320], [127, 365], [148, 394], [200, 404], [270, 403],
    [340, 403], [410, 401], [465, 397], [508, 379], [532, 346], [538, 310], [529, 279], [506, 255],
    [462, 236], [410, 234], [350, 256], [300, 261], [240, 254]];

  function drawBody(g) {
    smooth(g, BODY, 0.16);
    g.fillStyle = lin(g, 0, 240, 0, 405, [[0, C.pHi], [0.28, C.pBase], [0.72, '#dda6c6'], [1, C.pShade]]);
    g.fill();
    g.save();
    g.clip();
    // painterly shading: mauve under-belly and rump, pearly sheen along the back and chest
    softSpot(g, 170, 392, 120, '150,104,170', 0.36);
    softSpot(g, 330, 420, 110, '150,104,170', 0.3);
    softSpot(g, 520, 400, 80, '150,104,170', 0.26);
    softSpot(g, 285, 268, 95, '132,96,150', 0.2);          // Bongo's soft contact shadow
    g.save(); g.translate(250, 284); g.rotate(0.03); g.scale(1, 0.2);
    softSpot(g, 0, 0, 120, '255,255,255', 0.75); g.restore();
    g.save(); g.translate(170, 300); g.rotate(-0.9); g.scale(1, 0.42);
    softSpot(g, 0, 0, 52, '255,255,255', 0.7); g.restore();
    softSpot(g, 500, 300, 60, '255,255,255', 0.5);
    softSpot(g, 400, 290, 70, '255,255,255', 0.3);
    coatDots(g, 21, 126, 250, 540, 405, 26, 120, function (x, y) { return Math.hypot(x - 464, y - 322) < 58; });
    // a few sparkles for the pearl finish
    var rnd = mulberry(4);
    for (var i = 0; i < 7; i++) {
      var x = 150 + rnd() * 360, y = 262 + rnd() * 70, r = 4 + rnd() * 3;
      g.beginPath(); g.moveTo(x - r, y); g.quadraticCurveTo(x, y, x, y - r); g.quadraticCurveTo(x, y, x + r, y);
      g.quadraticCurveTo(x, y, x, y + r); g.quadraticCurveTo(x, y, x - r, y);
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.fill();
    }
    g.restore();
    smooth(g, BODY, 0.16);
    outline(g, 3);
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
    // rainbow rim: red, orange, yellow bands stacked; blue on the left side
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
    g.fillStyle = lin(g, 430, 280, 505, 365, [[0, '#fffef6'], [1, '#f1e7cb']]);
    g.fill();
    // veins + body
    g.save();
    wingPath(g); g.clip();
    softSpot(g, 448, 304, 26, '255,255,255', 0.9);
    g.translate(BF[0], BF[1]); g.rotate(0.42); g.scale(0.98, 0.98);
    g.lineCap = 'round'; g.lineWidth = 1.3; g.strokeStyle = 'rgba(176,146,120,0.38)';
    [[20, -12, 44, -28], [18, -6, 46, -10], [14, 14, 26, 30], [-20, -12, -44, -28], [-18, -6, -46, -10], [-14, 14, -24, 30]].forEach(function (v) {
      g.beginPath(); g.moveTo(v[0] * 0.3, v[1] * 0.3); g.lineTo(v[2], v[3]); g.stroke();
    });
    g.restore();
    g.save();
    g.translate(BF[0], BF[1]); g.rotate(0.42); g.scale(0.98, 0.98);
    g.beginPath(); g.ellipse(0, 6, 3.4, 22, 0, 0, TAU);
    g.fillStyle = '#eadcb8'; g.fill();
    g.lineWidth = 1; g.strokeStyle = 'rgba(150,120,110,0.5)'; g.stroke();
    g.restore();
    // little flowers around the decal
    flower(g, 424, 289, 9.5, '#ef5f8c', '#ffd25a', 5);
    flower(g, 436, 272, 5, '#a78bd6', '#ffe08a', 5);
    dot(g, 505, 300, 3.6, '#2fb5b0'); dot(g, 511, 320, 3, '#5aa6e0');
    flower(g, 500, 356, 6, '#5b6fb0', '#f3d46a', 5);
    flower(g, 462, 368, 5, '#6a6fb0', '#f3d46a', 5);
    dot(g, 421, 340, 3.2, '#f2c24a');
    // fixed white glints
    dot(g, 488, 318, 2.4, '#fff'); dot(g, 444, 298, 2, '#fff');
  }

  // Neck + head (one piece, traced). Pivot at the middle of the collar line.
  // The neck rises almost straight up with a gentle arch; the head hangs
  // forward and down, with a rounded, slightly darker muzzle.
  var NECK = [[401, 236], [402, 205], [409, 172], [423, 138], [444, 106], [472, 80], [504, 62], [532, 56],
    [556, 62], [574, 78], [588, 102], [600, 130], [614, 154], [621, 172], [618, 189], [606, 200],
    [587, 202], [567, 194], [548, 183], [531, 178], [517, 187], [509, 206], [510, 234], [519, 258],
    [527, 280], [508, 262], [462, 248]];

  function collarAt(t, up) {              // point on the collar curve, shifted "up" along the neck
    var a = [401, 236], b = [468, 244], c = [527, 281];
    var x = (1 - t) * (1 - t) * a[0] + 2 * t * (1 - t) * b[0] + t * t * c[0];
    var y = (1 - t) * (1 - t) * a[1] + 2 * t * (1 - t) * b[1] + t * t * c[1];
    return [x - up * 0.25, y - up];
  }

  function drawNeckHead(g) {
    var i;
    // ear (behind the poll)
    var ear = [[534, 66], [541, 46], [556, 36], [562, 50], [563, 70], [548, 76]];
    smooth(g, ear, 0.2);
    g.fillStyle = lin(g, 534, 40, 564, 74, [[0, '#f6c8df'], [1, '#dba3c8']]); g.fill();
    outline(g, 3);
    ellipsePath(g, 552, 54, 4.2, 11, 0.32);
    g.fillStyle = 'rgba(226,128,172,0.6)'; g.fill();

    smooth(g, NECK, 0.15);
    g.fillStyle = lin(g, 400, 60, 600, 230, [[0, '#f9d3e6'], [0.5, C.pBase], [1, '#dba6c8']]);
    g.fill();
    g.save();
    g.clip();
    softSpot(g, 520, 215, 62, '150,104,170', 0.36);         // throat shadow
    softSpot(g, 545, 196, 40, '150,104,170', 0.26);         // under the jaw
    softSpot(g, 408, 180, 46, '150,104,170', 0.22);         // under the mane
    softSpot(g, 470, 150, 60, '255,255,255', 0.42);         // pearly neck
    softSpot(g, 560, 92, 40, '255,255,255', 0.5);           // forehead sheen
    softSpot(g, 604, 176, 30, '212,104,156', 0.5);          // darker muzzle
    softSpot(g, 566, 160, 24, '255,120,160', 0.32);         // rosy cheek
    softSpot(g, 606, 160, 12, '255,255,255', 0.4);
    coatDots(g, 33, 404, 100, 520, 250, 7, 26, function (x, y) { return y < 150 && x > 440 && x < 520; });
    g.restore();
    smooth(g, NECK, 0.15); outline(g, 3);

    // nostril
    ellipsePath(g, 606, 171, 3.6, 5, 0.5);
    g.fillStyle = 'rgba(150,56,110,0.6)'; g.fill();
    // brow garland of tiny embossed flowers (poll -> horn base)
    for (i = 0; i < 5; i++) flower(g, 516 + i * 9, 70 + i * 2.6, 5, '#f9b3d1', '#fff2f8', 5);
    // colored flower gems on the cheek and neck (pink, yellow, teal)
    flower(g, 506, 90, 9.5, '#f0507e', '#ffc3d3', 6);
    g.save(); g.translate(474, 105); g.rotate(-0.35);       // yellow butterfly-shaped gem
    dot(g, -6, -4, 6, '#ffd23f'); dot(g, 6, -4, 6, '#ffd23f'); dot(g, -4.5, 5, 4.4, '#ffd23f'); dot(g, 4.5, 5, 4.4, '#ffd23f');
    dot(g, 0, 0, 2.6, '#f0a020'); g.restore();
    flower(g, 458, 127, 9.5, '#22aeb0', '#9eeee8', 6);
    dot(g, 505, 88, 1.6, 'rgba(255,255,255,0.8)'); dot(g, 456, 124, 1.6, 'rgba(255,255,255,0.8)');

    // collar band of embossed flowers, sitting just above the collar line
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.save();
    smooth(g, NECK, 0.15); g.clip();
    g.beginPath();
    for (i = 0; i <= 12; i++) { var p = collarAt(i / 12, 10); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }
    g.lineWidth = 22; g.strokeStyle = 'rgba(232,150,192,0.7)'; g.stroke();
    g.lineWidth = 16; g.strokeStyle = '#f6bcd8'; g.stroke();
    g.beginPath();
    for (i = 0; i <= 12; i++) { var q = collarAt(i / 12, 1.5); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
    g.lineWidth = 3.2; g.strokeStyle = 'rgba(214,84,142,0.85)'; g.stroke();
    g.restore();
    for (i = 0; i < 9; i++) {
      var fp = collarAt(0.06 + i * 0.105, 11);
      flower(g, fp[0], fp[1], 5.6, '#fff4fa', i % 3 === 1 ? '#ffd24a' : '#f493bf', 5);
    }
  }

  // Horn, tinted: color c ([r,g,b]); long slim spiral cone from the forehead
  var HORN_PNG = [561, 70], HORN_ANG = -0.70, HORN_LEN = 78;
  function drawHorn(g, c) {
    g.save();
    g.translate(HORN_PNG[0], HORN_PNG[1]);
    g.rotate(HORN_ANG);
    var col = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
    var light = 'rgb(' + Math.min(255, c[0] + 80) + ',' + Math.min(255, c[1] + 80) + ',' + Math.min(255, c[2] + 80) + ')';
    var dark = 'rgb(' + Math.round(c[0] * 0.8) + ',' + Math.round(c[1] * 0.72) + ',' + Math.round(c[2] * 0.84) + ')';
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
    g.fillStyle = lin(g, 0, -13, 0, 13, [[0, light], [0.45, col], [1, dark]]);
    g.fill();
    g.save(); g.clip();
    g.lineWidth = 3.4; g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineCap = 'round';
    for (var k = 0; k < 7; k++) {                      // spiral bands
      g.beginPath();
      g.moveTo(4 + k * 11, -15); g.quadraticCurveTo(12 + k * 11, 0, 12 + k * 11, 15);
      g.stroke();
    }
    g.fillStyle = lin(g, 0, -13, 0, 0, [[0, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]);   // soft lit side
    g.fillRect(-10, -13, HORN_LEN + 12, 13);
    g.restore();
    cone();
    g.lineWidth = 1.6; g.strokeStyle = 'rgba(' + Math.round(c[0] * 0.6) + ',' + Math.round(c[1] * 0.45) + ',' + Math.round(c[2] * 0.7) + ',0.55)';
    g.lineJoin = 'round'; g.stroke();
    g.restore();
  }

  // Hoof (rig units; origin = fetlock joint, leg comes from above, toe forward)
  function drawHoof(g, far) {
    var pts = [[-18, -8], [-22, 16], [-20, 40], [2, 46], [31, 45], [38, 36], [28, 12], [18, -9], [0, -14]];
    smooth(g, pts, 0.17);
    g.fillStyle = far ? lin(g, 0, -8, 0, 46, [[0, '#c878a6'], [1, '#a4588c']]) : lin(g, 0, -8, 0, 46, [[0, C.hoof], [1, C.hoofDeep]]);
    g.fill();
    outline(g, 3);
    ellipsePath(g, -3, 10, 9, 4.4, -0.2);
    g.fillStyle = 'rgba(255,255,255,0.4)'; g.fill();
  }

  // ============================================================= BONGO ====
  // Curly sherpa-fleece shape: a smooth blob whose silhouette is scalloped
  // with little round tufts, filled cream, then covered in tiny curls.
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
    var tufts = [], acc = 0, next = 0, tr = o.tuft || 10;
    for (i = 0; i < n; i++) {
      var p = poly[i], q = poly[(i + 1) % n];
      acc += Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (acc >= next) {
        var r = tr * (0.75 + rnd() * 0.55);
        var dx = cx - p[0], dy = cy - p[1], d = Math.hypot(dx, dy) || 1;
        tufts.push([p[0] + dx / d * r * 0.55, p[1] + dy / d * r * 0.55, r]);
        next = acc + r * (1.05 + rnd() * 0.35);
      }
    }
    function whole(noBegin) { smooth(g, pts, f, noBegin); circlesPath(g, tufts, true); }
    // outline underneath: only the outer half of the stroke stays visible
    g.beginPath(); whole(true);
    outline(g, 5.2, C.furLine);
    g.save();
    g.beginPath(); whole(true);
    g.fillStyle = lin(g, minx, miny, maxx, maxy, [[0, C.furHi], [0.45, C.fur], [1, C.furShade]]);
    g.fill();
    g.clip();
    // soft volume
    var w = maxx - minx, h = maxy - miny, big = Math.max(w, h);
    softSpot(g, minx + w * 0.34, miny + h * 0.26, big * 0.5, '255,255,255', 0.6);
    softSpot(g, minx + w * 0.78, maxy - h * 0.06, big * 0.55, '178,140,104', o.shade === undefined ? 0.4 : o.shade);
    softSpot(g, minx + w * 0.1, maxy - h * 0.1, big * 0.4, '170,136,150', 0.2);
    // scallop shading inside each tuft
    g.lineCap = 'round';
    for (i = 0; i < tufts.length; i++) {
      var t = tufts[i];
      g.beginPath(); g.arc(t[0], t[1], t[2] * 0.72, 0.1, 1.9);
      g.lineWidth = 1.8; g.strokeStyle = 'rgba(176,142,104,0.3)'; g.stroke();
      g.beginPath(); g.arc(t[0], t[1], t[2] * 0.6, 3.3, 5.1);
      g.lineWidth = 1.8; g.strokeStyle = 'rgba(255,255,255,0.75)'; g.stroke();
    }
    // curls: little embossed c-shapes all over
    var count = Math.round(w * h / (o.dens || 58));
    for (i = 0; i < count; i++) {
      var x = minx + rnd() * w, y = miny + rnd() * h, cr = 3.2 + rnd() * 3.6, a0 = rnd() * TAU, sw = 1.7 + rnd() * 1.9;
      g.beginPath(); g.arc(x + 1.1, y + 1.3, cr, a0, a0 + sw);
      g.lineWidth = 2.1; g.strokeStyle = 'rgba(170,134,98,' + (0.2 + rnd() * 0.16) + ')'; g.stroke();
      g.beginPath(); g.arc(x, y, cr, a0, a0 + sw);
      g.lineWidth = 1.9; g.strokeStyle = 'rgba(255,255,255,' + (0.55 + rnd() * 0.35) + ')'; g.stroke();
    }
    g.restore();
  }

  var ARM_L = [[176, 246], [124, 240], [72, 252], [38, 278], [34, 310], [58, 332], [110, 332], [170, 320]];
  var ARM_R = [[336, 246], [392, 244], [444, 266], [482, 304], [490, 340], [464, 368], [416, 356], [344, 322]];
  // seated: chubby legs hang down over Stella's side, ending in big round feet
  var LEG_L = [[150, 492], [214, 492], [230, 540], [224, 592], [200, 640], [150, 660], [96, 646], [62, 606], [70, 560], [106, 522]];
  var LEG_R = LEG_L.map(function (p) { return [512 - p[0], p[1]]; });

  // crochet stitches: staggered rows of little "v" loops with ridges between
  function crochet(g, x0, y0, x1, y1, seed) {
    var rnd = mulberry(seed), r, x, row = 0;
    g.lineCap = 'round';
    for (r = y0; r < y1; r += 12, row++) {
      var off = (row % 2) * 6;
      g.beginPath(); g.moveTo(x0, r + 5.5); g.lineTo(x1, r + 5.5);
      g.lineWidth = 2; g.strokeStyle = 'rgba(16,44,96,0.4)'; g.stroke();
      for (x = x0 + off; x < x1; x += 12) {
        var jx = x + (rnd() - 0.5) * 1.6, jy = r + (rnd() - 0.5) * 1.6;
        g.beginPath(); g.moveTo(jx - 3.8, jy - 3.2); g.quadraticCurveTo(jx, jy + 5, jx + 3.8, jy - 3.2);
        g.lineWidth = 3.4; g.strokeStyle = C.blueDark; g.stroke();
        g.beginPath(); g.moveTo(jx - 3.4, jy - 3.8); g.quadraticCurveTo(jx, jy + 2.6, jx + 3.4, jy - 3.8);
        g.lineWidth = 1.6; g.strokeStyle = C.blueHi; g.stroke();
      }
    }
  }

  // Overall SHORTS: a narrower bib on top, wide shorts below with an open-mesh
  // band (cream fur shows through the holes), two leg cuffs and a crotch notch.
  var OVER = [[170, 270], [212, 276], [256, 278], [300, 276], [342, 270], [348, 322], [372, 340], [398, 352],
    [405, 420], [402, 492], [396, 532], [344, 552], [292, 548], [256, 520], [220, 548], [168, 552],
    [116, 532], [110, 492], [107, 420], [114, 352], [140, 340], [164, 322]];

  function drawBongoTorso(g) {
    // cream body behind the overalls
    var body = [[166, 236], [256, 226], [346, 236], [388, 296], [400, 400], [392, 500], [340, 536], [256, 542],
      [172, 536], [120, 500], [112, 400], [124, 296]];
    furShape(g, body, 0.17, 43, { shade: 0.3 });
    // shoulder straps (under the bib corners), going up and out over the shoulders
    [[[152, 236], [184, 232], [200, 280], [166, 286]], [[360, 236], [328, 232], [312, 280], [346, 286]]].forEach(function (s) {
      smooth(g, s, 0.12);
      g.fillStyle = C.blue; g.fill();
      g.save(); g.clip(); crochet(g, 140, 226, 372, 292, 5); g.restore();
      smooth(g, s, 0.12); outline(g, 2.6, 'rgba(22,48,100,0.65)');
    });
    smooth(g, OVER, 0.13);
    g.fillStyle = C.blue; g.fill();
    g.save(); g.clip();
    crochet(g, 100, 274, 412, 560, 77);
    // open mesh band on the shorts: rounded holes with cream fur behind
    var r, cc, row = 0;
    var mr = mulberry(12);
    for (r = 406; r <= 500; r += 18.5, row++) {
      for (cc = 0; cc < 18; cc++) {
        var hx = 120 + cc * 18.5 + (row % 2) * 9 + (mr() - 0.5) * 3, hy = r + (mr() - 0.5) * 3, hs = 4.6 + mr() * 1.4;
        if (hx > 396) continue;
        g.beginPath(); g.roundRect(hx - hs - 1.5, hy - hs - 2, hs * 2 + 3, hs * 2 + 3.5, 4);
        g.fillStyle = 'rgba(10,28,70,0.92)'; g.fill();
        g.beginPath(); g.roundRect(hx - hs + 0.5, hy - hs + 1, hs * 2 - 0.5, hs * 2 - 0.5, 3.4);
        g.fillStyle = mr() < 0.35 ? '#cdbb98' : '#eadfc6'; g.fill();
      }
    }
    // waistband + hem ridges
    g.lineCap = 'round';
    [[344, 0.5], [394, 0.4], [510, 0.5]].forEach(function (b) {
      g.beginPath(); g.moveTo(100, b[0]); g.quadraticCurveTo(256, b[0] + 6, 412, b[0]);
      g.lineWidth = 4; g.strokeStyle = 'rgba(14,38,88,' + b[1] + ')'; g.stroke();
      g.beginPath(); g.moveTo(100, b[0] - 4); g.quadraticCurveTo(256, b[0] + 2, 412, b[0] - 4);
      g.lineWidth = 2; g.strokeStyle = 'rgba(120,176,230,0.45)'; g.stroke();
    });
    // crotch seam between the two leg cuffs
    g.beginPath(); g.moveTo(256, 498); g.lineTo(256, 524);
    g.lineWidth = 3; g.strokeStyle = 'rgba(14,38,88,0.5)'; g.stroke();
    // gentle painterly shading
    g.fillStyle = lin(g, 110, 0, 405, 0, [[0, 'rgba(10,24,70,0.22)'], [0.25, 'rgba(255,255,255,0.1)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(10,24,70,0.3)']]);
    g.fillRect(100, 260, 320, 300);
    g.fillStyle = lin(g, 0, 270, 0, 552, [[0, 'rgba(255,255,255,0.14)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(10,20,60,0.28)']]);
    g.fillRect(100, 260, 320, 300);
    g.restore();
    smooth(g, OVER, 0.13); outline(g, 3, 'rgba(22,48,100,0.7)');
    // red buttons on the bib corners
    [[182, 280], [330, 280]].forEach(function (b) {
      var bx = b[0], by = b[1];
      dot(g, bx, by + 1, 17, 'rgba(120,24,40,0.85)');
      dot(g, bx, by, 15.5, '#e23c44');
      g.beginPath(); g.arc(bx, by, 10.5, 0, TAU); g.lineWidth = 2; g.strokeStyle = 'rgba(150,24,36,0.6)'; g.stroke();
      ellipsePath(g, bx - 5, by - 8, 6.5, 3, -0.5); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fill();
      dot(g, bx - 3.6, by - 3.6, 2.1, '#7a1a20'); dot(g, bx + 3.6, by - 3.6, 2.1, '#7a1a20');
      dot(g, bx - 3.6, by + 3.6, 2.1, '#7a1a20'); dot(g, bx + 3.6, by + 3.6, 2.1, '#7a1a20');
    });
  }

  // Head (traced): big and round, wider than tall; round ears; a large round
  // pale muzzle low on the face with the black nose on its top edge.
  var HEAD = [[256, 30], [326, 40], [380, 80], [404, 140], [396, 196], [356, 238], [256, 256], [156, 238],
    [116, 196], [108, 140], [132, 80], [186, 40]];
  var MZ = [256, 168, 62, 55];
  function drawBongoHead(g) {
    function ear(x, y, r, seed) {
      var pts = [], q;
      for (q = 0; q < 10; q++) pts.push([x + Math.cos(q / 10 * TAU) * r, y + Math.sin(q / 10 * TAU) * r]);
      furShape(g, pts, 0.18, seed, { tuft: 8, shade: 0.25 });
      ellipsePath(g, x, y + 2, r * 0.6, r * 0.62, 0);
      g.fillStyle = rad(g, x, y + 4, 2, r * 0.66, [[0, '#d9bf98'], [0.7, '#e2cba6'], [1, 'rgba(232,214,180,0)']]); g.fill();
    }
    ear(124, 108, 40, 53);
    ear(388, 108, 40, 54);
    furShape(g, HEAD, 0.18, 51, { tuft: 11, shade: 0.32 });
    // rosy cheeks (always a little)
    softSpot(g, 172, 186, 30, '246,140,150', 0.42);
    softSpot(g, 340, 186, 30, '246,140,150', 0.42);
    // muzzle: short-pile, smoother and paler
    ellipsePath(g, MZ[0], MZ[1] + 3, MZ[2] + 3, MZ[3] + 3, 0);
    g.fillStyle = 'rgba(176,142,110,0.3)'; g.fill();
    ellipsePath(g, MZ[0], MZ[1], MZ[2], MZ[3], 0);
    g.fillStyle = rad(g, MZ[0] - 14, MZ[1] - 20, 6, 86, [[0, '#fffaf0'], [0.6, '#f6ead2'], [1, '#e6d4b2']]);
    g.fill();
    g.save(); g.clip();
    var rnd = mulberry(52);
    for (var i = 0; i < 70; i++) {
      var x = MZ[0] - MZ[2] + rnd() * MZ[2] * 2, y = MZ[1] - MZ[3] + rnd() * MZ[3] * 2;
      dot(g, x, y, 1.2 + rnd() * 1.2, rnd() < 0.5 ? 'rgba(255,255,255,0.7)' : 'rgba(190,160,120,0.22)');
    }
    g.restore();
    ellipsePath(g, MZ[0], MZ[1], MZ[2], MZ[3], 0); outline(g, 1.8, 'rgba(150,116,120,0.35)');
    // black nose on the top edge of the muzzle (rounded triangle)
    var nose = [[228, 110], [256, 104], [284, 110], [290, 122], [274, 136], [256, 141], [238, 136], [222, 122]];
    smooth(g, nose, 0.2);
    g.fillStyle = lin(g, 0, 104, 0, 141, [[0, '#4a3c44'], [1, '#1f171c']]); g.fill();
    ellipsePath(g, 247, 113, 11, 4.2, -0.15);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fill();
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

  var cache = [];     // 2 most recent scales

  function build(ppu) {
    var P = {}, i;
    P.tailClear = sPart(ppu, [150, 290], [20, 212, 170, 420], drawTailClear);
    P.tailPink = sPart(ppu, [150, 290], [80, 240, 172, 412], drawTailPink);
    P.mane = sPart(ppu, [440, 230], [366, 40, 520, 246], drawMane);
    P.body = sPart(ppu, [330, 330], [116, 226, 546, 412], drawBody);
    P.bfly = sPart(ppu, BF, [404, 262, 524, 382], drawButterfly, true);
    P.neck = sPart(ppu, NECK_PNG, [392, 26, 630, 290], drawNeckHead);
    P.hoofNear = makeSpr(ppu, [-26, -18, 42, 50], function (g) { drawHoof(g, false); });
    P.hoofFar = makeSpr(ppu, [-26, -18, 42, 50], function (g) { drawHoof(g, true); });

    P.bArmL = bPart(ppu, [164, 276], [18, 224, 190, 348], function (g) { furShape(g, ARM_L, 0.2, 61, { tuft: 9 }); });
    P.bArmR = bPart(ppu, [348, 276], [322, 228, 506, 384], function (g) { furShape(g, ARM_R, 0.2, 62, { tuft: 9 }); });
    P.bTail = bPart(ppu, [140, 500], [46, 452, 150, 552], function (g) {
      var pts = [], n = 10;
      for (var q = 0; q < n; q++) { var a = q / n * TAU; pts.push([96 + Math.cos(a) * 34, 502 + Math.sin(a) * 33]); }
      furShape(g, pts, 0.18, 44, { tuft: 9, dens: 40 });
    });
    P.bLegL = bPart(ppu, [184, 506], [44, 474, 244, 676], function (g) { furShape(g, LEG_L, 0.17, 41, { tuft: 11 }); });
    P.bLegR = bPart(ppu, [328, 506], [268, 474, 468, 676], function (g) { furShape(g, LEG_R, 0.17, 42, { tuft: 11 }); });
    P.bTorso = bPart(ppu, [256, 530], [94, 210, 418, 560], drawBongoTorso);
    P.bHead = bPart(ppu, [256, 236], [70, 14, 442, 274], drawBongoHead);

    // tinted lights: horn + glow halos, 24 hue steps (rendered once)
    P.horn = []; P.hornGlow = []; P.bflyGlow = [];
    var hp = HORN;
    for (i = 0; i < GLOW_STEPS; i++) {
      var col = hueRGB(i);
      P.horn.push(makeSpr(ppu, [-24, -90, 100, 26], function (g) {
        g.translate(-hp[0], -hp[1]); g.translate(SX, SY); g.scale(SK, SK); drawHorn(g, col);
      }, true));
      P.hornGlow.push(makeSpr(ppu, [-90, -90, 90, 90], function (g) { g.drawImage(glowSpr(col, 64, 0.85), -90, -90, 180, 180); }, true, 0.5));
      var hc = hueRGB((i + 8) % GLOW_STEPS);
      P.bflyGlow.push(makeSpr(ppu, [-104, -104, 104, 104], function (g) { g.drawImage(glowSpr(hc, 64, 0.6), -104, -104, 208, 208); }, true, 0.5));
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
  function placeHalo(g, spr, x, y, r) {
    g.save();
    g.translate(x, y);
    if (r) g.rotate(r);
    g.drawImage(spr.halo, spr.ox, spr.oy, spr.lw, spr.lh);
    g.restore();
  }

  // ---- Stella's legs: one continuous shape per leg, built live each frame.
  // A two-bone skeleton (hip -> joint -> fetlock) is rounded into a smooth
  // spine and given a tapering width, so there is never a visible knee seam.
  var LEGS = {
    // hip (png), rest angles [upper, lower] (rad from straight down, + = forward), gallop phase
    nf: { hip: R(478, 318), rest: [0.46, -0.04], ph: 0.0, front: true, far: false, A: 196, B: 172 },
    ff: { hip: R(480, 336), rest: [-0.3, -0.2], ph: 0.5, front: true, far: true, A: 196, B: 172 },
    nh: { hip: R(196, 326), rest: [0.02, 0.6], ph: Math.PI + 0.35, front: false, far: false, A: 222, B: 166 },
    fh: { hip: R(176, 336), rest: [-0.16, -0.5], ph: Math.PI + 0.85, front: false, far: true, A: 222, B: 166 }
  };
  var WID_FRONT = [50, 42, 31, 24, 20.5, 18, 16.5, 15.5, 16.5];
  var WID_HIND = [64, 54, 37, 27, 22.5, 19.5, 17.5, 16.5, 17.5];
  var SPX = new Float64Array(9), SPY = new Float64Array(9), LX = new Float64Array(9), LY = new Float64Array(9),
    RX = new Float64Array(9), RY = new Float64Array(9);

  function legPose(L, ph, run, by) {
    var c = ph + L.ph, s = Math.sin(c), bump, a1, a2;
    if (L.front) {
      // reach far forward almost straight, then tuck the knee under while coming back
      bump = 0.5 + 0.5 * Math.cos(c + 0.9); bump *= bump;
      a1 = 0.3 + 0.58 * s; a2 = a1 - (0.12 + 0.68 * bump);
    } else {
      // stretch out behind, then tuck up and swing under the belly
      bump = 0.5 + 0.5 * Math.cos(c - 0.1); bump *= bump;
      a1 = -0.12 + 0.5 * s; a2 = a1 + 0.26 - 0.8 * bump;
    }
    var idle = 1 - run;
    a1 = L.rest[0] * idle + a1 * run;
    a2 = L.rest[1] * idle + a2 * run;
    var far = L.far ? 0.86 : 1, wid = L.front ? WID_FRONT : WID_HIND;
    var hx = L.hip[0], hy = L.hip[1] + by;
    var kx = hx + Math.sin(a1) * L.A, ky = hy + Math.cos(a1) * L.A;
    var fx = kx + Math.sin(a2) * L.B, fy = ky + Math.cos(a2) * L.B;
    // spine: straight, rounded around the joint, straight
    var p1x = hx + (kx - hx) * 0.66, p1y = hy + (ky - hy) * 0.66, p2x = kx + (fx - kx) * 0.36, p2y = ky + (fy - ky) * 0.36, i, t, u;
    SPX[0] = hx; SPY[0] = hy;
    SPX[1] = hx + (kx - hx) * 0.33; SPY[1] = hy + (ky - hy) * 0.33;
    SPX[2] = p1x; SPY[2] = p1y;
    for (i = 1; i <= 3; i++) {
      t = i / 4; u = 1 - t;
      SPX[2 + i] = u * u * p1x + 2 * u * t * kx + t * t * p2x;
      SPY[2 + i] = u * u * p1y + 2 * u * t * ky + t * t * p2y;
    }
    SPX[6] = p2x; SPY[6] = p2y;
    SPX[7] = kx + (fx - kx) * 0.7; SPY[7] = ky + (fy - ky) * 0.7;
    SPX[8] = fx; SPY[8] = fy;
    for (i = 0; i < 9; i++) {
      var ia = i ? i - 1 : 0, ib = i < 8 ? i + 1 : 8;
      var tx = SPX[ib] - SPX[ia], ty = SPY[ib] - SPY[ia], d = Math.sqrt(tx * tx + ty * ty) || 1, w = wid[i] * far;
      // front edge a touch fuller on the upper leg (forearm / thigh muscle)
      LX[i] = SPX[i] + ty / d * w; LY[i] = SPY[i] - tx / d * w;
      RX[i] = SPX[i] - ty / d * w; RY[i] = SPY[i] + tx / d * w;
    }
    var p = new Path2D();
    p.moveTo(LX[0], LY[0]);
    for (i = 1; i < 8; i++) p.quadraticCurveTo(LX[i], LY[i], (LX[i] + LX[i + 1]) / 2, (LY[i] + LY[i + 1]) / 2);
    p.lineTo(LX[8], LY[8]); p.lineTo(RX[8], RY[8]);
    for (i = 7; i > 0; i--) p.quadraticCurveTo(RX[i], RY[i], (RX[i] + RX[i - 1]) / 2, (RY[i] + RY[i - 1]) / 2);
    p.lineTo(RX[0], RY[0]);
    p.closePath();
    // highlight streak + coat dots down the front of the leg
    var hl = null, dots = null;
    if (!L.far) {
      hl = new Path2D();
      hl.moveTo(SPX[3] + (LX[3] - SPX[3]) * 0.3, SPY[3] + (LY[3] - SPY[3]) * 0.3);
      for (i = 4; i < 8; i++) hl.lineTo(SPX[i] + (LX[i] - SPX[i]) * 0.3, SPY[i] + (LY[i] - SPY[i]) * 0.3);
      dots = new Path2D();
      for (i = 2; i < 8; i++) {
        var k = (i % 2 ? 0.45 : -0.4), dxp = SPX[i] + (RX[i] - SPX[i]) * k, dyp = SPY[i] + (RY[i] - SPY[i]) * k;
        dots.moveTo(dxp + 3, dyp); dots.arc(dxp, dyp, i < 4 ? 3.2 : 2.4, 0, TAU);
      }
    }
        // hoof: mostly level, toe tips down when the leg is lifted or trailing
    var hr = L.front ? -a2 * 0.4 + Math.max(0, a1 - a2) * 1.5 : -a2 * 0.35 + Math.max(0, -a2) * 1.3;
    return { p: p, hl: hl, dots: dots, hx: hx, hy: hy, fx: fx, fy: fy, hr: hr, far: L.far };
  }

  function legHalo(g, lp, P) {
    g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 30; g.stroke(lp.p);
    g.lineWidth = 20; g.stroke(lp.p);
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 10; g.stroke(lp.p);
    placeHalo(g, lp.far ? P.hoofFar : P.hoofNear, lp.fx, lp.fy, lp.hr);
  }

  function legDraw(g, lp, P) {
    var gr = g.createLinearGradient(lp.hx, lp.hy, lp.fx, lp.fy), st = g.createLinearGradient(lp.hx, lp.hy, lp.fx, lp.fy);
    if (lp.far) {
      gr.addColorStop(0, '#d9a2c4'); gr.addColorStop(1, '#c78cb6');
      g.fillStyle = gr; g.fill(lp.p);
      g.strokeStyle = C.line; g.lineWidth = 3; g.stroke(lp.p);
    } else {
      // the top fades into the body so thigh and shoulder melt into the torso
      gr.addColorStop(0, 'rgba(226,170,202,0)'); gr.addColorStop(0.07, 'rgba(226,170,202,0)');
      gr.addColorStop(0.22, 'rgba(228,172,204,1)'); gr.addColorStop(0.6, '#ecb6d2'); gr.addColorStop(1, '#e3a6c8');
      st.addColorStop(0, 'rgba(' + C.lineRGB + ',0)'); st.addColorStop(0.1, 'rgba(' + C.lineRGB + ',0)');
      st.addColorStop(0.26, 'rgba(' + C.lineRGB + ',0.66)'); st.addColorStop(1, 'rgba(' + C.lineRGB + ',0.66)');
      g.fillStyle = gr; g.fill(lp.p);
      g.strokeStyle = st; g.lineWidth = 3; g.stroke(lp.p);
      g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 7; g.stroke(lp.hl);
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.fill(lp.dots);
    }
    place(g, lp.far ? P.hoofFar : P.hoofNear, lp.fx, lp.fy, lp.hr);
  }

  var SEAT = B(256, 530);

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
    var k, lp;

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

    // Bongo: the whole bear sways around his seat, limbs and head follow loosely
    var bounce = -run * 6 * (0.5 + 0.5 * Math.sin(ph + 3.4));
    var bo = by + bounce - br * 0.8;
    var sway = 0.022 * Math.sin(t * 1.25) + run * 0.045 * Math.sin(ph + 2.6) + wave * 0.03;
    var cs = Math.cos(sway), sn = Math.sin(sway);
    function bItem(part, rot) {
      var dx = part.x - SEAT[0], dy = part.y - SEAT[1];
      return [part.s, SEAT[0] + dx * cs - dy * sn, SEAT[1] + bo + dx * sn + dy * cs, sway + rot];
    }
    var armL = 0.06 + run * 0.22 * Math.sin(ph + 1.6) + 0.05 * Math.sin(t * 1.7) + happy * 0.25;
    var armRsw = -0.04 + run * 0.22 * Math.sin(ph + 0.4) + 0.05 * Math.sin(t * 1.9 + 1) - happy * 0.25;
    var armRw = -1.45 + 0.3 * Math.sin(t * 10);
    var armR = armRsw + (armRw - armRsw) * wave;
    var ha = 0.035 * Math.sin(t * 1.6) + run * 0.05 * Math.sin(ph + 1.2) + wave * 0.07 - happy * 0.04 - sway * 0.5;
    var lgL = 0.05 * Math.sin(t * 1.5 + 0.6) + run * 0.16 * Math.sin(ph + 0.9);
    var lgR = 0.05 * Math.sin(t * 1.5 + 2.2) + run * 0.16 * Math.sin(ph + 1.7);
    items.push(bItem(P.bTail, 0.12 * Math.sin(t * 2.2) + run * 0.25 * Math.sin(ph + 2.2)));
    items.push(bItem(P.bArmL, armL));
    var armRItem = bItem(P.bArmR, armR);
    if (wave <= 0.25) items.push(armRItem);
    items.push(bItem(P.bLegL, lgL));
    items.push(bItem(P.bLegR, lgR));
    items.push(bItem(P.bTorso, 0));
    var headItem = bItem(P.bHead, ha);
    items.push(headItem);
    if (wave > 0.25) items.push(armRItem);       // waving arm in front of the head

    // pass 1: white sticker halos
    legHalo(g, lFH, P); legHalo(g, lFF, P); legHalo(g, lNH, P); legHalo(g, lNF, P);
    var n = items.length;
    for (k = 0; k < n; k++) placeHalo(g, items[k][0], items[k][1], items[k][2], items[k][3]);

    // pass 2: far legs, then sprites in order with live overlays at their z
    legDraw(g, lFH, P); legDraw(g, lFF, P);
    for (k = 0; k < n; k++) {
      var it = items[k];
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
        stellaFace(g, t, happy);
        g.restore();
      }
      if (it === headItem) {
        g.save();
        g.translate(it[1], it[2]); g.rotate(it[3]);
        bongoFace(g, t, happy, wave);
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

  // Stella's big blue eye and her smile (local = neck pivot coords, rig scale)
  var S_EYE = R(563, 117), S_MOUTH = [R(615, 187), R(600, 201), R(581, 186)];
  function stellaFace(g, t, happy) {
    var x = S_EYE[0] - PN[0], y = S_EYE[1] - PN[1];
    var open = 1 - Math.max(blink(t, 0), happy);
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (open > 0.25) {
      var ry = 17 * open, rx = 13;
      g.beginPath(); g.ellipse(x, y, rx, ry, 0.12, 0, TAU);
      g.fillStyle = '#fbfdff'; g.fill();
      g.save(); g.clip();
      g.beginPath(); g.ellipse(x + 1, y + 1.5, 11, Math.min(ry, 13), 0, 0, TAU);
      g.fillStyle = lin(g, x, y - 13, x, y + 13, [[0, '#2f7fc6'], [0.6, '#62b6e8'], [1, '#aee2f6']]); g.fill();
      dot(g, x + 1, y + 1.5, 6 * Math.min(1, open + 0.2), '#26264a');
      g.restore();
      dot(g, x - 3.5, y - 6 * open, 3.8, 'rgba(255,255,255,0.97)');
      dot(g, x + 5, y + 6 * open, 1.9, 'rgba(255,255,255,0.85)');
      g.beginPath(); g.ellipse(x, y, rx, ry, 0.12, 0, TAU);
      g.lineWidth = 2; g.strokeStyle = 'rgba(70,50,110,0.6)'; g.stroke();
      // soft upper lash line, lifted at the outer corner, with three lashes
      g.lineWidth = 3; g.strokeStyle = C.ink;
      g.beginPath(); g.ellipse(x, y, rx + 0.8, ry + 0.8, 0.12, Math.PI * 0.98, Math.PI * 1.72); g.stroke();
      g.lineWidth = 2.4;
      for (var i = 0; i < 3; i++) {
        var a = Math.PI * (1.04 + i * 0.19), ex = x + Math.cos(a) * (rx + 1), ey = y + Math.sin(a) * (ry + 1);
        g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex + Math.cos(a - 0.2) * 9, ey + Math.sin(a - 0.2) * 9); g.stroke();
      }
    } else {
      // closed: a happy upward-curved lash line
      g.lineWidth = 4; g.strokeStyle = C.ink;
      g.beginPath(); g.arc(x, y + 8, 13, Math.PI * 1.14, Math.PI * 1.86); g.stroke();
      g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(x - 11, y - 1); g.lineTo(x - 19, y - 5); g.stroke();
      g.beginPath(); g.moveTo(x - 6, y - 4); g.lineTo(x - 12, y - 11); g.stroke();
    }
    // smile: runs back from the lips and turns up into the cheek
    var m0 = S_MOUTH[0], m1 = S_MOUTH[1], m2 = S_MOUTH[2];
    var ax = m0[0] - PN[0], ay = m0[1] - PN[1], cx = m1[0] - PN[0], cy = m1[1] - PN[1] + happy * 9,
      bx = m2[0] - PN[0] - happy * 4, by = m2[1] - PN[1] - happy * 6;
    if (happy > 0.3) {
      g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(cx, cy + 4, bx, by); g.quadraticCurveTo(cx, cy - 12, ax, ay);
      g.fillStyle = 'rgba(190,60,110,' + (0.75 * (happy - 0.3) / 0.7) + ')'; g.fill();
    }
    g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(cx, cy, bx, by);
    g.lineWidth = 4; g.strokeStyle = 'rgba(150,44,104,0.9)'; g.stroke();
    g.beginPath(); g.arc(bx - 1, by - 1, 5, 0.3, 2.2);                 // dimple at the corner
    g.lineWidth = 2.6; g.strokeStyle = 'rgba(150,44,104,0.6)'; g.stroke();
  }

  // Bongo's eyes, brows and smile (local = head pivot coords)
  var B_HEAD = B(256, 236);
  function bongoFace(g, t, happy, wave) {
    var s = BK;
    function ex(x, y) { var p = B(x, y); return [p[0] - B_HEAD[0], p[1] - B_HEAD[1]]; }
    var bl = Math.max(blink(t, 1.7), happy);
    var smile = Math.max(happy, wave * 0.7);
    var le = ex(206, 126), re = ex(306, 126), m = ex(256, 140);
    g.lineCap = 'round'; g.lineJoin = 'round';
    // small raised brows: open, friendly
    g.lineWidth = 4 * s; g.strokeStyle = 'rgba(150,116,84,0.55)';
    [[le, -1], [re, 1]].forEach(function (q) {
      var p = q[0], d = q[1], lift = (6 + smile * 5) * s;
      g.beginPath(); g.moveTo(p[0] - 10 * s, p[1] - 17 * s - lift + 3 * s * d * -1);
      g.quadraticCurveTo(p[0], p[1] - 24 * s - lift, p[0] + 10 * s, p[1] - 17 * s - lift + 3 * s * d);
      g.stroke();
    });
    if (bl > 0.5) {
      g.lineWidth = 6 * s; g.strokeStyle = '#2b2025';
      [le, re].forEach(function (p) {
        g.beginPath(); g.arc(p[0], p[1] + 7 * s, 11 * s, Math.PI * 1.13, Math.PI * 1.87); g.stroke();
      });
    } else {
      [le, re].forEach(function (p) {
        dot(g, p[0], p[1], 9 * s, '#1e161a');
        dot(g, p[0] - 3 * s, p[1] - 3.5 * s, 3.6 * s, 'rgba(255,255,255,0.95)');
        dot(g, p[0] + 3.5 * s, p[1] + 3.5 * s, 1.6 * s, 'rgba(255,255,255,0.6)');
        // little smiling crease under the eye
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
    g.lineWidth = 6.4 * s; g.strokeStyle = '#33252a';
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

  // ------------------------------------------------------------- anchors
  // Rest-pose points in rig units. "follows" notes which part moves them.
  var A = {
    stellaHind: R(172, 318),        // body (bobs slightly)
    stellaBelly: R(320, 372),       // body
    stellaChest: R(512, 352),       // body, just under the butterfly light
    stellaNeck: R(452, 176),        // neck (swings a little around neck base)
    stellaCheek: R(566, 160),       // head (follows the neck)
    stellaLegBack: R(200, 428),     // top of the near hind leg (moves little)
    stellaLegFront: R(500, 420),    // top of the near front leg (moves little)
    bongoCheek: B(176, 186),        // Bongo head
    bongoTummy: B(256, 372),        // Bongo torso (overalls bib)
    bongoArm: B(82, 290),           // Bongo's left arm (viewer's left)
    body: { x: 450, y: 560, r: 330 }
  };

  window.Characters = {
    W: W, H: H, anchors: A,
    prerender: function (ppu) { prerender(ppu); },
    draw: draw
  };
})();
