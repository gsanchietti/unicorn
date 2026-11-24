/* art-town.js - the painted pieces of the street (the fairy town), in the style
 * of the bedroom-wall mural: dark uneven ink outlines, colored-pencil fills a
 * little lighter at the edges, white dotted trims on the mushroom house.
 * Classic script: window.Town. Needs window.Art (js/art.js) loaded first.
 *
 * Sizes: `M` is the size unit in CSS px that the street passes to build(). The
 * pieces are sized from it (see SIZE below: house 1.04 M tall, bakery 1.32 M with
 * its curly stem, gate 1.3 M with its ladder, ...; the street draws the jar
 * 0.35 M tall). Nothing is taller than 1.36 M, so every piece fits on the
 * street's screen. Everything is pre-rendered into canvases at DPR once per
 * build, the night looks too (lit windows with their glow); the per-frame
 * helpers only blit cached canvases: no shadowBlur, no filters, no grain per
 * frame.
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
 *                               many as fit); the pile never passes the neck.
 *                               jiggle 0..1: squash-and-wobble amount (the wobble's
 *                               phase comes from jiggle itself, so a jiggle easing
 *                               1 -> 0 wobbles and settles).
 *   Town.drawSign(g, x, y, r, kind, t)
 *                               a round picture sign centered at (x, y), radius r.
 *                               kind: 'star' (sky gate), 'cake' (bakery), 'octopus'
 *                               (pond). t: time in seconds, for a soft glow pulse.
 *
 * Inside, every piece is authored in "design units": 100 units = M. A piece is
 * painted on a scratch layer (fill, paler edge, pencil grain in a deeper shade,
 * details, ink line) and then laid on its sprite, so each color gets its own
 * grain and the ink stays dark.
 */
