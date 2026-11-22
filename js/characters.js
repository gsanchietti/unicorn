/* characters.js - Stella (pink unicorn toy) and Bongo (teddy in blue crocheted
 * overalls), drawn from scratch as an animated cut-out puppet rig.
 *
 * Every part is pre-rendered once into its own sprite (plus a soft white halo
 * sprite for the cut-out glow). Per frame, draw() only places cached sprites
 * with translate / rotate around joints. Classic script: window.Characters.
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
  var PAD = 14;                          // sprite margin for the halo (rig units)

  // png-space -> rig mapping
  var SK = 1.28, SX = 50, SY = 200;      // Stella
  var BK = 0.66, BX = 262, BY = 178;     // Bongo
  function R(x, y) { return [x * SK + SX, y * SK + SY]; }
  function B(x, y) { return [x * BK + BX, y * BK + BY]; }

  // ------------------------------------------------------------ palette
  var C = {
    line: 'rgba(118,82,150,0.62)',        // soft dark-lilac outline
    pBase: '#f1bad5', pHi: '#fde3f0', pShade: '#c995bf', pDeep: '#a870a8',
    hoof: '#d8709f', hoofDeep: '#b04f82',
    mane: '#f77db6', maneHi: '#ffb4d6', maneDeep: '#e35d9c',
    muzzle: '#e79bc0',
    fur: '#f7edd3', furHi: '#fffaf0', furShade: '#d8c6a0', furDark: '#bba984',
    muzzleB: '#efe0c2',
    blue: '#2a6aa8', blueDark: '#1c4e86', blueHi: '#4e92cf',
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

  function circlesPath(g, cs) {
    g.beginPath();
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

  // tiny embossed 6-dot "snowflake" flower, the pattern on Stella's coat
  function snow(g, x, y, r, a) {
    g.fillStyle = 'rgba(255,255,255,' + a + ')';
    g.beginPath();
    g.arc(x, y, r * 0.55, 0, TAU);
    for (var k = 0; k < 6; k++) {
      var an = k * TAU / 6;
      g.moveTo(x + Math.cos(an) * r + r * 0.4, y + Math.sin(an) * r);
      g.arc(x + Math.cos(an) * r, y + Math.sin(an) * r, r * 0.4, 0, TAU);
    }
    g.fill();
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
  function makeSpr(ppu, bb, draw, noHalo, res, edge) {
    res = res || 1;
    var x0 = bb[0] - PAD, y0 = bb[1] - PAD, w = bb[2] - bb[0] + PAD * 2, h = bb[3] - bb[1] + PAD * 2;
    var c = cv(w * ppu * res, h * ppu * res), g = c.getContext('2d');
    g.scale(c.width / w, c.height / h);
    g.translate(-x0, -y0);
    draw(g);
    c.ox = x0; c.oy = y0; c.lw = w; c.lh = h;
    if (!noHalo) c.halo = makeHalo(c, ppu);
    if (edge) c.edge = makeEdge(c, ppu);
    return c;
  }

  // soft white outer glow of the silhouette (the "cut-out" look)
  function makeHalo(spr, ppu) {
    var s = cv(spr.width, spr.height), sg = s.getContext('2d');
    sg.drawImage(spr, 0, 0);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = '#fff';
    sg.fillRect(0, 0, s.width, s.height);
    var h = cv(spr.width, spr.height), g = h.getContext('2d');
    g.shadowColor = 'rgba(255,255,255,1)';
    g.shadowBlur = 8 * ppu * (spr.width / (spr.lw * ppu));
    for (var i = 0; i < 3; i++) g.drawImage(s, 0, 0);
    return h;
  }

  // dilated silhouette in outline color (drawn under limb segments)
  function makeEdge(spr, ppu) {
    var s = cv(spr.width, spr.height), sg = s.getContext('2d');
    sg.drawImage(spr, 0, 0);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = '#7a5496';
    sg.fillRect(0, 0, s.width, s.height);
    var e = cv(spr.width, spr.height), g = e.getContext('2d');
    var r = 2.4 * ppu * (spr.width / (spr.lw * ppu));
    for (var i = 0; i < 14; i++) g.drawImage(s, Math.cos(i / 14 * TAU) * r, Math.sin(i / 14 * TAU) * r);
    return e;
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
  // Fluffy pink/white mass made of circles (mane, tail).
  function fluff(g, cs, base, hi, deep, seed, alpha) {
    var rnd = mulberry(seed), i;
    circlesPath(g, cs);                         // outline underneath: inner arcs get hidden by the fill
    outline(g, 5, 'rgba(160,70,140,0.5)');
    g.save();
    circlesPath(g, cs);
    var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    cs.forEach(function (c) {
      minx = Math.min(minx, c[0] - c[2]); maxx = Math.max(maxx, c[0] + c[2]);
      miny = Math.min(miny, c[1] - c[2]); maxy = Math.max(maxy, c[1] + c[2]);
    });
    g.fillStyle = lin(g, minx, miny, maxx, maxy, [[0, hi], [0.55, base], [1, deep]]);
    g.globalAlpha = alpha || 1;
    g.fill();
    g.clip();
    g.globalAlpha = 1;
    // soft hair strands
    g.lineCap = 'round';
    for (i = 0; i < 26; i++) {
      var c = cs[Math.floor(rnd() * cs.length)];
      var a = rnd() * TAU, d = rnd() * c[2] * 0.7;
      var x = c[0] + Math.cos(a) * d, y = c[1] + Math.sin(a) * d;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + (rnd() - 0.3) * 14, y + 8 + rnd() * 10, x + (rnd() - 0.2) * 18, y + 16 + rnd() * 16);
      g.lineWidth = 1.6 + rnd() * 1.4;
      g.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.3)' : 'rgba(210,70,140,0.16)';
      g.stroke();
    }
    g.restore();
  }

  function drawMane(g) {
    fluff(g, [[468, 66, 26], [442, 84, 30], [418, 118, 32], [400, 156, 30], [394, 198, 26],
      [488, 50, 18], [430, 96, 26], [406, 140, 28]], C.mane, C.maneHi, C.maneDeep, 5);
  }
  function drawTailClear(g) {
    var cs = [[80, 312, 50], [58, 345, 40], [98, 262, 38], [76, 385, 38], [112, 365, 44], [42, 304, 30], [118, 300, 40]];
    circlesPath(g, cs.map(function (c) { return [c[0], c[1], c[2] + 2.5]; }));   // soft lilac rim
    g.fillStyle = 'rgba(196,160,222,0.45)'; g.fill();
    g.save();
    circlesPath(g, cs);
    g.fillStyle = lin(g, 30, 230, 150, 410, [[0, 'rgba(255,255,255,0.92)'], [0.6, 'rgba(240,222,246,0.88)'], [1, 'rgba(214,186,234,0.88)']]);
    g.fill();
    g.clip();
    g.lineCap = 'round';
    var rnd = mulberry(9);
    for (var i = 0; i < 34; i++) {
      var x = 40 + rnd() * 100, y = 240 + rnd() * 150;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x - 10 + rnd() * 8, y + 14, x - 6 + rnd() * 16, y + 28 + rnd() * 10);
      g.lineWidth = 1.5;
      g.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.7)' : 'rgba(200,170,225,0.35)';
      g.stroke();
    }
    g.restore();
  }
  function drawTailPink(g) {
    fluff(g, [[138, 296, 24], [124, 332, 28], [130, 368, 26], [114, 396, 19], [142, 268, 18],
      [106, 350, 22], [120, 300, 20]], C.mane, C.maneHi, C.maneDeep, 7);
  }

  // Stella's torso with coat dots, butterfly decal, shading
  function drawBody(g) {
    var pts = [[128, 316], [138, 288], [165, 267], [215, 258], [290, 256], [350, 254], [398, 243],
      [450, 247], [513, 256], [527, 285], [525, 322], [507, 360], [470, 383], [410, 389], [340, 392],
      [270, 387], [205, 382], [155, 364], [131, 342]];
    smooth(g, pts, 0.16);
    g.fillStyle = lin(g, 0, 250, 0, 392, [[0, C.pHi], [0.3, C.pBase], [0.75, '#e2a8c8'], [1, C.pShade]]);
    g.fill();
    g.save();
    g.clip();
    // pearly sheen on the back and shoulder, darker belly/hind
    g.fillStyle = rad(g, 300, 270, 0, 180, [[0, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
    g.fillRect(100, 230, 460, 200);
    g.fillStyle = rad(g, 190, 380, 0, 110, [[0, 'rgba(150,100,170,0.35)'], [1, 'rgba(150,100,170,0)']]);
    g.fillRect(100, 300, 220, 120);
    g.fillStyle = rad(g, 470, 300, 0, 120, [[0, 'rgba(255,255,255,0.4)'], [1, 'rgba(255,255,255,0)']]);
    g.fillRect(380, 240, 160, 180);
    // coat dots
    var rnd = mulberry(21);
    for (var i = 0; i < 120; i++) {
      var x = 135 + rnd() * 390, y = 255 + rnd() * 150;
      if (Math.hypot(x - 462, y - 320) < 62) continue;
      snow(g, x, y, 1.6 + rnd() * 1.6, 0.35 + rnd() * 0.4);
    }
    g.restore();
    smooth(g, pts, 0.16);
    outline(g, 3);
    drawButterfly(g);
  }

  // Butterfly decal: one fused silhouette of four round wings (2 fore, 2 hind),
  // tilted like on the toy, centered at png (467,322). Builds the path only.
  function wingPath(g) {
    g.save();
    g.translate(467, 322); g.rotate(0.5); g.scale(1.08, 1.08);
    g.beginPath();
    g.moveTo(0, -2); g.bezierCurveTo(8, -34, 44, -44, 50, -22); g.bezierCurveTo(54, -6, 30, 4, 0, 5); g.closePath();
    g.moveTo(0, 5); g.bezierCurveTo(26, 6, 40, 24, 28, 38); g.bezierCurveTo(16, 46, 2, 30, 0, 14); g.closePath();
    g.moveTo(0, -2); g.lineTo(0, 5); g.bezierCurveTo(-30, 4, -54, -6, -50, -22); g.bezierCurveTo(-44, -44, -8, -34, 0, -2); g.closePath();
    g.moveTo(0, 5); g.lineTo(0, 14); g.bezierCurveTo(-2, 30, -16, 46, -28, 38); g.bezierCurveTo(-40, 24, -26, 6, 0, 5); g.closePath();
    g.restore();
  }

  // tinted wing shimmer over the cream wings (rim and flowers stay untouched)
  function drawWingShimmer(g, c) {
    var col = c.map(function (v) { return Math.round(v * 0.5 + 127); }).join(',');   // washed out: wings stay cream
    wingPath(g);
    g.fillStyle = rad(g, 467, 322, 4, 56, [[0, 'rgba(255,255,255,0.08)'], [0.5, 'rgba(' + col + ',0.1)'], [1, 'rgba(' + col + ',0.26)']]);
    g.fill();
    dot(g, 492, 318, 2.6, '#fff'); dot(g, 446, 296, 2.2, '#fff'); dot(g, 455, 342, 2, '#fff');
  }

  function drawButterfly(g) {
    g.lineJoin = 'round';
    // rainbow rim: blue (left), red, orange, yellow bands stacked
    [['#e8574a', 13], ['#f4a13a', 9.5], ['#f5da4a', 6]].forEach(function (b) {
      wingPath(g); g.strokeStyle = b[0]; g.lineWidth = b[1]; g.stroke();
    });
    g.save();
    g.beginPath(); g.rect(380, 250, 82, 150); g.clip();
    wingPath(g); g.strokeStyle = '#4ab0e8'; g.lineWidth = 9; g.stroke();
    g.restore();
    // cream wings
    wingPath(g);
    g.fillStyle = lin(g, 430, 280, 505, 365, [[0, '#fffdf4'], [1, '#eee3c6']]);
    g.fill();
    // veins + body
    g.save();
    wingPath(g); g.clip();
    g.translate(467, 322); g.rotate(0.5); g.scale(1.08, 1.08);
    g.lineCap = 'round'; g.lineWidth = 1.3; g.strokeStyle = 'rgba(170,140,120,0.35)';
    [[20, -12, 44, -28], [18, -6, 46, -10], [14, 14, 26, 30], [-20, -12, -44, -28], [-18, -6, -46, -10], [-14, 14, -24, 30]].forEach(function (v) {
      g.beginPath(); g.moveTo(v[0] * 0.3, v[1] * 0.3); g.lineTo(v[2], v[3]); g.stroke();
    });
    g.restore();
    g.save();
    g.translate(467, 322); g.rotate(0.5); g.scale(1.08, 1.08);
    g.beginPath(); g.ellipse(0, 6, 3.4, 24, 0, 0, TAU);
    g.fillStyle = '#e6d8b4'; g.fill();
    g.lineWidth = 1; g.strokeStyle = 'rgba(150,120,110,0.5)'; g.stroke();
    g.restore();
    // little flowers around the decal
    flower(g, 423, 286, 9, '#ef6c92', '#ffd25a', 5);
    flower(g, 434, 304, 5, '#a78bd6', '#ffe08a', 5);
    dot(g, 507, 296, 3.6, '#2fb5b0'); dot(g, 513, 316, 3, '#5aa6e0');
    flower(g, 502, 356, 6, '#5b6fb0', '#f3d46a', 5);
    flower(g, 462, 370, 5, '#6a6fb0', '#f3d46a', 5);
    dot(g, 421, 340, 3.2, '#f2c24a');
  }

  // Leg parts (local coords: joint at 0,0, leg hangs down +y). far = darker.
  // Legs are drawn WITHOUT outline; a separate dilated "edge" sprite is drawn under
  // both segments so the knee seam never shows (one continuous silhouette).
  var L1 = 168, L2 = 182;
  function legTone(far) { return far ? ['#e3a8c8', '#c487b4', '#a46aa0'] : [C.pHi, C.pBase, C.pShade]; }

  function drawUpper(g, far) {
    var t = legTone(far);
    var pts = [[-26, -30], [-30, 10], [-25, 60], [-17, 115], [-13, L1 - 14], [-14, L1 + 6], [0, L1 + 14], [14, L1 + 6],
      [13, L1 - 14], [18, 115], [26, 60], [32, 10], [28, -30]];
    smooth(g, pts, 0.17);
    g.fillStyle = lin(g, -32, 0, 32, 0, [[0, t[1]], [0.4, t[0]], [1, t[2]]]);
    g.fill();
    g.save(); g.clip();
    var rnd = mulberry(far ? 3 : 4);
    for (var i = 0; i < 12; i++) snow(g, -12 + rnd() * 24, 5 + rnd() * 150, 1.4 + rnd() * 1.2, 0.5);
    g.restore();
  }

  function drawLower(g, far) {
    var t = legTone(far), hy = L2 - 46;
    var pts = [[-15, -16], [-15, 30], [-11, hy - 55], [-12, hy - 26], [-15, hy - 8], [-13, hy + 4], [13, hy + 4],
      [15, hy - 8], [12, hy - 26], [11, hy - 55], [15, 30], [15, -16]];
    smooth(g, pts, 0.16);
    g.fillStyle = lin(g, -14, 0, 14, 0, [[0, t[1]], [0.4, t[0]], [1, t[2]]]);
    g.fill();
    // neat hoof: darker pink, rounded, toe forward
    var hf = [[-12, hy - 2], [-15, hy + 24], [-11, hy + 42], [6, hy + 46], [24, hy + 42], [28, hy + 32], [19, hy + 12], [13, hy - 2]];
    smooth(g, hf, 0.16);
    g.fillStyle = lin(g, 0, hy, 0, hy + 46, [[0, C.hoof], [1, C.hoofDeep]]);
    g.fill();
    ellipsePath(g, -3, hy + 12, 6, 3.5, 0);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fill();
  }

  // Neck + head (one piece) in png coords; pivot at the neck base.
  // A long, slim, arched neck rising up and forward to a small refined head.
  function drawNeckHead(g) {
    var pts = [[402, 250], [401, 210], [406, 170], [420, 128], [444, 92], [472, 66], [498, 52],
      [505, 44], [510, 26], [522, 42], [542, 56], [566, 74], [588, 98], [603, 116], [610, 128],
      [606, 142], [592, 148], [574, 146], [556, 138], [540, 135], [528, 144], [517, 162],
      [510, 190], [509, 225], [514, 254], [522, 268], [455, 272], [402, 264]];
    smooth(g, pts, 0.14);
    g.fillStyle = lin(g, 400, 40, 600, 200, [[0, '#f8cce2'], [0.5, C.pBase], [1, '#d9a0c6']]);
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = rad(g, 520, 200, 0, 55, [[0, 'rgba(160,100,170,0.35)'], [1, 'rgba(160,100,170,0)']]);
    g.fillRect(450, 140, 140, 130);
    g.fillStyle = rad(g, 412, 190, 0, 70, [[0, 'rgba(160,100,170,0.3)'], [1, 'rgba(160,100,170,0)']]);
    g.fillRect(380, 100, 100, 170);
    g.fillStyle = rad(g, 540, 80, 0, 50, [[0, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]);
    g.fillRect(480, 30, 140, 110);
    // tapered muzzle: slightly darker pink
    g.fillStyle = rad(g, 600, 130, 0, 28, [[0, 'rgba(214,110,160,0.5)'], [0.7, 'rgba(226,130,175,0.3)'], [1, 'rgba(226,130,175,0)']]);
    g.fillRect(560, 90, 70, 80);
    var rnd = mulberry(33), i;
    for (i = 0; i < 26; i++) snow(g, 410 + rnd() * 96, 110 + rnd() * 140, 1.6 + rnd() * 1.2, 0.5);
    g.restore();
    smooth(g, pts, 0.14); outline(g, 3);

    // ear: inner soft pink
    ellipsePath(g, 514, 42, 4.5, 10, 0.25);
    g.fillStyle = 'rgba(255,200,225,0.8)'; g.fill();
    // nostril + mouth line
    ellipsePath(g, 601, 129, 5.5, 3.6, -0.6);
    g.fillStyle = 'rgba(150,60,110,0.6)'; g.fill();
    g.beginPath(); g.moveTo(590, 145); g.quadraticCurveTo(599, 147, 606, 140);
    outline(g, 2, 'rgba(150,60,110,0.5)');
    // brow garland of tiny embossed flowers (ear -> horn)
    for (i = 0; i < 5; i++) flower(g, 524 + i * 9, 58 + i * 4.2, 4.8, '#f7aacb', '#fff2f8', 5);
    // colored flower gems on the face and neck
    flower(g, 510, 76, 8, '#ff5b82', '#ffd1dc', 6);
    dot(g, 484, 92, 5.2, '#ffd23f'); dot(g, 494, 94, 4.8, '#ffd23f'); dot(g, 486, 102, 3.6, '#ffd23f');
    dot(g, 493, 103, 3.3, '#ffd23f'); dot(g, 489, 98, 2.1, '#f0a020');
    flower(g, 470, 116, 8, '#28b4ae', '#a8f0ea', 6);
    // collar band of embossed flowers
    g.beginPath(); g.moveTo(398, 246); g.quadraticCurveTo(460, 264, 522, 270);
    g.lineCap = 'round'; g.lineWidth = 24; g.strokeStyle = '#e48fbc'; g.stroke();
    g.lineWidth = 17; g.strokeStyle = '#f2b0d2'; g.stroke();
    g.lineWidth = 3; g.strokeStyle = 'rgba(200,70,130,0.75)';
    g.beginPath(); g.moveTo(400, 257); g.quadraticCurveTo(460, 275, 522, 281); g.stroke();
    for (i = 0; i < 9; i++) {
      var tt = i / 8, fx = (1 - tt) * (1 - tt) * 402 + 2 * tt * (1 - tt) * 460 + tt * tt * 520;
      var fy = (1 - tt) * (1 - tt) * 245 + 2 * tt * (1 - tt) * 264 + tt * tt * 270;
      flower(g, fx, fy, 5.2, '#fff0f8', i % 3 === 0 ? '#ffd24a' : '#f7a0c8', 5);
    }
  }

  // Horn, tinted: color c ([r,g,b]); local origin = horn base (png 577,78)
  function drawHorn(g, c) {
    g.save();
    g.translate(535, 52);
    g.rotate(-0.87);
    var col = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
    var light = 'rgb(' + Math.min(255, c[0] + 70) + ',' + Math.min(255, c[1] + 70) + ',' + Math.min(255, c[2] + 70) + ')';
    var dark = 'rgb(' + Math.round(c[0] * 0.78) + ',' + Math.round(c[1] * 0.7) + ',' + Math.round(c[2] * 0.82) + ')';
    g.beginPath();
    g.moveTo(-2, -14);
    g.lineTo(66, -2.4);
    g.arc(66, 0, 2.4, -Math.PI / 2 - 0.15, Math.PI / 2 + 0.15);
    g.lineTo(-2, 14);
    g.quadraticCurveTo(-9, 0, -2, -14);
    g.closePath();
    g.fillStyle = lin(g, 0, -14, 0, 14, [[0, light], [0.45, col], [1, dark]]);
    g.fill();
    g.save(); g.clip();
    g.lineWidth = 3.2; g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineCap = 'round';
    for (var k = 0; k < 6; k++) {                      // spiral bands
      g.beginPath();
      g.moveTo(6 + k * 10, -15); g.lineTo(2 + k * 10 + 12, 15);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,0.55)';            // lit core
    g.fillRect(0, -4.5, 62, 3);
    g.restore();
    g.restore();
  }

  // ============================================================= BONGO ====
  function furFill(g, shadeY0, shadeY1, seed, n, bb) {
    // texture + shading, call with the shape path already built and filled
    g.save();
    g.clip();
    g.fillStyle = lin(g, 0, shadeY0, 0, shadeY1, [[0, 'rgba(180,150,100,0)'], [1, 'rgba(180,150,100,0.35)']]);
    g.fillRect(bb[0], bb[1], bb[2] - bb[0], bb[3] - bb[1]);
    var rnd = mulberry(seed);
    g.lineCap = 'round';
    for (var i = 0; i < n; i++) {
      var x = bb[0] + rnd() * (bb[2] - bb[0]), y = bb[1] + rnd() * (bb[3] - bb[1]), r = 4 + rnd() * 4, a0 = rnd() * TAU;
      g.beginPath();
      g.arc(x, y, r, a0, a0 + 1.1);
      g.lineWidth = 1.6 + rnd();
      g.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.6)' : 'rgba(190,160,110,0.28)';
      g.stroke();
    }
    g.restore();
  }

  // fuzzy silhouette: bumpy dashes along the current path + a faint outline
  function fuzzy(g, fill) {
    g.save();
    g.setLineDash([0.1, 8]);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = 12; g.strokeStyle = fill; g.stroke();
    g.restore();
  }

  function drawFurShape(g, pts, f, seed, bb, shade) {
    smooth(g, pts, f);
    fuzzy(g, C.fur);
    smooth(g, pts, f);
    g.fillStyle = lin(g, bb[0], bb[1], bb[2], bb[3], [[0, C.furHi], [0.5, C.fur], [1, C.furShade]]);
    g.fill();
    furFill(g, shade[0], shade[1], seed, 150, bb);
    smooth(g, pts, f);
    outline(g, 2.2, 'rgba(130,100,150,0.4)');
  }

  var ARM_L = [[152, 252], [102, 248], [58, 260], [36, 284], [40, 312], [66, 330], [112, 322], [156, 302]];
  var ARM_R = [[352, 272], [402, 260], [450, 288], [486, 320], [489, 346], [456, 372], [402, 352], [352, 332]];

  function drawBongoLegs(g) {
    // seated: chubby legs hang forward over her side; far leg (left) behind, near leg (right) in front
    var legL = [[140, 500], [205, 505], [212, 545], [196, 590], [170, 628], [120, 640], [80, 620], [84, 580], [110, 540]];
    var legR = [[300, 505], [360, 495], [392, 530], [400, 580], [412, 625], [386, 655], [335, 660], [300, 640], [285, 600], [280, 545]];
    drawFurShape(g, legL, 0.17, 41, [70, 490, 220, 650], [520, 650]);
    drawFurShape(g, legR, 0.17, 42, [270, 490, 420, 670], [520, 670]);
  }

  function drawBongoTorso(g) {
    // cream body behind the overalls
    var body = [[130, 300], [190, 270], [260, 262], [330, 270], [385, 310], [398, 400], [388, 500], [330, 535], [260, 545], [185, 535], [128, 495], [118, 400]];
    drawFurShape(g, body, 0.17, 43, [115, 260, 400, 548], [380, 548]);
    // overalls: main bib + shorts
    var over = [[170, 292], [255, 306], [336, 290], [378, 330], [393, 400], [390, 490], [384, 526],
      [350, 548], [300, 544], [282, 514], [268, 490], [254, 514], [238, 544], [184, 548], [138, 530], [122, 482], [120, 400], [130, 336]];
    smooth(g, over, 0.15);
    g.fillStyle = C.blue; g.fill();
    g.save(); g.clip();
    // crochet rows: little v stitches in staggered rows
    var rnd = mulberry(77), r, x;
    g.lineCap = 'round';
    for (r = 0; r < 23; r++) {
      var y = 296 + r * 11, off = (r % 2) * 5.5;
      for (x = 112 + off; x < 400; x += 11) {
        var jx = x + (rnd() - 0.5) * 1.5, jy = y + (rnd() - 0.5) * 1.5;
        g.beginPath(); g.moveTo(jx - 3.4, jy - 3); g.quadraticCurveTo(jx, jy + 4.4, jx + 3.4, jy - 3);
        g.lineWidth = 3.2; g.strokeStyle = C.blueDark; g.stroke();
        g.beginPath(); g.moveTo(jx - 3, jy - 3.4); g.quadraticCurveTo(jx, jy + 2.4, jx + 3, jy - 3.4);
        g.lineWidth = 1.4; g.strokeStyle = C.blueHi; g.stroke();
      }
    }
    // horizontal ridges between the stitch rows
    for (r = 0; r < 23; r++) {
      g.beginPath(); g.moveTo(110, 300 + r * 11); g.quadraticCurveTo(255, 304 + r * 11, 405, 300 + r * 11);
      g.lineWidth = 1.6; g.strokeStyle = 'rgba(20,50,100,0.35)'; g.stroke();
    }
    // open-mesh crochet on the shorts: small, subtle open squares in darker blue
    for (r = 0; r < 5; r++) {
      for (var cc = 0; cc < 12; cc++) {
        var hx = 138 + cc * 20 + (r % 2) * 10, hy = 404 + r * 20;
        if (hx > 378 || (hy > 464 && Math.abs(hx - 268) < 28)) continue;
        g.beginPath();
        g.moveTo(hx - 4, hy - 7); g.lineTo(hx + 4, hy - 7); g.quadraticCurveTo(hx + 7, hy - 7, hx + 7, hy - 4);
        g.lineTo(hx + 7, hy + 4); g.quadraticCurveTo(hx + 7, hy + 7, hx + 4, hy + 7); g.lineTo(hx - 4, hy + 7);
        g.quadraticCurveTo(hx - 7, hy + 7, hx - 7, hy + 4); g.lineTo(hx - 7, hy - 4); g.quadraticCurveTo(hx - 7, hy - 7, hx - 4, hy - 7);
        g.fillStyle = 'rgba(14,34,78,0.62)'; g.fill();
        g.fillStyle = 'rgba(226,208,170,0.45)';
        g.fillRect(hx - 5, hy + 1, 10, 5);
        g.lineWidth = 2; g.strokeStyle = C.blueHi; g.globalAlpha = 0.5; g.stroke(); g.globalAlpha = 1;
      }
    }
    // soft shading
    g.fillStyle = lin(g, 0, 290, 0, 548, [[0, 'rgba(255,255,255,0.16)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(10,20,60,0.3)']]);
    g.fillRect(100, 280, 320, 280);
    g.restore();
    smooth(g, over, 0.15); outline(g, 2.6, 'rgba(30,50,100,0.6)');
    // shoulder straps
    [[[150, 264], [182, 260], [212, 308], [182, 322]], [[332, 262], [358, 268], [330, 316], [298, 306]]].forEach(function (s, i) {
      smooth(g, s, 0.2);
      g.fillStyle = C.blue; g.fill();
      g.save(); g.clip();
      for (var q = 0; q < 12; q++) {
        var sx = s[0][0] + (s[3][0] - s[0][0]) * q / 11 + 8, sy = s[0][1] + (s[3][1] - s[0][1]) * q / 11 + 10;
        g.beginPath(); g.moveTo(sx - 12, sy - 3); g.quadraticCurveTo(sx, sy + 4, sx + 12, sy - 3);
        g.lineWidth = 2.4; g.strokeStyle = C.blueDark; g.stroke();
      }
      g.restore();
      smooth(g, s, 0.2); outline(g, 2.4, 'rgba(30,50,100,0.6)');
      // red button
      var bx = i === 0 ? 168 : 304, by = i === 0 ? 284 : 284;
      dot(g, bx, by, 15.5, '#a82a30');
      dot(g, bx - 0.5, by - 0.5, 14, '#e03a3f');
      ellipsePath(g, bx - 4, by - 6, 6, 3, -0.5); g.fillStyle = 'rgba(255,255,255,0.55)'; g.fill();
      dot(g, bx - 4, by + 1, 2.2, '#7a1a20'); dot(g, bx + 4, by + 1, 2.2, '#7a1a20');
      dot(g, bx - 4, by - 4, 2.2, '#7a1a20'); dot(g, bx + 4, by - 4, 2.2, '#7a1a20');
    });
  }

  function drawBongoHead(g) {
    g.translate(260, 240); g.scale(1.12, 1.12); g.translate(-260, -240);   // head a bit larger
    // round ears with a darker inner tone (behind the head)
    function ear(x, y, r) {
      circlesPath(g, [[x, y, r]]);
      g.fillStyle = lin(g, x - r, y - r, x + r, y + r, [[0, C.furHi], [1, C.fur]]); g.fill();
      circlesPath(g, [[x, y, r]]); fuzzy(g, C.fur);
      circlesPath(g, [[x, y, r]]); outline(g, 2.2, 'rgba(130,100,150,0.4)');
      ellipsePath(g, x + 1, y + 2, r * 0.62, r * 0.64, 0);
      g.fillStyle = lin(g, x, y - r, x, y + r, [[0, '#e6cfa8'], [1, '#d3b88e']]); g.fill();
    }
    ear(132, 134, 42);
    ear(382, 100, 44);
    var head = [[150, 98], [182, 52], [250, 32], [325, 40], [383, 86], [396, 145], [376, 205],
      [322, 246], [252, 256], [186, 241], [146, 196], [134, 145]];
    drawFurShape(g, head, 0.18, 51, [125, 28, 400, 258], [140, 258]);
    // big round pale-beige muzzle in the lower half of the face
    var mz = [[196, 160], [232, 128], [262, 122], [300, 128], [332, 160], [340, 196], [318, 232], [262, 246], [208, 232], [188, 198]];
    smooth(g, mz, 0.2);
    g.fillStyle = lin(g, 0, 122, 0, 246, [[0, '#f8eed6'], [1, C.muzzleB]]);
    g.fill();
    g.save(); g.clip();
    var rnd = mulberry(52);
    for (var i = 0; i < 50; i++) {
      var x = 185 + rnd() * 160, y = 120 + rnd() * 130;
      var a1 = rnd() * TAU; g.beginPath(); g.arc(x, y, 3 + rnd() * 3, a1, a1 + 1.1);
      g.lineWidth = 1.3; g.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.6)' : 'rgba(190,160,110,0.3)'; g.stroke();
    }
    g.fillStyle = rad(g, 262, 235, 0, 70, [[0, 'rgba(190,160,110,0.28)'], [1, 'rgba(190,160,110,0)']]);
    g.fillRect(180, 120, 170, 140);
    g.restore();
    smooth(g, mz, 0.2); outline(g, 1.8, 'rgba(130,100,150,0.3)');
    // black nose on top of the muzzle
    var nose = [[234, 126], [264, 114], [296, 126], [292, 148], [264, 162], [238, 148]];
    smooth(g, nose, 0.2);
    g.fillStyle = lin(g, 0, 114, 0, 162, [[0, '#4a3c42'], [1, '#231a20']]); g.fill();
    ellipsePath(g, 252, 124, 11, 4.5, -0.2);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fill();
  }

  // ================================================================ rig ===
  var PN = R(450, 250);       // neck pivot (rig)
  var HORN = R(535, 52);
  var BFLY = R(468, 322);     // butterfly decal center (it glows)
  var GLOW_STEPS = 24;

  // horn / heart light colors: pink -> lilac -> sky -> mint -> yellow -> pink
  var HUES = [[255, 84, 160], [170, 118, 255], [74, 178, 255], [64, 220, 168], [255, 204, 56]];
  function hueRGB(i) {
    var p = i / GLOW_STEPS * HUES.length, a = Math.floor(p) % HUES.length, b = (a + 1) % HUES.length, f = p - Math.floor(p);
    return [0, 1, 2].map(function (k) { return Math.round(HUES[a][k] + (HUES[b][k] - HUES[a][k]) * f); });
  }

  function glowSpr(c, radius) {
    var s = Math.ceil(radius * 2), cc = cv(s, s), g = cc.getContext('2d');
    var col = c.join(',');
    g.fillStyle = rad(g, s / 2, s / 2, 0, s / 2, [[0, 'rgba(255,255,255,0.85)'], [0.18, 'rgba(' + col + ',0.7)'],
      [0.5, 'rgba(' + col + ',0.22)'], [1, 'rgba(' + col + ',0)']]);
    g.fillRect(0, 0, s, s);
    return cc;
  }

  var cache = [];     // 2 most recent scales

  function build(ppu) {
    var P = {}, i;
    P.tailClear = sPart(ppu, [150, 290], [25, 220, 160, 415], drawTailClear);
    P.tailPink = sPart(ppu, [150, 290], [85, 245, 170, 415], drawTailPink);
    P.mane = sPart(ppu, [440, 230], [380, 20, 520, 250], drawMane);
    P.body = sPart(ppu, [330, 410], [120, 230, 540, 420], drawBody);
    P.neck = sPart(ppu, [450, 250], [390, 0, 640, 290], drawNeckHead);

    // legs: separate upper / lower sprites; far legs are slightly darker
    function leg(far) {
      return {
        up: makeSpr(ppu, [-34, -34, 36, L1 + 18], function (g) { drawUpper(g, far); }, false, 1, true),
        lo: makeSpr(ppu, [-20, -20, 34, L2 + 8], function (g) { drawLower(g, far); }, false, 1, true)
      };
    }
    P.legFar = leg(true);
    P.legNear = leg(false);

    P.bArmL = bPart(ppu, [140, 280], [30, 240, 165, 340], function (g) { drawFurShape(g, ARM_L, 0.2, 61, [30, 240, 165, 340], [260, 340]); });
    P.bArmR = bPart(ppu, [366, 300], [340, 250, 495, 380], function (g) { drawFurShape(g, ARM_R, 0.2, 62, [340, 250, 495, 380], [260, 380]); });
    P.bTail = bPart(ppu, [130, 505], [40, 440, 150, 570], function (g) {
      var pts = [], n = 12;
      for (var q = 0; q < n; q++) { var a = q / n * TAU; pts.push([95 + Math.cos(a) * 44, 508 + Math.sin(a) * 42]); }
      drawFurShape(g, pts, 0.18, 44, [45, 460, 150, 560], [500, 560]);
    });
    P.bLegs = bPart(ppu, [260, 520], [30, 480, 440, 672], drawBongoLegs);
    P.bTorso = bPart(ppu, [260, 520], [115, 232, 400, 550], drawBongoTorso);
    P.bHead = bPart(ppu, [260, 240], [30, -20, 490, 290], drawBongoHead);

    // tinted lights: horn + glows + heart, 24 hue steps (rendered once)
    P.horn = []; P.hornGlow = []; P.heart = []; P.heartGlow = [];
    var hp = HORN;
    for (i = 0; i < GLOW_STEPS; i++) {
      var col = hueRGB(i);
      P.horn.push(makeSpr(ppu, [-30, -100, 100, 30], function (g) {
        g.translate(-hp[0], -hp[1]); g.translate(SX, SY); g.scale(SK, SK); drawHorn(g, col);
      }, true));
      P.hornGlow.push(makeSpr(ppu, [-70, -130, 130, 60], function (g) {
        var cc = glowSpr(col, 60); g.drawImage(cc, 28 - 90, -33 - 90, 180, 180);
      }, true, 0.5));
      var hc = hueRGB((i + 8) % GLOW_STEPS);
      P.heart.push(makeSpr(ppu, [-60, -62, 60, 62], function (g) {
        g.translate(-BFLY[0], -BFLY[1]); g.translate(SX, SY); g.scale(SK, SK); drawWingShimmer(g, hc);
      }, true));
      P.heartGlow.push(makeSpr(ppu, [-80, -80, 80, 80], function (g) { g.drawImage(glowSpr(hc, 80), -80, -80, 160, 160); }, true, 0.5));
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
  var HIPS = { fA: R(430, 372), fB: R(498, 370), hA: R(190, 362), hB: R(244, 374) };
  var DEG = Math.PI / 180;

  function smoothstep(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }

  function blink(t, off) {
    var p = (t + off) % 4.3;
    if (p > 0.2) return 0;
    return Math.sin(p / 0.2 * Math.PI);
  }

  // one placement: {s: sprite, x, y, r, a}
  function place(g, spr, x, y, r, a) {
    g.save();
    g.translate(x, y);
    if (r) g.rotate(r);
    if (a !== undefined && a !== 1) g.globalAlpha *= a;
    g.drawImage(spr, spr.ox, spr.oy, spr.lw, spr.lh);
    g.restore();
  }
  function placeEdge(g, spr, x, y, r) {
    g.save();
    g.translate(x, y);
    if (r) g.rotate(r);
    g.globalAlpha *= 0.7;
    g.drawImage(spr.edge, spr.ox, spr.oy, spr.lw, spr.lh);
    g.restore();
  }
  function placeHalo(g, spr, x, y, r) {
    g.save();
    g.translate(x, y);
    if (r) g.rotate(r);
    g.drawImage(spr.halo, spr.ox, spr.oy, spr.lw, spr.lh);
    g.restore();
  }

  function draw(g, pose, ppu) {
    var E = prerender(ppu), P = E.P;
    pose = pose || {};
    var t = pose.t || 0, run = pose.run || 0, wave = smoothstep(pose.wave || 0),
      happy = pose.happy || 0, look = pose.look || 0;
    var glow = pose.glow === undefined ? 0.5 : pose.glow;
    var ph = t * TAU * 2.0;
    var idle = 1 - run;
    var br = Math.sin(t * 1.9) * (1 - run * 0.5);
    var by = run * 6 * Math.sin(ph * 2 + 1) + br * 1.6;      // body bob + breathing

    // --- items in z order: [kind, ...]; halos first, bodies second
    var items = [], k;

    // legs
    function legItem(set, hip, off, rest, restFold, amp, foldAmp) {
      var c = ph + off;
      var s = rest * idle + run * amp * Math.sin(c);          // forward swing
      var fold = restFold * idle + run * foldAmp * Math.max(0, Math.cos(c));
      var a1 = -s, a2 = -s + fold;
      var kx = hip[0] - Math.sin(a1) * L1, ky = hip[1] + by + Math.cos(a1) * L1;
      items.push([set.lo, kx, ky, a2, 'edge'], [set.up, hip[0], hip[1] + by, a1, 'edge'],
        [set.lo, kx, ky, a2], [set.up, hip[0], hip[1] + by, a1]);
    }
    legItem(P.legFar, HIPS.hB, Math.PI + 1.0, 0.04, 0.0, 0.72, 1.05);
    legItem(P.legFar, HIPS.fB, 0.8, 0.22, 0.25, 0.75, 1.15);
    legItem(P.legNear, HIPS.hA, Math.PI + 0.3, -0.34, 0.55, 0.7, 1.1);
    legItem(P.legNear, HIPS.fA, 0.0, -0.06, 0.0, 0.78, 1.2);

    var ta = -0.1 * run + (0.05 + 0.14 * run) * Math.sin(ph * 2 - 0.8) + 0.04 * Math.sin(t * 1.4);
    var ta2 = -0.12 * run + (0.06 + 0.16 * run) * Math.sin(ph * 2 - 1.3) + 0.05 * Math.sin(t * 1.3 + 1);
    items.push([P.tailClear.s, P.tailClear.x, P.tailClear.y + by, ta2]);
    var bodyItem = [P.body.s, P.body.x, P.body.y + by, 0];
    items.push(bodyItem);

    var na = -look * 0.08 + run * 0.07 * Math.sin(ph * 2 + 0.4) + 0.012 * Math.sin(t * 1.3 + 0.5) - happy * 0.03;
    var ma = na * 0.7 + (0.04 + 0.12 * run) * Math.sin(ph * 2 - 1.2) + 0.03 * Math.sin(t * 1.7);
    items.push([P.mane.s, P.mane.x, P.mane.y + by, ma]);
    items.push([P.tailPink.s, P.tailPink.x, P.tailPink.y + by, ta]);

    var nx = PN[0], ny = PN[1] + by;
    var neckItem = [P.neck.s, nx, ny, na];
    items.push(neckItem);

    // Bongo
    var bounce = -run * 7 * (0.5 + 0.5 * Math.sin(ph * 2 + 2));
    var bo = by + bounce - br * 0.6;
    var armL = 0.08 + run * 0.32 * Math.sin(ph * 2 + 1.6) + 0.02 * Math.sin(t * 1.7);
    var armRsw = -0.05 + run * 0.32 * Math.sin(ph * 2 + 0.2) + 0.02 * Math.sin(t * 1.9);
    var armRw = -1.5 + 0.3 * Math.sin(t * 10);
    var armR = armRsw + (armRw - armRsw) * wave;
    var ha = 0.03 * Math.sin(t * 1.6) + run * 0.05 * Math.sin(ph * 2 + 1) + wave * 0.07 - happy * 0.03;
    items.push([P.bTail.s, P.bTail.x, P.bTail.y + bo + run * 3 * Math.sin(ph * 2 + 2.5), 0.12 * Math.sin(t * 2.2) + run * 0.25 * Math.sin(ph * 2 + 2.2)]);
    items.push([P.bArmL.s, P.bArmL.x, P.bArmL.y + bo, armL]);
    var armRItem = [P.bArmR.s, P.bArmR.x, P.bArmR.y + bo, armR];
    if (wave <= 0.25) items.push(armRItem);
    items.push([P.bLegs.s, P.bLegs.x, P.bLegs.y + bo, 0]);
    items.push([P.bTorso.s, P.bTorso.x, P.bTorso.y + bo, 0]);
    var headItem = [P.bHead.s, P.bHead.x, P.bHead.y + bo, ha];
    items.push(headItem);
    if (wave > 0.25) items.push(armRItem);       // waving arm in front of the head

    // pass 1: white cut-out halos
    g.save();
    for (k = 0; k < items.length; k++) if (items[k][4] !== 'edge') placeHalo(g, items[k][0], items[k][1], items[k][2], items[k][3]);
    g.restore();

    // pass 2: sprites in order, with dynamic overlays inserted at their z
    var n = items.length;
    for (k = 0; k < n; k++) {
      var it = items[k];
      if (it[4] === 'edge') placeEdge(g, it[0], it[1], it[2], it[3]); else place(g, it[0], it[1], it[2], it[3]);
      if (it === bodyItem) heartLight(g, P, t, by, glow);
      if (it === neckItem) {
        // horn + halo + eye ride on the neck matrix
        g.save();
        g.translate(nx, ny); g.rotate(na);
        hornLight(g, P, t, glow, na);
        stellaEye(g, t, happy);
        g.restore();
      }
      if (it === headItem) {
        g.save();
        g.translate(it[1], it[2]); g.rotate(it[3]);
        bongoFace(g, t, happy, wave);
        g.restore();
      }
    }
  }

  // note: items order is legs(4), tailClear, body, mane, tailPink, neck, ...
  // so bodyIdx=5 (body), neckIdx=8 (neck): indices of those entries below.

  function hueIndex(t, off) {
    var p = ((t / 12 + off / GLOW_STEPS) % 1 + 1) % 1 * GLOW_STEPS;
    var i = Math.floor(p);
    return [i % GLOW_STEPS, (i + 1) % GLOW_STEPS, p - i];
  }

  function hornLight(g, P, t, glow, na) {
    var h = hueIndex(t, 0), pulse = 1 + 0.06 * Math.sin(t * 3);
    var ga = 0.3 + 0.7 * glow, sc = (1 + 0.45 * glow) * pulse;
    var gs = P.hornGlow[h[0]], gs2 = P.hornGlow[h[1]];
    // glow centered on horn middle; sprite local origin = horn base
    g.save();
    g.translate(HORN[0] - PN[0], HORN[1] - PN[1]);
    g.save();
    g.translate(28, -33); g.scale(sc, sc); g.translate(-28, 33);
    g.globalAlpha = ga * (1 - h[2]);
    g.drawImage(gs, gs.ox, gs.oy, gs.lw, gs.lh);
    g.globalAlpha = ga * h[2];
    g.drawImage(gs2, gs2.ox, gs2.oy, gs2.lw, gs2.lh);
    g.restore();
    g.globalAlpha = 1;
    var hs = P.hornGlow && P.horn[h[0]], hs2 = P.horn[h[1]];
    g.drawImage(hs, hs.ox, hs.oy, hs.lw, hs.lh);
    g.globalAlpha = h[2];
    g.drawImage(hs2, hs2.ox, hs2.oy, hs2.lw, hs2.lh);
    g.restore();
    g.globalAlpha = 1;
  }

  function heartLight(g, P, t, by, glow) {
    var h = hueIndex(t, 8), pulse = 1 + 0.07 * Math.sin(t * 3.2 + 1);
    var ga = 0.25 + 0.55 * glow;
    var gs = P.heartGlow[h[0]], gs2 = P.heartGlow[h[1]], hs = P.heart[h[0]], hs2 = P.heart[h[1]];
    g.save();
    g.translate(BFLY[0], BFLY[1] + by);
    g.globalAlpha = ga * pulse * (1 - h[2]);
    g.drawImage(gs, gs.ox, gs.oy, gs.lw, gs.lh);
    g.globalAlpha = ga * pulse * h[2];
    g.drawImage(gs2, gs2.ox, gs2.oy, gs2.lw, gs2.lh);
    g.globalAlpha = 0.5 + 0.5 * glow;
    g.drawImage(hs, hs.ox, hs.oy, hs.lw, hs.lh);
    g.globalAlpha = (0.5 + 0.5 * glow) * h[2];
    g.drawImage(hs2, hs2.ox, hs2.oy, hs2.lw, hs2.lh);
    g.restore();
    g.globalAlpha = 1;
  }

  // Stella's big blue eye (local = neck pivot coords, rig scale)
  function stellaEye(g, t, happy) {
    var e = R(558, 94), x = e[0] - PN[0], y = e[1] - PN[1];
    var open = 1 - Math.max(blink(t, 0), happy);
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (open > 0.25) {
      var ry = 15 * open, rx = 10.5;
      g.beginPath(); g.ellipse(x, y, rx, ry, 0.15, 0, TAU);
      g.fillStyle = '#fbfdff'; g.fill();
      g.save(); g.clip();
      g.beginPath(); g.ellipse(x + 0.5, y + 1, 9.5, Math.min(ry, 11), 0, 0, TAU);
      g.fillStyle = lin(g, x, y - 12, x, y + 12, [[0, '#2d7fc4'], [0.6, '#63b4e6'], [1, '#a6dcf3']]); g.fill();
      dot(g, x + 0.5, y + 1, 5 * Math.min(1, open + 0.2), '#26264a');
      g.restore();
      dot(g, x - 3, y - 5 * open, 3, 'rgba(255,255,255,0.95)');
      dot(g, x + 4, y + 5 * open, 1.5, 'rgba(255,255,255,0.8)');
      g.beginPath(); g.ellipse(x, y, rx, ry, 0.15, 0, TAU);
      g.lineWidth = 2; g.strokeStyle = 'rgba(70,50,110,0.65)'; g.stroke();
      // lashes on the upper-left
      g.lineWidth = 2.6; g.strokeStyle = C.ink;
      g.beginPath(); g.ellipse(x, y, rx + 0.8, ry + 0.8, 0.15, Math.PI * 0.95, Math.PI * 1.75); g.stroke();
      g.lineWidth = 2;
      for (var i = 0; i < 3; i++) {
        var a = Math.PI * (1.05 + i * 0.2), ex = x + Math.cos(a) * (rx + 1), ey = y + Math.sin(a) * (ry + 1) * 0.95 - (open - 1) * 0;
        g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex + Math.cos(a - 0.35) * 8, ey + Math.sin(a - 0.35) * 8); g.stroke();
      }
    } else {
      // closed: a happy upward-curved lash line
      g.lineWidth = 3.4; g.strokeStyle = C.ink;
      g.beginPath(); g.arc(x, y + 6, 11, Math.PI * 1.12, Math.PI * 1.9); g.stroke();
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(x - 10, y - 2); g.lineTo(x - 17, y - 6); g.stroke();
      g.beginPath(); g.moveTo(x - 6, y - 5); g.lineTo(x - 11, y - 11); g.stroke();
    }
  }

  // Bongo's eyes + stitched mouth + blush (local = head pivot coords; head is scaled 1.12)
  function bongoFace(g, t, happy, wave) {
    var o = B(260, 240), HS = 1.12, s = BK * HS;
    function ex(x, y) { var p = B(260 + (x - 260) * HS, 240 + (y - 240) * HS); return [p[0] - o[0], p[1] - o[1]]; }
    var bl = Math.max(blink(t, 1.7), happy);
    var smile = Math.max(happy, wave * 0.6);
    var le = ex(200, 112), re = ex(328, 110), m = ex(264, 162), my = ex(264, 197)[1];
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (bl > 0.5) {
      g.lineWidth = 3.4 * s; g.strokeStyle = '#2b2025';
      [le, re].forEach(function (p) {
        g.beginPath(); g.arc(p[0], p[1] + 5 * s, 8 * s, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      });
    } else {
      [le, re].forEach(function (p) {
        dot(g, p[0], p[1], 7.5 * s, '#1e161a');
        dot(g, p[0] - 2 * s, p[1] - 2.5 * s, 2.2 * s, 'rgba(255,255,255,0.85)');
      });
    }
    if (smile > 0.05) {
      var c1 = ex(205, 200), c2 = ex(324, 198);
      dot(g, c1[0], c1[1], 14 * s * smile, 'rgba(240,150,150,0.45)');
      dot(g, c2[0], c2[1], 14 * s * smile, 'rgba(240,150,150,0.45)');
    }
    // stitched mouth: line down from the nose + two little curves (smile grows with happy)
    var sm = 12 + 20 * smile, dp = 10 + 20 * smile, up = 4 - 7 * smile;
    g.lineWidth = 3 * s; g.strokeStyle = '#3a2a2e';
    g.beginPath(); g.moveTo(m[0], m[1]); g.lineTo(m[0], my); g.stroke();
    g.beginPath();
    g.moveTo(m[0] - sm * s, my + up * s);
    g.quadraticCurveTo(m[0] - sm * s * 0.4, my + dp * s, m[0], my);
    g.quadraticCurveTo(m[0] + sm * s * 0.4, my + dp * s, m[0] + sm * s, my + up * s);
    g.stroke();
    if (smile > 0.6) {
      g.fillStyle = 'rgba(200,90,110,' + (0.5 * (smile - 0.6) / 0.4) + ')';
      g.beginPath();
      g.moveTo(m[0] - sm * s, my + up * s);
      g.quadraticCurveTo(m[0], my + dp * s * 1.9, m[0] + sm * s, my + up * s);
      g.quadraticCurveTo(m[0], my + dp * s * 0.7, m[0] - sm * s, my + up * s);
      g.fill();
    }
  }

  // ------------------------------------------------------------- anchors
  // Rest-pose points in rig units. "follows" notes which part moves them.
  var A = {
    stellaHind: R(185, 325),        // body (bobs slightly)
    stellaBelly: R(310, 362),       // body
    stellaChest: R(506, 350),       // body, just under the heart light
    stellaNeck: R(430, 150),        // neck (swings a little around neck base)
    stellaCheek: R(546, 118),       // head (follows the neck)
    stellaLegBack: R(244, 405),     // upper far hind leg (top of the leg, moves little)
    stellaLegFront: R(498, 405),    // upper far front leg (top of the leg, moves little)
    bongoCheek: B(190, 185),        // Bongo head
    bongoTummy: B(260, 440),        // Bongo torso (overalls)
    bongoArm: B(80, 292),           // Bongo's left arm (viewer's left)
    body: { x: 450, y: 560, r: 330 }
  };

  window.Characters = {
    W: W, H: H, anchors: A,
    prerender: function (ppu) { prerender(ppu); },
    draw: draw
  };
})();