(function () {
  'use strict';

  var Art = window.Art, PAL = Art.PAL;
  var TAU = Math.PI * 2;

  var KINDS = ['square', 'gate', 'house', 'bakery', 'pond', 'tree', 'bush', 'flowers', 'clothesline', 'fox'];
  // [width, height] in design units (100 = M)
  var SIZE = {
    square: [100, 64], gate: [80, 130], house: [84, 104], bakery: [98, 132],
    pond: [100, 40], tree: [66, 98], bush: [38, 21], flowers: [34, 18],
    clothesline: [72, 46], fox: [32, 53],
    mouseBalloon: [30, 50], butterfly: [10, 9]
  };
  var C = {
    wood: '#a9734c', woodDeep: '#6b4335',
    wall: '#f2a160', wallDeep: '#c96a2a', roofDeep: '#9c2a40',
    stem: '#f3c19c', stemDeep: '#c98658', gill: '#c98d5e', gillDeep: '#8d5a36',
    glass: '#bfe3f2', gold: '#f6dc6e', goldDeep: '#d9a92c',
    stone: '#d8d0dc', stoneDeep: '#9a8fa8',
    fox: '#f28d40', foxDeep: '#c25e1c', cream: '#fff6e8',
    octo: '#e0483f', octoDeep: '#a82a2c',
    sand: '#f4d3a2', sandDeep: '#d9a868',
    mouse: '#a9684a', mouseDeep: '#6e3d28'
  };

  var U = 100, DPR = 1, K = 1;       // size unit (CSS px), pixel ratio, CSS px per design unit
  var IW = 0.8, ID = 0.5, LW = 2;    // ink widths: silhouette / detail (design units), silhouette (CSS px)
  var spr = {}, sprN = {}, life = {}, ground = null;
  var jarCache = {}, jarN = 0, signCache = {};

  // ------------------------------------------------------------------ helpers
  function mk(w, h) {
    var c = Art.makeCanvas(w * DPR, h * DPR);
    c.lw = w; c.lh = h;
    var g = c.getContext('2d');
    g.scale(DPR, DPR);
    g.lineJoin = 'round'; g.lineCap = 'round';
    return { c: c, g: g, w: w, h: h };
  }
  // A painting surface: the sprite and its scratch layer, both scaled by k
  // (CSS px per drawing unit).
  function surface(w, h, k, seed) {
    var s = mk(w, h), l = mk(w, h);
    s.g.scale(k, k); l.g.scale(k, k);
    return { c: s.c, g: s.g, lc: l.c, lg: l.g, w: w, h: h, k: k, seed: seed * 11 + 1, rand: Art.rng(seed + 3), wins: [] };
  }
  // The path makers below return path(g) functions that begin a path on g.
  // They carry .bb = [x0, y0, x1, y1], their bounds, so that a piece only
  // touches its own corner of the scratch layer (see layer()).
  function withBB(path, x0, y0, x1, y1) { path.bb = [x0, y0, x1, y1]; return path; }
  function ptsBB(path, pts) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    pts.forEach(function (p) {
      var r = p[2] || 0;
      x0 = Math.min(x0, p[0] - r); y0 = Math.min(y0, p[1] - r); x1 = Math.max(x1, p[0] + r); y1 = Math.max(y1, p[1] + r);
    });
    return withBB(path, x0, y0, x1, y1);
  }
  function rrectP(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    return withBB(function (g) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }, x, y, x + w, y + h);
  }
  function ellP(x, y, rx, ry, rot) {
    var r = Math.max(rx, ry);
    return withBB(function (g) { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }, x - r, y - r, x + r, y + r);
  }
  function polyP(pts) {
    return ptsBB(function (g) {
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.closePath();
    }, pts);
  }
  // smooth closed path through points (Catmull-Rom -> bezier)
  function smP(pts, f) {
    f = f === undefined ? 0.18 : f;
    return ptsBB(function (g) {
      var n = pts.length, i;
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (i = 0; i < n; i++) {
        var p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
        g.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * f, p1[1] + (p2[1] - p0[1]) * f,
          p2[0] - (p3[0] - p1[0]) * f, p2[1] - (p3[1] - p1[1]) * f, p2[0], p2[1]);
      }
      g.closePath();
    }, pts);
  }
  function circlesP(cs) {
    return ptsBB(function (g) {
      g.beginPath();
      for (var i = 0; i < cs.length; i++) { g.moveTo(cs[i][0] + cs[i][2], cs[i][1]); g.arc(cs[i][0], cs[i][1], cs[i][2], 0, TAU); }
    }, cs);
  }
  function dot(g, x, y, r, color) { g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  // hand-drawn ink line: stroked twice, the second pass thinner and a hair off
  function inkPath(T, g, path, w) {
    Art.ink(g, w);
    path(g); g.stroke();
    g.save();
    g.translate((T.rand() - 0.5) * w * 0.7, (T.rand() - 0.5) * w * 0.7);
    g.lineWidth = w * 0.6;
    path(g); g.stroke();
    g.restore();
  }
  // an open ink line on g; draw(g) adds the sub-paths
  function line(g, draw, w, alpha) {
    Art.ink(g, w === undefined ? ID : w);
    if (alpha !== undefined) g.globalAlpha = alpha;
    g.beginPath(); draw(g); g.stroke();
    g.globalAlpha = 1;
  }
  // a colored line with an ink edge (stems, ropes, the ladder): all sub-paths as one shape
  function tube(g, draw, color, w, iw) {
    Art.ink(g, w + 2 * (iw === undefined ? ID : iw));
    g.beginPath(); draw(g); g.stroke();
    g.strokeStyle = color; g.lineWidth = w;
    g.beginPath(); draw(g); g.stroke();
  }
  // white dots along a curve pt(t) -> [x, y], t in 0..1 (the mushroom's trims)
  function dotsAlong(g, pt, n, r, t0, t1) {
    g.fillStyle = 'rgba(255,252,246,0.92)';
    t0 = t0 === undefined ? 0 : t0; t1 = t1 === undefined ? 1 : t1;
    g.beginPath();
    for (var i = 0; i < n; i++) {
      var p = pt(t0 + (t1 - t0) * (n === 1 ? 0.5 : i / (n - 1)));
      g.moveTo(p[0] + r, p[1]); g.arc(p[0], p[1], r, 0, TAU);
    }
    g.fill();
  }
  function quadPt(a, c, b) {
    return function (t) {
      var u = 1 - t;
      return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
    };
  }
  function cubPt(a, c1, c2, b) {
    return function (t) {
      var u = 1 - t;
      return [u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0],
        u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1]];
    };
  }

  // Paints on the scratch layer and lays it on the sprite. paint(lg) does the
  // fills; then the pencil grain (color `deep`); then over(lg) for what stays
  // crisp (details, ink). bb (optional): the bounds of all of it, in the
  // layer's units; only that part of the layer is cleared, grained and laid.
  function layer(T, paint, deep, over, grain, bb) {
    var lg = T.lg, lc = T.lc, x0 = 0, y0 = 0, x1 = lc.width, y1 = lc.height;
    var m = lg.getTransform();             // scale and translation only
    if (bb) {
      var pad = 8 * DPR + 0.12 * Math.max(bb[2] - bb[0], bb[3] - bb[1]) * m.a;
      x0 = Math.max(0, Math.floor(bb[0] * m.a + m.e - pad)); y0 = Math.max(0, Math.floor(bb[1] * m.d + m.f - pad));
      x1 = Math.min(x1, Math.ceil(bb[2] * m.a + m.e + pad)); y1 = Math.min(y1, Math.ceil(bb[3] * m.d + m.f + pad));
      if (x1 <= x0 || y1 <= y0) return;
    }
    lg.save();
    lg.setTransform(1, 0, 0, 1, 0, 0);
    lg.clearRect(x0, y0, x1 - x0, y1 - y0);
    lg.beginPath(); lg.rect(x0, y0, x1 - x0, y1 - y0); lg.clip();   // the grain stays inside it too
    lg.setTransform(m);
    lg.globalAlpha = 1;
    paint(lg);
    if (deep) Art.pencil(lc, deep, T.seed++, grain === undefined ? 0.85 : grain);
    if (over) over(lg);
    lg.restore();
    T.g.save(); T.g.setTransform(1, 0, 0, 1, 0, 0); T.g.drawImage(lc, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0); T.g.restore();
  }
  // One inked shape. o: {edge: paler-edge alpha (0 = none), inside(g): shading
  // under the grain, clipped; over(g): details over the grain, clipped;
  // ink: line width (0 = none); union: the path is a union of overlapping
  // shapes (inked around it, no inner lines); grain}
  function piece(T, path, fill, deep, o) {
    o = o || {};
    var iw = o.ink === undefined ? IW : o.ink;
    layer(T, function (g) {
      path(g); g.fillStyle = fill; g.fill();
      if (o.inside || (o.edge !== 0 && !o.union)) {
        g.save(); path(g); g.clip();
        if (o.edge !== 0 && !o.union) {
          g.strokeStyle = 'rgba(255,252,244,' + (o.edge || 0.3) + ')'; g.lineWidth = 3.4;
          path(g); g.stroke();
        }
        if (o.inside) o.inside(g);
        g.restore();
      }
    }, deep, function (g) {
      if (o.over) { g.save(); path(g); g.clip(); o.over(g); g.restore(); }
      if (!iw) return;
      if (o.union) {
        g.save();
        g.globalCompositeOperation = 'destination-over';
        Art.ink(g, iw * 2); path(g); g.stroke();
        g.translate((T.rand() - 0.5) * iw * 0.7, (T.rand() - 0.5) * iw * 0.7);
        path(g); g.stroke();
        g.restore();
      } else inkPath(T, g, path, iw);
    }, o.grain, path.bb);
  }
  // a soft light patch (the wall showing through the middle of a fill)
  function light(g, x, y, r, a) {
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,252,244,' + a + ')'); gr.addColorStop(1, 'rgba(255,252,244,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // a clump of leaves, like the mural's trees: a union of circles with short ink curls inside
  function puffs(T, cs, fill, deep, curls) {
    var bx = 0, by = 0, br = 0;
    cs.forEach(function (c) { bx += c[0]; by += c[1]; br = Math.max(br, c[2]); });
    bx /= cs.length; by /= cs.length;
    piece(T, circlesP(cs), fill, deep, {
      union: true,
      inside: function (g) { light(g, bx, by - br * 0.2, br * 1.5, 0.4); },
      over: function (g) {
        line(g, function (g) {
          (curls || []).forEach(function (i) {
            var c = cs[i];
            g.moveTo(c[0] + Math.cos(3.5) * c[2], c[1] + Math.sin(3.5) * c[2]);
            g.arc(c[0], c[1], c[2], 3.5, 5.0);
          });
        }, ID, 0.85);
      }
    });
  }
  // an Art sprite (star, cloud) centered at (x, y) in design units
  function stamp(g, s, x, y, rot) {
    g.save();
    g.translate(x, y);
    if (rot) g.rotate(rot);
    g.scale(1 / K, 1 / K);
    g.drawImage(s, -s.lw / 2, -s.lh / 2, s.lw, s.lh);
    g.restore();
  }
  // A window (or a lamp): painted for the day here, and lit for the night later.
  // mull(g): its glazing bars, as sub-paths.
  function win(T, path, cx, cy, r, color, deep, mull, glow) {
    piece(T, path, color || C.glass, deep || PAL.cloudDeep, {
      ink: ID * 1.2, edge: 0.45,
      over: mull ? function (g) { line(g, mull, ID * 0.9); } : null
    });
    T.wins.push({ path: path, cx: cx, cy: cy, r: r, mull: mull, glow: glow || 3.2 });
  }
  function roundWin(T, x, y, r, color, deep, cross) {
    win(T, ellP(x, y, r, r), x, y, r, color, deep, cross === false ? null : function (g) {
      g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r);
    });
  }
  function archP(x, y, w, h) {       // an arched opening: bottom center (x, y), fully round top
    return withBB(function (g) {
      g.beginPath();
      g.moveTo(x - w / 2, y); g.lineTo(x - w / 2, y - h + w / 2);
      g.arc(x, y - h + w / 2, w / 2, Math.PI, 0);
      g.lineTo(x + w / 2, y); g.closePath();
    }, x - w / 2, y - h, x + w / 2, y);
  }
  function archWin(T, x, y, w, h, color, deep) {
    win(T, archP(x, y, w, h), x, y - h / 2, h / 2, color, deep, function (g) {
      g.moveTo(x, y - h); g.lineTo(x, y); g.moveTo(x - w / 2, y - h * 0.45); g.lineTo(x + w / 2, y - h * 0.45);
    });
  }
  // a little round flower: petals around a center
  function flower(g, x, y, r, petal, center, n, iw) {
    var i, a;
    n = n || 5; iw = iw || ID;
    Art.ink(g, r * 0.62 + iw * 1.6);
    g.beginPath();
    for (i = 0; i < n; i++) { a = i / n * TAU - 1.57; g.moveTo(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62); g.lineTo(x + Math.cos(a) * r * 0.63, y + Math.sin(a) * r * 0.63); }
    g.stroke();
    g.strokeStyle = petal; g.lineWidth = r * 0.62;
    g.stroke();
    dot(g, x, y, r * 0.36, center);
    Art.ink(g, iw * 0.7); g.beginPath(); g.arc(x, y, r * 0.36, 0, TAU); g.stroke();
  }
  function balloon(T, x, y, rx, ry, color, deep) {
    piece(T, ellP(x, y, rx, ry), color, deep, {
      inside: function (g) { light(g, x - rx * 0.35, y - ry * 0.4, rx * 0.9, 0.55); },
      over: function (g) {
        line(g, function (g) { g.moveTo(x + rx * 0.5, y - ry * 0.25); g.quadraticCurveTo(x + rx * 0.62, y + ry * 0.25, x + rx * 0.25, y + ry * 0.62); }, ID * 0.8, 0.6);
      }
    });
    piece(T, polyP([[x, y + ry - 0.2], [x + 1.1, y + ry + 1.6], [x - 1.1, y + ry + 1.6]]), color, deep, { edge: 0, ink: ID });
  }

  // ----------------------------------------------------------- the pieces
  // Each draws in design units into a w x h box, ground at y = h, center x = w / 2.
  // some pieces are authored bigger than they are painted
  var SCALE = { fox: 0.8 };
  var DRAW = {
    // the town square: a round cobbled plaza between two lamps with a string of flags
    square: function (T, w, h) {
      var g = T.g, rand = Art.rng(21), i;
      piece(T, ellP(50, 58.6, 48.5, 5), '#eadbc0', '#b9a27c', {
        over: function (g) {
          g.strokeStyle = 'rgba(150,120,84,0.75)'; g.lineWidth = ID * 0.8;
          for (i = 0; i < 26; i++) {
            var a = rand() * TAU, d = Math.sqrt(rand()) * 0.86;
            g.beginPath(); g.ellipse(50 + Math.cos(a) * 46 * d, 58.6 + Math.sin(a) * 4.2 * d, 2.2 + rand() * 1.6, 0.7 + rand() * 0.3, 0, 0, TAU); g.stroke();
          }
        }
      });
      // the string of round flags
      var sag = quadPt([13, 20], [50, 31], [87, 20]);
      line(g, function (g) { g.moveTo(13, 20); g.quadraticCurveTo(50, 31, 87, 20); }, ID);
      layer(T, function (g) {
        for (i = 0; i < 9; i++) {
          var p = sag(0.1 + i * 0.1);
          g.fillStyle = PAL.confetti[i % PAL.confetti.length];
          g.beginPath(); g.arc(p[0], p[1] + 0.2, 2.7, 0, Math.PI); g.closePath(); g.fill();
        }
      }, '#8a6a5a', function (g) {
        Art.ink(g, ID);
        for (i = 0; i < 9; i++) {
          var p = sag(0.1 + i * 0.1);
          g.beginPath(); g.arc(p[0], p[1] + 0.2, 2.7, 0, Math.PI); g.closePath(); g.stroke();
        }
      }, 0.5);
      // the lamps
      [13, 87].forEach(function (x) {
        tube(g, function (g) { g.moveTo(x, 59); g.lineTo(x, 21); }, '#7d6aa0', 1.9, ID);
        piece(T, rrectP(x - 3.4, 57, 6.8, 4, 1.6), '#7d6aa0', '#4f3f73', { ink: ID * 1.2 });
        win(T, ellP(x, 16, 4.6, 5), x, 16, 5, '#fdf3c4', C.goldDeep, null, 2.5);
        piece(T, smP([[x - 4.6, 12.3], [x, 8.9], [x + 4.6, 12.3], [x, 11.5]], 0.2), PAL.roof, C.roofDeep, { ink: ID * 1.2, edge: 0 });
        dot(g, x, 8.5, 0.9, PAL.ink);
      });
    },

    // the sky gate: a puffy cloud on the ground, and the moon's red ladder rising from it
    gate: function (T, w, h) {
      var g = T.g, i;
      var top = 23, bot = 100;
      function cx(y) { return 39 + 4.5 * Math.sin((bot - y) / (bot - top) * Math.PI * 1.6) + (bot - y) * 0.07; }
      function hw(y) { return 4.6 + 2.4 * (y - top) / (bot - top); }
      tube(g, function (g) {
        var y, s;
        for (s = -1; s <= 1; s += 2) {
          g.moveTo(cx(bot) + s * hw(bot), bot);
          for (y = bot - 2; y >= top; y -= 2) g.lineTo(cx(y) + s * hw(y), y);
        }
        for (i = 0; i < 10; i++) {
          y = bot - 6 - i * 7.3;
          g.moveTo(cx(y) - hw(y), y);
          g.quadraticCurveTo(cx(y), y + 0.9, cx(y) + hw(y), y - 0.3);
        }
      }, PAL.roof, 1.5, ID);
      // up in the sky: a small cloud and a star
      stamp(g, Art.cloudSprite(34 * K, DPR, { seed: 5, face: false }), 46, 20);
      stamp(g, Art.starSprite(7.5 * K, DPR, { glow: false }), 33.5, 12.5, -0.25);
      T.wins.push({ star: [33.5, 12.5, 7.5, -0.25], cx: 33.5, cy: 12.5, r: 5, glow: 2.4 });
      // the big cloud on the ground
      stamp(g, Art.cloudSprite(76 * K, DPR, { seed: 2, face: false }), 39.5, h - 0.36 * 76 + 0.6);
    },

    // the orange house with the red roof and the little tower
    house: function (T, w, h) {
      var g = T.g, i;
      // tower
      piece(T, polyP([[54.5, 60], [55.5, 26], [67.5, 26], [68.5, 60]]), '#f5ad6e', C.wallDeep, {
        over: function (g) {
          line(g, function (g) { for (i = 0; i < 4; i++) { g.moveTo(56, 31 + i * 3.4); g.lineTo(67, 31 + i * 3.4); } }, ID * 0.6, 0.22);
        }
      });
      archWin(T, 61.5, 43, 5.4, 8.4);
      piece(T, function (g) {
        g.beginPath(); g.moveTo(51, 27.5);
        g.quadraticCurveTo(58, 20, 60.4, 8.5); g.quadraticCurveTo(61.5, 6, 62.6, 8.5);
        g.quadraticCurveTo(65, 20, 72, 27.5); g.quadraticCurveTo(61.5, 30.5, 51, 27.5); g.closePath();
      }, '#ee8fa0', PAL.mushroomDeep);
      dot(g, 61.5, 6.6, 1.5, C.gold);
      Art.ink(g, ID); g.beginPath(); g.arc(61.5, 6.6, 1.5, 0, TAU); g.stroke();
      // the front wall, a gable that bulges a little
      piece(T, function (g) {
        g.beginPath(); g.moveTo(18.5, 104);
        g.quadraticCurveTo(15, 80, 17.5, 58); g.lineTo(42, 27); g.lineTo(66.5, 58);
        g.quadraticCurveTo(69, 80, 65.5, 104); g.closePath();
      }, C.wall, C.wallDeep, {
        inside: function (g) { light(g, 42, 70, 26, 0.3); },
        over: function (g) {
          // a few courses of bricks, as loose pencil lines
          g.strokeStyle = 'rgba(160,84,34,0.4)'; g.lineWidth = ID * 0.8;
          var rand = Art.rng(4);
          g.beginPath();
          for (i = 0; i < 16; i++) {
            var y = 40 + i * 4, x = 17 + rand() * 6;
            while (x < 66) { var l = 4 + rand() * 7; g.moveTo(x, y); g.lineTo(x + l, y + (rand() - 0.5) * 0.5); x += l + 3 + rand() * 6; }
          }
          g.stroke();
        }
      });
      // the stone base and the step
      piece(T, rrectP(15, 98.6, 54, 6.4, 2), C.stone, C.stoneDeep, { ink: ID * 1.3 });
      // the roof: a red band that swoops down to the eaves
      piece(T, function (g) {
        g.beginPath(); g.moveTo(7, 62.5);
        g.quadraticCurveTo(27, 46, 40.6, 17.5); g.quadraticCurveTo(42, 15, 43.4, 17.5);
        g.quadraticCurveTo(57, 46, 77, 62.5);
        g.quadraticCurveTo(76, 67, 71.5, 68.5); g.quadraticCurveTo(55, 53, 42, 30.5);
        g.quadraticCurveTo(29, 53, 12.5, 68.5); g.quadraticCurveTo(8, 67, 7, 62.5); g.closePath();
      }, PAL.roof, C.roofDeep, {
        over: function (g) {
          g.strokeStyle = 'rgba(120,24,44,0.55)'; g.lineWidth = ID * 0.8;
          var l = quadPt([9.5, 65.5], [28, 49.5], [42, 23.5]), r = quadPt([74.5, 65.5], [56, 49.5], [42, 23.5]);
          g.beginPath();
          for (i = 1; i < 9; i++) {
            [l, r].forEach(function (f, s) {
              var p = f(i / 9.5), d = s ? -1 : 1;
              g.moveTo(p[0] - 2.2 * d, p[1] - 3.2); g.quadraticCurveTo(p[0] + 1.2 * d, p[1] - 0.6, p[0] + 2.6 * d, p[1] + 2.6);
            });
          }
          g.stroke();
        }
      });
      // windows and the yellow door
      roundWin(T, 42, 50, 6);
      archWin(T, 26, 86, 7, 10.5);
      archWin(T, 58, 86, 7, 10.5);
      var door = archP(42, 99, 12, 21);
      piece(T, door, C.gold, C.goldDeep, {
        over: function (g) {
          line(g, function (g) { g.moveTo(42, 78); g.lineTo(42, 99); g.moveTo(36, 85); g.lineTo(39.4, 85); g.moveTo(36, 93); g.lineTo(39.4, 93); }, ID * 0.9, 0.8);
        }
      });
      dot(g, 44.3, 89.5, 0.8, PAL.ink);
      piece(T, rrectP(33, 99, 18, 5, 1.6), '#e9e2ec', C.stoneDeep, { ink: ID * 1.2 });
    },

    // the bakery: the big pink bellflower mushroom house, with white dotted trims
    bakery: function (T, w, h) {
      var g = T.g, i;
      // the curly stem on top
      tube(g, function (g) {
        g.moveTo(49, 31); g.bezierCurveTo(49, 20, 57, 12, 51, 6.5);
        g.bezierCurveTo(46, 2.5, 39.5, 7.5, 43.5, 12); g.bezierCurveTo(46.5, 14.8, 50, 12.4, 48.2, 9.9);
      }, PAL.leaf, 2, ID);
      // the little purple mushroom beside it
      piece(T, smP([[21.5, 132], [21, 121], [23, 112], [31, 112], [33, 121], [32.5, 132]]), C.stem, C.stemDeep, { ink: ID * 1.3 });
      win(T, archP(27, 132, 5, 8.4), 27, 128, 3.4, C.gold, C.goldDeep, function (g) { g.moveTo(27, 124); g.lineTo(27, 132); });
      tube(g, function (g) { g.moveTo(25, 93); g.bezierCurveTo(24, 88, 28, 85, 25.5, 82.6); g.bezierCurveTo(23.4, 81, 21.6, 83.4, 23.4, 84.6); }, PAL.leaf, 1.3, ID * 0.8);
      var purple = smP([[11.5, 111], [13, 100], [19, 93], [27, 91.5], [35, 96], [38.5, 107], [41.5, 112], [36, 115.5], [26, 112.5], [16, 116.5]]);
      piece(T, purple, PAL.plum, '#5e2a63', {
        inside: function (g) { light(g, 22, 100, 9, 0.3); },
        over: function (g) {
          g.strokeStyle = 'rgba(70,24,76,0.6)'; g.lineWidth = ID * 0.8;
          g.beginPath();
          [[16, 116], [26, 112.5], [36, 115]].forEach(function (p) { g.moveTo(25.5, 92); g.quadraticCurveTo(25.5 + (p[0] - 25.5) * 1.15, 100, p[0], p[1]); });
          g.stroke();
          dotsAlong(g, quadPt([13.5, 109.5], [26, 106.5], [38.5, 109.5]), 11, 0.42);
        }
      });
      piece(T, smP([[19.5, 95.5], [22, 91.8], [25.5, 91], [29, 91.8], [31.5, 95.5], [28, 94.4], [25.5, 96], [23, 94.4]]), PAL.leaf, PAL.leafDeep, { ink: ID * 1.1, edge: 0 });

      // the main stem: narrow under the cap, a round belly at the ground
      piece(T, smP([[40.5, 72], [41, 92], [36.5, 108], [33.5, 122], [36, 133], [62, 133], [65.5, 122], [62, 108], [57.5, 92], [58, 72]]), C.stem, C.stemDeep, {
        inside: function (g) { light(g, 46, 112, 13, 0.4); }
      });
      // under the cap: the brown gills
      var gills = smP([[9, 64], [30, 61], [49, 60], [68, 61], [89, 64], [78, 76], [62, 82], [49, 83], [36, 82], [20, 76]]);
      piece(T, gills, C.gill, C.gillDeep, {
        over: function (g) {
          g.strokeStyle = 'rgba(110,62,34,0.6)'; g.lineWidth = ID * 0.8;
          g.beginPath();
          for (i = 0; i < 11; i++) { var x = 14 + i * 7; g.moveTo(49 + (x - 49) * 0.25, 62); g.quadraticCurveTo(49 + (x - 49) * 0.7, 70, x, 62 + 21 * (1 - Math.pow(Math.abs(x - 49) / 40, 2))); }
          g.stroke();
          dotsAlong(g, cubPt([13, 67.5], [32, 82.5], [66, 82.5], [85, 67.5]), 30, 0.48);
        }
      });
      // the frilly collar
      piece(T, smP([[39.5, 79], [58.5, 79], [61, 89.5], [57.2, 91.5], [53.2, 89.6], [49, 91.8], [44.8, 89.6], [40.8, 91.5], [37, 89.5]], 0.2), '#dba473', C.gillDeep, {
        ink: ID * 1.3,
        over: function (g) { line(g, function (g) { for (i = 0; i < 6; i++) { g.moveTo(42 + i * 2.8, 80); g.lineTo(41 + i * 3.2, 89); } }, ID * 0.7, 0.45); }
      });
      // the hanging bellflower
      tube(g, function (g) { g.moveTo(66, 70); g.bezierCurveTo(66, 60, 77, 62, 74, 80); }, PAL.leaf, 1.3, ID * 0.8);
      var bell = smP([[66.5, 83], [73.5, 80], [80.5, 83], [82, 94], [84.5, 99.5], [80.2, 100.2], [77, 98], [73.5, 100.8], [70, 98], [66.8, 100.2], [62.5, 99.5], [65, 94]], 0.2);
      piece(T, bell, '#e77fb4', '#b8478a', {
        ink: ID * 1.3,
        inside: function (g) { light(g, 71, 89, 7, 0.35); },
        over: function (g) {
          g.strokeStyle = 'rgba(150,46,110,0.55)'; g.lineWidth = ID * 0.7;
          g.beginPath();
          [[67, 99.5], [73.5, 100], [80, 99.5]].forEach(function (p) { g.moveTo(73.5, 80.5); g.quadraticCurveTo(73.5 + (p[0] - 73.5) * 1.3, 88, p[0], p[1]); });
          g.stroke();
          dotsAlong(g, quadPt([65.5, 96.6], [73.5, 94.6], [81.5, 96.6]), 9, 0.4);
        }
      });
      piece(T, smP([[69, 83.4], [71, 80.4], [73.5, 79.4], [76, 80.4], [78, 83.4], [75.4, 82.6], [73.5, 84], [71.6, 82.6]]), PAL.leaf, PAL.leafDeep, { ink: ID, edge: 0 });

      // the cap: a dome with a scalloped hem
      var hem = [8, 24.5, 41, 57, 73.5, 90], L = [8, 62], Rr = [90, 62];
      var domeL = cubPt(L, [1, 36], [25, 28], [49, 28]), domeR = cubPt([49, 28], [73, 28], [97, 36], Rr);
      var cap = function (g) {
        g.beginPath(); g.moveTo(L[0], L[1]);
        g.bezierCurveTo(1, 36, 25, 28, 49, 28); g.bezierCurveTo(73, 28, 97, 36, Rr[0], Rr[1]);
        for (var k = hem.length - 1; k > 0; k--) g.quadraticCurveTo((hem[k] + hem[k - 1]) / 2, 72.5, hem[k - 1], 62.5);
        g.closePath();
      };
      piece(T, cap, PAL.mushroom, PAL.mushroomDeep, {
        ink: IW * 1.15, edge: 0.2,
        inside: function (g) {
          light(g, 38, 42, 26, 0.34);
          var sh = g.createLinearGradient(0, 50, 0, 70);
          sh.addColorStop(0, 'rgba(190,70,96,0)'); sh.addColorStop(1, 'rgba(190,70,96,0.3)');
          g.fillStyle = sh; g.fillRect(0, 50, w, 22);
        },
        over: function (g) {
          var k, ribs = [];
          for (k = 1; k < hem.length - 1; k++) ribs.push(quadPt([49, 28.5], [49 + (hem[k] - 49) * 1.35, 38], [hem[k], 62.5]));
          g.strokeStyle = 'rgba(176,60,90,0.7)'; g.lineWidth = ID * 0.9;
          g.beginPath();
          for (k = 1; k < hem.length - 1; k++) { g.moveTo(49, 28.5); g.quadraticCurveTo(49 + (hem[k] - 49) * 1.35, 38, hem[k], 62.5); }
          g.stroke();
          ribs.forEach(function (f) { dotsAlong(g, function (t) { var p = f(t); return [p[0] + 1.3, p[1]]; }, 15, 0.5, 0.1, 0.96); });
          // dots inside the rim of the dome and along the hem
          dotsAlong(g, function (t) { var p = domeL(t); return [p[0] + 1.9 + 0.6 * t, p[1] + 1.9 * t]; }, 22, 0.52, 0.04, 0.97);
          dotsAlong(g, function (t) { var p = domeR(t); return [p[0] - 2.5 + 0.6 * t, p[1] + 1.9 * (1 - t)]; }, 22, 0.52, 0.03, 0.96);
          for (k = 0; k < hem.length - 1; k++) {
            dotsAlong(g, quadPt([hem[k] + 1, 61], [(hem[k] + hem[k + 1]) / 2, 70], [hem[k + 1] - 1, 61]), 9, 0.52, 0.05, 0.95);
          }
        }
      });
      // the hem curls out at both ends
      [[5.6, 62.6, 1], [92.4, 62.6, -1]].forEach(function (c) {
        piece(T, ellP(c[0], c[1], 4.3, 4.3), PAL.mushroom, PAL.mushroomDeep, {
          ink: IW, edge: 0,
          over: function (g) {
            line(g, function (g) {
              if (c[2] > 0) { g.moveTo(c[0] + 2.4, c[1] - 0.6); g.arc(c[0], c[1] - 0.2, 2.2, -0.2, Math.PI * 1.25, false); }
              else { g.moveTo(c[0] - 2.4, c[1] - 0.6); g.arc(c[0], c[1] - 0.2, 2.2, Math.PI + 0.2, -Math.PI * 0.25, true); }
            }, ID);
          }
        });
      });
      // the green cap on top
      piece(T, smP([[37.5, 32.5], [42, 27.2], [49, 26], [56, 27.2], [60.5, 32.5], [55.6, 31], [52.4, 33.6], [49, 31.4], [45.6, 33.6], [42.4, 31]], 0.2), PAL.leaf, PAL.leafDeep, { ink: ID * 1.3, edge: 0 });

      // yellow windows, and the round yellow door
      roundWin(T, 49.6, 98, 2.5, C.gold, C.goldDeep);
      roundWin(T, 49, 108.5, 3.7, C.gold, C.goldDeep);
      win(T, archP(49, 131.5, 12.5, 16.5), 49, 124, 7, C.gold, C.goldDeep, function (g) { g.moveTo(49, 115); g.lineTo(49, 131.5); });
      dot(g, 47.4, 124.5, 0.6, PAL.ink); dot(g, 50.6, 124.5, 0.6, PAL.ink);
      // a tuft of grass at the foot
      line(g, function (g) {
        [[35, 1], [37, -1], [61, 1], [63.4, -1], [20, 1]].forEach(function (b) { g.moveTo(b[0], 132); g.quadraticCurveTo(b[0] + b[1], 129.5, b[0] + b[1] * 1.6, 127.6); });
      }, ID);
    },

    // the pond: a turquoise pool in a grassy bank, lily pads, reeds, and the octopus peeking out
    pond: function (T, w, h) {
      var g = T.g, i;
      // reeds behind
      tube(g, function (g) {
        [[14, 12, 6], [19, 20, 11], [9, 5, 15], [88, 90, 13], [92, 95, 19]].forEach(function (r) { g.moveTo(r[0], 30); g.quadraticCurveTo(r[0], 20, r[1], r[2]); });
      }, PAL.leafDeep, 1, ID * 0.7);
      [[12.4, 9.5, -0.12], [19.8, 14.5, 0.08], [5.6, 18, -0.2], [89.8, 16.4, 0.1]].forEach(function (c) {
        piece(T, ellP(c[0], c[1], 1.7, 4.4, c[2]), '#8d5a36', '#5c3620', { ink: ID * 1.1, edge: 0.2 });
      });
      // the grassy bank
      var bank = function (g) {
        g.beginPath(); g.moveTo(0.5, 41);
        g.bezierCurveTo(-1, 30, 6, 25, 14, 25.6);
        var x;
        for (x = 14; x < 86; x += 12) g.quadraticCurveTo(x + 6, 23 + (x % 24 ? 0.6 : -0.4), x + 12, 25.6);
        g.bezierCurveTo(94, 25, 101, 30, 99.5, 41);
        g.closePath();
      };
      piece(T, bank, PAL.leaf, PAL.leafDeep, {});
      // the water
      piece(T, ellP(50, 30.4, 42, 7.8), PAL.river, PAL.riverDeep, {
        edge: 0.35,
        inside: function (g) { light(g, 50, 29, 30, 0.22); },
        over: function (g) {
          g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = ID * 0.9; g.lineCap = 'round';
          g.beginPath();
          [[18, 28.6, 5], [80, 29.4, 6], [33, 35.4, 5], [62, 36, 4], [84, 33.6, 3]].forEach(function (r) { g.moveTo(r[0] - r[2], r[1]); g.quadraticCurveTo(r[0], r[1] - 1, r[0] + r[2], r[1]); });
          g.stroke();
        }
      });
      // lily pads, one in flower
      [[24, 32.6, 6.4, 2.3], [71, 34.2, 7.2, 2.5], [62, 26.4, 4.6, 1.6]].forEach(function (p) {
        piece(T, ellP(p[0], p[1], p[2], p[3]), '#9bd88c', PAL.leafDeep, {
          ink: ID * 1.1, edge: 0.25,
          over: function (g) { line(g, function (g) { g.moveTo(p[0], p[1]); g.lineTo(p[0] + p[2] * 0.8, p[1] - p[3] * 0.9); }, ID * 0.8); }
        });
      });
      layer(T, function (g) {
        g.fillStyle = '#f7a9c4';
        [[-1.9, 0.2, -0.5], [1.9, 0.2, 0.5], [0, -0.5, 0]].forEach(function (p) { g.beginPath(); g.ellipse(69 + p[0], 32.4 + p[1], 1.5, 2.5, p[2], 0, TAU); g.fill(); });
      }, PAL.mushroomDeep, function (g) {
        Art.ink(g, ID * 0.8);
        [[-1.9, 0.2, -0.5], [1.9, 0.2, 0.5], [0, -0.5, 0]].forEach(function (p) { g.beginPath(); g.ellipse(69 + p[0], 32.4 + p[1], 1.5, 2.5, p[2], 0, TAU); g.stroke(); });
      }, 0.5);
      // a tentacle tip waving
      tube(g, function (g) { g.moveTo(57.5, 31); g.bezierCurveTo(57, 25, 61.5, 22.5, 59.6, 19.6); g.bezierCurveTo(58.4, 18, 56.4, 19.4, 57.6, 20.8); }, C.octo, 2.3, ID);
      // the octopus: only the top of its head, down to the eyes
      var head = function (g) {
        g.beginPath(); g.moveTo(33, 31);
        g.bezierCurveTo(31.5, 13, 54.5, 13, 53, 31);
        g.quadraticCurveTo(43, 33.4, 33, 31); g.closePath();
      };
      piece(T, head, C.octo, C.octoDeep, {
        inside: function (g) { light(g, 39.5, 20, 7, 0.35); },
        over: function (g) {
          g.fillStyle = 'rgba(255,170,170,0.75)';
          g.beginPath(); g.ellipse(35.8, 29.6, 2, 1.2, 0, 0, TAU); g.ellipse(50.2, 29.6, 2, 1.2, 0, 0, TAU); g.fill();
        }
      });
      [39.2, 46.8].forEach(function (x) {
        g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(x, 26.2, 1.55, 1.9, 0, 0, TAU); g.fill();
        dot(g, x + 0.5, 25.4, 0.55, '#ffffff');
      });
      // the water closes around it
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = ID * 1.1; g.lineCap = 'round';
      g.beginPath(); g.ellipse(43, 31.6, 12.6, 2.2, 0, 0.1, Math.PI - 0.1); g.stroke();
      g.beginPath(); g.ellipse(57.6, 31.4, 3, 0.9, 0, 0.1, Math.PI - 0.1); g.stroke();
      // grass over the near edge
      line(g, function (g) {
        [[6, -1], [8, 1], [10, -0.4], [91, 1], [93.4, -1], [47, 1], [49, -0.6]].forEach(function (b) { g.moveTo(b[0], 40); g.quadraticCurveTo(b[0] + b[1], 37.8, b[0] + b[1] * 1.6, 36.2); });
      }, ID);
    },

    // a tree of the mural: a curvy trunk and round clumps of leaves
    tree: function (T, w, h) {
      // a branch to the low clump, then the trunk
      piece(T, smP([[28.5, 99], [30, 82], [28, 66], [22, 52], [26, 49], [32, 59], [33.4, 44], [38, 44], [38, 60], [47, 51], [50.4, 54.4], [41, 68], [40, 84], [43, 99]], 0.2), C.wood, C.woodDeep, {
        inside: function (g) { light(g, 33, 80, 5, 0.3); },
        over: function (g) { line(g, function (g) { g.moveTo(33.4, 90); g.quadraticCurveTo(32, 80, 33.6, 71); g.moveTo(37, 86); g.quadraticCurveTo(36.4, 81, 37.4, 77); }, ID * 0.8, 0.5); }
      });
      puffs(T, [[52, 51, 8.6], [59, 53.6, 5.6], [45.4, 54.6, 4.4]], PAL.leaf, PAL.leafDeep, [1]);
      puffs(T, [[33, 27, 17], [18.6, 33, 12.4], [48, 31, 13], [26, 16.6, 11.6], [41.6, 16, 11.4], [33, 39, 11.4], [12.6, 44, 7], [22, 45, 7.6]],
        PAL.leaf, PAL.leafDeep, [1, 2, 5, 6]);
    },

    bush: function (T, w, h) {
      var g = T.g;
      puffs(T, [[11, 15.4, 8.4], [19.4, 11, 9.6], [28.4, 14.6, 8], [5.4, 19.6, 4.6], [33.6, 19.6, 4]], PAL.leafDeep, '#2f7a45', [1, 2]);
      [[13, 13.5], [22, 8.6], [27.6, 15], [18, 17]].forEach(function (b) {
        dot(g, b[0], b[1], 1.25, PAL.roof);
        Art.ink(g, ID * 0.7); g.beginPath(); g.arc(b[0], b[1], 1.25, 0, TAU); g.stroke();
      });
    },

    flowers: function (T, w, h) {
      var F = [[5, 8.4, 2.9, PAL.mushroom], [11.6, 4.6, 3.3, PAL.yellowDeep], [18, 9.4, 2.7, '#b07cc6'], [24, 5, 3.2, PAL.cloudDeep], [30, 9.6, 2.6, PAL.orange]];
      layer(T, function (g) {
        tube(g, function (g) {
          F.forEach(function (f, i) { g.moveTo(f[0] + (i % 2 ? 0.8 : -0.8), 18.5); g.quadraticCurveTo(f[0] + (i % 2 ? 1 : -1), 13, f[0], f[1]); });
        }, PAL.leafDeep, 0.9, ID * 0.7);
        // leaves
        g.fillStyle = PAL.leaf;
        F.forEach(function (f, i) { g.beginPath(); g.ellipse(f[0] + (i % 2 ? -1.6 : 1.9), 14.6, 2.1, 0.95, i % 2 ? 0.6 : -0.6, 0, TAU); g.fill(); });
      }, PAL.leafDeep, function (g) {
        Art.ink(g, ID * 0.7);
        F.forEach(function (f, i) { g.beginPath(); g.ellipse(f[0] + (i % 2 ? -1.6 : 1.9), 14.6, 2.1, 0.95, i % 2 ? 0.6 : -0.6, 0, TAU); g.stroke(); });
        F.forEach(function (f, i) { flower(g, f[0], f[1], f[2], f[3], i === 1 ? '#fff6e8' : PAL.yellow, 5 + (i % 2)); });
      }, 0.6);
    },

    // two posts and a line of little clothes
    clothesline: function (T, w, h) {
      var g = T.g;
      [5, 67].forEach(function (x) {
        piece(T, rrectP(x - 1.6, 4, 3.2, 44, 1.5), C.wood, C.woodDeep, { ink: ID * 1.3 });
      });
      var sag = quadPt([5, 8], [36, 17], [67, 8]);
      line(g, function (g) { g.moveTo(5, 8); g.quadraticCurveTo(36, 17, 67, 8); }, ID);
      var p;
      // purple shorts
      p = sag(0.17);
      piece(T, (function (x, y) {
        return polyP([[x - 4.4, y], [x + 4.4, y], [x + 5.2, y + 8.6], [x + 1.1, y + 8.6], [x, y + 4.4], [x - 1.1, y + 8.6], [x - 5.2, y + 8.6]]);
      })(p[0], p[1] + 0.4), '#b07cc6', PAL.plum, { ink: ID * 1.2 });
      // a pair of striped socks
      [0.33, 0.4].forEach(function (t, i) {
        var q = sag(t), x = q[0], y = q[1] + 0.4;
        piece(T, function (g) {
          g.beginPath(); g.moveTo(x - 1.2, y); g.lineTo(x + 1.2, y); g.lineTo(x + 1.2, y + 5.6);
          g.quadraticCurveTo(x + 4.2, y + 6, x + 3.8, y + 8); g.quadraticCurveTo(x + 1, y + 9.6, x - 1.2, y + 8); g.closePath();
        }, i ? PAL.yellow : PAL.river, i ? C.goldDeep : PAL.riverDeep, {
          ink: ID * 1.1, edge: 0,
          over: function (g) { line(g, function (g) { g.moveTo(x - 1.2, y + 1.8); g.lineTo(x + 1.2, y + 1.8); g.moveTo(x - 1.2, y + 3.6); g.lineTo(x + 1.2, y + 3.6); }, ID * 0.7, 0.7); }
        });
      });
      // the red dress with white dots
      p = sag(0.6);
      (function (x, y) {
        piece(T, polyP([[x - 2.2, y], [x - 0.8, y + 1.6], [x + 0.8, y + 1.6], [x + 2.2, y], [x + 3, y + 3.4], [x + 5.6, y + 11.6], [x - 5.6, y + 11.6], [x - 3, y + 3.4]]), PAL.roof, C.roofDeep, {
          ink: ID * 1.2,
          over: function (g) {
            g.fillStyle = 'rgba(255,250,244,0.95)';
            [[-2, 5], [1.4, 4.6], [-0.2, 7.4], [3, 8], [-3.2, 8.6], [0.6, 10.2], [-2.6, 10.6], [3.6, 10.6]].forEach(function (d) { g.beginPath(); g.arc(x + d[0], y + d[1], 0.62, 0, TAU); g.fill(); });
          }
        });
      })(p[0], p[1] + 0.4);
      // a little blue shirt
      p = sag(0.83);
      (function (x, y) {
        piece(T, polyP([[x - 2, y], [x, y + 1.2], [x + 2, y], [x + 5.6, y + 1.8], [x + 4.8, y + 4.6], [x + 3.2, y + 4], [x + 3.2, y + 9.6], [x - 3.2, y + 9.6], [x - 3.2, y + 4], [x - 4.8, y + 4.6], [x - 5.6, y + 1.8]]),
          PAL.cloud, PAL.cloudDeep, { ink: ID * 1.2 });
      })(p[0], p[1] + 0.4);
      // pegs
      tube(g, function (g) {
        [0.14, 0.2, 0.33, 0.4, 0.57, 0.63, 0.8, 0.86].forEach(function (t) { var q = sag(t); g.moveTo(q[0], q[1] - 1); g.lineTo(q[0], q[1] + 1.1); });
      }, '#e9c79a', 0.8, ID * 0.6);
    },

    // the fox with its balloons
    fox: function (T, w, h) {
      var g = T.g, paw = [30, 50.4];
      // strings and balloons
      line(g, function (g) {
        [[26, 16.6], [19, 20.6], [33, 23.4]].forEach(function (b, i) { g.moveTo(paw[0], paw[1]); g.quadraticCurveTo(paw[0] + (i - 1) * 1.5, 36, b[0], b[1]); });
      }, ID * 0.8);
      balloon(T, 26, 8.4, 6.2, 7.3, PAL.river, PAL.riverDeep);
      balloon(T, 18.6, 12.4, 6.2, 7.3, PAL.roof, C.roofDeep);
      balloon(T, 33, 15.2, 6, 7.1, PAL.yellow, C.goldDeep);
      // tail, with a white tip
      piece(T, smP([[12, 64], [5, 62.6], [1.4, 55], [2.4, 47], [6.4, 43], [9.4, 46.4], [7.4, 51.4], [9, 56.4], [13.4, 58.6]]), C.fox, C.foxDeep, {
        over: function (g) {
          g.fillStyle = C.cream;
          g.beginPath(); g.moveTo(0, 49.6); g.quadraticCurveTo(3, 51.6, 5, 49.2); g.quadraticCurveTo(7, 51.2, 10.4, 48.6); g.lineTo(11, 40); g.lineTo(0, 40); g.closePath(); g.fill();
          Art.ink(g, ID * 0.8); g.beginPath(); g.moveTo(0, 49.6); g.quadraticCurveTo(3, 51.6, 5, 49.2); g.quadraticCurveTo(7, 51.2, 10.4, 48.6); g.stroke();
        }
      });
      // ears behind the head
      [[[10.8, 40], [10.2, 32.2], [15.6, 37]], [[18.4, 37], [23.8, 32.2], [23.2, 40]]].forEach(function (e) {
        piece(T, polyP(e), C.fox, C.foxDeep, { edge: 0, ink: IW * 1.2 });
        var mx = (e[0][0] + e[1][0] + e[2][0]) / 3, my = (e[0][1] + e[1][1] + e[2][1]) / 3;
        g.fillStyle = PAL.ink;
        polyP(e.map(function (p) { return [mx + (p[0] - mx) * 0.4, my + (p[1] - my) * 0.4 - 0.3]; }))(g); g.fill();
      });
      // body with a cream tummy
      piece(T, smP([[11, 67], [10.2, 57], [12.4, 50.4], [16.6, 47.6], [20.6, 50.4], [22.6, 57.6], [22, 67]]), C.fox, C.foxDeep, {
        over: function (g) { g.fillStyle = C.cream; g.beginPath(); g.ellipse(17, 59.6, 3.4, 6, 0, 0, TAU); g.fill(); }
      });
      // the arm that holds the strings
      tube(g, function (g) { g.moveTo(19.6, 53); g.quadraticCurveTo(25, 55.4, paw[0] - 0.4, paw[1] + 0.6); }, C.fox, 2.5, ID);
      dot(g, paw[0], paw[1] + 0.2, 1.7, '#5a3320');
      // head: wide cheeks, cream below
      piece(T, smP([[10.2, 43], [11.8, 38.2], [17, 36.6], [22.2, 38.2], [23.8, 43], [21.2, 46.6], [17, 48.8], [12.8, 46.6]], 0.2), C.fox, C.foxDeep, {
        over: function (g) {
          g.fillStyle = C.cream;
          g.beginPath(); g.ellipse(13, 45.6, 3.4, 2.9, 0.3, 0, TAU); g.ellipse(21, 45.6, 3.4, 2.9, -0.3, 0, TAU); g.fill();
        }
      });
      dot(g, 14.5, 41.8, 0.85, PAL.ink); dot(g, 19.5, 41.8, 0.85, PAL.ink);
      dot(g, 17, 44.8, 1.05, PAL.ink);
      line(g, function (g) { g.moveTo(15, 46); g.quadraticCurveTo(17, 48, 19, 46); }, ID * 0.9);
    }
  };

  var LIFE = {
    // the mouse in its basket under the patched yellow balloon
    mouseBalloon: function (T, w, h) {
      var g = T.g;
      // ropes
      line(g, function (g) {
        [[8.4, 24.4, 9.6], [12.4, 26.6, 12.6], [17.6, 26.6, 17.4], [21.6, 24.4, 20.4]].forEach(function (r) { g.moveTo(r[0], r[1]); g.lineTo(r[2], 39.6); });
      }, ID * 0.8);
      // the balloon, with its purple patch
      piece(T, ellP(15, 14.4, 10.8, 12.8), PAL.yellow, C.goldDeep, {
        ink: IW * 1.3,
        inside: function (g) { light(g, 11, 9, 8, 0.5); },
        over: function (g) {
          line(g, function (g) { g.moveTo(21.6, 15); g.quadraticCurveTo(22, 20.4, 18, 23.6); }, ID * 0.8, 0.7);
        }
      });
      piece(T, polyP([[11.4, 13.4], [19.4, 12.4], [20, 18], [12, 19]]), '#a85bb0', PAL.plum, { ink: ID * 1.3, edge: 0 });
      line(g, function (g) {
        [[10.6, 15, 12.6, 14.8], [10.8, 17.2, 12.8, 17], [18.6, 13.6, 20.8, 13.4], [18.8, 16.2, 21, 16], [14, 11.8, 14.2, 14], [17, 11.6, 17.2, 13.6], [15, 17.8, 15.2, 20]].forEach(function (s) { g.moveTo(s[0], s[1]); g.lineTo(s[2], s[3]); });
      }, ID * 0.8);
      // the mouse: tail, ear, neck, head with a pointed snout, googly eyes
      line(g, function (g) { g.moveTo(9.6, 40); g.bezierCurveTo(4.6, 39.6, 6.4, 33, 2.6, 33.6); }, ID * 0.8);
      piece(T, rrectP(12, 35, 5.6, 7, 2), C.mouse, C.mouseDeep, { ink: ID * 1.2, edge: 0 });
      piece(T, ellP(9.6, 29.6, 3.8, 4.1, -0.3), C.mouse, C.mouseDeep, {
        ink: ID * 1.3, edge: 0,
        over: function (g) { g.fillStyle = '#f4a3c0'; g.beginPath(); g.ellipse(9.4, 29.8, 2.3, 2.7, -0.3, 0, TAU); g.fill(); }
      });
      piece(T, smP([[10.8, 34], [12.2, 30.4], [15.8, 29.6], [19, 31.4], [23.8, 34.2], [20, 36.8], [15.6, 38], [12.2, 37.2]], 0.2), C.mouse, C.mouseDeep, { ink: ID * 1.3 });
      dot(g, 24, 34.2, 1, '#f58ab8');
      Art.ink(g, ID * 0.7); g.beginPath(); g.arc(24, 34.2, 1, 0, TAU); g.stroke();
      line(g, function (g) { g.moveTo(17.6, 36); g.quadraticCurveTo(19.8, 37, 21.4, 35.6); }, ID * 0.8);
      [[14.6, 30.2, 2.2], [17.8, 29.6, 2]].forEach(function (e) {
        dot(g, e[0], e[1], e[2], '#ffffff');
        Art.ink(g, ID * 0.9); g.beginPath(); g.arc(e[0], e[1], e[2], 0, TAU); g.stroke();
        dot(g, e[0] + 0.7, e[1] + 0.3, e[2] * 0.42, PAL.ink);
      });
      // the basket
      piece(T, smP([[8.4, 40], [21.6, 40], [22.4, 43.4], [23.4, 47], [20.6, 49.6], [9.4, 49.6], [6.6, 47], [7.6, 43.4]], 0.2), '#f39a4f', '#c9661f', {
        ink: IW * 1.2,
        inside: function (g) { light(g, 17, 44, 5, 0.3); },
        over: function (g) {
          line(g, function (g) {
            for (var i = 0; i < 4; i++) { g.moveTo(7, 44.4 + i * 1.5); g.lineTo(14 - i, 44.8 + i * 1.5); g.moveTo(8.6 + i * 1.6, 43.4); g.lineTo(8.8 + i * 1.6, 49.6); }
          }, ID * 0.6, 0.55);
        }
      });
      piece(T, rrectP(8, 38.8, 14, 2.4, 1.2), '#f7b06c', '#c9661f', { ink: ID * 1.2, edge: 0 });
      dot(g, 18.4, 39.4, 0.8, '#f4a3c0'); dot(g, 20, 39.6, 0.8, '#f4a3c0');
    },
    butterfly: function (T, w, h) {
      var g = T.g;
      layer(T, function (g) {
        g.fillStyle = PAL.mushroom;
        g.beginPath(); g.ellipse(2.9, 3.1, 2.4, 2.6, -0.3, 0, TAU); g.ellipse(7.1, 3.1, 2.4, 2.6, 0.3, 0, TAU); g.fill();
        g.fillStyle = PAL.yellow;
        g.beginPath(); g.ellipse(3.4, 6.3, 1.7, 1.8, 0.3, 0, TAU); g.ellipse(6.6, 6.3, 1.7, 1.8, -0.3, 0, TAU); g.fill();
      }, PAL.mushroomDeep, function (g) {
        Art.ink(g, ID * 0.8);
        [[2.9, 3.1, 2.4, 2.6, -0.3], [7.1, 3.1, 2.4, 2.6, 0.3], [3.4, 6.3, 1.7, 1.8, 0.3], [6.6, 6.3, 1.7, 1.8, -0.3]].forEach(function (e) {
          g.beginPath(); g.ellipse(e[0], e[1], e[2], e[3], e[4], 0, TAU); g.stroke();
        });
        dot(g, 2.7, 3, 0.6, '#fffaf0'); dot(g, 7.3, 3, 0.6, '#fffaf0');
      }, 0.5);
      g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(5, 4.6, 0.6, 2.5, 0, 0, TAU); g.fill();
      line(g, function (g) { g.moveTo(5, 2.4); g.quadraticCurveTo(4.4, 1, 3.6, 0.8); g.moveTo(5, 2.4); g.quadraticCurveTo(5.6, 1, 6.4, 0.8); }, ID * 0.6);
    }
  };

  // The night look: the day sprite under a blue wash, then the windows lit,
  // each with a soft warm glow painted in (never per frame).
  function nightOf(T) {
    var n = mk(T.w, T.h), g = n.g;
    g.drawImage(T.c, 0, 0, T.w, T.h);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = 0.45;
    g.fillStyle = PAL.nightTint;
    g.fillRect(0, 0, T.w, T.h);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.scale(T.k, T.k);
    T.wins.forEach(function (v) {
      var R = v.r * v.glow, gr = g.createRadialGradient(v.cx, v.cy, v.r * 0.5, v.cx, v.cy, R);
      gr.addColorStop(0, 'rgba(255,226,122,0.55)'); gr.addColorStop(0.5, 'rgba(255,226,122,0.2)'); gr.addColorStop(1, 'rgba(255,226,122,0)');
      g.fillStyle = gr; g.fillRect(v.cx - R, v.cy - R, R * 2, R * 2);
    });
    T.wins.forEach(function (v) {
      if (v.star) { stamp(g, Art.starSprite(v.star[2] * K, DPR, { glow: false }), v.star[0], v.star[1], v.star[3]); return; }
      var gr = g.createRadialGradient(v.cx, v.cy, 0, v.cx, v.cy, v.r * 1.3);
      gr.addColorStop(0, '#fff7c2'); gr.addColorStop(1, '#ffd45e');
      v.path(g); g.fillStyle = gr; g.fill();
      if (v.mull) line(g, v.mull, ID * 0.9);
      Art.ink(g, ID * 1.2); v.path(g); g.stroke();
    });
    return { c: n.c, w: T.w, h: T.h };
  }

  function paintSprite(set, kind, seed) {
    var sz = SIZE[kind], sc = SCALE[kind] || 1, w = Math.round(sz[0] * K), h = Math.round(sz[1] * K);
    var T = surface(w, h, K * sc, seed);
    set[kind](T, sz[0] / sc, sz[1] / sc);
    return T;
  }

  // The street band: a green rim under the ground line, the sandy path with its
  // pebbles, then grass. It repeats every w px (a multiple of the grain's period).
  function makeGround() {
    var w = Math.max(1, Math.round(1.2 * U / 128)) * 128, h = Math.round(0.6 * U);
    var T = surface(w, h, 1, 40), u = U, rim = u * 0.035, path = u * 0.135, rand = Art.rng(9), i;
    var waves = Math.max(2, Math.round(w / (u * 0.3)));
    function edge(g, y, amp, ph) {
      for (var x = 0; x <= w; x += 4) g.lineTo(x, y + Math.sin(x / w * TAU * waves + ph) * amp);
    }
    // grass, everywhere
    layer(T, function (g) { g.fillStyle = PAL.leaf; g.fillRect(0, 0, w, h); }, PAL.leafDeep, function (g) {
      // tufts and daisies below the path
      Art.ink(g, LW * 0.6);
      g.beginPath();
      for (i = 0; i < 7; i++) {
        var x = w * (i + 0.2 + rand() * 0.6) / 7, y = rim + path + u * (0.07 + rand() * 0.2), s = u * 0.012;
        g.moveTo(x - s, y); g.quadraticCurveTo(x - s * 1.4, y - s * 1.4, x - s * 2, y - s * 2);
        g.moveTo(x, y); g.lineTo(x, y - s * 2.6);
        g.moveTo(x + s, y); g.quadraticCurveTo(x + s * 1.4, y - s * 1.4, x + s * 2, y - s * 2);
      }
      g.stroke();
      for (i = 0; i < 4; i++) flower(g, w * (i + 0.3 + rand() * 0.4) / 4, rim + path + u * (0.05 + rand() * 0.2), u * 0.014, '#fffaf0', PAL.yellowDeep, 6, LW * 0.5);
    }, 0.9);
    // the path
    layer(T, function (g) {
      g.fillStyle = C.sand;
      g.beginPath(); g.moveTo(0, rim); edge(g, rim, u * 0.004, 0);
      g.lineTo(w, rim + path);
      for (var x = w; x >= 0; x -= 4) g.lineTo(x, rim + path + Math.sin(x / w * TAU * waves + 2) * u * 0.006);
      g.closePath(); g.fill();
    }, C.sandDeep, function (g) {
      g.strokeStyle = 'rgba(160,112,60,0.8)'; g.lineWidth = LW * 0.55;
      for (i = 0; i < 9; i++) {
        g.beginPath();
        g.ellipse(w * (i + 0.25 + rand() * 0.5) / 9, rim + path * (0.24 + 0.52 * ((i * 5) % 9) / 8), u * (0.012 + rand() * 0.008), u * (0.006 + rand() * 0.003), 0, 0, TAU);
        g.stroke();
      }
      Art.ink(g, LW * 0.7);
      g.beginPath(); g.moveTo(0, rim); edge(g, rim, u * 0.004, 0); g.stroke();
      g.beginPath(); g.moveTo(0, rim + path + Math.sin(2) * u * 0.006); edge(g, rim + path, u * 0.006, 2); g.stroke();
    }, 0.9);
    // the ground line
    Art.ink(T.g, LW * 1.1);
    T.g.beginPath(); T.g.moveTo(0, LW * 0.55); T.g.lineTo(w, LW * 0.55); T.g.stroke();
    return { c: T.c, w: w, h: h };
  }

  function build(m, dpr) {
    U = m; DPR = dpr; K = U / 100;
    LW = Math.max(1.6, U * 0.008);
    IW = LW / K; ID = Math.max(1.1, U * 0.005) / K;
    spr = {}; sprN = {}; life = {}; jarCache = {}; jarN = 0; signCache = {};
    KINDS.forEach(function (k, i) {
      var T = paintSprite(DRAW, k, i + 1);
      spr[k] = { c: T.c, w: T.w, h: T.h };
      sprN[k] = nightOf(T);
    });
    Object.keys(LIFE).forEach(function (k, i) {
      var T = paintSprite(LIFE, k, i + 20);
      life[k] = { c: T.c, w: T.w, h: T.h };
    });
    ground = makeGround();
  }

  // ------------------------------------------------------------------- jar
  // Authored 66 x 100 (100 = its height): the stone stand below, the glass above.
  var STAR_MAX = 60;
  function jarP(g) {
    g.beginPath(); g.moveTo(21, 16); g.lineTo(45, 16);
    g.quadraticCurveTo(45, 22, 53, 25); g.quadraticCurveTo(59, 28, 59, 36); g.lineTo(59, 66);
    g.quadraticCurveTo(59, 74, 51, 74); g.lineTo(15, 74); g.quadraticCurveTo(7, 74, 7, 66);
    g.lineTo(7, 36); g.quadraticCurveTo(7, 28, 13, 25); g.quadraticCurveTo(21, 22, 21, 16); g.closePath();
  }
  function jarSprite(h, total) {
    var key = Math.round(h) + ':' + Math.min(total, STAR_MAX) + ':' + Math.floor(total / 50);
    if (jarCache[key]) return jarCache[key];
    if (jarN >= 8) { jarCache = {}; jarN = 0; }
    jarN++;
    var k = h / 100, w = Math.round(66 * k), T = surface(w, Math.round(h), k, 50), g = T.g;
    var iw = Math.max(LW, 1.4) / k, id = iw * 0.62;
    // the stone stand
    piece(T, rrectP(8, 91.4, 50, 8, 2.4), C.stone, C.stoneDeep, { ink: iw * 0.9 });
    piece(T, polyP([[17, 80], [49, 80], [45.6, 92], [20.4, 92]]), '#cbc1d2', C.stoneDeep, { ink: iw * 0.9 });
    piece(T, rrectP(10, 74, 46, 7.4, 2.6), '#e2dbe6', C.stoneDeep, { ink: iw * 0.9 });
    // the glass, behind the stars
    jarP(g); g.fillStyle = 'rgba(214,236,246,0.5)'; g.fill();
    // the stars, piled from the bottom, never past the shoulder
    var x0 = 11.4, inW = 43.2, floor = 72.4, ceil = 31;
    var rs = inW / 11.5, rb = rs * 2.1;
    var small = Math.min(total, STAR_MAX), perBig = Math.max(1, Math.floor(inW / (rb * 1.7)));
    var big = Math.min(Math.floor(total / 50), perBig * 2);
    var sB = Art.starSprite(rb * k, DPR, { glow: false }), sS = Art.starSprite(rs * k, DPR, { glow: false });
    var rnd = Art.rng(7), i;
    g.save();
    jarP(g); g.clip();
    var per = Math.max(1, Math.floor(inW / (rs * 1.5))), rows = Math.ceil(small / per);
    var sy = floor - rs * 0.8;
    var step = rows > 1 ? Math.min(rs * 1.3, (sy - (ceil + rs * 0.8)) / (rows - 1)) : 0;
    for (i = 0; i < small; i++) {
      var c = i % per, row = Math.floor(i / per), n = Math.min(per, small - row * per);
      var sx = x0 + inW * (c + 0.5 + (row % 2 ? 0.25 : -0.25)) / per + (per - n) * inW / per / 2;
      stamp2(g, sS, sx + (rnd() - 0.5) * rs * 0.4, sy - row * step + (rnd() - 0.5) * rs * 0.25, k, (rnd() - 0.5) * 0.9);
    }
    // the big ones sit in front, at the bottom
    var y = floor - rb * 0.74;
    for (i = 0; i < big; i++) {
      var col = i % perBig, nRow = Math.min(perBig, big - (i - col));
      if (i && !col) y -= rb * 1.3;
      stamp2(g, sB, x0 + inW * (col + 0.5) / nRow, y + (rnd() - 0.5) * rb * 0.2, k, (rnd() - 0.5) * 0.6);
    }
    g.restore();
    // the glass in front: ink outline, soft highlights
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(12.6, 37); g.lineTo(12.6, 63); g.stroke();
    g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.beginPath(); g.moveTo(17.4, 30.6); g.quadraticCurveTo(14.6, 31.4, 13.4, 33.4); g.moveTo(54, 50); g.lineTo(54, 64); g.stroke();
    inkPath(T, g, jarP, iw * 1.1);
    // the rim and the cork
    piece(T, rrectP(23.5, 4.6, 19, 9, 3), '#d7a873', '#9c6c3c', { ink: iw * 0.9 });
    jarRim(g, iw);
    line(g, function (g) { g.moveTo(27, 8); g.lineTo(31, 8.4); g.moveTo(35, 10); g.lineTo(39.4, 9.6); }, id, 0.5);
    return (jarCache[key] = { c: T.c, w: w, h: Math.round(h) });
  }
  function jarRim(g, iw) {
    var p = rrectP(18.6, 11.6, 28.8, 5.4, 2.4);
    p(g); g.fillStyle = 'rgba(232,245,250,0.92)'; g.fill();
    Art.ink(g, iw * 0.9); p(g); g.stroke();
  }
  // an Art sprite centered at (x, y), where the context is scaled by k
  function stamp2(g, s, x, y, k, rot) {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.scale(1 / k, 1 / k);
    g.drawImage(s, -s.lw / 2, -s.lh / 2, s.lw, s.lh);
    g.restore();
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
  // Authored with the radius = 100.
  var SIGN = {
    star: function (T, r) {
      stamp2(T.g, Art.starSprite(r * 0.68, DPR, { glow: false }), 0, 2, r / 100 * 0.74, -0.12);
    },
    cake: function (T) {
      var g = T.g, iw = T.iw;
      piece(T, ellP(0, 52, 62, 9), '#fffdf8', '#cdbfae', { ink: iw * 0.8, edge: 0 });
      piece(T, rrectP(-50, 4, 100, 46, 9), PAL.mushroom, PAL.mushroomDeep, { ink: iw });
      // cream running down the bottom tier
      var cream = function (g) {
        g.beginPath(); g.moveTo(-50, 13); g.quadraticCurveTo(-50, 3, -41, 3); g.lineTo(41, 3); g.quadraticCurveTo(50, 3, 50, 13);
        for (var i = 0; i < 5; i++) { var x = 50 - i * 20; g.quadraticCurveTo(x - 4, 27 + (i % 2) * 7, x - 10, 22); g.quadraticCurveTo(x - 16, 15, x - 20, 16); }
        g.closePath();
      };
      piece(T, cream, '#fffaf0', '#e3cfae', { ink: iw * 0.8, edge: 0, grain: 0.5 });
      piece(T, rrectP(-33, -34, 66, 40, 9), '#f9d7e4', PAL.pinkDeep, { ink: iw });
      var top = function (g) {
        g.beginPath(); g.moveTo(-33, -26); g.quadraticCurveTo(-33, -35, -25, -35); g.lineTo(25, -35); g.quadraticCurveTo(33, -35, 33, -26);
        for (var i = 0; i < 3; i++) { var x = 33 - i * 22; g.quadraticCurveTo(x - 5, -13 + (i % 2) * 6, x - 11, -18); g.quadraticCurveTo(x - 18, -24, x - 22, -23); }
        g.closePath();
      };
      piece(T, top, '#fffaf0', '#e3cfae', { ink: iw * 0.8, edge: 0, grain: 0.5 });
      line(g, function (g) { g.moveTo(1, -44); g.quadraticCurveTo(3, -58, 12, -62); }, iw * 0.7);
      piece(T, ellP(0, -44, 11, 11), PAL.roof, C.roofDeep, {
        ink: iw * 0.9, edge: 0,
        inside: function (g) { light(g, -4, -48, 8, 0.6); }
      });
    },
    octopus: function (T) {
      var g = T.g, iw = T.iw, i;
      // little arms, then the round head
      var arms = [];
      for (i = 0; i < 5; i++) arms.push([-44 + i * 22, 36 + (i % 2 ? 5 : 0), 14.5]);
      piece(T, circlesP(arms), C.octo, C.octoDeep, { union: true, ink: iw });
      piece(T, ellP(0, -6, 47, 43), C.octo, C.octoDeep, {
        ink: iw,
        inside: function (g) { light(g, -14, -24, 30, 0.4); },
        over: function (g) {
          g.fillStyle = 'rgba(255,170,170,0.8)';
          g.beginPath(); g.ellipse(-29, 10, 8, 5, 0, 0, TAU); g.ellipse(29, 10, 8, 5, 0, 0, TAU); g.fill();
        }
      });
      [-17, 17].forEach(function (x) {
        g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(x, 0, 7, 8.6, 0, 0, TAU); g.fill();
        dot(g, x + 2.2, -3.4, 2.6, '#ffffff');
      });
      line(g, function (g) { g.moveTo(-7, 10); g.quadraticCurveTo(0, 18, 7, 10); }, iw * 0.8);
    }
  };
  function signSprite(r, kind) {
    var key = Math.round(r * 10) + kind;
    if (signCache[key]) return signCache[key];
    var size = Math.ceil(r * 2.8), k = r / 100, T = surface(size, size, k, 60), g = T.g;
    T.iw = Math.max(LW * 0.9, r * 0.05) / k;
    T.g.translate(size / 2 / k, size / 2 / k); T.lg.translate(size / 2 / k, size / 2 / k);
    piece(T, ellP(0, 0, 100, 100), '#fffaf0', '#e3cfae', { ink: T.iw * 1.3, edge: 0, grain: 0.6 });
    g.strokeStyle = PAL.mushroom; g.lineWidth = 5;
    g.beginPath(); g.arc(0, 0, 87, 0, TAU); g.stroke();
    var ps = kind === 'star' ? 0.74 : kind === 'cake' ? 1.08 : 1.2, py = kind === 'cake' ? 3 : kind === 'star' ? 0 : -3;
    g.save(); g.scale(ps, ps); g.translate(0, py);
    T.lg.save(); T.lg.scale(ps, ps); T.lg.translate(0, py);
    SIGN[kind === 'star' || kind === 'cake' ? kind : 'octopus'](T, r);
    T.lg.restore(); g.restore();
    // the soft glow ring, drawn per frame with a pulsing alpha
    var gl = mk(size, size), gg = gl.g, c = size / 2, gr = gg.createRadialGradient(c, c, r * 0.9, c, c, r * 1.4);
    gr.addColorStop(0, 'rgba(255,240,170,0.9)'); gr.addColorStop(1, 'rgba(255,240,170,0)');
    gg.fillStyle = gr; gg.fillRect(0, 0, size, size);
    return (signCache[key] = { sign: { c: T.c, w: size, h: size }, glow: gl });
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
